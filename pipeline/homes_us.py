"""US homes: OSM apartment buildings + Zillow ZORI rent by ZIP.

Stage 26b. Builds ``data/build/homes/us-menlo.json`` in the same slim
shape as the Korean per-region files (so the web reads it), with the
rent in USD (``currency: "USD"``; the ``median_won`` key name is kept
for schema reuse).
"""

from __future__ import annotations

import csv
import heapq
import json
import re
import statistics
from collections import defaultdict
from pathlib import Path

from .areas import DEFAULT_BUILD_DIR
from .homes import (DEFAULT_RAW_DIR, STATION_CATEGORIES, WALK_MPS,
                    haversine_m, nearest_station_walk)

AREA_ID = "us-menlo"
ZORI_CSV = Path("us") / "zillow" / "Zip_zori_uc_sfrcondomfr_sm_month.csv"
ZORI_URL = "https://www.zillow.com/research/data/"
ZORI_LABEL = "Zillow ZORI (typical rent for this ZIP, all home types)"

CANDIDATE_BUILDINGS = {"apartments", "residential", "dormitory"}
NO_NAME_RE = re.compile(r"^Building\s+\S+$", re.IGNORECASE)
ZIP_RE = re.compile(r"^(\d{5})")
MONTH_COL_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ROAD_HIGHWAYS = {"residential", "tertiary", "secondary", "primary",
                 "living_street", "unclassified"}

BIKE_MPS = 15 / 3.6  # assumed bike speed


def load_zori(csv_path: str | Path) -> dict[str, dict]:
    """ZIP -> {"monthly_usd", "month"} from the latest non-empty month."""
    zori: dict[str, dict] = {}
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        months = [c for c in (reader.fieldnames or [])
                  if MONTH_COL_RE.match(c or "")]
        for row in reader:
            name = (row.get("RegionName") or "").strip()
            m = ZIP_RE.match(name)
            if not m:
                continue
            best = None
            for col in months:
                cell = (row.get(col) or "").strip()
                if not cell:
                    continue
                try:
                    val = float(cell)
                except ValueError:
                    continue
                best = (round(val), col[:7])
            if best is None:
                continue
            zori[m.group(1)] = {"monthly_usd": best[0], "month": best[1]}
    return zori


def postcode_points(pbf_path: str | Path) -> list[tuple[float, float, str]]:
    """Every node/way/relation in the extract with an ``addr:postcode``."""
    import osmium

    class _Scan(osmium.SimpleHandler):
        def __init__(self) -> None:
            super().__init__()
            self.points: list[tuple[float, float, str]] = []
            self._nodes: dict[int, tuple[float, float]] = {}
            self._ways: dict[int, tuple[float, float]] = {}

        @staticmethod
        def _zip(tags) -> str | None:
            try:
                raw = tags.get("addr:postcode") or ""
            except (AttributeError, LookupError):
                return None
            m = ZIP_RE.match(str(raw).strip())
            return m.group(1) if m else None

        def node(self, n) -> None:
            if n.location.valid():
                xy = (n.location.lon, n.location.lat)
                self._nodes[n.id] = xy
                z = self._zip(n.tags)
                if z:
                    self.points.append((xy[0], xy[1], z))

        def way(self, w) -> None:
            try:
                coords = [(nd.lon, nd.lat) for nd in w.nodes
                          if nd.location.valid()]
            except (AttributeError, RuntimeError):
                coords = []
            if not coords:
                return
            xy = (sum(c[0] for c in coords) / len(coords),
                  sum(c[1] for c in coords) / len(coords))
            self._ways[w.id] = xy
            z = self._zip(w.tags)
            if z:
                self.points.append((xy[0], xy[1], z))

        def relation(self, r) -> None:
            z = self._zip(r.tags)
            if not z:
                return
            xs, ys = [], []
            try:
                members = list(r.members)
            except (AttributeError, RuntimeError):
                return
            for m in members:
                if m.type == "n" and m.ref in self._nodes:
                    xs.append(self._nodes[m.ref][0])
                    ys.append(self._nodes[m.ref][1])
                elif m.type == "w" and m.ref in self._ways:
                    xs.append(self._ways[m.ref][0])
                    ys.append(self._ways[m.ref][1])
            if xs:
                self.points.append((sum(xs) / len(xs),
                                    sum(ys) / len(ys), z))

    scan = _Scan()
    scan.apply_file(str(pbf_path), locations=True)
    return scan.points


