"""Low-detail corridor maps along station-ride paths (stage 8, Part A).

For each station-ride path in the scenario (the demo: 잠실 → 판교), builds
a 1 km-tiled corridor under ``data/build/region/corridor/<id>/``: register
(GIS) buildings within ±250 m of the line (stage-1 height estimate, flat
colour, no textures, merged per tile by the browser), major OSM roads
(motorway/trunk/primary), water (the Han included), district boundaries,
and station markers. The browser lazy-loads tiles as the journey camera
approaches and disposes tiles far behind; every tile view is labelled
"간략 지도 (건물 높이 추정)".

Routing reuses the stage-8 rule (shortest line km + transfer penalty from
``scenarios/criteria/kr-default.json`` C-journey-path) so the corridor
covers exactly the path the engine rides.
"""

from __future__ import annotations

import heapq
import json
import math
import subprocess
from pathlib import Path

import osmium
from shapely.geometry import LineString, Point, box
from shapely.ops import substring, unary_union
from shapely.prepared import prep

from .building_join import (
    FLOOR_HEIGHT_M,
    REGISTER_USE_TO_TYPE,
    _valid_floors,
    _valid_height,
    discover_register_files,
    infer_height,
    stream_register,
    wgs84_to_5186_bbox,
)
from .network import normalize_station

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RAW_PBF = REPO_ROOT / "data" / "raw" / "south-korea-latest.osm.pbf"
DEFAULT_BUILD_DIR = REPO_ROOT / "data" / "build"
DEFAULT_CRITERIA = REPO_ROOT / "scenarios" / "criteria" / "kr-default.json"

CORRIDOR_LABEL = "간략 지도 (건물 높이 추정)"
TILE_M = 1000.0
CORRIDOR_HALF_M = 250.0
BUILDINGS_PER_TILE = 1200
ROAD_CLASSES = {"motorway", "trunk", "primary"}
BOUNDARY_LEVELS = {"6", "7", "8"}
METERS_PER_DEG_LAT = 111_320.0
COORD_NDIGITS = 5


def _rnd(v: float) -> float:
    return round(float(v), COORD_NDIGITS)


def transfer_penalty_km(criteria_path: Path = DEFAULT_CRITERIA) -> float:
    """C-journey-path transfer penalty (the corridor covers the engine path)."""
    doc = json.loads(Path(criteria_path).read_text(encoding="utf-8"))
    for c in doc.get("criteria", []):
        if c.get("id") == "C-journey-path":
            return float(c["values"]["transfer_penalty_km"]["value"])
    raise KeyError("C-journey-path missing from criteria")


# ---------------------------------------------------------------------------
# pathfinding (same rule as web/src/engine/journey.js: shortest line km +
# transfer penalty; ties break on station key order for determinism)
# ---------------------------------------------------------------------------

