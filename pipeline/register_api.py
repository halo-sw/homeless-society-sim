"""Fill missing heights from the 건축HUB 건축물대장 표제부 API (stage 2b).

Code only + fixture-tested here: the sandbox has no network, so the real
fetch runs outside it via ``.venv/bin/python -m pipeline register-fill
--area pangyo``. Targets buildings with ``height_source == "inferred"``
that carry a register parcel id (PNU, field A2).

API (국토교통부 건축HUB via data.go.kr; field names CONFIRMED against
the official guide v1.0 and a real 36-item sample response)::

    GET https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo
        ?serviceKey=…&sigunguCd=…&bjdongCd=…&platGbCd=…&bun=…&ji=…
        &numOfRows=100&pageNo=1&_type=json
    GET https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo
        (same params; 총괄표제부: one record per parcel with hhldCnt 세대수
        and mainBldCnt 주건축물수)

PNU (19 chars) = sigunguCd(5) + bjdongCd(5) + land type(1) + bun(4) +
ji(4); land type ``1`` → ``platGbCd=0``, ``2`` → ``platGbCd=1``
(platGbCd 0:대지 1:산 2:블록).

Rules (documented):

* The API key comes from the ``DATA_GO_KR_KEY`` environment variable
  only; it is never printed, logged or written (not even into the
  cache — only raw response bodies are cached).
* One title request per distinct PNU; rate ≤ 5 req/s (0.25 s spacing),
  up to 3 attempts with 1/2/4 s backoff on network or HTTP 5xx/429
  errors — HTTP 503 included (observed once on the real API).
  API-level errors (``resultCode != "00"``) are counted and skipped.
* Raw responses are cached per PNU under ``data/raw/register_api/``
  (``<pnu>.json`` for titles, ``<pnu>.recap.json`` for recaps; public
  register data, caching allowed) and reused on later runs, so the
  fill is resumable. ``--overwrite`` refetches cached PNUs. A cached
  title body may be the ``platGbCd=2`` retry response (see below).
* Per-parcel assignment (``assign_parcel``): (1) ``dongNm`` vs register
  ``A25`` exact matches first (one-to-one); (2) the legacy single-record
  rule (a lone title record applies to every building on the parcel);
  (3) footprint-area match on the leftovers — main buildings only
  (``mainAtchGbCdNm == "주건축물"``, ``grndFlrCnt > 0``, records named
  경비실/주차장/부속 excluded), one-to-one by smallest relative
  ``|area − archArea| / archArea`` within 15 %, deterministic
  tie-break on (relative diff, building id, record key). Anything
  unmatched stays inferred (ambiguous when the parcel has > 1 record).
* New towns addressed by 블록: when ``platGbCd=0`` succeeds with
  0 records, retry once with ``platGbCd=2`` before giving up.
* Recap: one ``getBrRecapTitleInfo`` call per eligible parcel that has
  an apartment building (``recap_pnus`` in the plan); per complex the
  fetched parcel recaps are summed onto the complex as ``households``,
  ``main_bld_cnt``, ``households_source: "register_recap"`` and the
  contributing ``households_pnus`` (partial when a complex spans
  parcels outside the fill — the PNU list says exactly which).
* New height sources: ``api_height`` (``heit``) and ``api_floors``
  (``grndFlrCnt`` × 3.0 m). The matched title is stored verbatim under
  ``register.api`` (incl. per-building ``households`` from title
  ``hhldCnt`` when present); ``register.use`` keeps the shapefile value.
* ``--dry-run`` prints the planned request count without any network.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from shapely.geometry import shape as shapely_shape
from shapely.ops import transform as shp_transform

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BUILD_DIR = REPO_ROOT / "data" / "build"
DEFAULT_CACHE_DIR = REPO_ROOT / "data" / "raw" / "register_api"

API_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"
RECAP_URL = ("https://apis.data.go.kr/1613000/BldRgstHubService/"
             "getBrRecapTitleInfo")
ENV_KEY = "DATA_GO_KR_KEY"
MIN_INTERVAL_S = 0.25  # ≤ 5 req/s
MAX_ATTEMPTS = 3
BACKOFF_S = (1.0, 2.0, 4.0)
RETRYABLE_HTTP = (429, 500, 502, 503, 504)
NUM_ROWS = 100

FLOOR_HEIGHT_M = 3.0
AREA_TOLERANCE = 0.15  # footprint-area match: |area-arch|/arch ≤ 15 %
_EXCLUDED_NAME_PARTS = ("경비실", "주차장", "부속")


class RegisterApiError(RuntimeError):
    """API-level failure (bad key, bad params, resultCode != 00)."""


def split_pnu(pnu: str) -> dict[str, str]:
    """Split a 19-char PNU into data.go.kr title-API query params."""
    if not pnu or len(pnu) != 19 or not pnu.isdigit():
        raise ValueError(f"invalid PNU {pnu!r}: want 19 digits")
    land = pnu[10]
    if land == "1":
        plat = "0"
    elif land == "2":
        plat = "1"
    else:
        raise ValueError(f"invalid PNU {pnu!r}: land type {land!r}")
    return {
        "sigunguCd": pnu[0:5],
        "bjdongCd": pnu[5:10],
        "platGbCd": plat,
        "bun": pnu[11:15],
        "ji": pnu[15:19],
    }


def build_query(params: dict[str, str], api_key: str) -> str:
    """Encode the query string (key first, like the documented example)."""
    query = {"serviceKey": api_key, **params, "numOfRows": str(NUM_ROWS),
             "pageNo": "1", "_type": "json"}
    return urllib.parse.urlencode(query)


def _int(value) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _float(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        num = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return num if num == num else None  # drop NaN


def _text(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _check_header(payload: dict, operation: str) -> dict:
    response = payload.get("response", {})
    header = response.get("header", {})
    if header.get("resultCode") != "00":
        raise RegisterApiError(
            f"{operation}: resultCode={header.get('resultCode')!r} "
            f"resultMsg={header.get('resultMsg')!r}")
    return (response.get("body", {}) or {})


def _raw_items(body: dict) -> list[dict]:
    items = body.get("items", "")
    if not items:
        return []
    raw = items.get("item", []) if isinstance(items, dict) else []
    if isinstance(raw, dict):
        raw = [raw]
    return [r for r in raw if isinstance(r, dict)]


def parse_title_response(body: bytes | str) -> list[dict]:
    """Extract title items from a raw ``getBrTitleInfo`` JSON response.

    Raises :class:`RegisterApiError` when ``resultCode != "00"``.
    Returns [] when the parcel simply has no title records.
    """
    payload = json.loads(body)
    return _raw_items(_check_header(payload, "getBrTitleInfo"))


def parse_recap_response(body: bytes | str) -> dict | None:
    """Extract the recap item (총괄표제부) or None when the parcel has none.

    Raises :class:`RegisterApiError` when ``resultCode != "00"``.
    """
    payload = json.loads(body)
    items = _raw_items(_check_header(payload, "getBrRecapTitleInfo"))
    return items[0] if items else None


def pick_title(items: list[dict], sub_name: str | None) -> dict | None:
    """Pick the title record for one building (None = leave inferred).

    Prefer a ``dongNm`` match against the register ``A25`` dong; else
    accept only a single-record parcel; multi-record parcels without a
    dong match stay inferred (counted as ambiguous by the caller).
    Kept for the dong/single rules; :func:`assign_parcel` adds the
    footprint-area fallback used by the fill.
    """
    if not items:
        return None
    if sub_name:
        want = sub_name.replace(" ", "")
        for item in items:
            dong = _text(item.get("dongNm"))
            if dong and dong.replace(" ", "") == want:
                return item
    if len(items) == 1:
        return items[0]
    return None


def footprint_area_m2(geometry: dict) -> float | None:
    """Footprint area in m² (equirectangular metres around the centroid).

    Returns None for missing/empty/invalid geometry. Same projection as
    :mod:`pipeline.area_build` (:func:`local_xy`).
    """
    if not isinstance(geometry, dict):
        return None
    from .area_build import local_xy

    try:
        geom = shapely_shape(geometry)
    except (ValueError, KeyError, TypeError, AttributeError):
        return None
    if geom.is_empty:
        return None
    centroid = geom.centroid
    metric = shp_transform(
        lambda x, y, z=None: local_xy(x, y, centroid.x, centroid.y), geom)
    area = float(metric.area)
    return area if area > 0 else None


def is_main_building_record(item: dict) -> bool:
    """True for title records eligible for the footprint-area match.

    Main buildings only: ``mainAtchGbCdNm == "주건축물"``,
    ``grndFlrCnt > 0``, a positive ``archArea``, and no 경비실/주차장/부속
    in the building/dong name (gatehouses, car parks, annexes).
    """
    if _text(item.get("mainAtchGbCdNm")) != "주건축물":
        return False
    floors = _int(item.get("grndFlrCnt"))
    if floors is None or floors <= 0:
        return False
    names = f"{_text(item.get('bldNm')) or ''} {_text(item.get('dongNm')) or ''}"
    if any(part in names for part in _EXCLUDED_NAME_PARTS):
        return False
    arch = _float(item.get("archArea"))
    return arch is not None and arch > 0


def _record_key(index: int, item: dict) -> str:
    return (_text(item.get("mgmBldrgstPk")) or _text(item.get("dongNm"))
            or f"#{index}")


def match_by_area(buildings: list[dict], items: list[dict],
                  tolerance: float = AREA_TOLERANCE) -> dict[str, dict]:
    """One-to-one building→record assignment by footprint vs ``archArea``.

    Only :func:`is_main_building_record` records take part. Pairs with
    relative ``|area − archArea| / archArea`` ≤ ``tolerance`` are
    assigned greedily from the smallest diff up; ties break
    deterministically on (diff, building id, record key). Out-of-tolerance
    buildings are absent from the result (stay inferred).
    """
    records = [(i, item) for i, item in enumerate(items)
               if is_main_building_record(item)]
    areas: dict[str, float] = {}
    for building in buildings:
        area = footprint_area_m2(building.get("geometry") or {})
        if area is not None:
            areas[building["id"]] = area
    candidates: list[tuple[float, str, str, dict]] = []
    for b_id, area in areas.items():
        for i, item in records:
            arch = _float(item.get("archArea")) or 0.0
            rel = abs(area - arch) / arch
            if rel <= tolerance:
                candidates.append((rel, b_id, _record_key(i, item), item))
    candidates.sort(key=lambda c: (c[0], c[1], c[2]))
    used_buildings: set[str] = set()
    used_records: set[str] = set()
    assigned: dict[str, dict] = {}
    for _, b_id, key, item in candidates:
        if b_id in used_buildings or key in used_records:
            continue
        used_buildings.add(b_id)
        used_records.add(key)
        assigned[b_id] = item
    return assigned


def assign_parcel(buildings: list[dict], items: list[dict]) -> dict[str, dict]:
    """Assign title records to one parcel's buildings (id → record).

    Pass 1: ``dongNm``↔``A25`` exact matches (one-to-one, buildings in id
    order). Legacy single-record rule: a lone record applies to every
    still-unassigned building. Pass 2: :func:`match_by_area` on the
    leftovers. Unassigned buildings stay inferred.
    """
    ordered = sorted(buildings, key=lambda b: b.get("id", ""))
    assigned: dict[str, dict] = {}
    used: set[int] = set()
    for building in ordered:
        sub = (building.get("register") or {}).get("sub_name")
        if not sub:
            continue
        want = sub.replace(" ", "")
        for i, item in enumerate(items):
            if i in used:
                continue
            dong = _text(item.get("dongNm"))
            if dong and dong.replace(" ", "") == want:
                assigned[building["id"]] = item
                used.add(i)
                break
    if len(items) == 1:
        # Legacy rule (no one-to-one here, matching pick_title): the lone
        # record applies to every building, dong-matched or not.
        for building in ordered:
            if building["id"] not in assigned:
                assigned[building["id"]] = items[0]
        return assigned
    rest_buildings = [b for b in ordered if b["id"] not in assigned]
    rest_items = [item for i, item in enumerate(items) if i not in used]
    assigned.update(match_by_area(rest_buildings, rest_items))
    return assigned


def title_height(item: dict) -> tuple[float, str, int | None] | None:
    """(height_m, source, levels) from a title record, or None."""
    heit = _float(item.get("heit"))
    floors = _int(item.get("grndFlrCnt"))
    if floors is not None and not 0 < floors <= 200:
        floors = None
    if heit is not None and 0.0 < heit <= 1000.0:
        return (round(heit, 2), "api_height", floors)
    if floors is not None:
        return (round(floors * FLOOR_HEIGHT_M, 2), "api_floors", floors)
    return None


def title_summary(item: dict) -> dict:
    """Verbatim-ish API snapshot stored under ``register.api``."""
    out = {
        "bldNm": _text(item.get("bldNm")),
        "dongNm": _text(item.get("dongNm")),
        "use": _text(item.get("mainPurpsCdNm")),
        "approval_date": _text(item.get("useAprDay")),
        "floors_below": _int(item.get("ugrndFlrCnt")),
        "mgm_key": _text(item.get("mgmBldrgstPk")),
        "households": _int(item.get("hhldCnt")),
    }
    return {k: v for k, v in out.items() if v is not None}


def recap_summary(item: dict) -> dict:
    """Household signal from a recap record ({} when it carries none)."""
    out = {
        "households": _int(item.get("hhldCnt")),
        "main_bld_cnt": _int(item.get("mainBldCnt")),
    }
    return {k: v for k, v in out.items() if v is not None}


class RateLimiter:
    """Minimum spacing between request starts (≤ 5 req/s)."""

    def __init__(self, min_interval: float = MIN_INTERVAL_S,
                 clock=time.monotonic, sleeper=time.sleep):
        self.min_interval = min_interval
        self._clock = clock
        self._sleep = sleeper
        self._last: float | None = None

    def wait(self) -> None:
        now = self._clock()
        if self._last is not None:
            gap = now - self._last
            if gap < self.min_interval:
                self._sleep(self.min_interval - gap)
        self._last = self._clock()


def _default_opener(url: str) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": "housing-sim-register-fill/2"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def _http_get(url: str, limiter: RateLimiter | None,
              opener, sleeper) -> bytes:
    """GET with backoff on network errors and HTTP 5xx/429 (503 incl.).

    The key is only ever inside the request URL, never in any message
    raised here.
    """
    last: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        if limiter is not None:
            limiter.wait()
        try:
            return opener(url)
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in RETRYABLE_HTTP:
                raise RegisterApiError(f"HTTP {exc.code} for parcel") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
        if attempt + 1 < MAX_ATTEMPTS:
            sleeper(BACKOFF_S[attempt])
    raise RegisterApiError(
        f"parcel fetch failed after {MAX_ATTEMPTS} attempts: {last}") from last


def fetch_title(pnu: str, api_key: str,
                limiter: RateLimiter | None = None,
                opener=None, sleeper=time.sleep,
                plat_gb: str | None = None) -> bytes:
    """GET one parcel's title records (raw body); retried with backoff.

    ``opener`` is injectable for tests (default: urllib GET with a
    30 s timeout). ``plat_gb`` overrides the PNU-derived platGbCd (the
    블록 retry uses ``"2"``).
    """
    params = split_pnu(pnu)
    if plat_gb is not None:
        params["platGbCd"] = plat_gb
    url = f"{API_URL}?{build_query(params, api_key)}"
    return _http_get(url, limiter, opener or _default_opener, sleeper)


def fetch_parcel(pnu: str, api_key: str,
                 limiter: RateLimiter | None = None,
                 opener=None, sleeper=time.sleep) -> tuple[bytes, str]:
    """Fetch one parcel's titles with the 블록 fallback: (body, plat_used).

    When ``platGbCd=0`` succeeds with 0 records, retry once with
    ``platGbCd=2`` and return that body (even when it is empty too).
    API-level errors propagate without a retry.
    """
    first = fetch_title(pnu, api_key, limiter=limiter, opener=opener,
                        sleeper=sleeper)
    if split_pnu(pnu)["platGbCd"] != "0":
        return first, split_pnu(pnu)["platGbCd"]
    try:
        items = parse_title_response(first)
    except ValueError as exc:
        raise RegisterApiError(f"parcel title body is not JSON: {exc}") from exc
    if items:
        return first, "0"
    second = fetch_title(pnu, api_key, limiter=limiter, opener=opener,
                         sleeper=sleeper, plat_gb="2")
    return second, "2"


def fetch_recap(pnu: str, api_key: str,
                limiter: RateLimiter | None = None,
                opener=None, sleeper=time.sleep) -> bytes:
    """GET one parcel's recap record (총괄표제부, raw body)."""
    url = f"{RECAP_URL}?{build_query(split_pnu(pnu), api_key)}"
    return _http_get(url, limiter, opener or _default_opener, sleeper)


