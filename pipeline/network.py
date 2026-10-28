"""수도권 전철 station network from OSM route relations (stage 8, Part A).

Reads the national extract (via a cached osmium prefilter: route relations
+ railway station nodes, then the relations' member ways by id) and builds
``data/build/region/network.json``: per-line stop order, station nodes
(name, line, coordinates), simplified line geometry, and same-name
transfers. The life engine routes station rides on this graph
(``web/src/engine/journey.js``); the journey view draws the geometry.

Line model: OSM carries one relation per directed service pattern
(``서울 지하철 2호선: 내선순환``, ``수인·분당선: 왕십리 → 고색``,
``신분당선: 신사 → 광교``, …). 급행 (express) patterns are skipped: the
local stop order covers every station and the ride-minutes total stays the
customer's number. Per line the two longest opposite local patterns become
the canonical directions; every other local pattern is kept for geometry
only when it adds stations (it never does for the five lines today, so the
output keeps exactly the canonical pair — deterministic, no silent extras).

Direction labels (for the congestion lookup):
  * 2호선: ``내선`` / ``외선`` from the relation name (내선순환/외선순환).
  * other lines: ``상선`` when station numbers decrease along the travel
    order, ``하선`` when they increase (the Seoul Metro numbering rule),
    numbers from the congestion table (pipeline.congestion) or OSM ``ref``
    tags; when neither exists the label is ``<종점> 방면`` and the
    congestion lookup falls back to the criterion 가정값 (see C-congestion).

Distances: consecutive-stop km from the chained member-way geometry
(projected chainage along the travel direction); when the chain breaks the
fallback is stop-to-stop haversine. The method per edge is counted in
``meta`` so the weighting stays honest.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
from pathlib import Path

import osmium
from shapely.geometry import LineString

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RAW_PBF = REPO_ROOT / "data" / "raw" / "south-korea-latest.osm.pbf"
DEFAULT_BUILD_DIR = REPO_ROOT / "data" / "build"
REGION_DIR = "region"
NETWORK_FILE = "network.json"

# Lines the stage-8 journey view needs. "match" substrings hit the OSM
# relation name; 신분당선 is matched before 분당선 (it contains it).
LINE_SPECS = (
    {"id": "line2", "name": "2호선", "match": ("서울 지하철 2호선", "수도권 전철 2호선"), "circle": True},
    {"id": "line8", "name": "8호선", "match": ("서울 지하철 8호선", "수도권 전철 8호선"), "circle": False},
    {"id": "line9", "name": "9호선", "match": ("서울 지하철 9호선", "수도권 전철 9호선"), "circle": False},
    {"id": "sinbundang", "name": "신분당선", "match": ("신분당선",), "circle": False},
    {"id": "bundang", "name": "수인·분당선", "match": ("수인·분당선", "수인분당선", "분당선"), "circle": False},
)

ROUTE_VALUES = {"subway", "train", "light_rail"}
STOP_ROLES = {"stop", "stop_exit_only", "stop_entry_only", "platform",
              "platform_exit_only", "platform_entry_only"}
SKIP_PATTERN_WORDS = ("급행",)  # express patterns: local order covers all stops
NON_METRO_WORDS = ("부산", "대구", "광주", "대전", "인천", "도시철도")

COORD_NDIGITS = 6
GEOM_SIMPLIFY_DEG = 0.00015  # ~15 m
EARTH_R_M = 6_371_000.0


def _rnd(v: float) -> float:
    return round(float(v), COORD_NDIGITS)


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle metres between two WGS84 points."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_M * math.asin(math.sqrt(a))


def normalize_station(name: str) -> str:
    """Transfer/display key: strip whitespace, parenthetical subsidiaries
    (``교대(법원·검찰청)`` → ``교대``) and a trailing 역."""
    base = (name or "").strip()
    base = re.sub(r"\s*\([^()]*\)\s*$", "", base).strip()
    return base.removesuffix("역").strip()


def _line_of_relation(tags: dict) -> dict | None:
    if tags.get("type") != "route" or tags.get("route") not in ROUTE_VALUES:
        return None
    name = tags.get("name", "")
    if any(w in name for w in NON_METRO_WORDS):
        return None
    # Order matters: 신분당선 contains 분당선.
    for spec in (LINE_SPECS[3], LINE_SPECS[4], LINE_SPECS[0], LINE_SPECS[1], LINE_SPECS[2]):
        if any(k in name for k in spec["match"]):
            return spec
    return None


class _RelationScan(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.relations: dict[int, dict] = {}

    def relation(self, r):
        tags = dict(r.tags)
        spec = _line_of_relation(tags)
        if spec is None:
            return
        if any(w in tags.get("name", "") for w in SKIP_PATTERN_WORDS):
            return
        members = [(m.type, m.ref, m.role) for m in r.members]
        self.relations[r.id] = {"tags": tags, "members": members,
                                "line_id": spec["id"]}


class _MemberScan(osmium.SimpleHandler):
    """Node tags/coords + way geometries for relation members."""

    def __init__(self, node_ids: set[int], way_ids: set[int]):
        super().__init__()
        self.node_ids = node_ids
        self.way_ids = way_ids
        self.nodes: dict[int, dict] = {}
        self.ways: dict[int, dict] = {}
        self.stations: list[dict] = []  # railway station nodes (name fallback)

    def node(self, n):
        if not n.location.valid():
            return
        tags = dict(n.tags)
        if n.id in self.node_ids:
            self.nodes[n.id] = {"tags": tags,
                                "lon": n.location.lon, "lat": n.location.lat}
        if tags.get("railway") in ("station", "halt", "subway_station") and tags.get("name"):
            self.stations.append({"name": tags["name"], "lon": n.location.lon,
                                  "lat": n.location.lat,
                                  "ref": tags.get("ref")})

    def way(self, w):
        if w.id not in self.way_ids:
            return
        coords = [(m.lon, m.lat) for m in w.nodes if m.location.valid()]
        if len(coords) >= 2:
            self.ways[w.id] = {"coords": coords, "tags": dict(w.tags)}


def prefilter_path(cache_dir: Path) -> Path:
    return cache_dir / "network-routes.osm.pbf"


def members_path(cache_dir: Path) -> Path:
    return cache_dir / "network-members.osm.pbf"


def ensure_prefilter(raw_pbf: Path, cache_dir: Path,
                     osmium_bin: str = "osmium",
                     refresh: bool = False) -> tuple[Path, Path]:
    """Cache route relations + station nodes, then member ways by id."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    rel_file = prefilter_path(cache_dir)
    mem_file = members_path(cache_dir)
    if (not refresh and rel_file.exists() and mem_file.exists()
            and rel_file.stat().st_mtime >= raw_pbf.stat().st_mtime
            and mem_file.stat().st_mtime >= rel_file.stat().st_mtime):
        return rel_file, mem_file
    exprs = ["r/route=subway,train,light_rail",
             "n/railway=station,halt,subway_station"]
    cmd = [osmium_bin, "tags-filter", str(raw_pbf), *exprs,
           "-o", str(rel_file), "--no-progress", "--overwrite"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"osmium tags-filter failed: {proc.stderr.strip()}")
    scan = _RelationScan()
    scan.apply_file(str(rel_file), locations=False)
    node_ids: set[int] = set()
    way_ids: set[int] = set()
    for rel in scan.relations.values():
        for ref_type, ref, _role in rel["members"]:
            if ref_type == "n":
                node_ids.add(ref)
            elif ref_type == "w":
                way_ids.add(ref)
    id_file = cache_dir / "network-member-ids.txt"
    with open(id_file, "w", encoding="utf-8") as fh:
        for i in sorted(node_ids):
            fh.write(f"n{i}\n")
        for i in sorted(way_ids):
            fh.write(f"w{i}\n")
    cmd = [osmium_bin, "getid", str(raw_pbf), "-i", str(id_file),
           "-o", str(mem_file), "--no-progress", "--overwrite"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"osmium getid failed: {proc.stderr.strip()}")
    return rel_file, mem_file