def route_path(network: dict, from_name: str, to_name: str,
               penalty_km: float) -> dict | None:
    """Shortest path between two stations; None when either is missing."""
    stops: dict[str, dict] = {}  # stop id -> {line, key, name, lon, lat}
    for line in network.get("lines", []):
        for s in line.get("stops", []):
            stops[s["id"]] = {"line": line["id"], "line_name": line["name"],
                              **s}
    starts = sorted(sid for sid, s in stops.items()
                    if normalize_station(s["name"]) == normalize_station(from_name))
    goals = {sid for sid, s in stops.items()
             if normalize_station(s["name"]) == normalize_station(to_name)}
    if not starts or not goals:
        return None
    adj: dict[str, list[tuple[str, float, str]]] = {sid: [] for sid in stops}
    for line in network.get("lines", []):
        for p in line.get("patterns", []):
            ids = p["stops"]
            kms = p["chainage_km"]
            for a, b, ka, kb in zip(ids, ids[1:], kms, kms[1:]):
                w = abs(kb - ka)
                adj[a].append((b, w, p["id"]))
                adj[b].append((a, w, p["id"]))
    by_key: dict[str, list[str]] = {}
    for sid, s in stops.items():
        by_key.setdefault(s["key"], []).append(sid)
    for sids in by_key.values():
        for a in sids:
            for b in sids:
                if a != b:
                    adj[a].append((b, penalty_km, "transfer"))
    # Dijkstra from every same-named start (one per line), keep the best.
    best = None
    for start in starts:
        dist = {start: 0.0}
        prev: dict[str, tuple[str, str]] = {}
        heap = [(0.0, start)]
        while heap:
            d, u = heapq.heappop(heap)
            if d > dist[u]:
                continue
            if u in goals:
                break
            for v, w, via in sorted(adj[u], key=lambda e: e[0]):
                nd = d + w
                if nd < dist.get(v, math.inf):
                    dist[v] = nd
                    prev[v] = (u, via)
                    heapq.heappush(heap, (nd, v))
        reached = [(dist[g], g) for g in goals if g in dist]
        if not reached:
            continue
        reached.sort()
        if best is None or reached[0][0] < best[0]:
            # Reconstruct.
            node = reached[0][1]
            chain = [node]
            while node != start:
                node = prev[node][0]
                chain.append(node)
            chain.reverse()
            best = (reached[0][0], start, chain, prev)
    if best is None:
        return None
    _, start, chain, prev = best
    # Split the stop chain into legs (a transfer edge starts a new leg).
    legs = []
    cur = [chain[0]]
    transfers: list[str] = []
    for node in chain[1:]:
        via = prev[node][1]
        if via == "transfer":
            legs.append(cur)
            cur = [node]
            transfers.append(stops[node]["key"])
        else:
            cur.append(node)
    legs.append(cur)
    out_legs = []
    total_km = 0.0
    for leg in legs:
        line_id = stops[leg[0]]["line"]
        km = 0.0
        node = leg[0]
        # Re-walk with the pattern weights (transfers excluded by split).
        for nxt in leg[1:]:
            for v, w, _via in adj[node]:
                if v == nxt and _via != "transfer":
                    km += w
                    break
            node = nxt
        total_km += km
        out_legs.append({
            "line": line_id,
            "line_name": stops[leg[0]]["line_name"],
            "stops": [stops[s]["name"] for s in leg],
            "stop_ids": list(leg),
            "distance_km": round(km, 3),
        })
    return {"from": from_name, "to": to_name, "legs": out_legs,
            "transfers": transfers, "distance_km": round(total_km, 3)}


# ---------------------------------------------------------------------------
# tiling (absolute 1 km-ish grid in degrees; stable across corridors)
# ---------------------------------------------------------------------------

def tile_size_deg(lat_mid: float) -> tuple[float, float]:
    dlat = TILE_M / METERS_PER_DEG_LAT
    dlon = TILE_M / (METERS_PER_DEG_LAT * math.cos(math.radians(lat_mid)))
    return dlon, dlat


def tile_index(lon: float, lat: float, dlon: float, dlat: float) -> tuple[int, int]:
    return math.floor(lon / dlon), math.floor(lat / dlat)


def tile_bounds(ix: int, iy: int, dlon: float, dlat: float) -> tuple[float, float, float, float]:
    return (ix * dlon, iy * dlat, (ix + 1) * dlon, (iy + 1) * dlat)


def tile_id(ix: int, iy: int) -> str:
    return f"t_{ix}_{iy}"


# ---------------------------------------------------------------------------
# path geometry
# ---------------------------------------------------------------------------

def _pattern_by_id(network: dict) -> dict:
    out = {}
    for line in network.get("lines", []):
        for p in line.get("patterns", []):
            out[p["id"]] = p
    return out