def zip_for(lon: float, lat: float,
            points: list[tuple[float, float, str]],
            default: str = "94025") -> tuple[str, str]:
    """ZIP of the nearest point within 600 m, else the default."""
    best, best_d = None, 600.0
    for plon, plat, z in points:
        d = haversine_m(lon, lat, plon, plat)
        if d <= best_d and (best is None or d < best_d):
            best, best_d = z, d
    if best is None:
        return default, "default"
    return best, "osm_nearest"


def _ring_centroid(ring: list) -> tuple[float, float] | None:
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    if not pts:
        return None
    return (sum(p[0] for p in pts) / len(pts),
            sum(p[1] for p in pts) / len(pts))


def _geom_centroid(geom: dict) -> tuple[float, float] | None:
    if not isinstance(geom, dict):
        return None
    coords = geom.get("coordinates")
    if geom.get("type") == "Point" and coords and len(coords) >= 2:
        return (float(coords[0]), float(coords[1]))
    rings: list[list] = []
    if geom.get("type") == "Polygon" and coords:
        rings = [coords[0]] if coords else []
    elif geom.get("type") == "MultiPolygon" and coords:
        rings = [poly[0] for poly in coords if poly]
    xs, ys, n = 0.0, 0.0, 0
    for ring in rings:
        c = _ring_centroid(ring)
        if c is None:
            continue
        xs += c[0] * max(len(ring) - 1, 1)
        ys += c[1] * max(len(ring) - 1, 1)
        n += max(len(ring) - 1, 1)
    if not n:
        return None
    return (xs / n, ys / n)


def _resolve(area_dir: Path, area: dict, key: str) -> object:
    val = area.get(key)
    if isinstance(val, dict) and set(val) == {"$ref"}:
        ref = area_dir / val["$ref"]
        return json.loads(ref.read_text(encoding="utf-8"))
    return val


def _nearest_road_name(lon: float, lat: float, roads: list) -> str | None:
    best, best_d = None, float("inf")
    for road in roads:
        if road.get("highway") not in ROAD_HIGHWAYS:
            continue
        name = road.get("name")
        if not name:
            continue
        geom = road.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if geom.get("type") == "LineString":
            lines = [coords]
        elif geom.get("type") == "MultiLineString":
            lines = coords
        else:
            continue
        for line in lines:
            for pt in line:
                d = haversine_m(lon, lat, pt[0], pt[1])
                if d < best_d:
                    best, best_d = name, d
    return best


def _nearest_node(lon: float, lat: float, nodes: dict) -> str | None:
    best, best_d = None, float("inf")
    for nid, coords in nodes.items():
        d = (coords[0] - lon) ** 2 + (coords[1] - lat) ** 2
        if d < best_d:
            best, best_d = nid, d
    return best


def _adjacency(edges: list) -> dict[str, list[tuple[str, float]]]:
    adj: dict[str, list] = defaultdict(list)
    for e in edges or []:
        frm, to, length = e.get("from"), e.get("to"), e.get("length_m")
        if not frm or not to or length is None:
            continue
        adj[frm].append((to, float(length)))
        adj[to].append((frm, float(length)))
    return adj


def _dijkstra(adj: dict, start: str) -> dict[str, float]:
    dist = {start: 0.0}
    heap = [(0.0, start)]
    while heap:
        d, node = heapq.heappop(heap)
        if d > dist[node]:
            continue
        for nxt, w in adj.get(node, []):
            nd = d + w
            if nd < dist.get(nxt, float("inf")):
                dist[nxt] = nd
                heapq.heappush(heap, (nd, nxt))
    return dist


def _has_name(name: object) -> bool:
    return bool(name) and not NO_NAME_RE.match(str(name).strip())