def _nearest_station(stations: list[dict], lon: float, lat: float,
                     max_m: float = 500.0) -> dict | None:
    best = None
    best_d = max_m
    for s in stations:
        d = haversine_m(lon, lat, s["lon"], s["lat"])
        if d < best_d:
            best_d = d
            best = s
    return best


def _resolve_stop(member_scan: _MemberScan, ref: int) -> dict | None:
    """Station identity for a stop/platform member node."""
    node = member_scan.nodes.get(ref)
    if node is None:
        return None
    name = node["tags"].get("name")
    lon, lat = node["lon"], node["lat"]
    ref_no = node["tags"].get("ref")
    if not name:
        near = _nearest_station(member_scan.stations, lon, lat)
        if near is None:
            return None
        name, lon, lat = near["name"], near["lon"], near["lat"]
        ref_no = ref_no or near.get("ref")
    return {"name": name, "lon": lon, "lat": lat, "ref": ref_no}


def _pattern_stops(rel: dict, member_scan: _MemberScan) -> list[dict]:
    """Ordered stops: member order, consecutive same-name pairs collapsed
    (PTv2 lists a stop node and its platform for the same station)."""
    stops: list[dict] = []
    for ref_type, ref, role in rel["members"]:
        if role not in STOP_ROLES or ref_type != "n":
            continue
        stop = _resolve_stop(member_scan, ref)
        if stop is None:
            continue
        if stops and normalize_station(stops[-1]["name"]) == normalize_station(stop["name"]):
            continue
        stops.append(stop)
    return stops


