"""Build separate walk / bike / drive graphs from parsed OSM roads.

Reads ``osm.json`` from an area dir and writes ``graph.json``: shared nodes
(unique road coordinates, ids assigned in sorted coordinate order so they
are stable across runs) plus three directed edge sets. Two-way roads produce
both directions; oneway roads produce one.

Mode rules (documented):

* walk: every ``highway`` except motorways (``motorway``/``motorway_link``
  are never walkable) and expressways (``motorroad=yes`` carries
  motorway-like access rules, e.g. 자동차전용도로). Excluded when
  ``foot=no``, or when ``access`` is ``no``/``private`` without an
  explicit ``foot`` allowance (``yes``/``permissive``/``designated``).
* bike: motorways and ``motorroad=yes`` expressways excluded unless
  ``bicycle=yes``; ``highway=steps`` excluded unless ``bicycle=yes``;
  excluded when ``bicycle=no``, or when ``access`` is ``no``/``private``
  without an explicit ``bicycle`` allowance.
* drive: only drivable classes (motorway→residential, service,
  living_street, road, track, and ``*_link``); footway/path/steps/
  pedestrian/cycleway/bridleway and the like are never drivable. Excluded
  when ``motor_vehicle=no``, or when ``access`` is ``no``/``private``
  without an explicit ``motor_vehicle=yes``.

``oneway=yes`` keeps the way direction only, ``oneway=-1`` (``oneway_reverse``
in osm.json) keeps the reverse direction only; this applies to all three
modes. Edge ``length_m`` is the haversine segment length in metres.

Ways tagged ``area=yes`` (e.g. pedestrian plazas) are surfaces, not linear
paths, so they are excluded from the graph in every mode; they stay in the
roads list (with ``area: true``) for rendering.

Stage 2 buffered method (scene boxes only): the walk/bike/drive graphs are
built from an extract buffered by 300 m around the box
(``extract.buffered.osm.pbf``), connectivity is computed on that buffered
graph, and the shipped graph is clipped to the box keeping every edge
whose segment intersects it (endpoints may lie just outside). The
reported ``walk_lcc`` is the share of clipped-graph walk nodes that fall
in the buffered walk largest component — i.e. paths that connect just
outside the box count as connected. ``walk_lcc_box`` keeps the old
box-only share (before), ``walk_lcc_clipped_raw`` the plain LCC of the
shipped graph, and ``walk_lcc_buffered`` the LCC of the full buffered
graph. Boundary areas skip buffering (before == after).
"""

from __future__ import annotations

import json
import math
from pathlib import Path

GRAPH_FILE = "graph.json"

MOTORWAYS = {"motorway", "motorway_link"}

DRIVABLE_HIGHWAYS = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary",
    "primary_link", "secondary", "secondary_link", "tertiary",
    "tertiary_link", "unclassified", "residential", "service",
    "living_street", "road", "track",
}

ACCESS_DENY = {"no", "private"}
ACCESS_ALLOW = {"yes", "permissive", "designated"}

EARTH_RADIUS_M = 6_371_000.0


def _denied(access: dict, mode_key: str) -> bool:
    """True when access tags close the way for the mode (without override)."""
    if access.get(mode_key) == "no":
        return True
    return (access.get("access") in ACCESS_DENY
            and access.get(mode_key) not in ACCESS_ALLOW)


def _is_expressway(road: dict) -> bool:
    """Motorways plus motorroad=yes expressways (motorway-like rules)."""
    return road.get("highway") in MOTORWAYS or bool(road.get("motorroad"))


def walk_allowed(road: dict) -> bool:
    if _is_expressway(road):
        return False
    return not _denied(road.get("access", {}), "foot")


def bike_allowed(road: dict) -> bool:
    access = road.get("access", {})
    highway = road.get("highway")
    if _is_expressway(road) and access.get("bicycle") != "yes":
        return False
    if highway == "steps" and access.get("bicycle") != "yes":
        return False
    return not _denied(access, "bicycle")


def drive_allowed(road: dict) -> bool:
    if road.get("highway") not in DRIVABLE_HIGHWAYS:
        return False
    return not _denied(road.get("access", {}), "motor_vehicle")


