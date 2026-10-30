"""Stage-14 scene build: terrain, roads, lands, water and trees.

Reads the box's buffered extract (box + 300 m, covering the spec's R+100 m
margin), ``buildings.json`` footprints (tree exclusion) and the DEM, and
writes ``scene.json`` — local metres, ``x`` east, ``z`` south — following the
spec's §4.1 schema::

    {meta, terrain:{x0,z0,step,nx,nz,dm}, roads, lands, water, trees}

``scene.json`` lives next to ``area.json`` (not inside it): the two files
have different frames (scene-local metres vs WGS84), different consumers
(3D view vs everything) and different rebuild triggers (DEM/extract vs
register/graph), so a separate file keeps 2D/sim loads small and scene
rebuilds independent.

Everything clips to the box bbox: the terrain grid only covers the box, so
ribbons past its edge would float on the clamped fringe. Same input →
byte-identical output (compact JSON, sorted records, RNG seeded by box id).
Boundary-kind areas (whole-gu ``songpa``) are skipped — a 2.5 m grid over a
gu needs the spec's §6.1 tiling, which is future work; the renderer falls
back to flat ground there.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

import osmium
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box as shapely_box
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely.strtree import STRtree

from .dem import DEFAULT_DEM_DIR, open_dem
from .osm_parse import _parse_float, _parse_int, _rings_to_geojson
from .scene_geo import (M_PER_DEG_LAT, hash_string, lonlat_to_xz, mulberry32,
                        resample_polyline, xz_to_lonlat)

SCENE_CODE_VERSION = "14.1"
SCENE_FILE = "scene.json"

STEP_M = 2.5
ROUND_M = 0.1
SIMPLIFY_M = 0.5

MAX_TREES = 10_000
FOREST_SPACING_M = 5.0
PARK_SPACING_M = 12.0
ROW_SPACING_M = 8.0
STREET_SPACING_M = 10.0
STREET_OFFSET_M = 2.0  # past width/2
SPECIES_RATIO = (40, 50, 10)  # conifer : broadleaf : shrub (spec §5.4)
TREE_SCALE_MIN = 0.7
TREE_SCALE_MAX = 1.3

# Spec §4.2 defaults (width tag wins, then lanes × 3.25).
ROAD_DEFAULT_WIDTHS = {
    "motorway": 20, "trunk": 20, "primary": 16, "secondary": 12,
    "tertiary": 9, "residential": 6, "unclassified": 6, "service": 4,
    "footway": 2, "path": 2, "cycleway": 2, "steps": 2,
    "living_street": 5, "pedestrian": 5, "track": 3, "road": 5,
    "bridleway": 2.5, "railway": 4,
}
LANE_WIDTH_M = 3.25

# Spec §4.2 render order (ribbons stack by order × 0.01 m).
ROAD_ORDERS = {
    "motorway": 1, "trunk": 1, "railway": 1, "primary": 2, "secondary": 3,
    "tertiary": 4, "residential": 5, "unclassified": 5, "living_street": 5,
    "road": 5, "track": 6, "service": 6, "pedestrian": 6,
    "footway": 7, "path": 7, "cycleway": 7, "steps": 7, "bridleway": 7,
}

STREET_TREE_CLASSES = {"primary", "secondary", "tertiary"}

WATERWAY_DEFAULT_WIDTHS = {"river": 6, "canal": 4, "stream": 2.5,
                           "ditch": 1.5, "drain": 1.5}

FOREST_KINDS = {"natural:wood", "landuse:forest"}
PARK_KINDS = {"leisure:park", "leisure:garden", "landuse:park",
              "landuse:recreation_ground"}
SCRUB_KINDS = {"natural:scrub"}
WATER_KINDS = {"natural:water", "waterway:riverbank", "waterway:dock"}

LAND_TAGS = {
    "natural": {"wood", "scrub", "grassland", "water"},
    "landuse": {"forest", "grass", "meadow", "park", "recreation_ground"},
    "leisure": {"park", "garden", "pitch"},
}
RAILWAY_VALUES = {"rail", "subway", "light_rail"}


def road_width(highway: str | None, width_m: float | None = None,
               lanes: int | None = None) -> float:
    """Spec §4.2: width tag wins, then lanes × 3.25, then class default."""
    if width_m is not None and width_m > 0:
        return round(width_m, 1)
    if lanes is not None and lanes > 0:
        return round(lanes * LANE_WIDTH_M, 1)
    base = (highway or "").removesuffix("_link")
    return float(ROAD_DEFAULT_WIDTHS.get(base, 4))


def road_order(highway: str | None) -> int:
    base = (highway or "").removesuffix("_link")
    return ROAD_ORDERS.get(base, 5)


def bridge_flag(tags: dict) -> int:
    """1 = bridge (raised), -1 = tunnel (not drawn), else 0.

    From the ``bridge``/``tunnel``/``layer`` tags (spec §4.1): an explicit
    tunnel wins, then an explicit bridge, then a high layer.
    """
    tunnel = (tags.get("tunnel") or "no").lower()
    if tunnel not in ("no", "false", "none"):
        return -1
    bridge = (tags.get("bridge") or "no").lower()
    if bridge not in ("no", "false", "none"):
        return 1
    try:
        if int(float(tags.get("layer", "0"))) >= 2:
            return 1
    except (TypeError, ValueError):
        pass
    return 0


# --- OSM scan ------------------------------------------------------------------

def _landuse_kind(tags: dict) -> str | None:
    natural = tags.get("natural")
    if natural in LAND_TAGS["natural"]:
        return f"natural:{natural}"
    landuse = tags.get("landuse")
    if landuse in LAND_TAGS["landuse"]:
        return f"landuse:{landuse}"
    leisure = tags.get("leisure")
    if leisure in LAND_TAGS["leisure"]:
        return f"leisure:{leisure}"
    if tags.get("waterway") in ("riverbank", "dock"):
        return f"waterway:{tags['waterway']}"
    return None


class _SceneRelations(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.relations: dict[int, dict] = {}

    def relation(self, r):
        tags = dict(r.tags)
        if tags.get("type") != "multipolygon":
            return
        if _landuse_kind(tags) is None:
            return
        self.relations[r.id] = {
            "tags": tags,
            "members": [(m.type, m.ref, m.role) for m in r.members]}


class _SceneMain(osmium.SimpleHandler):
    def __init__(self, member_way_ids: set[int]):
        super().__init__()
        self.member_way_ids = member_way_ids
        self.member_geoms: dict[int, list] = {}
        self.tree_nodes: list[dict] = []
        self.ways: list[dict] = []

    def node(self, n):
        if not n.location.valid():
            return
        tags = dict(n.tags)
        if tags.get("natural") == "tree":
            self.tree_nodes.append({"id": n.id, "tags": tags,
                                    "lon": n.location.lon,
                                    "lat": n.location.lat})

    def way(self, w):
        coords = [(nd.lon, nd.lat) for nd in w.nodes
                  if nd.location.valid()]
        if not coords:
            return
        if w.id in self.member_way_ids:
            self.member_geoms[w.id] = coords
        tags = dict(w.tags)
        keep = (tags.get("highway") or tags.get("waterway")
                or tags.get("railway") in RAILWAY_VALUES
                or _landuse_kind(tags) is not None
                or tags.get("natural") == "tree_row")
        if keep:
            self.ways.append({"id": w.id, "tags": tags, "coords": coords})


def scan_scene_pbf(path: str | Path) -> dict:
    """Two pyosmium passes: multipolygons, then nodes/ways of interest."""
    path = str(path)
    rels = _SceneRelations()
    rels.apply_file(path, locations=False)
    member_ids: set[int] = set()
    for rel in rels.relations.values():
        for ref_type, ref, _role in rel["members"]:
            if ref_type == "w":
                member_ids.add(ref)
    main = _SceneMain(member_ids)
    main.apply_file(path, locations=True)
    return {"relations": rels.relations,
            "member_geoms": main.member_geoms,
            "tree_nodes": sorted(main.tree_nodes, key=lambda t: t["id"]),
            "ways": sorted(main.ways, key=lambda w: w["id"])}


# --- clip + project --------------------------------------------------------------

def _to_local_ring(ring_lonlat, lon0, lat0):
    return [lonlat_to_xz(lon, lat, lon0, lat0) for lon, lat in ring_lonlat]


def _round_pt(pt):
    return [round(pt[0], 1), round(pt[1], 1)]


def clip_line(coords: list, clip_poly: Polygon) -> list[LineString]:
    """Clip a lon/lat line to the box; drop fragments under 0.5 m."""
    if len(coords) < 2:
        return []
    try:
        hit = LineString(coords).intersection(clip_poly)
    except Exception:
        return []
    if hit.is_empty:
        return []
    parts = list(hit.geoms) if hit.geom_type == "MultiLineString" else [hit]
    out = []
    for part in parts:
        if part.geom_type != "LineString" or len(part.coords) < 2:
            continue
        seg = LineString(part.coords)
        # Length check in metres needs projection; approximate via degrees.
        if seg.length * M_PER_DEG_LAT < 0.5:
            continue
        out.append(seg)
    return out


def clip_poly(coords: list, clip_poly: Polygon) -> list[Polygon]:
    if len(coords) < 4:
        return []
    try:
        poly = Polygon(coords)
        if not poly.is_valid:
            poly = poly.buffer(0)
        hit = poly.intersection(clip_poly)
    except Exception:
        return []
    if hit.is_empty:
        return []
    polys = list(hit.geoms) if hit.geom_type == "MultiPolygon" else [hit]
    return [p for p in polys
            if p.geom_type == "Polygon" and not p.is_empty]


def project_line(line: LineString, lon0: float, lat0: float,
                 m_per_deg_lat: float = M_PER_DEG_LAT) -> list:
    pts = [lonlat_to_xz(lon, lat, lon0, lat0, m_per_deg_lat)
           for lon, lat in line.coords]
    if len(pts) >= 2:
        simp = LineString(pts).simplify(SIMPLIFY_M, preserve_topology=False)
        pts = list(simp.coords) if simp.geom_type == "LineString" else pts
    return [_round_pt(p) for p in pts]


def project_poly(poly: Polygon, lon0: float, lat0: float,
                 m_per_deg_lat: float = M_PER_DEG_LAT) -> list | None:
    """Local-metre rings (outer + holes), simplified 0.5 m, rounded 0.1 m."""
    local = Polygon(
        [lonlat_to_xz(lon, lat, lon0, lat0, m_per_deg_lat)
         for lon, lat in poly.exterior.coords],
        [[lonlat_to_xz(lon, lat, lon0, lat0, m_per_deg_lat)
          for lon, lat in hole.coords] for hole in poly.interiors])
    if not local.is_valid or local.is_empty:
        return None
    simp = local.simplify(SIMPLIFY_M, preserve_topology=True)
    geoms = (list(simp.geoms) if simp.geom_type == "MultiPolygon"
             else [simp])
    geoms = [g for g in geoms
             if g.geom_type == "Polygon" and not g.is_empty]
    if not geoms:
        return None
    outer = max(geoms, key=lambda g: g.area)
    rings = [[_round_pt(p) for p in outer.exterior.coords]]
    for hole in outer.interiors:
        rings.append([_round_pt(p) for p in hole.coords])
    if len(rings[0]) < 4:
        return None
    return rings


# --- trees -----------------------------------------------------------------------

def _poisson_in_poly(poly: Polygon, spacing: float, rng, k: int = 30,
                     max_points: int = 200_000) -> list[tuple[float, float]]:
    """Bridson's Poisson-disk sampling inside a polygon (deterministic)."""
    minx, miny, maxx, maxy = poly.bounds
    if maxx - minx <= 0 or maxy - miny <= 0:
        return []
    cell = spacing / math.sqrt(2)
    grid: dict[tuple[int, int], tuple[float, float]] = {}
    prepared = prep(poly)

    def key(p):
        return (math.floor(p[0] / cell), math.floor(p[1] / cell))

    def fits(p) -> bool:
        gx, gy = key(p)
        for ix in range(gx - 2, gx + 3):
            for iy in range(gy - 2, gy + 3):
                q = grid.get((ix, iy))
                if q is not None and math.hypot(p[0] - q[0], p[1] - q[1]) < spacing:
                    return False
        return True

    def add(p):
        grid[key(p)] = p
        points.append(p)
        active.append(p)

    points: list[tuple[float, float]] = []
    active: list[tuple[float, float]] = []
    for _ in range(200):
        p = (minx + next(rng) * (maxx - minx),
             miny + next(rng) * (maxy - miny))
        if prepared.contains(Point(p)):
            add(p)
            break
    if not active:
        return []
    while active and len(points) < max_points:
        idx = int(next(rng) * len(active)) % len(active)
        base = active[idx]
        placed = False
        for _ in range(k):
            ang = next(rng) * 2 * math.pi
            rad = spacing * (1 + next(rng))
            p = (base[0] + math.cos(ang) * rad,
                 base[1] + math.sin(ang) * rad)
            if not (minx <= p[0] <= maxx and miny <= p[1] <= maxy):
                continue
            if not prepared.contains(Point(p)):
                continue
            if fits(p):
                add(p)
                placed = True
                break
        if not placed:
            active[idx] = active[-1]
            active.pop()
    return points