def _chain_ways(ways: list[list[tuple[float, float]]]) -> list[tuple[float, float]]:
    """Endpoint chaining of member-way geometries (longest chain).

    Ways join at shared endpoints in either orientation, regardless of
    relation order; chains also merge with each other. Returns the longest
    chain — partial when the relation's ways are genuinely disconnected.
    """
    if not ways:
        return []
    chains = [list(w) for w in ways]
    merged = True
    while merged and len(chains) > 1:
        merged = False
        for i in range(len(chains)):
            for j in range(len(chains)):
                if i == j:
                    continue
                a, b = chains[i], chains[j]
                joined = None
                if a[-1] == b[0]:
                    joined = a + b[1:]
                elif a[-1] == b[-1]:
                    joined = a + list(reversed(b[:-1]))
                elif a[0] == b[-1]:
                    joined = b + a[1:]
                elif a[0] == b[0]:
                    joined = list(reversed(b[1:])) + a
                if joined is not None:
                    chains = [c for k, c in enumerate(chains)
                              if k not in (i, j)] + [joined]
                    merged = True
                    break
            if merged:
                break
    chains.sort(key=len, reverse=True)
    return chains[0]


def _chainage_km(coords: list[tuple[float, float]],
                 stops: list[dict]) -> tuple[list[float], list[str]]:
    """Per-stop km along the chained geometry in travel order.

    Projects each stop onto the chain; loops wrap around the total length.
    Each consecutive pair uses the geometry substring when both stops
    project in travel order, else stop-to-stop haversine. Returns the km
    list plus one method per edge ("geometry"/"haversine").
    """
    if len(coords) < 2 or not stops:
        return [], []
    try:
        line = LineString(coords)
    except ValueError:
        return _haversine_chain(stops), ["haversine"] * (len(stops) - 1)
    total_m = sum(haversine_m(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1])
                  for i in range(len(coords) - 1))
    if total_m <= 0:
        return _haversine_chain(stops), ["haversine"] * (len(stops) - 1)
    from shapely.geometry import Point
    # Stops further than ~500 m from the chain do not project (a far
    # projection would silently shrink the edge to the chain's extent).
    MAX_PROJECT_DEG = 0.005
    fracs: list[float | None] = []
    for s in stops:
        try:
            pt = Point(s["lon"], s["lat"])
            if pt.distance(line) > MAX_PROJECT_DEG:
                fracs.append(None)
            else:
                fracs.append(line.project(pt, normalized=True))
        except Exception:
            fracs.append(None)
    # The chained ways may run against the travel order: try the chain
    # both ways and keep the direction with more forward segments.
    rev = list(reversed(coords))
    try:
        rline = LineString(rev)
        rfracs: list[float | None] = []
        for s in stops:
            try:
                pt = Point(s["lon"], s["lat"])
                if pt.distance(rline) > MAX_PROJECT_DEG:
                    rfracs.append(None)
                else:
                    rfracs.append(rline.project(pt, normalized=True))
            except Exception:
                rfracs.append(None)
    except ValueError:
        rfracs = [None] * len(stops)

    def _forward(fs: list[float | None]) -> int:
        n = 0
        for a, b in zip(fs, fs[1:]):
            if a is not None and b is not None and b >= a:
                n += 1
        return n

    if _forward(rfracs) > _forward(fracs):
        fracs = rfracs
    kms = [0.0]
    methods: list[str] = []
    for i in range(1, len(stops)):
        a, b = fracs[i - 1], fracs[i]
        d = -1.0
        if a is not None and b is not None:
            d = (b - a) * total_m / 1000.0
            if d < -total_m / 2000.0:
                d += total_m / 1000.0  # loop wrap
        if d < 0:
            d = haversine_m(stops[i - 1]["lon"], stops[i - 1]["lat"],
                            stops[i]["lon"], stops[i]["lat"]) / 1000.0
            methods.append("haversine")
        else:
            methods.append("geometry")
        kms.append(kms[-1] + d)
    return kms, methods


