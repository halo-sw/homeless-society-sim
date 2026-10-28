"""Parse one area extract into buildings, roads, POIs, landuse and trees.

Reads ``extract.osm.pbf`` with pyosmium (two passes: relations, then
nodes/ways) and returns plain JSON-serializable dicts. All lists are sorted
by stable OSM id so output is deterministic. Coordinates are WGS84
(lon/lat, 7 decimals); the local metre frame is derived downstream by
``area_build`` from the stored origin.
"""

from __future__ import annotations

import json
from pathlib import Path

import osmium
from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize, unary_union

COORD_NDIGITS = 7

POI_KEYS = ("railway", "public_transport", "amenity", "shop", "leisure",
            "tourism")
ACCESS_KEYS = ("access", "foot", "bicycle", "motor_vehicle", "vehicle")
LEISURE_LANDUSE = {"park", "garden", "playground", "pitch", "sports_centre",
                   "stadium", "swimming_pool", "water_park", "nature_reserve",
                   "common", "golf_course"}
NATURAL_LANDUSE = {"water", "wood", "grassland", "scrub", "wetland", "beach",
                   "bare_rock", "sand", "tree_row", "spring"}


def _rnd(v: float) -> float:
    return round(float(v), COORD_NDIGITS)


def _parse_float(text: str | None) -> float | None:
    """Parse values like '12', '12 m', '12m' to metres; None if unparsable."""
    if text is None:
        return None
    token = text.strip().lower().removesuffix("m").strip().replace(",", "")
    try:
        return float(token)
    except ValueError:
        return None


def _parse_int(text: str | None) -> int | None:
    if text is None:
        return None
    try:
        return int(text.strip().split(";")[0])
    except (ValueError, IndexError):
        return None


def _closed(coords: list) -> bool:
    return len(coords) >= 4 and coords[0] == coords[-1]


def _centroid_of(coords: list[tuple[float, float]]) -> tuple[float, float]:
    if _closed(coords):
        c = Polygon(coords).centroid
    else:
        c = LineString(coords).centroid
    return (_rnd(c.x), _rnd(c.y))


def _rings_to_geojson(outers: list, inners: list) -> dict | None:
    """Assemble multipolygon member rings into a Polygon/MultiPolygon."""
    lines = [LineString(c) for c in outers if len(c) >= 2]
    polys = [p for p in polygonize(lines) if p.is_valid and not p.is_empty]
    for c in outers:  # single closed-way members polygonize may miss
        if _closed(c):
            try:
                p = Polygon(c)
                if p.is_valid and not p.is_empty and p not in polys:
                    polys.append(p)
            except ValueError:
                pass
    if not polys:
        return None
    shape = unary_union(polys)
    holes = [LineString(c) for c in inners if len(c) >= 2]
    hole_polys = [p for p in polygonize(holes) if p.is_valid and not p.is_empty]
    for c in inners:
        if _closed(c):
            try:
                p = Polygon(c)
                if p.is_valid and not p.is_empty:
                    hole_polys.append(p)
            except ValueError:
                pass
    if hole_polys:
        shape = shape.difference(unary_union(hole_polys))
    if shape.is_empty:
        return None
    if shape.geom_type == "Polygon":
        rings = [shape.exterior, *shape.interiors]
        coords = [[[_rnd(x), _rnd(y)] for x, y in r.coords] for r in rings]
        return {"type": "Polygon", "coordinates": coords}
    if shape.geom_type == "MultiPolygon":
        all_polys = []
        for poly in shape.geoms:
            rings = [poly.exterior, *poly.interiors]
            all_polys.append([[ [_rnd(x), _rnd(y)] for x, y in r.coords]
                              for r in rings])
        return {"type": "MultiPolygon", "coordinates": all_polys}
    return None


def _polygon_geojson(coords: list) -> dict | None:
    try:
        poly = Polygon(coords)
    except ValueError:
        return None
    if not poly.is_valid or poly.is_empty:
        return None
    rings = [poly.exterior, *poly.interiors]
    return {"type": "Polygon", "coordinates": [
        [[_rnd(x), _rnd(y)] for x, y in r.coords] for r in rings]}


def _point_geojson(lon: float, lat: float) -> dict:
    return {"type": "Point", "coordinates": [_rnd(lon), _rnd(lat)]}


def _line_geojson(coords: list) -> dict:
    return {"type": "LineString",
            "coordinates": [[_rnd(x), _rnd(y)] for x, y in coords]}


def _poi_category(tags: dict) -> str | None:
    for key in POI_KEYS:
        val = tags.get(key)
        if val and val != "no":
            return f"{key}:{val}"
    return None