def cache_path(cache_dir: Path, pnu: str) -> Path:
    return Path(cache_dir) / f"{pnu}.json"


def recap_cache_path(cache_dir: Path, pnu: str) -> Path:
    return Path(cache_dir) / f"{pnu}.recap.json"


def load_cached(cache_dir: Path, pnu: str) -> bytes | None:
    path = cache_path(cache_dir, pnu)
    if path.exists():
        return path.read_bytes()
    return None


def store_cached(cache_dir: Path, pnu: str, body: bytes) -> Path:
    path = cache_path(cache_dir, pnu)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return path


def load_cached_recap(cache_dir: Path, pnu: str) -> bytes | None:
    path = recap_cache_path(cache_dir, pnu)
    if path.exists():
        return path.read_bytes()
    return None


def store_cached_recap(cache_dir: Path, pnu: str, body: bytes) -> Path:
    path = recap_cache_path(cache_dir, pnu)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return path


def eligible_buildings(buildings: list[dict]) -> dict[str, list[dict]]:
    """Inferred-height buildings with a PNU, grouped by PNU (sorted)."""
    groups: dict[str, list[dict]] = {}
    for b in buildings:
        if b.get("height_source") != "inferred":
            continue
        pnu = (b.get("register") or {}).get("pnu")
        if not pnu:
            continue
        groups.setdefault(pnu, []).append(b)
    for pnu in groups:
        groups[pnu].sort(key=lambda b: b["id"])
    return dict(sorted(groups.items()))