def _haversine_chain(stops: list[dict]) -> list[float]:
    kms = [0.0]
    for i in range(1, len(stops)):
        kms.append(kms[-1] + haversine_m(stops[i - 1]["lon"], stops[i - 1]["lat"],
                                         stops[i]["lon"], stops[i]["lat"]) / 1000.0)
    return kms


def _pattern_numbers(stops: list[dict], congestion: dict | None) -> list[int | None]:
    """Station numbers along the order, for 상선/하선 derivation."""
    out: list[int | None] = []
    table = ((congestion or {}).get("station_numbers") or {})
    for s in stops:
        num = None
        for line_key, stations in table.items():
            hit = stations.get(s["name"]) or stations.get(normalize_station(s["name"]))
            if hit is not None:
                num = hit
                break
        if num is None and s.get("ref"):
            try:
                num = int(str(s["ref"]).strip().split(";")[0])
            except ValueError:
                num = None
        out.append(num)
    return out


def _direction_for(line_id: str, rel_name: str, stops: list[dict],
                   congestion: dict | None) -> tuple[str, str]:
    """(kind, label): inner/outer/up/down/toward + Korean label."""
    if line_id == "line2":
        if "내선" in rel_name:
            return "inner", "내선"
        if "외선" in rel_name:
            return "outer", "외선"
    nums = [n for n in _pattern_numbers(stops, congestion) if n is not None]
    if len(nums) >= 2 and len(set(nums)) >= 2:
        # Majority vote over consecutive pairs (robust to one bad number).
        ups = sum(1 for a, b in zip(nums, nums[1:]) if b < a)
        downs = sum(1 for a, b in zip(nums, nums[1:]) if b > a)
        if ups > downs:
            return "up", "상선"
        if downs > ups:
            return "down", "하선"
    if stops:
        return "toward", f"{normalize_station(stops[-1]['name'])} 방면"
    return "toward", "방면 미상"