def _landuse_kind(tags: dict) -> str | None:
    if tags.get("landuse"):
        return f"landuse:{tags['landuse']}"
    leisure = tags.get("leisure")
    if leisure in LEISURE_LANDUSE:
        return f"leisure:{leisure}"
    natural = tags.get("natural")
    if natural in NATURAL_LANDUSE:
        return f"natural:{natural}"
    if tags.get("waterway") in ("riverbank", "dock"):
        return f"waterway:{tags['waterway']}"
    return None


def _is_area(tags: dict) -> bool:
    return (tags.get("building") not in (None, "no")
            or _landuse_kind(tags) is not None
            or tags.get("amenity") == "parking")


class _RelationScan(osmium.SimpleHandler):
    """Pass 1: keep multipolygon relations that are buildings or landuse."""

    def __init__(self):
        super().__init__()
        self.relations: dict[int, dict] = {}

    def relation(self, r):
        tags = dict(r.tags)
        if tags.get("type") != "multipolygon" or not _is_area(tags):
            return
        members = [(m.type, m.ref, m.role) for m in r.members]
        self.relations[r.id] = {"tags": tags, "members": members}


class _MainPass(osmium.SimpleHandler):
    """Pass 2: nodes (POIs, trees) and ways (buildings, roads, POIs...)."""

    def __init__(self, member_way_ids: set[int]):
        super().__init__()
        self.member_way_ids = member_way_ids
        self.member_geoms: dict[int, list] = {}
        self.nodes_poi: list[dict] = []
        self.trees: list[dict] = []
        self.ways: list[dict] = []

    def node(self, n):
        if not n.location.valid():
            return
        tags = dict(n.tags)
        lon, lat = _rnd(n.location.lon), _rnd(n.location.lat)
        if tags.get("natural") == "tree":
            self.trees.append({"id": f"n{n.id}", "osm_kind": "node",
                               "osm_id": n.id,
                               "geometry": _point_geojson(lon, lat)})
            return
        cat = _poi_category(tags)
        if tags.get("name") and cat:
            self.nodes_poi.append(
                {"id": f"n{n.id}", "osm_kind": "node", "osm_id": n.id,
                 "name": tags["name"], "category": cat,
                 "geometry": _point_geojson(lon, lat)})

    def way(self, w):
        coords = [(m.lon, m.lat) for m in w.nodes
                  if m.location.valid()]
        if not coords:
            return
        if w.id in self.member_way_ids:
            self.member_geoms[w.id] = coords
        tags = dict(w.tags)
        if not (tags.get("highway") or _is_area(tags)
                or _poi_category(tags) or tags.get("natural") == "tree_row"):
            return
        self.ways.append({"osm_id": w.id, "tags": tags, "coords": coords})


def _building_feature(fid: str, kind: str, oid: int, tags: dict,
                      geometry: dict) -> dict:
    return {
        "id": fid, "osm_kind": kind, "osm_id": oid,
        "building": tags.get("building"),
        "name": tags.get("name"),
        "height_m": _parse_float(tags.get("height")),
        "min_height_m": _parse_float(tags.get("min_height")),
        "levels": _parse_int(tags.get("building:levels")),
        "min_level": _parse_int(tags.get("building:min_level")),
        "geometry": geometry,
    }


def _road_feature(oid: int, tags: dict, coords: list) -> dict:
    oneway = tags.get("oneway", "no")
    return {
        "id": f"w{oid}", "osm_kind": "way", "osm_id": oid,
        "highway": tags.get("highway"),
        "name": tags.get("name"),
        # area=yes marks a surface (e.g. a pedestrian plaza), not a linear
        # path: kept in the roads list for rendering, excluded from the
        # routing graph (see pipeline.graph).
        "area": tags.get("area") == "yes",
        # motorroad=yes marks an expressway (자동차전용도로) with
        # motorway-like access rules: never walkable (see pipeline.graph).
        "motorroad": tags.get("motorroad") == "yes",
        "oneway": oneway in ("yes", "true", "1", "-1"),
        "oneway_reverse": oneway == "-1",
        "access": {k: tags[k] for k in ACCESS_KEYS if k in tags},
        "lanes": _parse_int(tags.get("lanes")),
        "bridge": tags.get("bridge"),
        "tunnel": tags.get("tunnel"),
        "layer": _parse_int(tags.get("layer")) or 0,
        "geometry": _line_geojson(coords),
    }


