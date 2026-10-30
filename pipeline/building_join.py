"""Join the GIS building register to OSM footprints and assign heights.

Reads ``area_def.json`` + ``osm.json`` from an area dir, streams the
GIS건물통합정보 shapefiles under ``data/raw/buildings/<region>/`` for the
area bbox, matches register polygons to OSM footprints by overlap, adds
register-only buildings, and writes ``buildings.json``. Every building gets
``height_m`` + ``height_source``.

Register field mapping (anonymised A0..A28, inspected from values in
``seoul/AL_D010_11_20261009.*``; confidence in brackets):

================= =====================================================
field             meaning
================= =====================================================
A0                row serial number [medium: near-unique integers]
A1                28-char building management id, unique per record [high]
A2                19-char parcel id (PNU: 법정동코드+지번) [medium-high]
A3                10-digit 법정동 code, e.g. 1111017500 [high]
A4                법정동 address, e.g. 서울특별시 종로구 숭인동 [high]
A5                lot number (번지), e.g. 56-24 [high]
A6/A7             lot-type code/label: 1/일반 vs 2/산 [high]
A8/A9             use code/name, e.g. 01000/단독주택 [high]
A10/A11           structure code/name, e.g. 11/벽돌구조 [high]
A12               building footprint area, m² (건축면적) [high]
A13               approval date (사용승인일), YYYY-MM-DD string [high]
A14               gross floor area, m² (연면적) [high]
A15               site area, m² (대지면적) [high: A12/A15 == A17 verified]
A16               building height, m [high: 20 floors→59.5, 3→9.1]
A17               building coverage %, 건폐율 [high: arithmetic verified]
A18               floor-area ratio %, 용적률 [medium: plausible, unverified]
A19               unknown numeric, often empty [low]
A20               unknown flag, N/Y/empty [low]
A21               auxiliary 17-char building id, sometimes empty [medium]
A22               base date (기준일 2026-10-06) [high]
A23               5-digit 시군구 code, e.g. 11110 종로구 [high]
A24               building name, e.g. 목동현대1차아파트 [high]
A25               sub-unit (동), e.g. 101동 [high]
A26               above-ground floors (지상층수) [high]
A27               basement floors (지하층수) [high]
A28               data change date, YYYY-MM-DD [medium]
================= =====================================================

Match rule (overlap-based): for each OSM building, the register polygon with
the highest IoU (intersection over union, areas in local metres) is accepted
when ``IoU >= 0.25`` OR ``intersection / min(osm, reg area) >= 0.50``. The
second clause catches small OSM parts matched against a larger register
whole (and vice versa). One-to-one: each register polygon matches at most
one OSM building (best IoU wins, ties broken by register id).

Height priority: ``osm_height`` > ``osm_levels`` (levels × 3.0 m) >
``register_height`` (A16) > ``register_floors`` (A26 × 3.0 m) > ``inferred``.

Inferred heights: per-type floor range from the OSM ``building`` value (or
the register-use mapping below), plus a footprint-area bump
(>500 m²: +2 floors, >2000 m²: +5, cap 25), floors drawn uniformly with a
RNG seeded by ``sha256("stage1-infer:<area>:<building id>")`` so runs are
deterministic; height = floors × 3.0 m.

Register-use to coarse type: 공동주택→apartments, 단독주택→house,
제1/2종근린생활시설 + 근린생활시설→commercial, 업무시설→office,
교육연구시설→school, 숙박시설→hotel, 공장→industrial, 창고시설→warehouse,
anything else→yes.

Residential classification (stage 2): every building gets ``residential``
(``apartment`` | ``house`` | ``mixed`` | ``none``) plus
``residential_source``. Precedence (see :func:`classify_residential`):

1. Register use wins when present: ``공동주택``→apartment,
   ``단독주택``→house; other uses→none, except 근린생활시설 with strict
   residential-name evidence→mixed.
2. Otherwise the OSM ``building`` tag: ``apartments``→apartment,
   ``house``/``detached``/``terrace``→house, ``residential``→apartment
   when ``levels >= 4`` else house (the tag is unreliable on its own:
   pangyo carries 8-floor office blocks tagged ``residential``).
3. Otherwise an apartment name (아파트/연립주택/다세대주택/주상복합,
   excluding 상가/공장 wings such as 상가동 and 아파트형공장)→apartment.
4. Otherwise none.

``register.use`` is kept verbatim; the classification never rewrites it.
Known gap: officetels (업무시설) and 주상복합 towers read as none/mixed
at best — the register gives no household signal, so they are not
guessed into apartment.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely.geometry import shape as shapely_shape
from shapely.geometry import Polygon
from shapely.ops import transform as shp_transform
from shapely.ops import unary_union
from shapely.validation import make_valid

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REGISTER_DIR = REPO_ROOT / "data" / "raw" / "buildings"

SRC_CRS = "EPSG:5186"  # Korea_2000_Central_Belt_2010 per .prj
DST_CRS = "EPSG:4326"

# Match thresholds (documented rule, see module docstring).
MATCH_IOU_MIN = 0.25
MATCH_MIN_COVER_MIN = 0.50

FLOOR_HEIGHT_M = 3.0
INFER_SEED_TAG = "stage1-infer"
COORD_NDIGITS = 7
BBOX_PAD_DEG = 0.001  # ~100 m so edge-crossing footprints still match
BBOX_PAD_M = 150.0  # pad applied in EPSG:5186 space
METERS_PER_DEG_LAT = 111_320.0

BUILDINGS_FILE = "buildings.json"

REGISTER_USE_TO_TYPE = {
    "공동주택": "apartments",
    "단독주택": "house",
    "제1종근린생활시설": "commercial",
    "제2종근린생활시설": "commercial",
    "근린생활시설": "commercial",
    "업무시설": "office",
    "교육연구시설": "school",
    "숙박시설": "hotel",
    "공장": "industrial",
    "창고시설": "warehouse",
}

# Residential classification (stage 2; documented in the module docstring).
RESIDENTIAL_VALUES = ("apartment", "house", "mixed", "none")
GEUNRIN_USES = {"제1종근린생활시설", "제2종근린생활시설", "근린생활시설"}
APARTMENT_NAME_KEYWORDS = ("아파트", "연립주택", "다세대주택", "주상복합")
APARTMENT_NAME_EXCLUSIONS = ("상가", "공장")  # 상가동 wings, 아파트형공장
RESIDENTIAL_OSM_HOUSE_TAGS = {"house", "detached", "terrace"}
RESIDENTIAL_LEVELS_APARTMENT_MIN = 4  # OSM building=residential split


def has_apartment_name(name: str | None) -> bool:
    """Strict apartment-name evidence: keyword present, no 상가/공장 wing."""
    if not name:
        return False
    if any(exc in name for exc in APARTMENT_NAME_EXCLUSIONS):
        return False
    return any(kw in name for kw in APARTMENT_NAME_KEYWORDS)


def classify_residential(building_tag: str | None, name: str | None,
                         reg_use: str | None,
                         levels: int | None) -> tuple[str, str]:
    """Return (residential, residential_source) per the documented rules."""
    if reg_use:
        if reg_use == "공동주택":
            return ("apartment", f"register:{reg_use}")
        if reg_use == "단독주택":
            return ("house", f"register:{reg_use}")
        if reg_use in GEUNRIN_USES and has_apartment_name(name):
            return ("mixed", f"register:{reg_use}+name")
        return ("none", f"register:{reg_use}")
    if building_tag == "apartments":
        return ("apartment", "osm:apartments")
    if building_tag in RESIDENTIAL_OSM_HOUSE_TAGS:
        return ("house", f"osm:{building_tag}")
    if building_tag == "residential":
        if (levels or 0) >= RESIDENTIAL_LEVELS_APARTMENT_MIN:
            return ("apartment", "osm:residential")
        return ("house", "osm:residential")
    if has_apartment_name(name):
        return ("apartment", "name")
    return ("none", "none")


INFER_FLOORS: dict[str, tuple[int, int]] = {
    "apartments": (3, 15),
    "office": (2, 12),
    "commercial": (1, 6),
    "retail": (1, 3),
    "industrial": (1, 3),
    "warehouse": (1, 2),
    "school": (1, 5),
    "hotel": (3, 12),
    "hospital": (2, 8),
    "dormitory": (3, 10),
    "house": (1, 2),
    "detached": (1, 2),
    "semidetached": (1, 2),
    "terrace": (1, 3),
    "residential": (1, 5),
}
DEFAULT_INFER_FLOORS = (1, 4)
AREA_BUMP = ((2000.0, 5, 25), (500.0, 2, 15))  # (area_m2, extra, cap)

# assumed; US has no national building register
US_INFER_FLOORS: dict[str, tuple[int, int]] = {
    "house": (1, 2),
    "detached": (1, 2),
    "semidetached_house": (1, 2),
    "bungalow": (1, 2),
    "residential": (1, 2),
    "terrace": (1, 2),
    "apartments": (2, 3),
    "commercial": (1, 2),
    "retail": (1, 2),
    "industrial": (1, 2),
    "warehouse": (1, 2),
    "church": (1, 2),
    "school": (1, 2),
    "office": (2, 3),
    "garage": (1, 1),
    "garages": (1, 1),
    "carport": (1, 1),
    "shed": (1, 1),
    "roof": (1, 1),
    "hut": (1, 1),
}
# assumed; US has no national building register
US_DEFAULT_INFER_FLOORS = (1, 2)
# assumed; US has no national building register
US_AREA_BUMP = ((5000.0, 1, 4),)  # (area_m2, extra, cap)
# Accessory structures stay single-storey at 3.0 m.
US_ACCESSORY_TYPES = frozenset(
    {"garage", "garages", "carport", "shed", "roof", "hut"})


def discover_register_files(
    register_dir: str | Path = DEFAULT_REGISTER_DIR,
) -> list[tuple[str, Path]]:
    """Auto-discover ``<region>/*.shp`` under the register dir (sorted)."""
    register_dir = Path(register_dir)
    if not register_dir.exists():
        return []
    found = sorted(register_dir.glob("*/ *.shp".replace(" ", "")))
    return [(p.parent.name, p) for p in found]