MODE_RULES = {"walk": walk_allowed, "bike": bike_allowed, "drive": drive_allowed}


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    hav = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(hav))


def _directions(road: dict) -> list[tuple[int, int]]:
    """Directed index pairs for one way: [(0, 1)] / [(1, 0)] / both."""
    if road.get("oneway"):
        return [(1, 0)] if road.get("oneway_reverse") else [(0, 1)]
    return [(0, 1), (1, 0)]


def build_graph(roads: list[dict]) -> dict:
    """Build the node set + walk/bike/drive directed edge sets."""
    usable = [r for r in roads
              if len(r.get("geometry", {}).get("coordinates", [])) >= 2
              and not r.get("area")
              and any(rule(r) for rule in MODE_RULES.values())]
    points = {(c[0], c[1]) for r in usable for c in r["geometry"]["coordinates"]}
    node_ids = {pt: f"n{i:06d}" for i, pt in enumerate(sorted(points))}
    nodes = {node_ids[pt]: [pt[0], pt[1]] for pt in sorted(points)}

    edges: dict[str, list[dict]] = {"walk": [], "bike": [], "drive": []}
    for road in sorted(usable, key=lambda r: r["id"]):
        coords = road["geometry"]["coordinates"]
        modes = [mode for mode, rule in MODE_RULES.items() if rule(road)]
        for (a, b), (lon1, lat1), (lon2, lat2) in [
                (d, coords[i], coords[i + 1])
                for i in range(len(coords) - 1)
                for d in _directions(road)]:
            length = round(haversine_m(lon1, lat1, lon2, lat2), 2)
            src, dst = ((lon1, lat1), (lon2, lat2)) if a == 0 else (
                (lon2, lat2), (lon1, lat1))
            for mode in modes:
                edges[mode].append({
                    "from": node_ids[src],
                    "to": node_ids[dst],
                    "way": road["osm_id"],
                    "highway": road.get("highway"),
                    "name": road.get("name"),
                    "length_m": length,
                })
    for mode in edges:
        edges[mode].sort(key=lambda e: (e["from"], e["to"], e["way"]))
    return {"nodes": nodes, "edges": edges}


def largest_component_share(nodes: dict, edges: list[dict]) -> dict:
    """Largest weakly-connected component over edge-incident nodes."""
    parent: dict[str, str] = {}

    def find(node: str) -> str:
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    incident: set[str] = set()
    for edge in edges:
        incident.add(edge["from"])
        incident.add(edge["to"])
    for node in incident:
        parent[node] = node
    for edge in edges:
        ra, rb = find(edge["from"]), find(edge["to"])
        if ra != rb:
            parent[ra] = rb
    sizes: dict[str, int] = {}
    for node in incident:
        sizes[find(node)] = sizes.get(find(node), 0) + 1
    largest = max(sizes.values()) if sizes else 0
    share = largest / len(incident) if incident else 0.0
    return {"nodes": len(incident), "largest": largest,
            "share": round(share, 4)}


def build_area_graph(area_id: str, osm: dict) -> dict:
    graph = build_graph(osm.get("roads", []))
    walk_lcc = largest_component_share(graph["nodes"], graph["edges"]["walk"])
    graph["meta"] = {
        "area": area_id,
        "method": "box",
        "counts": {
            "nodes": len(graph["nodes"]),
            "walk_edges": len(graph["edges"]["walk"]),
            "bike_edges": len(graph["edges"]["bike"]),
            "drive_edges": len(graph["edges"]["drive"]),
        },
        "walk_lcc": walk_lcc,
    }
    return graph


def _point_in_box(lon: float, lat: float,
                  bbox: tuple[float, float, float, float]) -> bool:
    minlon, minlat, maxlon, maxlat = bbox
    return minlon <= lon <= maxlon and minlat <= lat <= maxlat