def recap_parcels(groups: dict[str, list[dict]]) -> list[str]:
    """Eligible parcels (sorted) with ≥ 1 apartment building on them."""
    return sorted(pnu for pnu, members in groups.items()
                  if any(b.get("residential") == "apartment"
                         for b in members))


def apply_item(building: dict, item: dict) -> bool:
    """Apply a picked title record; True when the height was filled."""
    filled = title_height(item)
    if filled is None:
        return False
    height, source, levels = filled
    building["height_m"] = height
    building["height_source"] = source
    building["levels"] = levels
    register = building.setdefault("register", {})
    register["api"] = title_summary(item)
    return True


def attach_complex_recaps(area_dir: str | Path,
                          updates: dict[str, dict]) -> int:
    """Write per-complex recap households into area.json (or its part file).

    ``updates`` maps complex id → ``{households?, main_bld_cnt?,
    households_source, households_pnus}``. Returns the number of
    complexes patched.
    """
    if not updates:
        return 0
    area_dir = Path(area_dir)
    area_path = area_dir / "area.json"
    area = json.loads(area_path.read_text(encoding="utf-8"))
    section = area.get("complexes")
    if isinstance(section, dict) and set(section) == {"$ref"}:
        part_path = area_dir / section["$ref"]
        complexes = json.loads(part_path.read_text(encoding="utf-8"))
        target: Path | None = part_path
    else:
        complexes = section or []
        target = None
    patched = 0
    for comp in complexes:
        update = updates.get(comp.get("id", ""))
        if update is None:
            continue
        comp.update(update)
        patched += 1
    if target is not None:
        blob = (json.dumps(complexes, indent=2, sort_keys=True,
                           ensure_ascii=False) + "\n")
        target.write_text(blob, encoding="utf-8")
    else:
        area["complexes"] = complexes
        blob = (json.dumps(area, indent=2, sort_keys=True,
                           ensure_ascii=False) + "\n")
        area_path.write_text(blob, encoding="utf-8")
    return patched


