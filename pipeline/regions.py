"""Search regions for stage 12a (9 regions + neighbourhood labels).

Regions (for search and statistics):

* seongdong / songpa-gu / gangnam / gangdong — the four Seoul 구
  (OSM admin boundaries).
* bundang / sujeong / jungwon — 성남시 분당구 / 수정구 / 중원구
  (OSM admin boundaries).
* suji — 용인시 수지구 (OSM admin boundary).
* wirye — 위례: the 위례동 parts of 송파구, 성남 수정구 and 하남시.
  Resolved as every OSM admin boundary named 위례동; the resolved
  relation ids are recorded in ``regions.json`` so the definition is
  auditable (see ``wirye_note``).

Neighbourhood labels inside the regions (판교, 정자, 분당/서현·수내,
미금) are named places / stations, not statistics units — they resolve
to stations in the network, never to a safety column.

Each region records: id, label, boundary (gu/dong names looked up in
OSM), 시군구 codes (행정안전부 법정동코드 앞 5자리; cross-checked
against the register A23 values seen during the homes build), the RTMS
file districts, and the safety column + geographic level.

Output: ``data/build/regions.json`` (gitignored, like all built data).
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path

import osmium

from .areas import US_RAW_PBF

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RAW_PBF = REPO_ROOT / "data" / "raw" / "south-korea-latest.osm.pbf"
DEFAULT_BUILD_DIR = REPO_ROOT / "data" / "build"
REGIONS_FILE = "regions.json"

# id, label, OSM admin names to look up, sigungu codes, RTMS districts,
# safety (column, level) pairs.
REGION_SPECS = (
    {"id": "seongdong", "label": "서울 성동구",
     "osm_names": ("성동구",), "sigungu": ("11200",),
     "rtms": ("seongdong",),
     "safety": (("서울 성동구", "district"),)},
    {"id": "songpa-gu", "label": "서울 송파구",
     "osm_names": ("송파구",), "sigungu": ("11710",),
     "rtms": ("songpa",),
     "safety": (("서울 송파구", "district"),)},
    {"id": "gangnam", "label": "서울 강남구",
     "osm_names": ("강남구",), "sigungu": ("11680",),
     "rtms": ("gangnam",),
     "safety": (("서울 강남구", "district"),)},
    {"id": "gangdong", "label": "서울 강동구",
     "osm_names": ("강동구",), "sigungu": ("11740",),
     "rtms": ("gangdong",),
     "safety": (("서울 강동구", "district"),)},
    {"id": "bundang", "label": "성남시 분당구",
     "osm_names": ("분당구",), "sigungu": ("41135",),
     "rtms": ("bundang",),
     "safety": (("경기도 성남시", "city"),)},
    {"id": "sujeong", "label": "성남시 수정구",
     "osm_names": ("수정구",), "sigungu": ("41131",),
     "rtms": ("sujeong",),
     "safety": (("경기도 성남시", "city"),)},
    {"id": "jungwon", "label": "성남시 중원구",
     "osm_names": ("중원구",), "sigungu": ("41133",),
     "rtms": ("jungwon",),
     "safety": (("경기도 성남시", "city"),)},
    {"id": "suji", "label": "용인시 수지구",
     "osm_names": ("수지구",), "sigungu": ("41465",),
     "rtms": ("suji",),
     "safety": (("경기도 용인시", "city"),)},
    {"id": "wirye", "label": "위례",
     "osm_names": ("위례동",), "sigungu": ("11710", "41131", "41450"),
     "rtms": ("songpa", "sujeong", "hanam"),
     "safety": (("서울 송파구", "district"),
                ("경기도 성남시", "city"),
                ("경기도 하남시", "city"))},
)

REGION_IDS = tuple(spec["id"] for spec in REGION_SPECS)

WIRYE_NOTE = (
    "위례 = OSM에서 이름이 '위례동'인 행정경계의 합집합. "
    "이 추출본에는 서울 송파구 위례동(r11117000)과 하남시 위례동(r13316464)만 있고 "
    "성남 수정구 위례동 경계는 없으므로, 위례 실거래는 songpa·sujeong·hanam 세 파일의 행 중 "
    "매칭된 발바닥 중심점이 두 경계의 합집합 안에 든 것만 해당한다(성남 쪽 행은 수정구에 남는다). "
    "치안은 세 관할(서울 송파구·경기도 성남시·경기도 하남시) 통계를 각각 표시하며 합치지 않는다."
)

# Neighbourhood labels inside the regions: named places / stations.
# station_names are looked up in the stage-8 network (normalised, no 역).
PLACES = (
    {"id": "pangyo", "label": "판교", "region": "bundang",
     "station_names": ("판교",)},
    {"id": "jeongja", "label": "정자", "region": "bundang",
     "station_names": ("정자",)},
    {"id": "bundang-central", "label": "분당 (서현·수내)", "region": "bundang",
     "station_names": ("서현", "수내")},
    {"id": "migeum", "label": "미금", "region": "bundang",
     "station_names": ("미금",)},
)

PLACE_IDS = tuple(place["id"] for place in PLACES)

RTMS_TYPES = ("apt", "rowhouse", "officetel")
RTMS_DEALS = ("trade", "rent")
RTMS_SUFFIX = "2510-2610"


def rtms_file_names(district: str) -> list[str]:
    """The six RTMS CSV names for one district (same format as stage 6)."""
    return [f"{t}_{d}_{district}_{RTMS_SUFFIX}.csv"
            for t in RTMS_TYPES for d in RTMS_DEALS]


@dataclass
class RegionDef:
    """One resolved search region."""

    id: str
    label: str
    boundary_names: list[str]
    sigungu: list[str]
    rtms_districts: list[str]
    rtms_files: list[str]
    safety: list[dict]
    relations: list[dict] = field(default_factory=list)
    bbox: list[float] | None = None  # minlon,minlat,maxlon,maxlat over relations

    def to_dict(self) -> dict:
        return asdict(self)


class _BoundaryScan(osmium.SimpleHandler):
    """Collect admin-boundary relations whose name is one of the targets."""

    def __init__(self, names: set[str]):
        super().__init__()
        self.names = names
        self.hits: list[dict] = []

    def relation(self, r):
        tags = dict(r.tags)
        if tags.get("name") not in self.names:
            return
        if tags.get("type") != "boundary":
            return
        if tags.get("boundary") != "administrative":
            return
        self.hits.append({
            "id": r.id,
            "tags": tags,
            "members": [(m.type, m.ref, m.role) for m in r.members],
        })


def candidate_names() -> set[str]:
    names: set[str] = set()
    for spec in REGION_SPECS:
        names.update(spec["osm_names"])
    return names


def build_region_candidates(src_pbf: str | Path, dst_pbf: str | Path,
                            osmium_bin: str = "osmium",
                            refresh: bool = False) -> Path:
    """Prefilter the national PBF to the region admin names (cached)."""
    src, dst = Path(src_pbf), Path(dst_pbf)
    if (not refresh and dst.exists()
            and dst.stat().st_mtime >= src.stat().st_mtime):
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    expr = "nwr/name=" + ",".join(sorted(candidate_names()))
    proc = subprocess.run(
        [osmium_bin, "tags-filter", str(src_pbf), expr,
         "-o", str(dst), "-O", "--no-progress"],
        capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"osmium tags-filter failed: {proc.stderr.strip()}")
    return dst


def scan_boundaries(candidates_pbf: str | Path) -> list[dict]:
    """Single pyosmium pass over the candidate extract."""
    handler = _BoundaryScan(candidate_names())
    handler.apply_file(str(candidates_pbf), locations=False)
    return handler.hits


def _rank_hit(hit: dict) -> tuple:
    lvl_rank = {"6": 0, "7": 1, "8": 2, "9": 3}.get(
        hit["tags"].get("admin_level", ""), 4)
    return (lvl_rank, hit["id"])


def pick_region_relations(spec: dict, hits: list[dict]) -> list[dict]:
    """Relations for one region: every admin boundary with a spec name.

    Gu regions expect exactly one (the best admin level wins); 위례동
    keeps every match (송파·성남·하남) so the union is explicit.
    """
    names = set(spec["osm_names"])
    cands = [h for h in hits if h["tags"].get("name") in names]
    if not cands:
        raise LookupError(
            f"region {spec['id']!r}: no admin boundary named {sorted(names)}")
    if spec["id"] == "wirye":
        return sorted(cands, key=_rank_hit)
    return [sorted(cands, key=_rank_hit)[0]]


def resolve_regions(raw_pbf: str | Path = DEFAULT_RAW_PBF,
                    cache_dir: str | Path | None = None,
                    osmium_bin: str = "osmium",
                    refresh: bool = False) -> dict[str, RegionDef]:
    """Resolve every region: boundary relations + bboxes, one OSM scan."""
    from .extract import find_osmium

    raw_pbf = Path(raw_pbf)
    if not raw_pbf.exists():
        raise FileNotFoundError(f"national extract not found: {raw_pbf}")
    binary = find_osmium(osmium_bin)
    cache_dir = Path(cache_dir) if cache_dir else DEFAULT_BUILD_DIR / "_cache"
    cand = build_region_candidates(
        raw_pbf, cache_dir / "region-candidates.osm.pbf",
        osmium_bin=binary, refresh=refresh)
    hits = scan_boundaries(cand)
    out: dict[str, RegionDef] = {}
    for spec in REGION_SPECS:
        relations = pick_region_relations(spec, hits)
        bbox = region_bbox(raw_pbf, relations, cache_dir, spec["id"],
                           osmium_bin=binary, refresh=refresh)
        files: list[str] = []
        for district in spec["rtms"]:
            files.extend(rtms_file_names(district))
        out[spec["id"]] = RegionDef(
            id=spec["id"], label=spec["label"],
            boundary_names=list(spec["osm_names"]),
            sigungu=list(spec["sigungu"]),
            rtms_districts=list(spec["rtms"]),
            rtms_files=files,
            safety=[{"column": col, "level": lvl}
                    for col, lvl in spec["safety"]],
            relations=[{"name": h["tags"].get("name"),
                        "relation_id": h["id"],
                        "admin_level": h["tags"].get("admin_level")}
                       for h in relations],
            bbox=bbox)
    return out


def region_bbox(raw_pbf: Path, relations: list[dict], cache_dir: Path,
                region_id: str, osmium_bin: str = "osmium",
                refresh: bool = False) -> list[float] | None:
    """Bbox over the region's boundary member ways (one fetch per region).

    Fetches the relation(s) plus referenced members into the build cache,
    then bounds the member-way geometries. Returns None when no member
    geometry is available (caller falls back to a wider box).
    """
    from .extract import fetch_relation

    wanted: set[int] = set()
    for rel in relations:
        wanted.update(ref for typ, ref, _ in rel["members"] if typ == "w")
    if not wanted:
        return None
    cache_file = cache_dir / f"region-{region_id}-boundary.osm.pbf"
    if refresh or not cache_file.exists():
        tmp_files = []
        for rel in relations:
            tmp = cache_dir / f"region-{region_id}-r{rel['id']}.osm.pbf"
            fetch_relation(osmium_bin, raw_pbf, rel["id"], tmp)
            tmp_files.append(tmp)
        if len(tmp_files) == 1:
            tmp_files[0].replace(cache_file)
        else:
            proc = subprocess.run(
                [osmium_bin, "merge", *[str(t) for t in tmp_files],
                 "-o", str(cache_file), "-O", "--no-progress"],
                capture_output=True, text=True)
            if proc.returncode != 0:
                raise RuntimeError(
                    f"osmium merge failed: {proc.stderr.strip()}")
            for tmp in tmp_files:
                tmp.unlink(missing_ok=True)

    box = [float("inf"), float("inf"),
           float("-inf"), float("-inf")]

    class _WayScan(osmium.SimpleHandler):
        def way(self, w):
            if w.id not in wanted:
                return
            for n in w.nodes:
                if n.location.valid():
                    box[0] = min(box[0], n.lon)
                    box[1] = min(box[1], n.lat)
                    box[2] = max(box[2], n.lon)
                    box[3] = max(box[3], n.lat)

    _WayScan().apply_file(str(cache_file), locations=True)
    if box[0] == float("inf"):
        return None
    return [round(v, 7) for v in box]


def load_region_union(region_id: str, build_dir: str | Path):
    """Union polygon of a region's boundary relations (shapely, or None).

    Assembles rings from the cached ``region-<id>-boundary.osm.pbf``
    written by :func:`region_bbox`. Returns None when the cache or the
    member geometry is unavailable.
    """
    import osmium

    from .osm_parse import _rings_to_geojson
    from shapely.geometry import shape as shapely_shape
    from shapely.ops import unary_union

    build_dir = Path(build_dir)
    doc = json.loads((build_dir / REGIONS_FILE).read_text(encoding="utf-8"))
    region = next((r for r in doc["regions"] if r["id"] == region_id), None)
    cache_file = build_dir / "_cache" / f"region-{region_id}-boundary.osm.pbf"
    if region is None or not cache_file.exists():
        return None
    wanted_ids = {rel["relation_id"] for rel in region["relations"]}
    members: dict[int, list[tuple[str, int, str]]] = {}

    class _RelScan(osmium.SimpleHandler):
        def relation(self, r):
            if r.id in wanted_ids:
                members[r.id] = [(m.type, m.ref, m.role)
                                 for m in r.members]

    _RelScan().apply_file(str(cache_file), locations=False)
    wanted_ways = {ref for mems in members.values() for typ, ref, _ in mems
                   if typ == "w"}
    if not wanted_ways:
        return None
    geoms: dict[int, list] = {}

    class _WayScan(osmium.SimpleHandler):
        def way(self, w):
            if w.id in wanted_ways:
                coords = [(n.lon, n.lat) for n in w.nodes
                          if n.location.valid()]
                if coords:
                    geoms[w.id] = coords

    _WayScan().apply_file(str(cache_file), locations=True)
    polys = []
    for rel_id, mems in members.items():
        outers = [geoms[ref] for typ, ref, role in mems
                  if typ == "w" and role != "inner" and ref in geoms]
        inners = [geoms[ref] for typ, ref, role in mems
                  if typ == "w" and role == "inner" and ref in geoms]
        geojson = _rings_to_geojson(outers, inners)
        if geojson:
            polys.append(shapely_shape(geojson))
    if not polys:
        return None
    return unary_union(polys)


def to_doc(resolved: dict[str, RegionDef]) -> dict:
    return {
        "regions": [resolved[rid].to_dict() for rid in REGION_IDS],
        "places": [dict(p) for p in PLACES],
        "wirye_note": WIRYE_NOTE,
        "rtms_suffix": RTMS_SUFFIX,
    }


def write_regions(doc: dict, path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2, sort_keys=True,
                               ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def run_build(raw_pbf: str | Path = DEFAULT_RAW_PBF,
              build_dir: str | Path = DEFAULT_BUILD_DIR,
              osmium_bin: str = "osmium",
              refresh: bool = False) -> dict:
    """CLI entry: resolve regions, write data/build/regions.json."""
    build_dir = Path(build_dir)
    resolved = resolve_regions(raw_pbf, build_dir / "_cache",
                               osmium_bin=osmium_bin, refresh=refresh)
    out = write_regions(to_doc(resolved), build_dir / REGIONS_FILE)
    return {"file": str(out), "regions": list(resolved),
            "wirye_relations": len(resolved["wirye"].relations)}


# Stage 26a US region: Menlo Park around Meta HQ (same box as us-menlo).
US_REGION_SPECS = (
    {"id": "us-menlo", "label": "Menlo Park · East Palo Alto",
     "bbox": (-122.190, 37.450, -122.125, 37.492),
     "country": "US", "currency": "USD"},
)

US_REGION_IDS = tuple(spec["id"] for spec in US_REGION_SPECS)


def _us_region_entry(spec: dict) -> dict:
    """One US region entry: every KR key present so readers don't crash."""
    return {
        "id": spec["id"],
        "label": spec["label"],
        "bbox": list(spec["bbox"]),
        "country": spec["country"],
        "currency": spec["currency"],
        "boundary_names": [],
        "sigungu": [],
        "rtms_districts": [],
        "rtms_files": [],
        "safety": [],
        "relations": [],
    }


