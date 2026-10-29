"""Home index from real transactions (stage 12a, Part B).

For every RTMS row in the region files, resolve the parcel
(시군구 + 법정동 + 본번/부번 → PNU) to the GIS building footprints
(GIS건물통합정보, same register stream as :mod:`pipeline.building_join`),
and group by complex (단지명 + PNU) into
``data/build/homes-index.json``.

Per record: id, name, kind (아파트 / 연립·다세대 / 오피스텔), region,
lon/lat (footprint centroid), build year, per area bucket (±5 ㎡) the
last 12 months of 매매 / 전세 / 월세 counts, medians and ranges
(cancelled deals excluded, as stage 6), the nearest station with walk
minutes on the graph when the home sits inside a built box (else null —
never a straight-line guess), the containing scene box id or null, the
number of photos within 700 m, and ``match`` ("register" | "osm_name").

Second join (12a2, Part 3): rows the register cannot match (new
complexes the register extract lacks) fall back to
:mod:`pipeline.osm_names` — an OSM residential polygon whose name
matches the 단지명, inside the row's region and (when OSM has it) the
same 법정동. Location = polygon centroid; the card later shows
"위치: OSM 단지 이름 일치" for these.

PNU matching mirrors ``web/src/money/pnu.js``: normalised address text
plus zero-padded 본번/부번 against the register PNU's last 8 digits,
land-type agnostic (산 번지 included; 부번 0 pads to 0000). The 법정동
prefix always comes from register data, never guessed.
"""

from __future__ import annotations

import csv
import heapq
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

from pyproj import Transformer

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw"
DEFAULT_BUILD_DIR = REPO_ROOT / "data" / "build"
DEFAULT_PHOTOS = REPO_ROOT / "scenarios" / "places" / "commons-photos.json"

HOMES_FILE = "homes-index.json"
RTMS_SUFFIX = "2510-2610"
BUCKET_HALF_M2 = 5.0
PHOTO_RADIUS_M = 700.0
WALK_MPS = 1.3  # C-walk-speed, adult (labelled engine constant)
EARTH_R_M = 6_371_000.0

KIND_KO = {"apt": "아파트", "rowhouse": "연립·다세대",
           "officetel": "오피스텔"}

# Station POI categories (mirrors web/src/engine/places.js STATION_CATS).
STATION_CATEGORIES = {"railway:station", "railway:subway_station",
                      "public_transport:station"}


# --- RTMS parsing (mirrors web/src/money/rtms.js) -----------------------------

def _num_manwon(text) -> int | None:
    t = str(text or "").replace(",", "").strip()
    if t in ("", "-"):
        return None
    try:
        return round(float(t) * 10000)
    except ValueError:
        return None


def _num_plain(text):
    t = str(text or "").replace(",", "").strip()
    if t in ("", "-"):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def _num_int(text) -> int | None:
    v = _num_plain(text)
    return int(v) if v is not None else None


def parse_rtms_file(path: str | Path, housing_type: str,
                    deal: str, limit: int | None = None) -> list[dict]:
    """Parse one RTMS CSV (cp949). Cancelled trade deals are excluded."""
    rows: list[dict] = []
    with open(path, encoding="cp949", newline="") as f:
        lines = f.read().splitlines()
    header_idx = next(
        (i for i, line in enumerate(lines)
         if "단지명" in line or "건물명" in line), None)
    if header_idx is None:
        raise ValueError(f"rtms: no header line in {path}")
    reader = csv.DictReader(lines[header_idx:])
    for rec in reader:
        if limit is not None and len(rows) >= limit:
            break
        if deal == "trade":
            if str(rec.get("해제사유발생일") or "").strip() not in ("", "-"):
                continue
            rows.append({
                "sigungu": (rec.get("시군구") or "").strip(),
                "bonbun": (rec.get("본번") or "").strip(),
                "bubun": (rec.get("부번") or "").strip(),
                "complex": (rec.get("단지명") or rec.get("건물명")
                             or "").strip(),
                "area_m2": _num_plain(rec.get("전용면적(㎡)")),
                "contract_ym": (rec.get("계약년월") or "").strip(),
                "deal": "trade", "housing_type": housing_type,
                "trade_won": _num_manwon(rec.get("거래금액(만원)")),
                "build_year": _num_int(rec.get("건축년도")),
            })
        else:
            kind = (rec.get("전월세구분") or "").strip()
            rows.append({
                "sigungu": (rec.get("시군구") or "").strip(),
                "bonbun": (rec.get("본번") or "").strip(),
                "bubun": (rec.get("부번") or "").strip(),
                "complex": (rec.get("단지명") or rec.get("건물명")
                             or "").strip(),
                "area_m2": _num_plain(rec.get("전용면적(㎡)")),
                "contract_ym": (rec.get("계약년월") or "").strip(),
                "deal": "rent", "housing_type": housing_type,
                "rent_kind": ("jeonse" if kind == "전세"
                              else "wolse" if kind == "월세" else "other"),
                "deposit_won": _num_manwon(rec.get("보증금(만원)")),
                "monthly_won": _num_manwon(rec.get("월세금(만원)")),
                "build_year": _num_int(rec.get("건축년도")),
            })
    return rows