def _way_poi(oid: int, tags: dict, coords: list) -> dict | None:
    cat = _poi_category(tags)
    if not (tags.get("name") and cat):
        return None
    lon, lat = _centroid_of(coords)
    return {"id": f"w{oid}", "osm_kind": "way", "osm_id": oid,
            "name": tags["name"], "category": cat,
            "geometry": _point_geojson(lon, lat)}


def parse_pbf(path: str | Path) -> dict:
    """Parse an area extract; returns deterministic dict of feature lists."""
    path = str(path)

    rel_scan = _RelationScan()
    rel_scan.apply_file(path, locations=False)
    member_way_ids: set[int] = set()
    for rel in rel_scan.relations.values():
        for ref_type, ref, _role in rel["members"]:
            if ref_type == "w":
                member_way_ids.add(ref)

    main = _MainPass(member_way_ids)
    main.apply_file(path, locations=True)

    buildings: list[dict] = []
    roads: list[dict] = []
    pois: list[dict] = list(main.nodes_poi)
    landuse: list[dict] = []

    for w in main.ways:
        oid, tags, coords = w["osm_id"], w["tags"], w["coords"]
        if tags.get("highway"):
            # Closed loops (pedestrian squares, roundabouts) stay roads.
            roads.append(_road_feature(oid, tags, coords))
        bval = tags.get("building")
        if bval and bval != "no" and _closed(coords):
            geom = _polygon_geojson(coords)
            if geom:
                buildings.append(
                    _building_feature(f"w{oid}", "way", oid, tags, geom))
        kind = _landuse_kind(tags)
        if kind and _closed(coords):
            geom = _polygon_geojson(coords)
            if geom:
                landuse.append({"id": f"w{oid}", "osm_kind": "way",
                                "osm_id": oid, "kind": kind,
                                "name": tags.get("name"), "geometry": geom})
        elif tags.get("natural") == "tree_row":
            landuse.append({"id": f"w{oid}", "osm_kind": "way", "osm_id": oid,
                            "kind": "natural:tree_row",
                            "name": tags.get("name"),
                            "geometry": _line_geojson(coords)})
        poi = _way_poi(oid, tags, coords)
        if poi:
            pois.append(poi)

    for rid, rel in rel_scan.relations.items():
        tags = rel["tags"]
        outers, inners = [], []
        for ref_type, ref, role in rel["members"]:
            if ref_type != "w" or ref not in main.member_geoms:
                continue
            (inners if role == "inner" else outers).append(
                main.member_geoms[ref])
        geom = _rings_to_geojson(outers, inners)
        if geom is None:
            continue
        bval = tags.get("building")
        if bval and bval != "no":
            buildings.append(
                _building_feature(f"r{rid}", "relation", rid, tags, geom))
        kind = _landuse_kind(tags)
        if kind:
            landuse.append({"id": f"r{rid}", "osm_kind": "relation",
                            "osm_id": rid, "kind": kind,
                            "name": tags.get("name"), "geometry": geom})
        cat = _poi_category(tags)
        if tags.get("name") and cat:
            shape = unary_union([Polygon(r[0]) for r in
                                 ([geom["coordinates"]] if geom["type"] == "Polygon"
                                  else geom["coordinates"])])
            c = shape.centroid
            pois.append({"id": f"r{rid}", "osm_kind": "relation",
                         "osm_id": rid, "name": tags["name"],
                         "category": cat,
                         "geometry": _point_geojson(c.x, c.y)})

    buildings.sort(key=lambda f: f["id"])
    roads.sort(key=lambda f: f["id"])
    pois.sort(key=lambda f: f["id"])
    landuse.sort(key=lambda f: f["id"])
    trees = sorted(main.trees, key=lambda f: f["id"])

    return {
        "buildings": buildings,
        "roads": roads,
        "pois": pois,
        "landuse": landuse,
        "trees": trees,
        "meta": {
            "counts": {
                "buildings": len(buildings),
                "roads": len(roads),
                "pois": len(pois),
                "landuse": len(landuse),
                "trees": len(trees),
            }
        },
    }


def parse_extract(area_id: str, build_dir: str | Path) -> dict:
    """Parse ``data/build/<area_id>/extract.osm.pbf``."""
    from .extract import EXTRACT_FILE

    path = Path(build_dir) / area_id / EXTRACT_FILE
    if not path.exists():
        raise FileNotFoundError(f"extract not found: {path} (run extract first)")
    parsed = parse_pbf(path)
    parsed["meta"]["area"] = area_id
    parsed["meta"]["source"] = path.name
    return parsed


def write_osm_json(parsed: dict, path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(parsed, indent=2, sort_keys=True,
                               ensure_ascii=False) + "\n", encoding="utf-8")
    return path