def _num(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value) -> int | None:
    num = _num(value)
    return int(num) if num is not None else None


def _text(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _bounds_of_osm(osm: dict) -> tuple[float, float, float, float] | None:
    """Bounds over every building/road/POI/landuse geometry in osm.json."""

    def walk(coords, box: list):
        if isinstance(coords[0], (int, float)):
            box[0] = min(box[0], coords[0])
            box[1] = min(box[1], coords[1])
            box[2] = max(box[2], coords[0])
            box[3] = max(box[3], coords[1])
        else:
            for part in coords:
                walk(part, box)

    box: list = [math.inf, math.inf, -math.inf, -math.inf]
    for key in ("buildings", "roads", "pois", "landuse", "trees"):
        for feat in osm.get(key, []):
            geom = feat.get("geometry")
            if geom and geom.get("coordinates"):
                walk(geom["coordinates"], box)
    if box[0] == math.inf:
        return None
    return (box[0], box[1], box[2], box[3])


def query_bbox_wgs84(area_def: dict, osm: dict) -> tuple[float, float, float, float]:
    """Area query bbox (WGS84, padded) for the register stream."""
    if area_def.get("bbox"):
        minlon, minlat, maxlon, maxlat = area_def["bbox"]
    else:  # boundary area (e.g. whole songpa-gu): derive from parsed features
        bounds = _bounds_of_osm(osm)
        if bounds is None:
            raise ValueError("boundary area has no parsed features for a bbox")
        minlon, minlat, maxlon, maxlat = bounds
    pad = BBOX_PAD_DEG
    return (minlon - pad, minlat, maxlon + pad, maxlat + pad)


def load_boundary_polygon(area_def: dict, area_dir: Path):
    """Assemble the admin-boundary polygon for a ``kind == boundary`` area.

    Reads the relation extract cached by :mod:`pipeline.extract`
    (``<build>/_cache/songpa-boundary.osm.pbf``) and assembles the rings of
    ``area_def["boundary"]["relation_id"]``. Returns a shapely geometry, or
    None when unavailable (caller falls back to the feature bbox).
    """
    from .extract import BOUNDARY_FILE

    boundary = area_def.get("boundary") or {}
    relation_id = boundary.get("relation_id")
    cache_file = area_dir.parent / "_cache" / BOUNDARY_FILE
    if not relation_id or not cache_file.exists():
        return None

    import osmium

    from .osm_parse import _rings_to_geojson

    members: list[tuple[str, int, str]] = []

    class _RelScan(osmium.SimpleHandler):
        def relation(self, r):
            if r.id == relation_id:
                members.extend((m.type, m.ref, m.role) for m in r.members)

    _RelScan().apply_file(str(cache_file), locations=False)
    wanted = {ref for typ, ref, _role in members if typ == "w"}
    if not wanted:
        return None
    geoms: dict[int, list] = {}

    class _WayScan(osmium.SimpleHandler):
        def way(self, w):
            if w.id in wanted:
                coords = [(n.lon, n.lat) for n in w.nodes
                          if n.location.valid()]
                if coords:
                    geoms[w.id] = coords

    _WayScan().apply_file(str(cache_file), locations=True)
    outers = [geoms[ref] for typ, ref, role in members
              if typ == "w" and role != "inner" and ref in geoms]
    inners = [geoms[ref] for typ, ref, role in members
              if typ == "w" and role == "inner" and ref in geoms]
    geojson = _rings_to_geojson(outers, inners)
    return shapely_shape(geojson) if geojson else None


def wgs84_to_5186_bbox(
    bbox: tuple[float, float, float, float],
    transformer: Transformer,
) -> tuple[float, float, float, float]:
    minlon, minlat, maxlon, maxlat = bbox
    corners = [(minlon, minlat), (minlon, maxlat), (maxlon, minlat),
               (maxlon, maxlat)]
    xs, ys = transformer.transform([c[0] for c in corners],
                                   [c[1] for c in corners])
    return (min(xs) - BBOX_PAD_M, min(ys) - BBOX_PAD_M,
            max(xs) + BBOX_PAD_M, max(ys) + BBOX_PAD_M)


def _reproject_rings(rings: list, transformer: Transformer) -> list:
    out = []
    for ring in rings:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        tx, ty = transformer.transform(xs, ys)
        out.append([(round(x, COORD_NDIGITS), round(y, COORD_NDIGITS))
                    for x, y in zip(tx, ty)])
    return out


def stream_register(
    shp_files: list[tuple[str, Path]],
    bbox_5186: tuple[float, float, float, float],
) -> list[dict]:
    """Stream register polygons inside the bbox (EPSG:5186 filter, early).

    Reads each shape header/geometry via the ``.shx`` index first and only
    touches the (1.26 GB) DBF record when the shape bbox overlaps the query
    bbox. Returns reprojected (WGS84) records.
    """
    qminx, qminy, qmaxx, qmaxy = bbox_5186
    to_wgs84 = Transformer.from_crs(SRC_CRS, DST_CRS, always_xy=True)
    records: list[dict] = []
    for region, shp_path in shp_files:
        reader = shapefile.Reader(str(shp_path), encoding="cp949")
        stem = shp_path.stem
        for idx in range(len(reader)):
            shp = reader.shape(idx)  # shx seek; DBF untouched
            if shp.shapeType not in (5, 15):  # polygon / polygonZ
                continue
            sb = shp.bbox
            if sb[0] > qmaxx or sb[2] < qminx or sb[1] > qmaxy or sb[3] < qminy:
                continue
            rec = reader.record(idx)  # DBF read only for bbox hits
            parts = list(shp.parts) + [len(shp.points)]
            rings_5186 = [shp.points[parts[k]:parts[k + 1]]
                          for k in range(len(parts) - 1)]
            rings_5186 = [r for r in rings_5186 if len(r) >= 4]
            if not rings_5186:
                continue
            rings = _reproject_rings(rings_5186, to_wgs84)
            try:
                poly = (Polygon(rings[0]) if len(rings) == 1
                        else Polygon(rings[0], rings[1:]))
            except ValueError:
                continue
            if not poly.is_valid:
                poly = make_valid(poly)
            if poly.is_empty or poly.geom_type not in ("Polygon",
                                                       "MultiPolygon"):
                continue
            mgmt = _text(rec[1])
            reg_id = f"reg:{mgmt}" if mgmt else f"reg:{stem}:{idx}"
            pnu = _text(rec[2])
            records.append({
                "id": reg_id,
                "region": region,
                "shape_index": idx,
                "pnu": pnu if pnu and len(pnu) == 19 else None,
                "height": _num(rec[16]),
                "floors_above": _int(rec[26]),
                "floors_below": _int(rec[27]),
                "use_code": _text(rec[8]),
                "use": _text(rec[9]),
                "structure_code": _text(rec[10]),
                "structure": _text(rec[11]),
                "name": _text(rec[24]),
                "sub_name": _text(rec[25]),
                "footprint_area": _num(rec[12]),
                "approval_date": _text(rec[13]),
                "address": _text(rec[4]),
                "lot": _text(rec[5]),
                "geometry_wgs84": poly,
            })
    records.sort(key=lambda r: r["id"])
    return records


def _to_local(geoms: list, lon0: float, lat0: float) -> list:
    kx = METERS_PER_DEG_LAT * math.cos(math.radians(lat0))
    ky = METERS_PER_DEG_LAT
    return [shp_transform(lambda x, y, z=None: ((x - lon0) * kx, (y - lat0) * ky), g)
            for g in geoms]


def _overlap(osm_geom, reg_geom) -> tuple[float, float, float]:
    """Return (iou, cover_of_min, reg_area_m2) in a local metre frame."""
    c = osm_geom.centroid
    proj_o, proj_r = _to_local([osm_geom, reg_geom], c.x, c.y)
    area_o = proj_o.area
    area_r = proj_r.area
    if area_o <= 0 or area_r <= 0:
        return (0.0, 0.0, area_r)
    inter = proj_o.intersection(proj_r).area
    union = area_o + area_r - inter
    iou = inter / union if union > 0 else 0.0
    cover = inter / min(area_o, area_r)
    return (iou, cover, area_r)


def match_buildings(osm_buildings: list[dict],
                    register: list[dict]) -> dict[str, dict]:
    """Match OSM buildings to register polygons; returns {osm_id: reg}."""
    from shapely import STRtree

    if not register:
        return {}
    reg_geoms = [r["geometry_wgs84"] for r in register]
    tree = STRtree(reg_geoms)
    matches: dict[str, dict] = {}
    claimed: dict[str, str] = {}  # reg_id -> osm_id
    for osm in sorted(osm_buildings, key=lambda b: b["id"]):
        try:
            geom_o = shapely_shape(osm["geometry"])
        except (ValueError, KeyError):
            continue
        if geom_o.is_empty:
            continue
        best = None
        for cand in sorted(tree.query(geom_o), key=lambda i: register[i]["id"]):
            reg = register[cand]
            iou, cover, _ = _overlap(geom_o, reg["geometry_wgs84"])
            if iou >= MATCH_IOU_MIN or cover >= MATCH_MIN_COVER_MIN:
                key = (round(iou, 9), reg["id"])
                if best is None or key > best[0]:
                    best = (key, reg)
        if best is None:
            continue
        reg = best[1]
        prev_osm = claimed.get(reg["id"])
        if prev_osm is None:
            claimed[reg["id"]] = osm["id"]
            matches[osm["id"]] = reg
        # else: register polygon already matched to an earlier (lower-id)
        # OSM building; keep the first claim for determinism.
    return matches


def _valid_height(value: float | None) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    if 0.0 < value <= 1000.0:
        return round(float(value), 2)
    return None


def _valid_floors(value: int | None) -> int | None:
    if value is None or not 0 < value <= 200:
        return None
    return value


def infer_height(building_type: str | None, area_m2: float,
                 area_id: str, building_id: str,
                 country: str = "KR") -> tuple[float, int]:
    """Seeded inferred (height_m, floors) from type + footprint area."""
    if country == "US":
        if (building_type or "") in US_ACCESSORY_TYPES:
            return (3.0, 1)
        lo, hi = US_INFER_FLOORS.get(building_type or "",
                                     US_DEFAULT_INFER_FLOORS)
        seed = int.from_bytes(
            hashlib.sha256(
                f"{INFER_SEED_TAG}:{area_id}:{building_id}".encode()
            ).digest()[:8], "big")
        rng = random.Random(seed)
        floors = rng.randint(lo, hi)
        for threshold, extra, cap in US_AREA_BUMP:
            if area_m2 > threshold:
                floors = min(floors + extra, cap)
                break
        return (round(floors * FLOOR_HEIGHT_M, 2), floors)
    lo, hi = INFER_FLOORS.get(building_type or "", DEFAULT_INFER_FLOORS)
    seed = int.from_bytes(
        hashlib.sha256(
            f"{INFER_SEED_TAG}:{area_id}:{building_id}".encode()).digest()[:8],
        "big")
    rng = random.Random(seed)
    floors = rng.randint(lo, hi)
    for threshold, extra, cap in AREA_BUMP:
        if area_m2 > threshold:
            floors = min(floors + extra, cap)
            break
    return (round(floors * FLOOR_HEIGHT_M, 2), floors)


def _geom_to_geojson(geom) -> dict | None:
    if geom.is_empty:
        return None
    if geom.geom_type == "Polygon":
        rings = [geom.exterior, *geom.interiors]
        coords = [[[round(float(x), COORD_NDIGITS),
                    round(float(y), COORD_NDIGITS)] for x, y in r.coords]
                  for r in rings]
        return {"type": "Polygon", "coordinates": coords}
    if geom.geom_type == "MultiPolygon":
        all_polys = []
        for poly in geom.geoms:
            rings = [poly.exterior, *poly.interiors]
            all_polys.append([[[round(float(x), COORD_NDIGITS),
                                round(float(y), COORD_NDIGITS)]
                               for x, y in r.coords] for r in rings])
        return {"type": "MultiPolygon", "coordinates": all_polys}
    return None


def _footprint_area_m2(geom) -> float:
    c = geom.centroid
    kx = METERS_PER_DEG_LAT * math.cos(math.radians(c.y))
    ky = METERS_PER_DEG_LAT
    proj = shp_transform(lambda x, y, z=None: ((x - c.x) * kx, (y - c.y) * ky),
                         geom)
    return round(proj.area, 2)


def join_area(area_id: str, area_def: dict, osm: dict,
              shp_files: list[tuple[str, Path]],
              area_dir: Path | None = None) -> dict:
    """Join register + OSM for one area; returns the buildings.json payload."""
    boundary_poly = None
    if area_def.get("kind") == "boundary" and area_dir is not None:
        # A gu-sized bbox covers ~4x the district plus complete_ways
        # stragglers, so clip register candidates to the real boundary.
        boundary_poly = load_boundary_polygon(area_def, area_dir)
    if boundary_poly is not None:
        minlon, minlat, maxlon, maxlat = boundary_poly.bounds
        pad = BBOX_PAD_DEG
        bbox = (minlon - pad, minlat, maxlon + pad, maxlat + pad)
    else:
        bbox = query_bbox_wgs84(area_def, osm)
    to_5186 = Transformer.from_crs(DST_CRS, SRC_CRS, always_xy=True)
    register = stream_register(shp_files, wgs84_to_5186_bbox(bbox, to_5186))
    if boundary_poly is not None:
        from shapely.prepared import prep

        prepared = prep(boundary_poly)
        register = [r for r in register
                    if prepared.intersects(r["geometry_wgs84"])]
    coverage = "full" if register else "none"

    osm_buildings = osm.get("buildings", [])
    matches = match_buildings(osm_buildings, register) if register else {}
    matched_reg_ids = {r["id"] for r in matches.values()}

    buildings: list[dict] = []
    for osm_b in sorted(osm_buildings, key=lambda b: b["id"]):
        geom = shapely_shape(osm_b["geometry"])
        area_m2 = _footprint_area_m2(geom)
        reg = matches.get(osm_b["id"])
        osm_h = _valid_height(osm_b.get("height_m"))
        osm_lv = _valid_floors(osm_b.get("levels"))
        reg_h = _valid_height(reg["height"]) if reg else None
        reg_lv = _valid_floors(reg["floors_above"]) if reg else None
        if osm_h is not None:
            height, source, levels = osm_h, "osm_height", osm_lv
        elif osm_lv is not None:
            height = round(osm_lv * FLOOR_HEIGHT_M, 2)
            source, levels = "osm_levels", osm_lv
        elif reg_h is not None:
            height, source, levels = reg_h, "register_height", reg_lv
        elif reg_lv is not None:
            height = round(reg_lv * FLOOR_HEIGHT_M, 2)
            source, levels = "register_floors", reg_lv
        else:
            height, floors = infer_height(osm_b.get("building"), area_m2,
                                          area_id, osm_b["id"],
                                          country=area_def.get("country", "KR"))
            source, levels = "inferred", floors
        bname = osm_b.get("name") or (reg["name"] if reg else None)
        residential, residential_source = classify_residential(
            osm_b.get("building"), bname,
            reg["use"] if reg else None, levels)
        buildings.append({
            "id": osm_b["id"],
            "origin": "joined" if reg else "osm",
            "osm_kind": osm_b.get("osm_kind"),
            "osm_id": osm_b.get("osm_id"),
            "register_id": reg["id"] if reg else None,
            "building": osm_b.get("building"),
            "name": bname,
            "height_m": height,
            "height_source": source,
            "levels": levels,
            "area_m2": area_m2,
            "residential": residential,
            "residential_source": residential_source,
            "register": _register_summary(reg) if reg else None,
            "geometry": osm_b["geometry"],
        })

    for reg in register:
        if reg["id"] in matched_reg_ids:
            continue
        geom = reg["geometry_wgs84"]
        geojson = _geom_to_geojson(geom)
        if geojson is None:
            continue
        area_m2 = _footprint_area_m2(geom)
        reg_h = _valid_height(reg["height"])
        reg_lv = _valid_floors(reg["floors_above"])
        btype = REGISTER_USE_TO_TYPE.get(reg["use"] or "", "yes")
        if reg_h is not None:
            height, source, levels = reg_h, "register_height", reg_lv
        elif reg_lv is not None:
            height = round(reg_lv * FLOOR_HEIGHT_M, 2)
            source, levels = "register_floors", reg_lv
        else:
            height, floors = infer_height(btype, area_m2, area_id, reg["id"],
                                          country=area_def.get("country", "KR"))
            source, levels = "inferred", floors
        name = reg["name"]
        if name and reg["sub_name"]:
            name = f"{name} {reg['sub_name']}"
        residential, residential_source = classify_residential(
            btype, name, reg["use"], levels)
        buildings.append({
            "id": reg["id"],
            "origin": "register",
            "osm_kind": None,
            "osm_id": None,
            "register_id": reg["id"],
            "building": btype,
            "name": name,
            "height_m": height,
            "height_source": source,
            "levels": levels,
            "area_m2": area_m2,
            "residential": residential,
            "residential_source": residential_source,
            "register": _register_summary(reg),
            "geometry": geojson,
        })

    buildings.sort(key=lambda b: b["id"])
    sources = height_sources(buildings)
    inferred_share = all_inferred_share(buildings)
    residential_inferred = residential_inferred_share(buildings)
    residential_counts: dict[str, int] = {}
    for b in buildings:
        key = b["residential"]
        residential_counts[key] = residential_counts.get(key, 0) + 1
    return {
        "buildings": buildings,
        "meta": {
            "area": area_id,
            "register_coverage": coverage,
            "register_files": [f"{region}/{p.name}"
                               for region, p in shp_files],
            "register_records_in_bbox": len(register),
            "counts": {
                "total": len(buildings),
                "joined": sum(1 for b in buildings if b["origin"] == "joined"),
                "osm_only": sum(1 for b in buildings if b["origin"] == "osm"),
                "register_only": sum(1 for b in buildings
                                     if b["origin"] == "register"),
            },
            "height_sources": sources,
            "inferred_share": round(inferred_share, 4),
            "residential_inferred_share": (
                round(residential_inferred, 4)
                if residential_inferred is not None else None),
            "residential_counts": residential_counts,
            "rules": {
                "match_iou_min": MATCH_IOU_MIN,
                "match_min_cover_min": MATCH_MIN_COVER_MIN,
                "floor_height_m": FLOOR_HEIGHT_M,
                "infer_seed_tag": INFER_SEED_TAG,
            },
        },
    }


def height_sources(buildings: list[dict]) -> dict[str, int]:
    """Count buildings per ``height_source`` (deterministic key order)."""
    sources: dict[str, int] = {}
    for b in buildings:
        sources[b["height_source"]] = sources.get(b["height_source"], 0) + 1
    return sources


def all_inferred_share(buildings: list[dict]) -> float:
    """Inferred-height share over all buildings (reported, not a gate)."""
    if not buildings:
        return 0.0
    return (sum(1 for b in buildings
                if b.get("height_source") == "inferred") / len(buildings))


def residential_inferred_share(buildings: list[dict]) -> float | None:
    """Inferred-height share among homes (the stage-3 pass gate).

    Homes are buildings with ``residential`` in apartment/house/mixed.
    None when the area has no homes (gate passes vacuously).
    """
    homes = [b for b in buildings
             if b.get("residential") in ("apartment", "house", "mixed")]
    if not homes:
        return None
    return (sum(1 for b in homes
                if b.get("height_source") == "inferred") / len(homes))


def _register_summary(reg: dict) -> dict:
    return {
        "height": reg["height"],
        "floors_above": reg["floors_above"],
        "floors_below": reg["floors_below"],
        "use": reg["use"],
        "structure": reg["structure"],
        "approval_date": reg["approval_date"],
        "address": reg["address"],
        "region": reg["region"],
        # Stage 2 additions (verbatim register fields): parcel id (A2),
        # building name (A24) and sub-unit/dong (A25). Needed for complex
        # name stems, dong matching in the register-API fill, and PNU keys.
        "pnu": reg.get("pnu"),
        "name": reg.get("name"),
        "sub_name": reg.get("sub_name"),
    }


def run_build(area_dir: str | Path) -> dict:
    """CLI hook: read osm.json, write buildings.json, return a summary.

    Stage 3: cached register-API titles (``data/raw/register_api/``) are
    re-applied offline after the join, so a rebuild after
    ``register-fill`` keeps ``api_height`` etc. (no network, no key).
    """
    from .register_api import apply_cached_titles

    area_dir = Path(area_dir)
    area_id = area_dir.name
    area_def = json.loads((area_dir / "area_def.json").read_text(encoding="utf-8"))
    osm = json.loads((area_dir / "osm.json").read_text(encoding="utf-8"))
    shp_files = discover_register_files()
    payload = join_area(area_id, area_def, osm, shp_files, area_dir)
    cache_counts = apply_cached_titles(payload["buildings"])
    if cache_counts["cache_filled"]:
        # Recompute the source mix after the offline fill (same helpers
        # as join_area, so consecutive rebuilds stay byte-identical).
        payload["meta"]["height_sources"] = height_sources(
            payload["buildings"])
        payload["meta"]["inferred_share"] = round(
            all_inferred_share(payload["buildings"]), 4)
        res_share = residential_inferred_share(payload["buildings"])
        payload["meta"]["residential_inferred_share"] = (
            round(res_share, 4) if res_share is not None else None)
    payload["meta"]["register_cache"] = cache_counts
    (area_dir / BUILDINGS_FILE).write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8")
    meta = payload["meta"]
    return {
        "buildings": meta["counts"]["total"],
        "joined": meta["counts"]["joined"],
        "osm_only": meta["counts"]["osm_only"],
        "register_only": meta["counts"]["register_only"],
        "register_coverage": meta["register_coverage"],
        "height_sources": meta["height_sources"],
        "inferred_share": meta["inferred_share"],
        "residential_inferred_share": meta["residential_inferred_share"],
        "register_cache": cache_counts,
    }