# --- PNU matching (mirrors web/src/money/pnu.js) -------------------------------

def parse_pnu(pnu: str | None) -> dict | None:
    s = str(pnu or "")
    if len(s) != 19 or not s.isdigit():
        return None
    return {"full": s, "bjdong": s[:10], "bon": s[11:15], "bu": s[15:19]}


def _norm_bonbu(value) -> str | None:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if not digits:
        return None
    return digits.zfill(4)[-4:]


def _norm_addr(text) -> str:
    return " ".join(str(text or "").split())


def build_pnu_index(records: list[dict]) -> dict:
    """Index register records: by_key[(addr, bon, bu)] -> [record]."""
    by_key: dict[tuple, list[dict]] = defaultdict(list)
    for rec in records:
        p = parse_pnu(rec.get("pnu"))
        if not p:
            continue
        addr = _norm_addr(rec.get("address"))
        if not addr:
            continue
        by_key[(addr, p["bon"], p["bu"])].append(rec)
    return {"by_key": by_key}


def match_row(row: dict, index: dict) -> tuple[list[dict], str | None]:
    """Match one RTMS row to register footprints (land-type agnostic)."""
    addr = _norm_addr(row.get("sigungu"))
    bon = _norm_bonbu(row.get("bonbun"))
    bu = _norm_bonbu(row.get("bubun"))
    if not addr or not bon or not bu:
        return ([], None)
    hits = index["by_key"].get((addr, bon, bu), [])
    if not hits:
        return ([], None)
    return (hits, hits[0].get("pnu"))


# --- buckets -----------------------------------------------------------------

def bucket_center(area_m2: float) -> int:
    return int(round(area_m2 / 10.0) * 10)