def build_network(rel_file: Path, mem_file: Path,
                  congestion: dict | None = None) -> dict:
    """Assemble the network from the two cached extracts."""
    rel_scan = _RelationScan()
    rel_scan.apply_file(str(rel_file), locations=False)
    node_ids: set[int] = set()
    way_ids: set[int] = set()
    for rel in rel_scan.relations.values():
        for ref_type, ref, _role in rel["members"]:
            if ref_type == "n":
                node_ids.add(ref)
            elif ref_type == "w":
                way_ids.add(ref)
    mem = _MemberScan(node_ids, way_ids)
    mem.apply_file(str(rel_file), locations=True)
    mem.apply_file(str(mem_file), locations=True)

    by_line: dict[str, list[dict]] = {}
    for rid, rel in rel_scan.relations.items():
        stops = _pattern_stops(rel, mem)
        if len(stops) < 2:
            continue
        way_geoms = [mem.ways[ref]["coords"] for (_t, ref, role) in rel["members"]
                     if _t == "w" and ref in mem.ways and role not in STOP_ROLES]
        chained = _chain_ways(way_geoms)
        by_line.setdefault(rel["line_id"], []).append({
            "rel_id": rid, "name": rel["tags"].get("name", ""),
            "stops": stops, "chained": chained,
        })

    lines = []
    edge_methods = {"geometry": 0, "haversine": 0}
    for spec in LINE_SPECS:
        patterns = by_line.get(spec["id"], [])
        if not patterns:
            continue
        # Canonical pair: the two longest opposite patterns. Opposite =
        # reversed endpoint order (loops: the 내선/외선 pair by name).
        patterns.sort(key=lambda p: len(p["stops"]), reverse=True)
        chosen = _canonical_pair(spec, patterns)
        line_stops: dict[str, dict] = {}
        line_patterns = []
        for p in chosen:
            kms, methods = _chainage_km(p["chained"], p["stops"])
            if not kms:
                kms = _haversine_chain(p["stops"])
                methods = ["haversine"] * (len(p["stops"]) - 1)
            p["_edge_methods"] = methods
            method = ("geometry" if all(m == "geometry" for m in methods)
                      else "haversine" if all(m == "haversine" for m in methods)
                      else "mixed")
            kind, label = _direction_for(spec["id"], p["name"], p["stops"], congestion)
            stop_ids = []
            for s, km in zip(p["stops"], kms):
                key = normalize_station(s["name"])
                if key not in line_stops:
                    line_stops[key] = {"id": f"{spec['id']}:{key}",
                                       "name": key, "key": key,
                                       "lon": _rnd(s["lon"]), "lat": _rnd(s["lat"])}
                stop_ids.append(line_stops[key]["id"])
            geom = [[_rnd(x), _rnd(y)] for x, y in p["chained"]]
            if len(geom) >= 2:
                try:
                    simple = LineString(geom).simplify(GEOM_SIMPLIFY_DEG,
                                                       preserve_topology=False)
                    coords = list(simple.coords) if simple.geom_type == "LineString" else geom
                    geom = [[_rnd(x), _rnd(y)] for x, y in coords]
                except Exception:
                    pass
            line_patterns.append({
                "id": f"{spec['id']}:{kind}:{p['rel_id']}",
                "relation_id": p["rel_id"], "name": p["name"],
                "direction": kind, "direction_label": label,
                "stops": stop_ids,
                "chainage_km": [round(k, 3) for k in kms],
                "distance_km": round(kms[-1], 3) if kms else 0.0,
                "distance_method": method,
                "geometry": geom,
                "_edge_methods": methods,
            })
        # Exact-reverse pairs share one track: when one pattern's chained
        # geometry covers less (member ways missing on that side), mirror
        # the longer sibling's chainage + geometry onto it (recorded).
        if len(line_patterns) == 2:
            a, b = line_patterns
            if a["stops"] == list(reversed(b["stops"])):
                if a["distance_km"] + 0.5 < b["distance_km"]:
                    _mirror_pattern(a, b)
                elif b["distance_km"] + 0.5 < a["distance_km"]:
                    _mirror_pattern(b, a)
        for p in line_patterns:
            for m in p.pop("_edge_methods", []):
                edge_methods[m] += 1
        lines.append({"id": spec["id"], "name": spec["name"],
                      "circle": spec["circle"],
                      "stops": [line_stops[k] for k in sorted(line_stops)],
                      "patterns": line_patterns})
    lines.sort(key=lambda l: l["id"])

    transfers = []
    index: dict[str, list[str]] = {}
    for line in lines:
        for s in line["stops"]:
            index.setdefault(s["key"], []).append(line["id"])
    for key in sorted(index):
        if len(index[key]) > 1:
            name = next(line["stops"][[s["key"] for s in line["stops"]].index(key)]["name"]
                        for line in lines if key in [s["key"] for s in line["stops"]])
            transfers.append({"station": name, "key": key,
                              "lines": sorted(index[key])})

    return {
        "lines": lines,
        "transfers": transfers,
        "meta": {
            "source": "OpenStreetMap route relations (ODbL)",
            "lines": [spec["id"] for spec in LINE_SPECS],
            "edge_methods": edge_methods,
            "congestion_numbers": bool((congestion or {}).get("station_numbers")),
        },
    }