def build_us_homes(area_dir: str | Path, zori: dict[str, dict],
                   points: list[tuple[float, float, str]],
                   stats: dict | None = None) -> list[dict]:
    """Group OSM apartment buildings into homes with ZORI rent."""
    area_dir = Path(area_dir)
    payload = json.loads((area_dir / "buildings.json").read_text(
        encoding="utf-8"))
    buildings = (payload.get("buildings", []) if isinstance(
        payload, dict) else payload)
    area = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    graph = json.loads((area_dir / "graph.json").read_text(encoding="utf-8"))
    roads = _resolve(area_dir, area, "roads") or []
    pois = _resolve(area_dir, area, "pois") or []
    workplaces = area.get("workplaces") or {}
    if isinstance(workplaces, dict):
        workplaces = list(workplaces.values())
    meta_hq = next((w for w in workplaces if w.get("id") == "meta-hq"),
                   None)

    cands = []
    for b in sorted(buildings, key=lambda b: str(b.get("id"))):
        bval = b.get("building")
        if bval == "dormitory":
            continue  # student housing
        if bval not in CANDIDATE_BUILDINGS:
            continue
        c = _geom_centroid(b.get("geometry") or {})
        if c is None:
            continue
        cands.append((b, c[0], c[1]))

    named: dict[str, list[int]] = defaultdict(list)
    unnamed: list[int] = []
    for i, (b, _lon, _lat) in enumerate(cands):
        name = b.get("name")
        if _has_name(name):
            named[str(name).strip()].append(i)
        else:
            unnamed.append(i)

    groups: list[tuple[str | None, list[int]]] = []
    for name in sorted(named):
        idxs = named[name]
        parent = {i: i for i in idxs}

        def _find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for a in range(len(idxs)):
            for c in range(a + 1, len(idxs)):
                ia, ib = idxs[a], idxs[c]
                if haversine_m(cands[ia][1], cands[ia][2],
                               cands[ib][1], cands[ib][2]) <= 300:
                    parent[_find(ia)] = _find(ib)
        clusters: dict[int, list[int]] = defaultdict(list)
        for i in idxs:
            clusters[_find(i)].append(i)
        for key in sorted(clusters, key=lambda k: min(clusters[k])):
            groups.append((name, sorted(clusters[key])))
    for i in sorted(unnamed):
        groups.append((None, [i]))

    nodes = graph.get("nodes") or {}
    walk_adj = _adjacency((graph.get("edges") or {}).get("walk"))
    bike_adj = _adjacency((graph.get("edges") or {}).get("bike"))
    box = {"graph": graph,
           "stations": [p for p in pois
                        if p.get("category") in STATION_CATEGORIES]}

    homes = []
    dropped = 0
    fallback_n = 0
    seq = 0
    for name, idxs in groups:
        lon = sum(cands[i][1] for i in idxs) / len(idxs)
        lat = sum(cands[i][2] for i in idxs) / len(idxs)
        lon_r, lat_r = round(lon, 7), round(lat, 7)
        zip_code, zip_source = zip_for(lon, lat, points)
        z = zori.get(zip_code)
        if z is None:
            dropped += 1
            continue
        seq += 1
        if name is not None:
            home_name, match = name, "osm_name"
        else:
            road = _nearest_road_name(lon, lat, roads)
            if road:
                home_name = f"Apartments on {road}"
            else:
                fallback_n += 1
                home_name = f"Apartment building {fallback_n}"
            match = "osm"
        usd = z["monthly_usd"]
        st = nearest_station_walk(lon, lat, box)
        station = None
        if st and st["walk_minutes"] <= 40:
            station = {"station": st["station"],
                       "walk_minutes": st["walk_minutes"]}
        work_targets: dict = {}
        if meta_hq is not None and nodes:
            home_node = _nearest_node(lon, lat, nodes)
            hq_node = _nearest_node(meta_hq["lon"], meta_hq["lat"], nodes)
            entry = {"walk_m": None, "walk_minutes": None,
                     "bike_m": None, "bike_minutes": None,
                     "bike_speed_kmh": 15,
                     "bike_speed_source": "assumed"}
            if home_node and hq_node:
                if walk_adj:
                    dist = _dijkstra(walk_adj, home_node)
                    if hq_node in dist:
                        entry["walk_m"] = round(dist[hq_node], 1)
                        entry["walk_minutes"] = round(
                            dist[hq_node] / WALK_MPS / 60, 1)
                if bike_adj:
                    dist = _dijkstra(bike_adj, home_node)
                    if hq_node in dist:
                        entry["bike_m"] = round(dist[hq_node], 1)
                        entry["bike_minutes"] = round(
                            dist[hq_node] / BIKE_MPS / 60, 1)
            work_targets = {"meta-hq": entry}
        homes.append({
            "id": f"us-home-{seq:04d}",
            "name": home_name,
            "kind": "아파트",
            "region": AREA_ID,
            "lon": lon_r,
            "lat": lat_r,
            "build_year": None,
            "pnu": None,
            "match": match,
            "osm_name": name,
            "scene": AREA_ID,
            "station": station,
            "buckets": [{
                "center_m2": None,
                "range_m2": None,
                "trade": None,
                "jeonse": None,
                "wolse": {
                    "count": 1,
                    "deposit": None,
                    "monthly": {"count": 1, "median_won": usd,
                                "min_won": usd, "max_won": usd},
                },
            }],
            "currency": "USD",
            "country": "US",
            "price": {"source": "zillow_zori_zip", "zip": zip_code,
                      "zip_source": zip_source, "month": z["month"],
                      "label": ZORI_LABEL},
            "work_targets": work_targets,
        })
    if stats is not None:
        stats["dropped_no_zori"] = dropped
    return homes