def _stats(values: list) -> dict | None:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    n = len(vals)
    median = (vals[n // 2] if n % 2 == 1
              else (vals[n // 2 - 1] + vals[n // 2]) / 2)
    return {"count": n, "median_won": median,
            "min_won": vals[0], "max_won": vals[-1]}


def bucketize(rows: list[dict]) -> list[dict]:
    """Group rows into ±5 ㎡ buckets with trade/jeonse/wolse stats."""
    by_bucket: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        area = row.get("area_m2")
        if area is None:
            continue
        by_bucket[bucket_center(area)].append(row)
    out = []
    for center in sorted(by_bucket):
        group = by_bucket[center]
        trades = [r.get("trade_won") for r in group
                  if r.get("deal") == "trade"]
        jeonse = [r.get("deposit_won") for r in group
                  if r.get("deal") == "rent" and r.get("rent_kind") == "jeonse"]
        wolse = [r for r in group if r.get("deal") == "rent"
                 and r.get("rent_kind") == "wolse"]
        wolse_stat = None
        if wolse:
            dep = _stats([r.get("deposit_won") for r in wolse])
            mon = _stats([r.get("monthly_won") for r in wolse])
            if dep or mon:
                wolse_stat = {"count": len(wolse),
                              "deposit": dep, "monthly": mon}
        out.append({"center_m2": center,
                    "range_m2": [center - BUCKET_HALF_M2,
                                 center + BUCKET_HALF_M2],
                    "trade": _stats(trades),
                    "jeonse": _stats(jeonse),
                    "wolse": wolse_stat})
    return out


# --- geo helpers ---------------------------------------------------------------

def haversine_m(lon1, lat1, lon2, lat2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = (math.sin(dp / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * EARTH_R_M * math.asin(math.sqrt(a))


def _mode(values: list) -> int | None:
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return Counter(vals).most_common(1)[0][0]


# --- built-box lookups (scene, walk minutes) ------------------------------------

def load_box_graphs(build_dir: Path) -> list[dict]:
    """Walk graphs + station POIs + bboxes of every built box area."""
    boxes = []
    for area_def_path in sorted(build_dir.glob("*/area_def.json")):
        area_dir = area_def_path.parent
        area_path = area_dir / "area.json"
        if not area_path.exists():
            continue
        try:
            area_def = json.loads(area_def_path.read_text(encoding="utf-8"))
            area = json.loads(area_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if area_def.get("kind") != "bbox" or not area_def.get("bbox"):
            continue
        graph = area.get("graph") or {}
        if isinstance(graph, dict) and set(graph) == {"$ref"}:
            ref = area_dir / graph["$ref"]
            if not ref.exists():
                continue
            graph = json.loads(ref.read_text(encoding="utf-8"))
        boxes.append({"id": area_def.get("id", area_dir.name),
                      "bbox": area_def["bbox"],
                      "graph": graph,
                      "stations": [p for p in area.get("pois", [])
                                   if p.get("category") in STATION_CATEGORIES]})
    return boxes


def containing_box(lon: float, lat: float, boxes: list[dict]) -> dict | None:
    """Smallest built box containing (lon, lat), or None."""
    best, best_size = None, float("inf")
    for box in boxes:
        minlon, minlat, maxlon, maxlat = box["bbox"]
        if not (minlon <= lon <= maxlon and minlat <= lat <= maxlat):
            continue
        size = (maxlon - minlon) * (maxlat - minlat)
        if size < best_size:
            best, best_size = box, size
    return best


def _walk_adjacency(graph: dict) -> dict[str, list[tuple[str, float]]]:
    adj: dict[str, list] = defaultdict(list)
    edges = graph.get("edges", {})
    walks = edges.get("walk", []) if isinstance(edges, dict) else []
    for e in walks:
        frm, to = e.get("from"), e.get("to")
        length = e.get("length_m")
        if not frm or not to or length is None:
            continue
        adj[frm].append((to, float(length)))
        adj[to].append((frm, float(length)))
    return adj


def _nearest_node(lon: float, lat: float, nodes: dict) -> str | None:
    best, best_d = None, float("inf")
    for nid, coords in nodes.items():
        d = (coords[0] - lon) ** 2 + (coords[1] - lat) ** 2
        if d < best_d:
            best, best_d = nid, d
    return best


def _poi_lonlat(poi: dict) -> tuple[float, float] | None:
    geom = poi.get("geometry") or {}
    coords = geom.get("coordinates")
    if (geom.get("type") == "Point" and isinstance(coords, (list, tuple))
            and len(coords) >= 2):
        return (float(coords[0]), float(coords[1]))
    return None


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


def nearest_station_walk(lon: float, lat: float, box: dict) -> dict | None:
    """Nearest station by graph walk metres → minutes (adult speed).

    Returns None when the box has no walk graph or no reachable
    station — the caller must keep null, never a straight-line guess.
    """
    graph = box.get("graph") or {}
    nodes = graph.get("nodes") or {}
    if not nodes:
        return None
    start = _nearest_node(lon, lat, nodes)
    if start is None:
        return None
    adj = _walk_adjacency(graph)
    if not adj:
        return None
    dist = _dijkstra(adj, start)
    best = None
    for poi in box.get("stations", []):
        ll = _poi_lonlat(poi)
        if ll is None:
            continue
        node = _nearest_node(ll[0], ll[1], nodes)
        if node is None or node not in dist:
            continue
        metres = dist[node]
        minutes = round(metres / WALK_MPS / 60, 1)
        name = poi.get("name") or poi.get("id")
        if best is None or metres < best["metres"]:
            best = {"station": name, "walk_minutes": minutes,
                    "metres": round(metres, 1)}
    if best is None:
        return None
    return {"station": best["station"],
            "walk_minutes": best["walk_minutes"],
            "source": "graph"}


# --- main build -----------------------------------------------------------------

def combined_bbox(bboxes: list[list[float]]) -> list[float] | None:
    boxes = [b for b in bboxes if b]
    if not boxes:
        return None
    return [min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes)]


def stream_register_for_bbox(bbox: list[float],
                             register_dir: str | Path | None = None
                             ) -> list[dict]:
    """Stream register footprints inside one WGS84 bbox (both regions)."""
    from .building_join import (discover_register_files, stream_register,
                                wgs84_to_5186_bbox)

    to_5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)
    bbox_5186 = wgs84_to_5186_bbox(tuple(bbox), to_5186)
    files = discover_register_files(
        register_dir if register_dir else DEFAULT_RAW_DIR / "buildings")
    return stream_register(files, bbox_5186)


def _record_centroid_year(rec: dict) -> tuple[float, float, int | None]:
    geom = rec["geometry_wgs84"]
    c = geom.centroid
    year = None
    approval = rec.get("approval_date") or ""
    if len(approval) >= 4 and approval[:4].isdigit():
        year = int(approval[:4])
    return (round(float(c.x), 7), round(float(c.y), 7), year)


def load_photos(photos_path: str | Path | None) -> list[dict]:
    path = Path(photos_path) if photos_path else DEFAULT_PHOTOS
    if not path.exists():
        return []
    doc = json.loads(path.read_text(encoding="utf-8"))
    return doc.get("items", [])


def count_photos_near(lon: float, lat: float, photos: list[dict],
                      radius_m: float = PHOTO_RADIUS_M) -> int:
    n = 0
    for p in photos:
        if p.get("lat") is None or p.get("lon") is None:
            continue
        if haversine_m(lon, lat, p["lon"], p["lat"]) <= radius_m:
            n += 1
    return n


def build_homes_index(region_rows: dict[str, list[dict]],
                      register: list[dict],
                      boxes: list[dict],
                      photos: list[dict],
                      wirye_within=None,
                      osm_polygons: list[dict] | None = None,
                      region_within: dict | None = None,
                      ) -> tuple[list[dict], dict]:
    """Match + group rows into home records. Returns (homes, report).

    ``wirye_within`` (lon, lat) -> bool keeps 위례 groups whose
    footprint centroid falls inside the 위례동 union; other regions
    keep every matched group. ``osm_polygons`` (from
    :mod:`pipeline.osm_names`) gives register-unmatched rows a second
    join; ``region_within`` maps region id -> (lon, lat) -> bool for the
    OSM containment check (no filter when a region has no entry).
    """
    from .osm_names import match_osm_name, row_dong

    index = build_pnu_index(register)
    reg_points = {rec["id"]: _record_centroid_year(rec) for rec in register}
    homes: list[dict] = []
    report: dict[str, dict] = {}
    seq = 0
    for region_id in sorted(region_rows):
        rows = region_rows[region_id]
        matched = 0
        matched_osm = 0
        unmatched_examples: list[dict] = []
        groups: dict[tuple, dict] = {}
        within = (region_within or {}).get(region_id)
        inside = ([p for p in (osm_polygons or [])
                   if within is None or within(p["lon"], p["lat"])]
                if osm_polygons else [])
        osm_cache: dict[tuple, dict | None] = {}
        for row in rows:
            hits, pnu = match_row(row, index)
            if hits and pnu:
                matched += 1
                key = (row.get("complex") or "", pnu,
                       row.get("housing_type"))
                group = groups.setdefault(key, {"rows": [], "pnus": set(),
                                                "rec_ids": set(),
                                                "osm": None})
                group["rows"].append(row)
                group["pnus"].add(pnu)
                for h in hits:
                    group["rec_ids"].add(h["id"])
                continue
            # One OSM lookup per (complex, dong): rows share 단지명.
            cache_key = (row.get("complex") or "",
                         row_dong(row.get("sigungu")))
            if cache_key in osm_cache:
                poly = osm_cache[cache_key]
            else:
                poly = (match_osm_name(row.get("complex"), cache_key[1],
                                       inside)
                        if inside else None)
                osm_cache[cache_key] = poly
            if poly is None:
                if len(unmatched_examples) < 5:
                    unmatched_examples.append({
                        "sigungu": row.get("sigungu"),
                        "bonbun": row.get("bonbun"),
                        "bubun": row.get("bubun"),
                        "complex": row.get("complex")})
                continue
            matched_osm += 1
            key = (row.get("complex") or "", "osm:" + poly["osm_id"],
                   row.get("housing_type"))
            group = groups.setdefault(key, {"rows": [], "pnus": set(),
                                            "rec_ids": set(),
                                            "osm": poly})
            group["rows"].append(row)
        kept_groups = 0
        kept_osm = 0
        for (name, pnu, housing_type) in sorted(groups):
            group = groups[(name, pnu, housing_type)]
            poly = group.get("osm")
            if poly is not None:
                lon, lat = poly["lon"], poly["lat"]
                years = [r.get("build_year") for r in group["rows"]
                         if r.get("build_year")]
                footprints = 1
                is_osm = True
            else:
                pts = [reg_points[rid] for rid in sorted(group["rec_ids"])
                       if rid in reg_points]
                if not pts:
                    continue
                lon = round(sum(p[0] for p in pts) / len(pts), 7)
                lat = round(sum(p[1] for p in pts) / len(pts), 7)
                years = [p[2] for p in pts if p[2]] + [
                    r.get("build_year") for r in group["rows"]
                    if r.get("build_year")]
                footprints = len(pts)
                is_osm = False
            if region_id == "wirye" and wirye_within is not None:
                if not wirye_within(lon, lat):
                    continue
            kept_groups += 1
            if is_osm:
                kept_osm += 1
            box = containing_box(lon, lat, boxes)
            station = (nearest_station_walk(lon, lat, box)
                       if box is not None else None)
            seq += 1
            homes.append({
                "id": f"home-{seq:06d}",
                "name": name,
                "pnu": None if is_osm else pnu,
                "kind": KIND_KO.get(housing_type, housing_type),
                "housing_type": housing_type,
                "region": region_id,
                "lon": lon, "lat": lat,
                "footprints": footprints,
                "build_year": _mode(years),
                "buckets": bucketize(group["rows"]),
                "station": station,
                "scene": box["id"] if box is not None else None,
                "photos_700m": count_photos_near(lon, lat, photos),
                "match": "osm_name" if is_osm else "register",
                "osm": ({"id": poly["osm_id"], "name": poly["name"]}
                        if is_osm else None),
            })
        total_matched = matched + matched_osm
        report[region_id] = {"rows_read": len(rows),
                             "rows_matched": total_matched,
                             "rows_matched_register": matched,
                             "rows_matched_osm": matched_osm,
                             "matched_pct": (round(total_matched / len(rows) * 100, 1)
                                             if rows else 0.0),
                             "matched_register_pct": (round(matched / len(rows) * 100, 1)
                                                      if rows else 0.0),
                             "groups": len(groups),
                             "groups_kept": kept_groups,
                             "groups_kept_osm": kept_osm,
                             "unmatched_examples": unmatched_examples}
    homes.sort(key=lambda h: (h["region"], h["name"], h["pnu"] or ""))
    for i, home in enumerate(homes):
        home["id"] = f"home-{i + 1:06d}"
    return homes, report


def read_region_rows(raw_dir: Path, regions: list[dict],
                     limit: int | None = None) -> tuple[dict, list[str]]:
    """Read every RTMS file of every region. Returns (rows, missing)."""
    from .regions import RTMS_DEALS, RTMS_TYPES, rtms_file_names

    region_rows: dict[str, list[dict]] = {}
    missing: list[str] = []
    for region in regions:
        rows: list[dict] = []
        for district in region["rtms_districts"]:
            for fname in rtms_file_names(district):
                parts = fname.replace(".csv", "").split("_")
                housing_type, deal = parts[0], parts[1]
                path = raw_dir / "rtms" / fname
                if not path.exists() or path.stat().st_size == 0:
                    missing.append(fname)
                    continue
                rows.extend(parse_rtms_file(path, housing_type, deal,
                                            limit=limit))
        # 위례 reads all three districts' rows; groups are filtered by
        # footprint-in-union-polygon after matching (see build_homes_index).
        region_rows[region["id"]] = rows
    return region_rows, missing


def _region_filters(regions: list[dict], build_dir: Path):
    """Per-region (lon, lat) -> bool containment + method used.

    Prefers the region's boundary-union polygon, else its bbox.
    Returns (filters, methods).
    """
    from shapely.geometry import Point

    from .regions import load_region_union

    filters = {}
    methods = {}
    for region in regions:
        rid = region["id"]
        union = None
        try:
            union = load_region_union(rid, build_dir)
        except (FileNotFoundError, json.JSONDecodeError, OSError, KeyError,
                ValueError):
            union = None
        bbox = region.get("bbox")
        if union is not None:
            minx, miny, maxx, maxy = union.bounds

            def within(lon, lat, _u=union,
                       _b=(minx, miny, maxx, maxy)):
                if not (_b[0] <= lon <= _b[2] and _b[1] <= lat <= _b[3]):
                    return False
                pt = Point(lon, lat)
                return bool(_u.contains(pt) or _u.touches(pt))

            filters[rid] = within
            methods[rid] = "union"
        elif bbox:
            minx, miny, maxx, maxy = bbox

            def within(lon, lat, _b=(minx, miny, maxx, maxy)):
                return bool(_b[0] <= lon <= _b[2] and _b[1] <= lat <= _b[3])

            filters[rid] = within
            methods[rid] = "bbox"
    return filters, methods


def _wirye_filter(build_dir: Path):
    """(lon, lat) -> bool for the 위례동 union (None when unavailable)."""
    try:
        regions = json.loads((build_dir / "regions.json")
                             .read_text(encoding="utf-8"))["regions"]
    except (FileNotFoundError, json.JSONDecodeError, OSError, KeyError):
        return None
    filters, _ = _region_filters(
        [r for r in regions if r["id"] == "wirye"], build_dir)
    return filters.get("wirye")


# --- slim per-region index (12a2, Part 4) --------------------------------------
#
# homes-index.json (~18 MB) stays server-side for the consult tools; the
# browser gets one small file per region with only the card fields, plus
# a summary with counts per region and kind.

SLIM_DIR = "homes"
SLIM_SUMMARY = "summary.json"


def slim_home(home: dict) -> dict:
    """Card fields only: id, name, kind, region, lon/lat, year, buckets,
    station walk, scene, match + OSM name when relevant."""
    station = home.get("station") or {}
    return {
        "id": home.get("id"),
        "name": home.get("name"),
        "kind": home.get("kind"),
        "region": home.get("region"),
        "lon": home.get("lon"),
        "lat": home.get("lat"),
        "build_year": home.get("build_year"),
        "buckets": home.get("buckets") or [],
        "station": ({
            "station": station.get("station"),
            "walk_minutes": station.get("walk_minutes"),
        } if station.get("station") else None),
        "scene": home.get("scene"),
        "match": home.get("match", "register"),
        "osm_name": ((home.get("osm") or {}).get("name")
                     if home.get("match") == "osm_name" else None),
    }


def write_slim_indexes(homes: list[dict], build_dir: str | Path) -> dict:
    """Write data/build/homes/<region>.json + summary.json. Returns sizes."""
    build_dir = Path(build_dir)
    out_dir = build_dir / SLIM_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    by_region: dict[str, list[dict]] = {}
    for home in homes:
        by_region.setdefault(home.get("region", "unknown"), []).append(home)
    sizes = {}
    counts = {}
    for region_id in sorted(by_region):
        slim = [slim_home(h) for h in by_region[region_id]]
        path = out_dir / f"{region_id}.json"
        path.write_text(json.dumps({"region": region_id, "homes": slim},
                                   ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8")
        sizes[region_id] = path.stat().st_size
        by_kind: dict[str, int] = {}
        by_match: dict[str, int] = {}
        for h in by_region[region_id]:
            by_kind[h.get("kind", "?")] = by_kind.get(h.get("kind", "?"), 0) + 1
            by_match[h.get("match", "?")] = by_match.get(
                h.get("match", "?"), 0) + 1
        counts[region_id] = {"homes": len(slim), "by_kind": by_kind,
                             "by_match": by_match}
    summary = {"regions": counts,
               "total": sum(c["homes"] for c in counts.values())}
    summary_path = out_dir / SLIM_SUMMARY
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=1)
                            + "\n", encoding="utf-8")
    sizes["_summary"] = summary_path.stat().st_size
    return {"dir": str(out_dir), "sizes": sizes,
            "total_bytes": sum(sizes.values()), "summary": summary}


OSM_SPOTCHECK_SEED = 20261029
OSM_SPOTCHECK_N = 10


def run_build(raw_dir: str | Path = DEFAULT_RAW_DIR,
              build_dir: str | Path = DEFAULT_BUILD_DIR,
              regions_path: str | Path | None = None,
              photos_path: str | Path | None = None,
              register_dir: str | Path | None = None,
              limit: int | None = None,
              skip_osm_names: bool = False) -> dict:
    """CLI entry: read RTMS + register, write data/build/homes-index.json."""
    import random

    from .osm_names import collect_all_extracts

    raw_dir, build_dir = Path(raw_dir), Path(build_dir)
    regions_path = (Path(regions_path) if regions_path
                    else build_dir / "regions.json")
    regions = json.loads(regions_path.read_text(encoding="utf-8"))["regions"]
    region_rows, missing = read_region_rows(raw_dir, regions, limit=limit)
    bbox = combined_bbox([r.get("bbox") for r in regions])
    register = stream_register_for_bbox(
        bbox, register_dir if register_dir
        else raw_dir / "buildings") if bbox else []
    boxes = load_box_graphs(build_dir)
    photos = load_photos(photos_path)
    filters, geofence = _region_filters(regions, build_dir)
    wirye_within = filters.get("wirye")
    pool = [] if skip_osm_names else collect_all_extracts(
        build_dir / "_cache" / "regions")
    homes, report = build_homes_index(region_rows, register, boxes, photos,
                                      wirye_within=wirye_within,
                                      osm_polygons=pool,
                                      region_within=filters)
    doc = {"homes": homes,
           "sources": {
               "rtms": "국토교통부 실거래가 공개시스템 (2025-10-28…2026-10-27, 계약일 기준)",
               "register": "GIS건물통합정보 AL_D010",
               "osm_names": "OpenStreetMap residential polygons by complex name (match=osm_name only)",
               "walk": "built-box walk graph, adult 1.3 m/s (null outside boxes)",
               "photos": "Wikimedia Commons geotagged manifest (700 m count)"},
           "report": report,
           "missing_files": missing}
    out = build_dir / HOMES_FILE
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8")
    slim = write_slim_indexes(homes, build_dir)
    osm_homes = [h for h in homes if h.get("match") == "osm_name"]
    rng = random.Random(OSM_SPOTCHECK_SEED)
    picks = rng.sample(osm_homes, min(OSM_SPOTCHECK_N, len(osm_homes)))
    spotcheck = [{"region": h["region"], "complex": h["name"],
                  "osm_name": (h.get("osm") or {}).get("name"),
                  "lon": h["lon"], "lat": h["lat"]} for h in picks]
    total_read = sum(r["rows_read"] for r in report.values())
    total_matched = sum(r["rows_matched"] for r in report.values())
    total_osm = sum(r["rows_matched_osm"] for r in report.values())
    return {"file": str(out), "homes": len(homes),
            "homes_osm": len(osm_homes),
            "rows_read": total_read, "rows_matched": total_matched,
            "rows_matched_osm": total_osm,
            "matched_pct": (round(total_matched / total_read * 100, 1)
                            if total_read else 0.0),
            "missing_files": missing, "boxes_used": [b["id"] for b in boxes],
            "geofence": geofence, "slim": slim, "osm_spotcheck": spotcheck,
            "per_region": report}