def _mirror_pattern(short: dict, long: dict) -> None:
    """Copy the longer sibling's track data onto the partial pattern."""
    n = len(short["stops"])
    total = long["distance_km"]
    long_km = long["chainage_km"]
    short["chainage_km"] = [round(total - long_km[n - 1 - i], 3) for i in range(n)]
    short["distance_km"] = total
    short["geometry"] = list(reversed(long["geometry"]))
    short["distance_method"] = long["distance_method"]
    short["mirrored_from"] = long["id"]
    if "_edge_methods" in long:
        short["_edge_methods"] = list(reversed(long["_edge_methods"]))


def _canonical_pair(spec: dict, patterns: list[dict]) -> list[dict]:
    """Two longest opposite patterns (deterministic)."""
    if len(patterns) <= 2:
        return sorted(patterns, key=lambda p: p["rel_id"])
    if spec["id"] == "line2":
        inner = [p for p in patterns if "내선" in p["name"]]
        outer = [p for p in patterns if "외선" in p["name"]]
        if inner and outer:
            pick = sorted(inner, key=lambda p: (-len(p["stops"]), p["rel_id"]))[0]
            pick2 = sorted(outer, key=lambda p: (-len(p["stops"]), p["rel_id"]))[0]
            return sorted([pick, pick2], key=lambda p: p["rel_id"])
    first = patterns[0]
    a0 = normalize_station(first["stops"][0]["name"])
    a1 = normalize_station(first["stops"][-1]["name"])
    for cand in patterns[1:]:
        b0 = normalize_station(cand["stops"][0]["name"])
        b1 = normalize_station(cand["stops"][-1]["name"])
        if b0 == a1 and b1 == a0:
            return sorted([first, cand], key=lambda p: p["rel_id"])
    # No clean opposite: keep the longest (single direction is still routable
    # both ways on the stop graph; the return direction reuses the order).
    return [first]


def write_network(network: dict, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(network, indent=2, sort_keys=True,
                               ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def run_build(raw_pbf: Path = DEFAULT_RAW_PBF,
              build_dir: Path = DEFAULT_BUILD_DIR,
              cache_dir: Path | None = None,
              congestion: dict | None = None,
              osmium_bin: str = "osmium",
              refresh: bool = False) -> dict:
    """Build ``data/build/region/network.json``; returns a summary."""
    raw_pbf = Path(raw_pbf)
    if not raw_pbf.exists():
        raise FileNotFoundError(f"national extract not found: {raw_pbf}")
    cache = Path(cache_dir) if cache_dir else Path(build_dir) / "_cache"
    rel_file, mem_file = ensure_prefilter(raw_pbf, cache,
                                          osmium_bin=osmium_bin,
                                          refresh=refresh)
    if congestion is None:
        cong_file = Path(build_dir) / REGION_DIR / "congestion.json"
        if cong_file.exists():
            congestion = json.loads(cong_file.read_text(encoding="utf-8"))
    network = build_network(rel_file, mem_file, congestion)
    out = write_network(network, Path(build_dir) / REGION_DIR / NETWORK_FILE)
    return {"network": str(out),
            "lines": {line["id"]: {"stops": len(line["stops"]),
                                   "patterns": [p["name"] for p in line["patterns"]]}
                      for line in network["lines"]},
            "transfers": len(network["transfers"]),
            "edge_methods": network["meta"]["edge_methods"]}