def leg_geometry(network: dict, leg: dict) -> LineString | None:
    """Slice of the travelled pattern geometry between the leg's end stops."""
    patterns = _pattern_by_id(network)
    line_id = leg["line"]
    want = leg["stop_ids"]
    for p in patterns.values():
        ids = p["stops"]
        # Find the leg as a contiguous run (either direction).
        for i in range(len(ids) - len(want) + 1):
            run = ids[i:i + len(want)]
            if run != want and run != list(reversed(want)):
                continue
            coords = [(x, y) for x, y in p["geometry"]]
            if len(coords) < 2:
                continue
            geom = LineString(coords)
            stops = {s["id"]: s for line in network["lines"]
                     if line["id"] == line_id for s in line["stops"]}
            a, b = want[0], want[-1]
            try:
                da = geom.project(Point(stops[a]["lon"], stops[a]["lat"]),
                                  normalized=True)
                db = geom.project(Point(stops[b]["lon"], stops[b]["lat"]),
                                  normalized=True)
            except Exception:
                return None
            lo, hi = (da, db) if da <= db else (db, da)
            if hi - lo < 1e-9:
                return None
            return substring(geom, lo, hi, normalized=True)
    return None


def path_geometry(network: dict, path: dict) -> LineString:
    """Concatenated leg geometries (straight hops at transfers)."""
    parts = []
    for leg in path["legs"]:
        g = leg_geometry(network, leg)
        if g is not None:
            parts.extend(list(g.coords))
    if len(parts) < 2:
        # Fallback: straight hops between the leg end stations.
        stops = {s["id"]: s for line in network["lines"] for s in line["stops"]}
        for leg in path["legs"]:
            for sid in (leg["stop_ids"][0], leg["stop_ids"][-1]):
                s = stops[sid]
                parts.append((s["lon"], s["lat"]))
    # De-dupe consecutive points (transfer joints repeat a station).
    out = [parts[0]]
    for pt in parts[1:]:
        if pt != out[-1]:
            out.append(pt)
    return LineString(out)


# ---------------------------------------------------------------------------
# context clip (roads / water / boundaries from the national pbf)
# ---------------------------------------------------------------------------