def fill_area(area_dir: str | Path, cache_dir: str | Path | None = None,
              api_key: str | None = None, overwrite: bool = False,
              limit: int | None = None, dry_run: bool = False,
              fetcher=None, recap_fetcher=None,
              sleeper=time.sleep) -> dict:
    """Run the register-API fill over one built area (no CLI needed).

    Returns a summary dict with per-outcome counts. ``fetcher`` injects
    ``(pnu) -> bytes`` for titles and ``recap_fetcher`` for recaps in
    tests; otherwise the real API is used with the key from
    ``DATA_GO_KR_KEY``. Recap is skipped when a title ``fetcher`` is
    injected without a ``recap_fetcher`` (unit-test mode).
    """
    area_dir = Path(area_dir)
    cache_dir = Path(cache_dir) if cache_dir else DEFAULT_CACHE_DIR
    buildings_path = area_dir / "buildings.json"
    payload = json.loads(buildings_path.read_text(encoding="utf-8"))
    buildings = payload.get("buildings", [])
    groups = eligible_buildings(buildings)
    pnus = list(groups)
    if limit is not None:
        pnus = pnus[:limit]
    plan = {"area": area_dir.name, "pnus": len(pnus),
            "buildings": sum(len(groups[p]) for p in pnus),
            "recap_pnus": len(recap_parcels({p: groups[p] for p in pnus}))}
    if dry_run:
        return {**plan, "dry_run": True}

    real_mode = fetcher is None
    if fetcher is None:
        key = api_key or os.environ.get(ENV_KEY)
        if not key:
            raise RegisterApiError(
                f"{ENV_KEY} is not set (pass it in the environment only)")
        limiter = RateLimiter(sleeper=sleeper)
        plats: list[str] = []

        def fetcher(pnu: str, _key: str = key,
                    _lim: RateLimiter = limiter) -> bytes:
            body, plat = fetch_parcel(pnu, _key, limiter=_lim,
                                      sleeper=sleeper)
            plats.append(plat)
            return body

    counts = {"fetched": 0, "cache_hits": 0, "filled": 0,
              "ambiguous": 0, "no_data": 0, "failed": 0,
              "block_retries": 0,
              "recap_fetched": 0, "recap_hits": 0, "recap_failed": 0,
              "recap_complexes": 0}
    for pnu in pnus:
        body = None if overwrite else load_cached(cache_dir, pnu)
        if body is None:
            try:
                body = fetcher(pnu)
            except RegisterApiError:
                counts["failed"] += 1
                continue
            store_cached(cache_dir, pnu, body)
            counts["fetched"] += 1
        else:
            counts["cache_hits"] += 1
        try:
            items = parse_title_response(body)
        except (RegisterApiError, ValueError):
            counts["failed"] += 1
            continue
        assigned = assign_parcel(groups[pnu], items)
        for building in groups[pnu]:
            picked = assigned.get(building["id"])
            if picked is None:
                if len(items) > 1:
                    counts["ambiguous"] += 1
                else:
                    counts["no_data"] += 1
                continue
            if apply_item(building, picked):
                counts["filled"] += 1
            else:
                counts["no_data"] += 1
    if real_mode:
        counts["block_retries"] = sum(1 for p in plats if p == "2")

    buildings_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8")
    # Refresh area.json + report.json from the updated buildings.
    from .area_build import run_build as area_run_build

    area_run_build(area_dir)

    # Recap phase: household signal per complex (skipped in unit-test
    # mode unless recap_fetcher is injected).
    recap_get = None
    if recap_fetcher is not None:
        recap_get = recap_fetcher
    elif real_mode:
        def recap_get(pnu: str, _key: str = key,
                      _lim: RateLimiter = limiter) -> bytes:  # noqa: F811
            return fetch_recap(pnu, _key, limiter=_lim, sleeper=sleeper)
    if recap_get is not None:
        recaps: dict[str, dict] = {}
        for pnu in recap_parcels({p: groups[p] for p in pnus}):
            body = None if overwrite else load_cached_recap(cache_dir, pnu)
            if body is None:
                try:
                    body = recap_get(pnu)
                except RegisterApiError:
                    counts["recap_failed"] += 1
                    continue
                store_cached_recap(cache_dir, pnu, body)
                counts["recap_fetched"] += 1
            else:
                counts["recap_hits"] += 1
            try:
                item = parse_recap_response(body)
            except (RegisterApiError, ValueError):
                counts["recap_failed"] += 1
                continue
            if item is None:
                continue
            summary = recap_summary(item)
            if summary:
                recaps[pnu] = summary
        if recaps:
            counts["recap_complexes"] = _attach_recaps(
                area_dir, buildings, recaps)
    return {**plan, "dry_run": False, **counts}