def _segments_cross(p1: tuple[float, float], p2: tuple[float, float],
                    p3: tuple[float, float], p4: tuple[float, float]) -> bool:
    """True when segments p1-p2 and p3-p4 intersect (inclusive)."""

    def orient(a, b, c) -> float:
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    def on_seg(a, b, c) -> bool:
        return (min(a[0], c[0]) <= b[0] <= max(a[0], c[0])
                and min(a[1], c[1]) <= b[1] <= max(a[1], c[1]))

    o1, o2 = orient(p1, p2, p3), orient(p1, p2, p4)
    o3, o4 = orient(p3, p4, p1), orient(p3, p4, p2)
    if o1 == 0 and on_seg(p1, p3, p2):
        return True
    if o2 == 0 and on_seg(p1, p4, p2):
        return True
    if o3 == 0 and on_seg(p3, p1, p4):
        return True
    if o4 == 0 and on_seg(p3, p2, p4):
        return True
    return (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0)


def segment_intersects_box(p1: tuple[float, float], p2: tuple[float, float],
                           bbox: tuple[float, float, float, float]) -> bool:
    """True when the segment touches or crosses the bbox (edges inclusive)."""
    if _point_in_box(*p1, bbox) or _point_in_box(*p2, bbox):
        return True
    minlon, minlat, maxlon, maxlat = bbox
    corners = [(minlon, minlat), (maxlon, minlat),
               (maxlon, maxlat), (minlon, maxlat)]
    box_edges = [(corners[i], corners[(i + 1) % 4]) for i in range(4)]
    return any(_segments_cross(p1, p2, a, b) for a, b in box_edges)


def clip_graph_to_bbox(graph: dict,
                       bbox: tuple[float, float, float, float]) -> dict:
    """Keep edges whose segment intersects the box (buffered node ids kept).

    Both endpoints of a kept edge stay in the node table even when one of
    them lies outside the box, so stubs poking out of the box survive.
    """
    nodes: dict[str, list[float]] = graph.get("nodes", {})
    coords = {nid: (pt[0], pt[1]) for nid, pt in nodes.items()}
    clipped_edges: dict[str, list[dict]] = {}
    kept: set[str] = set()
    for mode, edges in graph.get("edges", {}).items():
        kept_edges = []
        for edge in edges:
            p1 = coords.get(edge["from"])
            p2 = coords.get(edge["to"])
            if p1 is None or p2 is None:
                continue
            if segment_intersects_box(p1, p2, bbox):
                kept_edges.append(edge)
                kept.add(edge["from"])
                kept.add(edge["to"])
        clipped_edges[mode] = kept_edges
    return {"nodes": {nid: nodes[nid] for nid in sorted(kept)},
            "edges": clipped_edges}


def _component_of(nodes: set[str], edges: list[dict]) -> dict[str, str]:
    """Weakly-connected component root per edge-incident node (union-find)."""
    parent = {n: n for n in nodes}

    def find(node: str) -> str:
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    for edge in edges:
        ra, rb = find(edge["from"]), find(edge["to"])
        if ra != rb:
            parent[ra] = rb
    return {n: find(n) for n in nodes}


def buffered_lcc_share(buffered_walk_edges: list[dict],
                       clipped_walk_edges: list[dict]) -> dict:
    """Share of clipped walk nodes lying in the buffered walk LCC.

    Connectivity comes from the buffered graph; the node set from the
    clipped (shipped) graph. Deterministic: ties between equal-sized
    buffered components break by sorted root id.
    """
    incident: set[str] = set()
    for edge in buffered_walk_edges:
        incident.add(edge["from"])
        incident.add(edge["to"])
    if not incident:
        return {"nodes": 0, "largest": 0, "share": 0.0}
    comp = _component_of(incident, buffered_walk_edges)
    sizes: dict[str, int] = {}
    for node, root in comp.items():
        sizes[root] = sizes.get(root, 0) + 1
    best = max(sizes.values())
    lcc_roots = sorted(r for r, s in sizes.items() if s == best)
    lcc_root = lcc_roots[0]
    clipped_nodes: set[str] = set()
    for edge in clipped_walk_edges:
        clipped_nodes.add(edge["from"])
        clipped_nodes.add(edge["to"])
    inside = sum(1 for n in clipped_nodes if comp.get(n) == lcc_root)
    share = inside / len(clipped_nodes) if clipped_nodes else 0.0
    return {"nodes": len(clipped_nodes), "largest": inside,
            "share": round(share, 4)}


