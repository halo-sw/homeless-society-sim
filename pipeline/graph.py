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
        "counts": {
            "nodes": len(graph["nodes"]),
            "walk_edges": len(graph["edges"]["walk"]),
            "bike_edges": len(graph["edges"]["bike"]),
            "drive_edges": len(graph["edges"]["drive"]),
        },
        "walk_lcc": walk_lcc,
    }
    return graph


def run_build(area_dir: str | Path) -> dict:
    """CLI hook: read osm.json, write graph.json, return a summary."""
    area_dir = Path(area_dir)
    osm = json.loads((area_dir / "osm.json").read_text(encoding="utf-8"))
    graph = build_area_graph(area_dir.name, osm)
    (area_dir / GRAPH_FILE).write_text(
        json.dumps(graph, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8")
    counts = graph["meta"]["counts"]
    return {
        "nodes": counts["nodes"],
        "edges": {"walk": counts["walk_edges"], "bike": counts["bike_edges"],
                  "drive": counts["drive_edges"]},
        "walk_lcc_share": graph["meta"]["walk_lcc"]["share"],
    }