class _ClipScan(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.roads: list[dict] = []
        self.water_ways: list[dict] = []
        self.boundaries: dict[int, dict] = {}
        self.way_geoms: dict[int, list] = {}

    def relation(self, r):
        tags = dict(r.tags)
        if (tags.get("type") == "boundary"
                and tags.get("boundary") == "administrative"
                and tags.get("admin_level") in BOUNDARY_LEVELS):
            members = [(m.type, m.ref) for m in r.members]
            self.boundaries[r.id] = {"tags": tags, "members": members}

    def way(self, w):
        coords = [(m.lon, m.lat) for m in w.nodes if m.location.valid()]
        if len(coords) < 2:
            return
        tags = dict(w.tags)
        self.way_geoms[w.id] = coords
        hw = tags.get("highway")
        if hw in ROAD_CLASSES:
            self.roads.append({"name": tags.get("name"), "class": hw,
                               "coords": coords})
        if tags.get("natural") == "water" or tags.get("waterway") in (
                "riverbank", "river", "canal"):
            closed = len(coords) >= 4 and coords[0] == coords[-1]
            self.water_ways.append({"name": tags.get("name"),
                                    "kind": tags.get("waterway") or "water",
                                    "coords": coords, "closed": closed})


def _simplify_coords(coords: list, tolerance_deg: float) -> list:
    if len(coords) <= 2:
        return [[_rnd(x), _rnd(y)] for x, y in coords]
    try:
        line = LineString(coords).simplify(tolerance_deg,
                                           preserve_topology=False)
        pts = list(line.coords)
    except Exception:
        pts = coords
    return [[_rnd(x), _rnd(y)] for x, y in pts]


def _clip_line_to_tile(coords: list, bounds) -> list[list]:
    """Line ∩ tile bbox (one part per continuous run inside)."""
    try:
        hit = LineString(coords).intersection(bounds)
    except Exception:
        return []
    if hit.is_empty:
        return []
    geoms = list(hit.geoms) if hit.geom_type == "MultiLineString" else [hit]
    out = []
    for g in geoms:
        if g.geom_type == "LineString" and len(g.coords) >= 2:
            out.append(_simplify_coords(list(g.coords), 0.0001))
    return out


def clip_context(clip_pbf: Path, tiles: dict[tuple[int, int], dict],
                 dlon: float, dlat: float) -> None:
    """Parse the clip extract; append roads/water/boundaries per tile."""
    scan = _ClipScan()
    scan.apply_file(str(clip_pbf), locations=True)
    bounds_by_tile = {key: box(*tile_bounds(*key, dlon, dlat)) for key in tiles}

    def _tiles_for(bbox) -> list:
        minx, miny, maxx, maxy = bbox
        ix0, iy0 = tile_index(minx, miny, dlon, dlat)
        ix1, iy1 = tile_index(maxx, maxy, dlon, dlat)
        return [(ix, iy) for ix in range(ix0, ix1 + 1)
                for iy in range(iy0, iy1 + 1) if (ix, iy) in tiles]

    for road in scan.roads:
        xs = [c[0] for c in road["coords"]]
        ys = [c[1] for c in road["coords"]]
        for key in _tiles_for((min(xs), min(ys), max(xs), max(ys))):
            for part in _clip_line_to_tile(road["coords"], bounds_by_tile[key]):
                tiles[key]["roads"].append({"name": road["name"],
                                            "class": road["class"],
                                            "pts": part})
    for water in scan.water_ways:
        xs = [c[0] for c in water["coords"]]
        ys = [c[1] for c in water["coords"]]
        for key in _tiles_for((min(xs), min(ys), max(xs), max(ys))):
            for part in _clip_line_to_tile(water["coords"], bounds_by_tile[key]):
                tiles[key]["water"].append({"name": water["name"],
                                            "closed": water["closed"],
                                            "pts": part})
    for rel in scan.boundaries.values():
        name = rel["tags"].get("name")
        for typ, ref in rel["members"]:
            if typ != "w" or ref not in scan.way_geoms:
                continue
            coords = scan.way_geoms[ref]
            xs = [c[0] for c in coords]
            ys = [c[1] for c in coords]
            for key in _tiles_for((min(xs), min(ys), max(xs), max(ys))):
                for part in _clip_line_to_tile(coords, bounds_by_tile[key]):
                    tiles[key]["boundaries"].append({"name": name, "pts": part})


# ---------------------------------------------------------------------------
# buildings
# ---------------------------------------------------------------------------

def _corridor_height(rec: dict) -> tuple[float, str]:
    """Stage-1 height priority on register fields (no OSM join here)."""
    h = _valid_height(rec.get("height"))
    if h is not None:
        return h, "register_height"
    fl = _valid_floors(rec.get("floors_above"))
    if fl is not None:
        return round(fl * FLOOR_HEIGHT_M, 2), "register_floors"
    area = rec.get("footprint_area") or 0.0
    btype = REGISTER_USE_TO_TYPE.get(rec.get("use") or "", "yes")
    h, _fl = infer_height(btype, area, "corridor", rec["id"])
    return h, "inferred"


def _footprint_points(poly, cap: int = 12) -> list | None:
    geoms = list(poly.geoms) if poly.geom_type == "MultiPolygon" else [poly]
    geoms = [g for g in geoms if not g.is_empty]
    if not geoms:
        return None
    big = max(geoms, key=lambda g: g.area)
    try:
        simple = big.simplify(0.00001, preserve_topology=True)
        ring = list(simple.exterior.coords)
    except Exception:
        ring = list(big.exterior.coords)
    if len(ring) > cap:
        step = (len(ring) - 1) / (cap - 1)
        ring = [ring[round(i * step)] for i in range(cap - 1)] + [ring[0]]
    return [[_rnd(x), _rnd(y)] for x, y in ring]


def collect_buildings(path_geom, tiles: dict[tuple[int, int], dict],
                      dlon: float, dlat: float,
                      register_dir: Path) -> dict:
    """Register buildings within ±250 m of the path, assigned per tile."""
    half_deg = CORRIDOR_HALF_M / METERS_PER_DEG_LAT
    corridor = prep(path_geom.buffer(half_deg * 1.5))
    minlon, minlat, maxlon, maxlat = path_geom.bounds
    pad = half_deg * 2
    from pyproj import Transformer
    to_5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)
    bbox_5186 = wgs84_to_5186_bbox((minlon - pad, minlat - pad,
                                    maxlon + pad, maxlat + pad), to_5186)
    shp_files = discover_register_files(register_dir)
    records = stream_register(shp_files, bbox_5186)
    kept = 0
    dropped = 0
    for rec in records:
        poly = rec["geometry_wgs84"]
        if not corridor.intersects(poly):
            continue
        pts = _footprint_points(poly)
        if not pts:
            continue
        height, source = _corridor_height(rec)
        c = poly.centroid
        key = tile_index(c.x, c.y, dlon, dlat)
        if key not in tiles:
            continue
        tiles[key]["buildings"].append({"id": rec["id"], "h": height,
                                        "hs": source, "pts": pts})
        kept += 1
    for key, tile in tiles.items():
        tile["buildings"].sort(key=lambda b: b["id"])
        if len(tile["buildings"]) > BUILDINGS_PER_TILE:
            dropped += len(tile["buildings"]) - BUILDINGS_PER_TILE
            tile["buildings"] = tile["buildings"][:BUILDINGS_PER_TILE]
    return {"kept": kept, "dropped": dropped, "scanned": len(records)}


# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------

def _tiles_for_path(path_geom, lat_mid: float) -> tuple[dict, float, float]:
    dlon, dlat = tile_size_deg(lat_mid)
    minlon, minlat, maxlon, maxlat = path_geom.bounds
    pad_lon = CORRIDOR_HALF_M / (METERS_PER_DEG_LAT
                                 * math.cos(math.radians(lat_mid)))
    pad_lat = CORRIDOR_HALF_M / METERS_PER_DEG_LAT
    ix0, iy0 = tile_index(minlon - pad_lon, minlat - pad_lat, dlon, dlat)
    ix1, iy1 = tile_index(maxlon + pad_lon, maxlat + pad_lat, dlon, dlat)
    # Keep only tiles near the path (the bbox rectangle would drown a
    # diagonal path in empty tiles, one HTTP fetch each).
    near = prep(path_geom.buffer(max(dlon, dlat) * 0.75))
    tiles: dict[tuple[int, int], dict] = {}
    for ix in range(ix0, ix1 + 1):
        for iy in range(iy0, iy1 + 1):
            if not near.intersects(box(*tile_bounds(ix, iy, dlon, dlat))):
                continue
            tiles[(ix, iy)] = {"id": tile_id(ix, iy),
                               "bounds": [round(v, 6) for v in
                                          tile_bounds(ix, iy, dlon, dlat)],
                               "buildings": [], "roads": [],
                               "water": [], "boundaries": []}
    return tiles, dlon, dlat


def _station_coords(network: dict) -> dict:
    out = {}
    for line in network.get("lines", []):
        for s in line.get("stops", []):
            out[s["id"]] = s
    return out