def build_buffered_graph(area_id: str, box_osm: dict,
                         buffered_osm: dict,
                         bbox: tuple[float, float, float, float]) -> dict:
    """Buffered method: box graph (before) + clipped buffered graph (after).

    Returns the clipped graph with a meta block carrying all four LCC
    numbers (``walk_lcc`` is the after-share used for thresholds).
    """
    box_graph = build_graph(box_osm.get("roads", []))
    box_lcc = largest_component_share(box_graph["nodes"],
                                      box_graph["edges"]["walk"])
    buffered = build_graph(buffered_osm.get("roads", []))
    buffered_lcc = largest_component_share(buffered["nodes"],
                                           buffered["edges"]["walk"])
    clipped = clip_graph_to_bbox(buffered, bbox)
    raw_lcc = largest_component_share(clipped["nodes"], clipped["edges"]["walk"])
    after = buffered_lcc_share(buffered["edges"]["walk"],
                               clipped["edges"]["walk"])
    clipped["meta"] = {
        "area": area_id,
        "method": "buffered-300m",
        "counts": {
            "nodes": len(clipped["nodes"]),
            "walk_edges": len(clipped["edges"]["walk"]),
            "bike_edges": len(clipped["edges"]["bike"]),
            "drive_edges": len(clipped["edges"]["drive"]),
        },
        "buffered_counts": {
            "nodes": len(buffered["nodes"]),
            "walk_edges": len(buffered["edges"]["walk"]),
            "bike_edges": len(buffered["edges"]["bike"]),
            "drive_edges": len(buffered["edges"]["drive"]),
        },
        "walk_lcc": after,
        "walk_lcc_box": box_lcc,
        "walk_lcc_buffered": buffered_lcc,
        "walk_lcc_clipped_raw": raw_lcc,
    }
    return clipped


def run_build(area_dir: str | Path) -> dict:
    """CLI hook: read osm.json, write graph.json, return a summary."""
    from . import extract as extract_mod
    from . import osm_parse

    area_dir = Path(area_dir)
    osm = json.loads((area_dir / "osm.json").read_text(encoding="utf-8"))
    area_def = json.loads(
        (area_dir / "area_def.json").read_text(encoding="utf-8"))
    if area_def.get("kind") == "bbox" and area_def.get("bbox"):
        from .areas import US_RAW_PBF
        bbox = tuple(area_def["bbox"])
        if area_def.get("country") == "US":
            buf = extract_mod.ensure_buffered_extract(
                area_dir.name, raw_pbf=US_RAW_PBF,
                build_dir=area_dir.parent)
        else:
            buf = extract_mod.ensure_buffered_extract(area_dir.name,
                                                      build_dir=area_dir.parent)
        if not buf.get("buffered"):
            raise RuntimeError(f"{area_dir.name}: buffered extract unavailable")
        buffered_osm = osm_parse.parse_pbf(buf["extract"])
        graph = build_buffered_graph(area_dir.name, osm, buffered_osm, bbox)
    else:
        graph = build_area_graph(area_dir.name, osm)
        graph["meta"]["method"] = "boundary"
        graph["meta"]["walk_lcc_box"] = graph["meta"]["walk_lcc"]
        graph["meta"]["walk_lcc_buffered"] = graph["meta"]["walk_lcc"]
        graph["meta"]["walk_lcc_clipped_raw"] = graph["meta"]["walk_lcc"]
    (area_dir / GRAPH_FILE).write_text(
        json.dumps(graph, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8")
    counts = graph["meta"]["counts"]
    return {
        "nodes": counts["nodes"],
        "edges": {"walk": counts["walk_edges"], "bike": counts["bike_edges"],
                  "drive": counts["drive_edges"]},
        "walk_lcc_share": graph["meta"]["walk_lcc"]["share"],
        "walk_lcc_box_share": graph["meta"]["walk_lcc_box"]["share"],
        "method": graph["meta"]["method"],
    }