def run_us_regions(raw_pbf: str | Path = US_RAW_PBF,
                   build_dir: str | Path = DEFAULT_BUILD_DIR,
                   osmium_bin: str = "osmium",
                   refresh: bool = False) -> dict:
    """CLI entry (``regions --us``): clip US bboxes, merge regions.json."""
    from .extract import clip_bbox, find_osmium

    raw_pbf = Path(raw_pbf)
    build_dir = Path(build_dir)
    if not raw_pbf.exists():
        raise FileNotFoundError(f"US extract not found: {raw_pbf}")
    binary = find_osmium(osmium_bin)
    cache_dir = build_dir / "_cache" / "regions"
    for spec in US_REGION_SPECS:
        out = cache_dir / f"{spec['id']}.osm.pbf"
        if refresh or not out.exists():
            clip_bbox(binary, raw_pbf, tuple(spec["bbox"]), out)
    regions_path = build_dir / REGIONS_FILE
    if regions_path.exists():
        doc = json.loads(regions_path.read_text(encoding="utf-8"))
    else:
        doc = {"regions": [], "places": [dict(p) for p in PLACES],
               "wirye_note": WIRYE_NOTE, "rtms_suffix": RTMS_SUFFIX}
    regions = list(doc.get("regions", []))
    positions = {r["id"]: i for i, r in enumerate(regions)}
    for spec in US_REGION_SPECS:
        entry = _us_region_entry(spec)
        if spec["id"] in positions:
            regions[positions[spec["id"]]] = entry
        else:
            regions.append(entry)
    doc["regions"] = regions
    out = write_regions(doc, regions_path)
    return {"file": str(out),
            "regions": [spec["id"] for spec in US_REGION_SPECS]}