def run_us_homes(build_dir: str | Path = DEFAULT_BUILD_DIR,
                 raw_dir: str | Path = DEFAULT_RAW_DIR) -> dict:
    """Write data/build/homes/us-menlo.json; update summary.json."""
    build_dir, raw_dir = Path(build_dir), Path(raw_dir)
    area_dir = build_dir / AREA_ID
    zori = load_zori(raw_dir / ZORI_CSV)
    extract = area_dir / "extract.osm.pbf"
    points = postcode_points(extract) if extract.exists() else []
    stats: dict = {}
    homes = build_us_homes(area_dir, zori, points, stats=stats)

    out_dir = build_dir / "homes"
    out_dir.mkdir(parents=True, exist_ok=True)
    month = max((z["month"] for z in zori.values()), default=None)
    doc = {
        "region": AREA_ID,
        "country": "US",
        "currency": "USD",
        "sources": [
            {"id": "zillow_zori",
             "name": "Zillow Observed Rent Index (ZORI), ZIP, "
                     "smoothed, all homes",
             "url": ZORI_URL,
             "month": month},
            {"id": "osm", "name": "OpenStreetMap contributors",
             "license": "ODbL"},
        ],
        "homes": homes,
    }
    (out_dir / f"{AREA_ID}.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8")

    summary_path = out_dir / "summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    other = dict(summary.get("other_regions") or {})
    other[AREA_ID] = {"homes": len(homes), "country": "US",
                      "currency": "USD"}
    summary["other_regions"] = other
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8")

    zips: dict[str, int] = {}
    named = sum(1 for h in homes if h["match"] == "osm_name")
    with_station = sum(1 for h in homes if h.get("station"))
    bikes = [h["work_targets"]["meta-hq"]["bike_minutes"]
             for h in homes
             if h.get("work_targets", {}).get("meta-hq", {})
             .get("bike_minutes") is not None]
    for h in homes:
        z = h["price"]["zip"]
        zips[z] = zips.get(z, 0) + 1
    return {
        "area": AREA_ID,
        "homes": len(homes),
        "named": named,
        "unnamed": len(homes) - named,
        "dropped_no_zori": stats.get("dropped_no_zori", 0),
        "zips": zips,
        "station_walk_share": (round(with_station / len(homes), 3)
                               if homes else 0.0),
        "bike_minutes": {
            "min": min(bikes) if bikes else None,
            "median": statistics.median(bikes) if bikes else None,
            "max": max(bikes) if bikes else None,
        },
    }
