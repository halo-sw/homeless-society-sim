"""Area definitions resolved from OSM at build time.

Validation areas (briefs/01-data-pipeline.md):
  pangyo / seongsu / songpa-jamsil -- 1.2 km boxes centred on the matching
      subway station, whose coordinates are looked up in OSM during the build.
  songpa -- the whole Songpa-gu administrative boundary from OSM.

Nothing is hardcoded except the names to look up; the coordinates and the
boundary relation id used are recorded in ``area_def.json`` for each build.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path

import osmium

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RAW_PBF = REPO_ROOT / "data" / "raw" / "south-korea-latest.osm.pbf"
DEFAULT_BUILD_DIR = REPO_ROOT / "data" / "build"

AREA_IDS = ("pangyo", "seongsu", "songpa", "songpa-jamsil")

# Stage 12a station scene boxes: ids are "st-<station>" (e.g. "st-판교").
# They are dynamic (see pipeline.boxes station-boxes.json), so they are
# validated by prefix, not by membership in AREA_IDS.
STATION_BOX_PREFIX = "st-"

# Station name lookups for the 1.2 km scene boxes. Korean subway stations in
# OSM are usually named without the 역 suffix (판교, 성수, 잠실); related bus
# stops and stop areas carry the full ...역 name, so both are matched and the
# railway station is picked by tag rank (see _pick_station).
STATION_NAMES = {
    "pangyo": ("판교역", "판교"),
    "seongsu": ("성수역", "성수"),
    "songpa-jamsil": ("잠실역", "잠실"),
}

SONGPA_NAMES = ("송파구", "Songpa-gu")

BOX_HALF_M = 600.0  # 1.2 km box => 600 m half side
METERS_PER_DEG_LAT = 111_320.0


@dataclass
class AreaDef:
    """Resolved definition of one build area."""

    id: str
    label: str
    kind: str  # "bbox" or "boundary"
    bbox: tuple[float, float, float, float] | None  # minlon, minlat, maxlon, maxlat
    center: tuple[float, float] | None  # lon, lat (station)
    station: dict | None  # {name, lon, lat, osm_kind, osm_id}
    boundary: dict | None  # {name, relation_id, admin_level}

    def to_dict(self) -> dict:
        d = asdict(self)
        if self.bbox is not None:
            d["bbox"] = list(self.bbox)
        if self.center is not None:
            d["center"] = list(self.center)
        return d


LABELS = {
    "pangyo": "판교역 인근",
    "seongsu": "성수동",
    "songpa": "송파구",
    "songpa-jamsil": "송파구 잠실역 인근",
}


def bbox_from_center(lon: float, lat: float, half_m: float = BOX_HALF_M):
    """1.2 km box around (lon, lat) using a local equirectangular approx."""
    import math

    dlat = half_m / METERS_PER_DEG_LAT
    dlon = half_m / (METERS_PER_DEG_LAT * math.cos(math.radians(lat)))
    return (lon - dlon, lat - dlat, lon + dlon, lat + dlat)


class _CandidateScan(osmium.SimpleHandler):
    """Collect nodes/ways/relations whose ``name`` is one of the targets."""

    def __init__(self, names: set[str]):
        super().__init__()
        self.names = names
        self.hits: list[dict] = []

    def _record(self, kind: str, obj, lon=None, lat=None, coords=None):
        tags = dict(obj.tags)
        if tags.get("name") not in self.names:
            return
        self.hits.append(
            {"kind": kind, "id": obj.id, "tags": tags,
             "lon": lon, "lat": lat, "coords": coords}
        )

    def node(self, n):
        if n.location.valid():
            self._record("node", n, n.location.lon, n.location.lat)

    def way(self, w):
        coords = [(nd.lon, nd.lat) for nd in w.nodes if nd.location.valid()]
        if coords:
            self._record("way", w, coords=coords)

    def relation(self, r):
        self._record("relation", r)


def _is_metro_station(tags: dict) -> bool:
    """True for Seoul metro (수도권 전철) / subway stations."""
    return (
        tags.get("network") == "수도권 전철"
        or tags.get("network:en") == "Seoul Metropolitan Subway"
        or tags.get("station") == "subway"
        or tags.get("subway") == "yes"
    )


def _pick_station(hits: list[dict], names: tuple[str, ...]) -> dict:
    cands = [h for h in hits if h["tags"].get("name") in names]
    if not cands:
        raise LookupError(f"station {names[0]!r} not found in OSM data")
    # Railway stations only: this excludes bus stops, stop positions,
    # entrances and station buildings that merely share the name. Same-named
    # mainline stations elsewhere in the country lose to metro ones.
    railway = [h for h in cands
               if h["tags"].get("railway") in ("station", "subway_station",
                                               "halt")]
    pool = railway or [h for h in cands
                       if h["tags"].get("public_transport") == "station"
                       and not h["tags"].get("highway")]
    if not pool:
        raise LookupError(f"station {names[0]!r}: no railway station match")

    def rank(h):
        tags = h["tags"]
        metro_rank = 0 if _is_metro_station(tags) else 1
        kind_rank = {"node": 0, "way": 1, "relation": 2}[h["kind"]]
        rw_rank = {"subway_station": 0, "station": 1, "halt": 2}.get(
            tags.get("railway", ""), 3)
        return (metro_rank, kind_rank, rw_rank, h["id"])

    best = sorted(pool, key=rank)[0]
    if best["kind"] == "node":
        lon, lat = best["lon"], best["lat"]
    elif best["kind"] == "way":
        xs = [c[0] for c in best["coords"]]
        ys = [c[1] for c in best["coords"]]
        lon, lat = sum(xs) / len(xs), sum(ys) / len(ys)
    else:
        raise LookupError(f"station {names[0]!r} only found as relation")
    return {"name": best["tags"]["name"], "lon": lon, "lat": lat,
            "osm_kind": best["kind"], "osm_id": best["id"]}


def _pick_boundary(hits: list[dict]) -> dict:
    cands = [
        h for h in hits
        if h["kind"] == "relation"
        and h["tags"].get("name") in SONGPA_NAMES
        and h["tags"].get("type") == "boundary"
        and h["tags"].get("boundary") == "administrative"
    ]
    if not cands:
        raise LookupError("Songpa-gu administrative boundary not found in OSM data")

    def rank(h):
        lvl = h["tags"].get("admin_level", "")
        lvl_rank = {"6": 0, "7": 1, "8": 2}.get(lvl, 3)
        return (lvl_rank, h["id"])

    best = sorted(cands, key=rank)[0]
    return {"name": best["tags"]["name"], "relation_id": best["id"],
            "admin_level": best["tags"].get("admin_level")}


def build_candidate_extract(src_pbf: str | Path, dst_pbf: str | Path,
                            osmium_bin: str = "osmium",
                            refresh: bool = False) -> Path:
    """Prefilter the national PBF to name matches (fast; still OSM looked up).

    Reuses a cached prefilter newer than the source unless refresh=True.
    """
    src = Path(src_pbf)
    dst = Path(dst_pbf)
    if (not refresh and dst.exists()
            and dst.stat().st_mtime >= src.stat().st_mtime):
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    names = sorted({n for pair in STATION_NAMES.values() for n in pair}
                     | set(SONGPA_NAMES))
    expr = "nwr/name=" + ",".join(names)
    cmd = [osmium_bin, "tags-filter", str(src_pbf), expr,
           "-o", str(dst), "-O", "--no-progress"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"osmium tags-filter failed: {proc.stderr.strip()}")
    return dst


def scan_candidates(candidates_pbf: str | Path) -> list[dict]:
    """Single pyosmium pass over the small candidate extract."""
    handler = _CandidateScan({n for pair in STATION_NAMES.values()
                                for n in pair} | set(SONGPA_NAMES))
    handler.apply_file(str(candidates_pbf), locations=True)
    return handler.hits


def resolve_all(raw_pbf: str | Path = DEFAULT_RAW_PBF,
                cache_dir: str | Path | None = None,
                osmium_bin: str = "osmium",
                refresh: bool = False) -> dict[str, AreaDef]:
    """Resolve every area id in one national prefilter + one scan."""
    raw_pbf = Path(raw_pbf)
    if not raw_pbf.exists():
        raise FileNotFoundError(f"national extract not found: {raw_pbf}")
    cache_dir = Path(cache_dir) if cache_dir else DEFAULT_BUILD_DIR / "_cache"
    cand = build_candidate_extract(raw_pbf, cache_dir / "candidates.osm.pbf",
                                   osmium_bin=osmium_bin, refresh=refresh)
    hits = scan_candidates(cand)

    out: dict[str, AreaDef] = {}
    for area_id in AREA_IDS:
        out[area_id] = resolve_area(area_id, raw_pbf, hits=hits)
    return out


def resolve_area(area_id: str, raw_pbf: str | Path = DEFAULT_RAW_PBF,
                 hits: list[dict] | None = None,
                 osmium_bin: str = "osmium") -> AreaDef:
    """Resolve one area id, scanning the national PBF if hits not given."""
    if area_id not in AREA_IDS:
        raise KeyError(f"unknown area {area_id!r}; expected one of {list(AREA_IDS)}")
    if hits is None:
        import tempfile

        with tempfile.TemporaryDirectory(prefix="area-candidates-") as tmp:
            cand = build_candidate_extract(
                raw_pbf, Path(tmp) / "candidates.osm.pbf", osmium_bin=osmium_bin)
            hits = scan_candidates(cand)

    label = LABELS[area_id]
    if area_id == "songpa":
        boundary = _pick_boundary(hits)
        return AreaDef(id=area_id, label=label, kind="boundary", bbox=None,
                       center=None, station=None, boundary=boundary)
    station = _pick_station(hits, STATION_NAMES[area_id])
    lon, lat = station["lon"], station["lat"]
    bbox = bbox_from_center(lon, lat)
    return AreaDef(id=area_id, label=label, kind="bbox", bbox=bbox,
                   center=(lon, lat), station=station, boundary=None)


def is_station_box(area_id: str) -> bool:
    return area_id.startswith(STATION_BOX_PREFIX)


def resolve_station_box(area_id: str,
                        build_dir: str | Path = DEFAULT_BUILD_DIR,
                        raw_pbf: str | Path = DEFAULT_RAW_PBF,
                        osmium_bin: str = "osmium") -> AreaDef:
    """Resolve a stage-12a ``st-<station>`` scene box.

    Coordinates come from ``station-boxes.json`` (the discovery run);
    when the station is absent there, fall back to an OSM name lookup
    of ``<station>역`` / ``<station>``. Either way the box is the same
    1.2 km ``bbox`` kind as the legacy station areas.
    """
    from .boxes import box_coords, load_boxes

    if not is_station_box(area_id):
        raise KeyError(f"not a station box {area_id!r}")
    station = area_id[len(STATION_BOX_PREFIX):]
    boxes = load_boxes(build_dir)
    hit = None
    if boxes:
        hit = next((b for b in boxes.get("boxes", [])
                    if b.get("station") == station), None)
    if hit is not None:
        lon, lat = box_coords(hit)
        info = {"name": station, "lon": lon, "lat": lat,
                "osm_kind": hit.get("osm_kind"), "osm_id": hit.get("osm_id")}
    else:
        info = _lookup_station_by_name(station, raw_pbf,
                                       osmium_bin=osmium_bin)
        lon, lat = info["lon"], info["lat"]
    bbox = bbox_from_center(lon, lat)
    return AreaDef(id=area_id, label=f"{station}역 인근", kind="bbox",
                   bbox=bbox, center=(lon, lat), station=info,
                   boundary=None)


def _lookup_station_by_name(station: str, raw_pbf: str | Path,
                            osmium_bin: str = "osmium") -> dict:
    """OSM lookup of one station name (fallback when discovery is stale)."""
    import tempfile

    names = (f"{station}역", station)
    handler = _CandidateScan(set(names))
    with tempfile.TemporaryDirectory(prefix="station-box-") as tmp:
        dst = Path(tmp) / "candidates.osm.pbf"
        expr = "nwr/name=" + ",".join(names)
        import subprocess

        proc = subprocess.run(
            [osmium_bin, "tags-filter", str(raw_pbf), expr,
             "-o", str(dst), "-O", "--no-progress"],
            capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(
                f"osmium tags-filter failed: {proc.stderr.strip()}")
        handler.apply_file(str(dst), locations=True)
    return _pick_station(handler.hits, names)


def write_area_def(area: AreaDef, path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(area.to_dict(), indent=2, sort_keys=True,
                               ensure_ascii=False) + "\n", encoding="utf-8")
    return path