def _line_normals(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    normals = []
    for i in range(len(points)):
        p0 = points[max(0, i - 1)]
        p1 = points[min(len(points) - 1, i + 1)]
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        length = math.hypot(dx, dy) or 1.0
        normals.append((-dy / length, dx / length))
    return normals


def pick_species(rng_value: float, ratio: tuple[int, int, int] = SPECIES_RATIO) -> int:
    """Species 0/1/2 (conifer/broadleaf/shrub) from one RNG draw + ratio."""
    total = sum(ratio)
    cut0 = ratio[0] / total
    cut1 = (ratio[0] + ratio[1]) / total
    if rng_value < cut0:
        return 0
    if rng_value < cut1:
        return 1
    return 2


def leaf_species(leaf_type: str | None) -> int | None:
    if leaf_type == "needleleaved":
        return 0
    if leaf_type == "broadleaved":
        return 1
    return None


# --- scene build -------------------------------------------------------------------

def build_scene(area_id: str, area_def: dict, scan: dict,
                buildings: list[dict], dem_source,
                species_ratio: tuple[int, int, int] = SPECIES_RATIO,
                seed_text: str | None = None) -> dict:
    """Assemble the scene.json document (pure: no I/O)."""
    from .dem import sample_grid

    seed_text = area_id if seed_text is None else seed_text
    lon0, lat0 = area_def["center"]
    bbox = area_def["bbox"]
    clip = shapely_box(*bbox)

    # Terrain half-cover: symmetric square covering the box bbox.
    corners = [lonlat_to_xz(lon, lat, lon0, lat0)
               for lon in (bbox[0], bbox[2]) for lat in (bbox[1], bbox[3])]
    need = max(abs(x) for x, _z in corners + [(0, 0)])
    need = max(need, max(abs(z) for _x, z in corners))
    half_m = math.ceil(need / STEP_M) * STEP_M
    nx, nz, dm, dem_info = sample_grid(dem_source, lon0, lat0, half_m,
                                       STEP_M, f"dem:{seed_text}")

    roads: list[dict] = []
    lands: list[dict] = []
    waters: list[dict] = []
    # Local geometries for tree exclusion + planting.
    road_lines: list[tuple[str, float, LineString]] = []
    water_lines: list[tuple[float, LineString]] = []
    forest_polys: list[Polygon] = []
    park_polys: list[Polygon] = []
    scrub_polys: list[Polygon] = []
    water_polys: list[Polygon] = []
    row_lines: list[LineString] = []

    for w in scan["ways"]:
        tags = w["tags"]
        coords = w["coords"]
        closed = len(coords) >= 4 and coords[0] == coords[-1]
        highway = tags.get("highway")
        railway = tags.get("railway") in RAILWAY_VALUES
        waterway = tags.get("waterway")
        kind = _landuse_kind(tags)
        if highway or railway:
            for part in clip_line(coords, clip):
                local = LineString(_to_local_ring(list(part.coords),
                                                  lon0, lat0))
                if local.length < 0.5:
                    continue
                k = "railway" if railway and not highway else highway
                width = road_width(k, _parse_float(tags.get("width")),
                                   _parse_int(tags.get("lanes")))
                pts = project_line(part, lon0, lat0)
                if len(pts) < 2:
                    continue
                roads.append({"k": k, "n": tags.get("name"), "w": width,
                              "br": bridge_flag(tags), "p": pts})
                road_lines.append((k, width, local))
        elif waterway and waterway not in ("riverbank", "dock"):
            for part in clip_line(coords, clip):
                local = LineString(_to_local_ring(list(part.coords),
                                                  lon0, lat0))
                if local.length < 0.5:
                    continue
                width = _parse_float(tags.get("width")) or \
                    WATERWAY_DEFAULT_WIDTHS.get(waterway, 2.0)
                pts = project_line(part, lon0, lat0)
                if len(pts) < 2:
                    continue
                waters.append({"k": waterway, "w": round(width, 1), "p": pts})
                water_lines.append((width, local))
        if kind and closed:
            for poly in clip_poly(coords, clip):
                rings = project_poly(poly, lon0, lat0)
                if rings is None:
                    continue
                lands.append({"k": kind.split(":", 1)[1],
                              "r": rings})
                local = Polygon(_to_local_ring(list(poly.exterior.coords),
                                               lon0, lat0),
                                [_to_local_ring(list(h.coords), lon0, lat0)
                                 for h in poly.interiors])
                if not local.is_valid or local.is_empty:
                    continue
                if kind in FOREST_KINDS:
                    forest_polys.append(local)
                elif kind in PARK_KINDS:
                    park_polys.append(local)
                elif kind in SCRUB_KINDS:
                    scrub_polys.append(local)
                elif kind in WATER_KINDS:
                    water_polys.append(local)
        if tags.get("natural") == "tree_row" and not closed:
            for part in clip_line(coords, clip):
                local = LineString(_to_local_ring(list(part.coords),
                                                  lon0, lat0))
                if local.length >= 1.0:
                    row_lines.append(local)

    for rid in sorted(scan["relations"]):
        rel = scan["relations"][rid]
        outers, inners = [], []
        for ref_type, ref, role in rel["members"]:
            if ref_type != "w" or ref not in scan["member_geoms"]:
                continue
            (inners if role == "inner" else outers).append(
                scan["member_geoms"][ref])
        geom = _rings_to_geojson(outers, inners)
        if geom is None:
            continue
        kind = _landuse_kind(rel["tags"])
        polys = ([geom["coordinates"]] if geom["type"] == "Polygon"
                 else geom["coordinates"])
        for poly_coords in polys:
            try:
                poly = Polygon(poly_coords[0], poly_coords[1:])
                if not poly.is_valid:
                    poly = poly.buffer(0)
                hit = poly.intersection(clip)
            except Exception:
                continue
            if hit.is_empty:
                continue
            parts = (list(hit.geoms) if hit.geom_type == "MultiPolygon"
                     else [hit])
            for part in parts:
                if part.geom_type != "Polygon" or part.is_empty:
                    continue
                rings = project_poly(part, lon0, lat0)
                if rings is None:
                    continue
                lands.append({"k": kind.split(":", 1)[1], "r": rings})
                local = Polygon(
                    _to_local_ring(list(part.exterior.coords), lon0, lat0),
                    [_to_local_ring(list(h.coords), lon0, lat0)
                     for h in part.interiors])
                if not local.is_valid or local.is_empty:
                    continue
                if kind in FOREST_KINDS:
                    forest_polys.append(local)
                elif kind in PARK_KINDS:
                    park_polys.append(local)
                elif kind in SCRUB_KINDS:
                    scrub_polys.append(local)
                elif kind in WATER_KINDS:
                    water_polys.append(local)

    # Deterministic record order (spec: same input → byte-identical).
    roads.sort(key=lambda r: (road_order(r["k"]), r["k"], r["w"],
                              r["n"] or "", json.dumps(r["p"])))
    lands.sort(key=lambda r: (r["k"], json.dumps(r["r"])))
    waters.sort(key=lambda r: (r["k"], r["w"], json.dumps(r["p"])))

    # --- tree exclusion index (local metres) ---
    exclusions: list = []
    for b in buildings:
        geom = (b.get("geometry") or {})
        polys = ([geom["coordinates"]] if geom.get("type") == "Polygon"
                 else geom.get("coordinates", []))
        for poly_coords in polys:
            try:
                ring = _to_local_ring(poly_coords[0], lon0, lat0)
                poly = Polygon(ring)
                if poly.is_valid and not poly.is_empty:
                    exclusions.append(poly)
            except Exception:
                continue
    for _k, width, line in road_lines:
        exclusions.append(line.buffer(width / 2 + 0.5, quad_segs=2))
    for width, line in water_lines:
        exclusions.append(line.buffer(width / 2 + 1.0, quad_segs=2))
    exclusions.extend(water_polys)
    tree_idx = STRtree(exclusions) if exclusions else None

    def excluded(x: float, z: float) -> bool:
        if tree_idx is None:
            return False
        pt = Point(x, z)
        for i in tree_idx.query(pt):
            if exclusions[i].intersects(pt):
                return True
        return False

    # --- tree candidates by source ---
    by_source: dict[str, list[tuple[float, float]]] = {
        "osm": [], "row": [], "street": [], "forest": [], "park": [],
        "scrub": []}

    for t in scan["tree_nodes"]:
        if not (bbox[0] <= t["lon"] <= bbox[2]
                and bbox[1] <= t["lat"] <= bbox[3]):
            continue
        x, z = lonlat_to_xz(t["lon"], t["lat"], lon0, lat0)
        if not excluded(x, z):
            by_source["osm"].append((x, z, t["tags"].get("leaf_type")))

    for line in sorted(row_lines, key=lambda l: l.bounds):
        for x, z in resample_polyline(list(line.coords), ROW_SPACING_M):
            if not excluded(x, z):
                by_source["row"].append((x, z))

    street_roads = sorted(
        ((k, w, l) for k, w, l in road_lines
         if k and k.removesuffix("_link") in STREET_TREE_CLASSES),
        key=lambda r: r[2].bounds)
    # Local box rect: the kerb offset can push street trees past the clip
    # edge; keep them inside (the terrain grid covers exactly the box).
    gx = [c[0] for c in corners]
    gz = [c[1] for c in corners]
    for _k, width, line in street_roads:
        pts = resample_polyline(list(line.coords), STREET_SPACING_M)
        normals = _line_normals(pts)
        off = width / 2 + STREET_OFFSET_M
        for (x, z), (nx_, nz_) in zip(pts, normals):
            for side in (1, -1):
                px, pz = x + nx_ * off * side, z + nz_ * off * side
                if not (min(gx) <= px <= max(gx)
                        and min(gz) <= pz <= max(gz)):
                    continue
                if not excluded(px, pz):
                    by_source["street"].append((px, pz))

    rng_forest = mulberry32(hash_string(f"trees:forest:{seed_text}"))
    for poly in sorted(forest_polys, key=lambda p: p.bounds):
        prep_poly = poly
        for x, z in _poisson_in_poly(prep_poly, FOREST_SPACING_M,
                                     rng_forest):
            if not excluded(x, z):
                by_source["forest"].append((x, z))
    rng_park = mulberry32(hash_string(f"trees:park:{seed_text}"))
    for poly in sorted(park_polys, key=lambda p: p.bounds):
        for x, z in _poisson_in_poly(poly, PARK_SPACING_M, rng_park):
            if not excluded(x, z):
                by_source["park"].append((x, z))
    rng_scrub = mulberry32(hash_string(f"trees:scrub:{seed_text}"))
    for poly in sorted(scrub_polys, key=lambda p: p.bounds):
        for x, z in _poisson_in_poly(poly, PARK_SPACING_M, rng_scrub):
            if not excluded(x, z):
                by_source["scrub"].append((x, z))

    # Cap: OSM + rows + street survive; thin the Poisson sets evenly.
    fixed = (len(by_source["osm"]) + len(by_source["row"])
             + len(by_source["street"]))
    room = max(0, MAX_TREES - fixed)
    poisson = ([("forest", p) for p in by_source["forest"]]
               + [("park", p) for p in by_source["park"]]
               + [("scrub", p) for p in by_source["scrub"]])
    if len(poisson) > room:
        rng_thin = mulberry32(hash_string(f"trees:thin:{seed_text}"))
        order = list(range(len(poisson)))
        for i in range(len(order) - 1, 0, -1):
            j = int(next(rng_thin) * (i + 1)) % (i + 1)
            order[i], order[j] = order[j], order[i]
        keep = set(order[:room])
        poisson = [p for i, p in enumerate(poisson) if i in keep]

    # Species + scale (one RNG stream over sorted positions).
    final: list[tuple[float, float, int | None]] = []
    for x, z, leaf in by_source["osm"]:
        final.append((x, z, leaf_species(leaf)))
    for src in ("row", "street"):
        for x, z in by_source[src]:
            final.append((x, z, None))
    for src, (x, z) in poisson:
        final.append((x, z, 2 if src == "scrub" else None))
    final.sort(key=lambda t: (round(t[0], 1), round(t[1], 1)))
    rng_tree = mulberry32(hash_string(f"trees:kind:{seed_text}"))
    trees = []
    species_counts = [0, 0, 0]
    for x, z, forced in final:
        species = forced if forced is not None else pick_species(
            next(rng_tree), species_ratio)
        scale = TREE_SCALE_MIN + next(rng_tree) * (
            TREE_SCALE_MAX - TREE_SCALE_MIN)
        species_counts[species] += 1
        trees.append([round(x, 1), round(z, 1), round(scale, 2), species])

    src_counts = {src: len(by_source[src]) for src in by_source}
    src_counts["forest"] = sum(1 for s, _p in poisson if s == "forest")
    src_counts["park"] = sum(1 for s, _p in poisson if s == "park")
    src_counts["scrub"] = sum(1 for s, _p in poisson if s == "scrub")
    road_counts: dict[str, int] = {}
    for r in roads:
        road_counts[r["k"]] = road_counts.get(r["k"], 0) + 1
    land_counts: dict[str, int] = {}
    for land in lands:
        land_counts[land["k"]] = land_counts.get(land["k"], 0) + 1

    scene = {
        "meta": {
            "name": area_def.get("label", area_id),
            "area": area_id,
            "lat": lat0,
            "lon": lon0,
            "half_m": half_m,
            "seed": seed_text,
            "dem": {**dem_source.describe(), **dem_info},
            "species_ratio": list(species_ratio),
            "counts": {
                "roads": len(roads),
                "roads_by_class": road_counts,
                "lands": len(lands),
                "lands_by_class": land_counts,
                "waters": len(waters),
                "trees": len(trees),
                "trees_by_species": {"conifer": species_counts[0],
                                     "broadleaf": species_counts[1],
                                     "shrub": species_counts[2]},
                "trees_by_source": src_counts,
            },
            "code": SCENE_CODE_VERSION,
        },
        "terrain": {"x0": -half_m, "z0": -half_m, "step": STEP_M,
                    "nx": nx, "nz": nz, "dm": dm},
        "roads": roads,
        "lands": lands,
        "water": waters,
        "trees": trees,
    }
    return scene


def dumps_scene(scene: dict) -> bytes:
    return (json.dumps(scene, sort_keys=True, separators=(",", ":"),
                       ensure_ascii=False) + "\n").encode("utf-8")


# --- incremental driver ----------------------------------------------------------

def scene_source_pbf(area_dir: Path) -> Path:
    buffered = area_dir / "extract.buffered.osm.pbf"
    if buffered.exists():
        return buffered
    return area_dir / "extract.osm.pbf"


def scene_signature(area_id: str, area_def: dict, source_pbf: Path,
                    buildings_path: Path, dem_source,
                    species_ratio: tuple[int, int, int]) -> dict:
    st = source_pbf.stat()
    try:
        bst = buildings_path.stat()
        binfo = {"bytes": bst.st_size, "mtime": int(bst.st_mtime)}
    except OSError:
        binfo = {"bytes": 0, "mtime": 0}
    return {"area": area_id, "bbox": list(area_def["bbox"]),
            "center": list(area_def["center"]),
            "source_extract": source_pbf.name,
            "source_bytes": st.st_size, "source_mtime": int(st.st_mtime),
            "buildings": binfo, "dem": dem_source.name,
            "dem_sig": dem_source.signature(),
            "species_ratio": list(species_ratio),
            "code": SCENE_CODE_VERSION}


def signature_matches(area_dir: Path, sig: dict) -> bool:
    path = area_dir / SCENE_FILE
    if not path.exists():
        return False
    try:
        saved = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False
    return saved.get("meta", {}).get("signature") == sig


def run_scene(area_id: str, build_dir: str | Path,
              dem_name: str = "terrarium",
              dem_root: str | Path = DEFAULT_DEM_DIR,
              species_ratio: tuple[int, int, int] = SPECIES_RATIO,
              overwrite: bool = False) -> dict:
    """Build (or skip) ``scene.json`` for one area."""
    from .areas import AREA_IDS, is_station_box, is_us_area

    started = time.perf_counter()
    if (area_id not in AREA_IDS and not is_station_box(area_id)
            and not is_us_area(area_id)):
        raise KeyError(f"unknown area {area_id!r}")
    build_dir = Path(build_dir)
    area_dir = build_dir / area_id
    area_def_path = area_dir / "area_def.json"
    if not area_def_path.exists():
        raise FileNotFoundError(
            f"{area_id}: area_def.json missing (build the area first)")
    area_def = json.loads(area_def_path.read_text(encoding="utf-8"))
    if area_def.get("kind") != "bbox" or not area_def.get("bbox"):
        return {"area": area_id, "skipped": True,
                "reason": "boundary areas need tiling (spec §6.1); "
                          "the renderer falls back to flat ground"}
    dem_source = open_dem(dem_name, dem_root)
    source_pbf = scene_source_pbf(area_dir)
    if not source_pbf.exists():
        raise FileNotFoundError(f"{area_id}: {source_pbf.name} missing "
                                "(build the area first)")
    buildings_path = area_dir / "buildings.json"
    sig = scene_signature(area_id, area_def, source_pbf, buildings_path,
                          dem_source, species_ratio)
    if not overwrite and signature_matches(area_dir, sig):
        size = (area_dir / SCENE_FILE).stat().st_size
        return {"area": area_id, "skipped": True,
                "reason": "signature matches (same inputs)",
                "seconds": round(time.perf_counter() - started, 2),
                "bytes": size}

    scan = scan_scene_pbf(source_pbf)
    buildings = []
    if buildings_path.exists():
        buildings = json.loads(
            buildings_path.read_text(encoding="utf-8")).get("buildings", [])
    scene = build_scene(area_id, area_def, scan, buildings, dem_source,
                        species_ratio)
    scene["meta"]["signature"] = sig
    blob = dumps_scene(scene)
    (area_dir / SCENE_FILE).write_bytes(blob)
    seconds = round(time.perf_counter() - started, 2)
    return {"area": area_id, "skipped": False, "seconds": seconds,
            "bytes": len(blob), "counts": scene["meta"]["counts"],
            "dem": scene["meta"]["dem"],
            "source_extract": source_pbf.name}
