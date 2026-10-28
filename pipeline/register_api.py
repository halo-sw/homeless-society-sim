"""Fill missing heights from the 건축HUB 건축물대장 표제부 API (stage 2).

Code only + fixture-tested here: the sandbox has no network, so the real
fetch runs outside it via ``.venv/bin/python -m pipeline register-fill
--area pangyo``. Targets buildings with ``height_source == "inferred"``
that carry a register parcel id (PNU, field A2).

API (국토교통부 건축HUB via data.go.kr; item field names below are
UNCONFIRMED until the first real response is inspected)::

    GET https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo
        ?serviceKey=…&sigunguCd=…&bjdongCd=…&platGbCd=…&bun=…&ji=…
        &numOfRows=100&pageNo=1&_type=json

PNU (19 chars) = sigunguCd(5) + bjdongCd(5) + land type(1) + bun(4) +
ji(4); land type ``1`` → ``platGbCd=0``, ``2`` → ``platGbCd=1``
(confirmed by the guide: platGbCd 0:대지 1:산 2:블록).

Item fields, CONFIRMED against the official guide (건축HUB 건축물대장
OpenAPI 활용가이드 v1.0, 2024-10) and a real 36-item sample response
(``data/raw/register_api_samples/getBrTitleInfo_4113511000105530000.json``,
백현동 553): ``grndFlrCnt`` (지상층수), ``ugrndFlrCnt`` (지하층수),
``heit`` (높이, m), ``mainPurpsCdNm`` (주용도코드명), ``bldNm``,
``dongNm`` (동명칭), ``useAprDay`` (사용승인일), ``mgmBldrgstPk``
(management PK, numeric in JSON), plus ``hhldCnt`` (세대수 — the real
household signal, stored as ``register.api.households`` for stage 3).

Rules (documented):

* The API key comes from the ``DATA_GO_KR_KEY`` environment variable
  only; it is never printed, logged or written (not even into the
  cache — only raw response bodies are cached).
* One request per distinct PNU; rate ≤ 5 req/s (0.25 s spacing), up to
  3 attempts with 1/2/4 s backoff on network or HTTP 5xx/429 errors.
  API-level errors (``resultCode != "00"``) are counted and skipped.
* Raw responses are cached per PNU under ``data/raw/register_api/``
  (public register data; caching allowed) and reused on later runs, so
  the fill is resumable. ``--overwrite`` refetches cached PNUs.
* Parcel with several title records: pick by ``dongNm`` vs register
  ``A25`` when possible, else assign only when the parcel has exactly
  one title record; otherwise the building stays inferred and is
  counted as ambiguous.
* New height sources: ``api_height`` (``heit``) and ``api_floors``
  (``grndFlrCnt`` × 3.0 m). The matched title is stored verbatim under
  ``register.api``; ``register.use`` keeps the shapefile value.
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

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BUILD_DIR = REPO_ROOT / "data" / "build"
DEFAULT_CACHE_DIR = REPO_ROOT / "data" / "raw" / "register_api"

API_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"
ENV_KEY = "DATA_GO_KR_KEY"
MIN_INTERVAL_S = 0.25  # ≤ 5 req/s
MAX_ATTEMPTS = 3
BACKOFF_S = (1.0, 2.0, 4.0)
NUM_ROWS = 100

FLOOR_HEIGHT_M = 3.0


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


def parse_title_response(body: bytes | str) -> list[dict]:
    """Extract title items from a raw ``getBrTitleInfo`` JSON response.

    Raises :class:`RegisterApiError` when ``resultCode != "00"``.
    Returns [] when the parcel simply has no title records.
    """
    payload = json.loads(body)
    response = payload.get("response", {})
    header = response.get("header", {})
    if header.get("resultCode") != "00":
        raise RegisterApiError(
            f"resultCode={header.get('resultCode')!r} "
            f"resultMsg={header.get('resultMsg')!r}")
    items = (response.get("body", {}) or {}).get("items", "")
    if not items:
        return []
    raw = items.get("item", []) if isinstance(items, dict) else []
    if isinstance(raw, dict):
        raw = [raw]
    return [r for r in raw if isinstance(r, dict)]


def pick_title(items: list[dict], sub_name: str | None) -> dict | None:
    """Pick the title record for one building (None = leave inferred).

    Prefer a ``dongNm`` match against the register ``A25`` dong; else
    accept only a single-record parcel; multi-record parcels without a
    dong match stay inferred (counted as ambiguous by the caller).
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


def fetch_title(pnu: str, api_key: str,
                limiter: RateLimiter | None = None,
                opener=None, sleeper=time.sleep) -> bytes:
    """GET one parcel's title records (raw body); retried with backoff.

    ``opener`` is injectable for tests (default: urllib GET with a
    30 s timeout). The key is only ever inside the request URL, never
    in any message raised here.
    """
    params = split_pnu(pnu)
    url = f"{API_URL}?{build_query(params, api_key)}"
    if opener is None:
        def opener(url: str) -> bytes:
            req = urllib.request.Request(url, headers={
                "User-Agent": "housing-sim-register-fill/2"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
    last: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        if limiter is not None:
            limiter.wait()
        try:
            return opener(url)
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (429, 500, 502, 503, 504):
                raise RegisterApiError(f"HTTP {exc.code} for parcel") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
        if attempt + 1 < MAX_ATTEMPTS:
            sleeper(BACKOFF_S[attempt])
    raise RegisterApiError(
        f"parcel fetch failed after {MAX_ATTEMPTS} attempts: {last}") from last


def cache_path(cache_dir: Path, pnu: str) -> Path:
    return Path(cache_dir) / f"{pnu}.json"


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


def fill_area(area_dir: str | Path, cache_dir: str | Path | None = None,
              api_key: str | None = None, overwrite: bool = False,
              limit: int | None = None, dry_run: bool = False,
              fetcher=None, sleeper=time.sleep) -> dict:
    """Run the register-API fill over one built area (no CLI needed).

    Returns a summary dict with per-outcome counts. ``fetcher`` injects
    ``(pnu) -> bytes`` for tests; otherwise :func:`fetch_title` is used
    with the key from ``DATA_GO_KR_KEY``.
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
            "buildings": sum(len(groups[p]) for p in pnus)}
    if dry_run:
        return {**plan, "dry_run": True}

    if fetcher is None:
        key = api_key or os.environ.get(ENV_KEY)
        if not key:
            raise RegisterApiError(
                f"{ENV_KEY} is not set (pass it in the environment only)")
        limiter = RateLimiter(sleeper=sleeper)

        def fetcher(pnu: str, _key: str = key,
                    _lim: RateLimiter = limiter) -> bytes:
            return fetch_title(pnu, _key, limiter=_lim, sleeper=sleeper)

    counts = {"fetched": 0, "cache_hits": 0, "filled": 0,
              "ambiguous": 0, "no_data": 0, "failed": 0}
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
        for building in groups[pnu]:
            sub = (building.get("register") or {}).get("sub_name")
            picked = pick_title(items, sub)
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

    buildings_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8")
    # Refresh area.json + report.json from the updated buildings.
    from .area_build import run_build as area_run_build

    area_run_build(area_dir)
    return {**plan, "dry_run": False, **counts}
