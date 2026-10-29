"""Light walk graph per region (13, Part 8).

``.venv/bin/python -m pipeline walkgraph`` reads the cached region
extracts (``data/build/_cache/regions/<id>.osm.pbf``, written by the
regions step) and writes ``data/build/walkgraph/<id>.json``: OSM
footways, streets and crossings — no buildings. The web app uses it
for any home outside the built 3D boxes (``find_homes`` walk minutes
+ the 2D map simulation).

Shape per region::

    {"region": id, "nodes": {nid: [lon, lat]},
     "edges": {"walk": [{"from", "to", "length_m"}]},
     "stations": {name: nodeId}}

Node ids are assigned in sorted coordinate order (stable across
runs). Station nodes snap to the nearest walk node within 150 m;
farther stations are listed in ``unlinked_stations`` instead of
being faked.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from .areas import DEFAULT_BUILD_DIR, REPO_ROOT

WALK_HIGHWAYS = {
    "footway", "path", "pedestrian", "steps", "corridor",
    "residential", "living_street", "service", "unclassified",
    "tertiary", "secondary", "primary", "tertiary_link",
    "secondary_link", "primary_link", "cycleway", "bridleway",
    "track", "road",
}

STATION_SNAP_M = 150.0


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def way_walkable(tags: dict) -> bool:
    hw = tags.get("highway")
    if not hw or hw not in WALK_HIGHWAYS:
        return False
    if tags.get("motorroad") == "yes":
        return False
    if tags.get("area") == "yes":
        return False
    if tags.get("foot") == "no":
        return False
    if tags.get("access") in ("no", "private") and tags.get("foot") not in (
        "yes", "permissive", "designated",
    ):
        return False
    return True


def build_walkgraph(ways: list[dict], stations: list[dict]) -> dict:
    """Pure builder: ways [{nodes: [(lon, lat)], tags}], stations
    [{name, lon, lat}] -> graph dict (no stations key fixups)."""
    coords: set[tuple[float, float]] = set()
    for w in ways:
        if not way_walkable(w.get("tags", {})):
            continue
        for c in w.get("nodes", []):
            coords.add((round(c[0], 7), round(c[1], 7)))
    ordered = sorted(coords)
    node_id = {c: str(i) for i, c in enumerate(ordered)}
    nodes = {nid: [c[0], c[1]] for c, nid in node_id.items()}
    edges: list[dict] = []
    for w in ways:
        if not way_walkable(w.get("tags", {})):
            continue
        pts = [(round(c[0], 7), round(c[1], 7)) for c in w.get("nodes", [])]
        for a, b in zip(pts, pts[1:]):
            if a == b or a not in node_id or b not in node_id:
                continue
            edges.append({
                "from": node_id[a], "to": node_id[b],
                "length_m": round(haversine_m(a[0], a[1], b[0], b[1]), 2),
            })
    linked: dict[str, str] = {}
    unlinked: list[str] = []
    node_list = list(node_id.items())
    for s in stations:
        best = None
        best_d = STATION_SNAP_M
        for c, nid in node_list:
            d = haversine_m(s["lon"], s["lat"], c[0], c[1])
            if d < best_d:
                best_d = d
                best = nid
        if best is None:
            unlinked.append(s["name"])
        elif s["name"] not in linked:
            linked[s["name"]] = best
    return {"nodes": nodes, "edges": {"walk": edges},
            "stations": linked, "unlinked_stations": sorted(unlinked)}


def _scan_region(region_pbf: Path):
    import osmium

    ways: list[dict] = []
    stations: list[dict] = []

    class _Scan(osmium.SimpleHandler):
        def way(self, w):
            tags = dict(w.tags)
            if tags.get("highway") not in WALK_HIGHWAYS:
                return
            pts = []
            for n in w.nodes:
                if n.location.valid():
                    pts.append((n.location.lon, n.location.lat))
            if len(pts) >= 2:
                ways.append({"nodes": pts, "tags": tags})

        def node(self, n):
            tags = dict(n.tags)
            if tags.get("railway") in ("station", "halt", "subway_station") \
                    and tags.get("name") and n.location.valid():
                stations.append({"name": tags["name"],
                                 "lon": n.location.lon, "lat": n.location.lat})

    _Scan().apply_file(str(region_pbf), locations=True)
    return ways, stations


def run_build(build_dir: Path | None = None, regions: list[str] | None = None) -> dict:
    build_dir = Path(build_dir) if build_dir else DEFAULT_BUILD_DIR
    regions_path = build_dir / "regions.json"
    if not regions_path.exists():
        raise FileNotFoundError(
            f"{regions_path} missing — run `.venv/bin/python -m pipeline regions` first")
    doc = json.loads(regions_path.read_text(encoding="utf-8"))
    region_ids = [r["id"] for r in doc.get("regions", [])]
    if regions:
        region_ids = [r for r in region_ids if r in set(regions)]
    cache_dir = build_dir / "_cache" / "regions"
    out_dir = build_dir / "walkgraph"
    out_dir.mkdir(parents=True, exist_ok=True)
    per_region: dict[str, dict] = {}
    for rid in region_ids:
        pbf = cache_dir / f"{rid}.osm.pbf"
        if not pbf.exists():
            per_region[rid] = {"status": "missing-extract", "file": str(pbf)}
            continue
        ways, stations = _scan_region(pbf)
        graph = build_walkgraph(ways, stations)
        graph["region"] = rid
        (out_dir / f"{rid}.json").write_text(
            json.dumps(graph, ensure_ascii=False), encoding="utf-8")
        per_region[rid] = {"status": "ok", "ways": len(ways),
                           "nodes": len(graph["nodes"]),
                           "edges": len(graph["edges"]["walk"]),
                           "stations": len(graph["stations"]),
                           "unlinked_stations": graph["unlinked_stations"]}
    ok = sum(1 for v in per_region.values() if v.get("status") == "ok")
    return {"regions": per_region, "ok": ok, "total": len(region_ids),
            "out_dir": str(out_dir)}


def cmd_walkgraph(args) -> int:
    summary = run_build(build_dir=Path(args.build_dir),
                        regions=args.regions.split(",") if args.regions else None)
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


def walkgraph_coverage(build_dir: Path | None = None) -> dict:
    """How many indexed homes are simulatable: 3D (scene), map
    (region walkgraph built), none (with reason)."""
    build_dir = Path(build_dir) if build_dir else DEFAULT_BUILD_DIR
    index_path = build_dir / "homes-index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    homes = index.get("homes", index if isinstance(index, list) else [])
    out = {"d3": 0, "map": 0, "none": 0, "none_reasons": {}}
    for h in homes:
        if h.get("scene"):
            out["d3"] += 1
        elif (build_dir / "walkgraph" / f"{h.get('region')}.json").exists():
            out["map"] += 1
        else:
            out["none"] += 1
            reason = f"no-walkgraph:{h.get('region')}"
            out["none_reasons"][reason] = out["none_reasons"].get(reason, 0) + 1
    out["total"] = out["d3"] + out["map"] + out["none"]
    return out