def run_build(from_station: str, to_station: str,
              raw_pbf: Path = DEFAULT_RAW_PBF,
              build_dir: Path = DEFAULT_BUILD_DIR,
              register_dir: Path | None = None,
              criteria_path: Path = DEFAULT_CRITERIA,
              osmium_bin: str = "osmium") -> dict:
    """Build one corridor; returns the manifest summary."""
    from .network import DEFAULT_BUILD_DIR as _BD  # noqa: F401 (path default)
    build_dir = Path(build_dir)
    network_file = build_dir / "region" / "network.json"
    if not network_file.exists():
        raise FileNotFoundError(f"{network_file} missing (run network first)")
    network = json.loads(network_file.read_text(encoding="utf-8"))
    penalty = transfer_penalty_km(criteria_path)
    path = route_path(network, from_station, to_station, penalty)
    if path is None:
        raise LookupError(f"no path {from_station!r} → {to_station!r} in network.json")
    geom = path_geometry(network, path)
    lat_mid = (geom.bounds[1] + geom.bounds[3]) / 2
    tiles, dlon, dlat = _tiles_for_path(geom, lat_mid)

    # Context clip: roads / water / boundaries.
    cache_dir = build_dir / "_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    minlon, minlat, maxlon, maxlat = geom.bounds
    pad = 400.0 / METERS_PER_DEG_LAT
    clip_file = cache_dir / "corridor-context.osm.pbf"
    bbox = f"{minlon - pad},{minlat - pad},{maxlon + pad},{maxlat + pad}"
    cmd = [osmium_bin, "extract", "-b", bbox, str(raw_pbf),
           "-o", str(clip_file), "--no-progress", "--overwrite"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"osmium extract failed: {proc.stderr.strip()}")
    clip_context(clip_file, tiles, dlon, dlat)

    # Buildings.
    reg_dir = Path(register_dir) if register_dir else (
        REPO_ROOT / "data" / "raw" / "buildings")
    bstat = collect_buildings(geom, tiles, dlon, dlat, reg_dir)

    # Index id: reuse the corridor for the same endpoints, else next cN.
    region_dir = build_dir / "region"
    index_file = region_dir / "corridors.json"
    index = {"corridors": []}
    if index_file.exists():
        index = json.loads(index_file.read_text(encoding="utf-8"))
    hit = next((c for c in index.get("corridors", [])
                if c.get("from") == from_station and c.get("to") == to_station),
               None)
    cid = hit["id"] if hit else f"c{len(index.get('corridors', [])) + 1}"

    corridor_dir = region_dir / "corridor" / cid
    tiles_dir = corridor_dir / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    for stale in tiles_dir.glob("t_*.json"):
        stale.unlink()  # a re-routed path must not leave ghost tiles
    total_bytes = 0
    tile_rows = []
    by_id = _station_coords(network)
    for key in sorted(tiles):
        tile = tiles[key]
        payload = {"id": tile["id"], "bounds": tile["bounds"],
                   "label": CORRIDOR_LABEL,
                   "buildings": tile["buildings"], "roads": tile["roads"],
                   "water": tile["water"], "boundaries": tile["boundaries"]}
        text = json.dumps(payload, sort_keys=True, ensure_ascii=False,
                          separators=(",", ":"))
        (tiles_dir / f"{tile['id']}.json").write_text(text, encoding="utf-8")
        total_bytes += len(text.encode("utf-8"))
        tile_rows.append({"id": tile["id"], "bounds": tile["bounds"],
                          "buildings": len(tile["buildings"]),
                          "roads": len(tile["roads"]), "water": len(tile["water"]),
                          "boundaries": len(tile["boundaries"])})
    stations = []
    for leg in path["legs"]:
        for sid in leg["stop_ids"]:
            s = by_id[sid]
            stations.append({"name": s["name"], "line": leg["line"],
                             "line_name": leg["line_name"],
                             "lon": s["lon"], "lat": s["lat"]})
    manifest = {"id": cid, "from": from_station, "to": to_station,
                "label": CORRIDOR_LABEL,
                "path": path,
                "path_km": path["distance_km"],
                "stations": stations,
                "tiles": tile_rows,
                "bounds": [round(v, 6) for v in geom.bounds],
                "sources": ["© OpenStreetMap contributors (ODbL)",
                            "GIS건물통합정보 (국토교통부/VWorld)"]}
    (corridor_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False)
        + "\n", encoding="utf-8")
    entry = {"id": cid, "from": from_station, "to": to_station,
             "dir": f"corridor/{cid}", "tiles": len(tile_rows),
             "buildings": sum(t["buildings"] for t in tile_rows),
             "bytes": total_bytes}
    if hit:
        hit.update(entry)
    else:
        index.setdefault("corridors", []).append(entry)
    index_file.write_text(json.dumps(index, indent=2, sort_keys=True,
                                     ensure_ascii=False) + "\n",
                          encoding="utf-8")
    return {"corridor": cid, "from": from_station, "to": to_station,
            "path_km": path["distance_km"],
            "legs": [(leg["line_name"], leg["stops"][0], leg["stops"][-1],
                      leg["distance_km"]) for leg in path["legs"]],
            "transfers": path["transfers"], "tiles": len(tile_rows),
            "buildings": entry["buildings"], "bytes": total_bytes,
            "register_scanned": bstat["scanned"],
            "register_dropped": bstat["dropped"]}