def _attach_recaps(area_dir: Path, buildings: list[dict],
                   recaps: dict[str, dict]) -> int:
    """Sum fetched parcel recaps onto their complexes; return patched count."""
    area = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    section = area.get("complexes")
    if isinstance(section, dict) and set(section) == {"$ref"}:
        complexes = json.loads(
            (area_dir / section["$ref"]).read_text(encoding="utf-8"))
    else:
        complexes = section or []
    building_complex: dict[str, str] = {}
    for comp in complexes:
        for bid in comp.get("building_ids", []):
            building_complex[bid] = comp["id"]
    parcel_complexes: dict[str, set[str]] = {}
    for building in buildings:
        pnu = (building.get("register") or {}).get("pnu")
        cid = building_complex.get(building.get("id", ""))
        if pnu and cid:
            parcel_complexes.setdefault(pnu, set()).add(cid)
    agg: dict[str, dict] = {}
    for pnu, summary in sorted(recaps.items()):
        for cid in sorted(parcel_complexes.get(pnu, ())):
            slot = agg.setdefault(cid, {"households": 0, "main_bld_cnt": 0,
                                        "pnus": []})
            if "households" in summary:
                slot["households"] += summary["households"]
            if "main_bld_cnt" in summary:
                slot["main_bld_cnt"] += summary["main_bld_cnt"]
            slot["pnus"].append(pnu)
    updates = {}
    for cid, slot in agg.items():
        update: dict = {"households_source": "register_recap",
                        "households_pnus": sorted(slot["pnus"])}
        if any("households" in recaps[p] for p in slot["pnus"]):
            update["households"] = slot["households"]
        if any("main_bld_cnt" in recaps[p] for p in slot["pnus"]):
            update["main_bld_cnt"] = slot["main_bld_cnt"]
        updates[cid] = update
    return attach_complex_recaps(area_dir, updates)
