"""Second home join: OSM residential polygons by complex name (12a2, Part 3).

The building register lacks new complexes (헬리오시티, 위례 아파트…),
so RTMS rows the register cannot match get a second chance: an OSM
building or landuse polygon tagged as residential
(``building=apartments`` / ``landuse=residential`` with a ``name``)
whose name matches the row's 단지명 after normalisation, inside the
row's region, and — when OSM carries it — in the same 법정동
(``addr:subdistrict``). Location = polygon centroid.

Matching rules (all must hold):

* name: normalised 단지명 equals the normalised OSM name (exact wins),
  else exactly one distinct normalised OSM name contains it or is
  contained in it. Normalisation drops parentheticals, whitespace,
  punctuation and the 아파트/APT/단지 suffixes ("헬리오시티" ⊂
  "송파 헬리오시티"). Edge-aligned containment (one side is a prefix
  or suffix of the other) needs the shorter side ≥ 4 chars;
  non-aligned (middle) containment needs ≥ 7 ("신동아파밀리에" ⊂
  "강남…1단지" passes, "논현오피스텔" in the middle of "리체힐신논현…"
  does not). Exact needs ≥ 2.
* identity: OSM names carrying no complex identity never match —
  bare building numbers ("101", "503동", "가동") and bare generic
  types ("오피스텔", "관리사무소"…).
* place: polygons sharing one normalised name must cluster within
  1.5 km (a complex and its buildings); the same name in far-apart
  places ("현대아파트" in ten dongs) is ambiguous, never a guess.
* region: the polygon centroid falls inside the row's region union —
  never a name alone across regions (extracts are bbox clips and
  overlap: the suji file holds 수원 polygons, the songpa file 수정구
  ones).
* dong: when the OSM polygon has ``addr:subdistrict`` and the row has a
  법정동, they must agree (both are 법정동 in practice: 장지동, 창곡동…).

Ambiguity (two distinct complex names containing the 단지명, e.g.
"위례자이" ⊂ "위례자이 더 시티") resolves to the exact match when one
exists, else to no match — never a guess.
"""

from __future__ import annotations

import re
from pathlib import Path

import osmium
from shapely import wkb as shapely_wkb

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REGION_EXTRACTS = REPO_ROOT / "data" / "build" / "_cache" / "regions"

EXACT_MIN_LEN = 2
CONTAIN_MIN_LEN = 4
MIDDLE_MIN_LEN = 7
SAME_NAME_SPAN_KM = 1.5

# OSM names with no complex identity (bare numbers, dong letters,
# bare generic types): never match, even exactly.
_NUMBER_NAME_RE = re.compile(r"^(\d+[동호층]?|[a-z가-힣]동)$")
GENERIC_NAMES = frozenset({
    "오피스텔", "오피스", "빌라", "빌딩", "상가", "주택",
    "주상복합", "관리사무소",
})


def _has_identity(norm: str) -> bool:
    return (len(norm) >= EXACT_MIN_LEN
            and not _NUMBER_NAME_RE.match(norm)
            and norm not in GENERIC_NAMES)

_SUFFIX_RE = re.compile(r"(아파트|단지|APT|apt)$")
_PAREN_RE = re.compile(r"\([^()]*\)")
_KEEP_RE = re.compile(r"[가-힣a-z0-9]")


def normalize_complex(name: str | None) -> str:
    """Complex-name key: no parentheticals/spaces/punctuation/suffixes."""
    s = _PAREN_RE.sub("", str(name or ""))
    s = s.lower().replace("·", "")
    kept = "".join(ch for ch in s if _KEEP_RE.match(ch))
    prev = None
    while prev != kept:
        prev = kept
        kept = _SUFFIX_RE.sub("", kept)
    return kept


def normalize_dong(dong: str | None) -> str:
    return "".join(str(dong or "").split())


def row_dong(sigungu: str | None) -> str | None:
    """법정동 from an RTMS 시군구 ("… 수정구 창곡동" → "창곡동")."""
    toks = str(sigungu or "").split()
    if not toks:
        return None
    return normalize_dong(toks[-1]) or None


class _ResidentialScan(osmium.SimpleHandler):
    """Named residential areas with centroid + area (WKB in-callback)."""

    def __init__(self):
        super().__init__()
        self.polys: list[dict] = []
        self._wkbf = osmium.geom.WKBFactory()

    def area(self, a):
        tags = dict(a.tags)
        if not tags.get("name"):
            return
        if (tags.get("building") != "apartments"
                and tags.get("landuse") != "residential"):
            return
        norm = normalize_complex(tags.get("name"))
        if len(norm) < EXACT_MIN_LEN:
            return
        try:
            geom = shapely_wkb.loads(self._wkbf.create_multipolygon(a))
        except Exception:
            return
        if geom.is_empty:
            return
        c = geom.centroid
        self.polys.append({
            "osm_id": ("r" if a.is_multipolygon() else "w") + str(a.id),
            "name": tags.get("name"), "norm": norm,
            "lon": round(float(c.x), 7), "lat": round(float(c.y), 7),
            "area_deg2": float(geom.area),
            "dong": normalize_dong(tags.get("addr:subdistrict")) or None,
            "district": (tags.get("addr:district") or "").strip() or None,
            "kind": ("landuse" if tags.get("landuse") == "residential"
                     else "building")})


def collect_residential_polygons(pbf_path: str | Path) -> list[dict]:
    """Named residential polygons of one extract (centroid + metadata)."""
    scan = _ResidentialScan()
    scan.apply_file(str(pbf_path), locations=True)
    seen = set()
    out = []
    for p in scan.polys:
        if p["osm_id"] in seen:
            continue
        seen.add(p["osm_id"])
        out.append(p)
    return out


def collect_all_extracts(extracts_dir: str | Path = DEFAULT_REGION_EXTRACTS
                         ) -> list[dict]:
    """Pool every region extract; dedupe by osm id (largest area wins).

    Extracts are bbox clips, so one polygon may appear (partially) in
    several files; the largest copy is the least clipped.
    """
    pool: dict[str, dict] = {}
    for path in sorted(Path(extracts_dir).glob("*.osm.pbf")):
        for p in collect_residential_polygons(path):
            prev = pool.get(p["osm_id"])
            if prev is None or p["area_deg2"] > prev["area_deg2"]:
                pool[p["osm_id"]] = p
    return sorted(pool.values(), key=lambda p: p["osm_id"])


def _dong_ok(poly_dong: str | None, want_dong: str | None) -> bool:
    if poly_dong and want_dong:
        return poly_dong == want_dong
    return True


def _best_of(polys: list[dict]) -> dict:
    """One polygon per name: landuse over building, then largest first."""
    return sorted(polys, key=lambda p: (
        0 if p["kind"] == "landuse" else 1,
        -p["area_deg2"], p["osm_id"]))[0]


def _span_km(polys: list[dict]) -> float:
    """Bbox-diagonal spread of polygon centroids, ~km."""
    lons = [p["lon"] for p in polys]
    lats = [p["lat"] for p in polys]
    return ((max(lons) - min(lons)) ** 2
            + (max(lats) - min(lats)) ** 2) ** 0.5 * 111.0


def _aligned(shorter: str, longer: str) -> bool:
    return longer.startswith(shorter) or longer.endswith(shorter)


def match_osm_name(complex_name: str | None, want_dong: str | None,
                   polygons: list[dict],
                   region_contains=None) -> dict | None:
    """Match one 단지명 to a residential polygon, or None.

    ``polygons`` should already be limited to the row's region (or pass
    ``region_contains``); the dong must agree when both sides have one.
    """
    norm_c = normalize_complex(complex_name)
    if len(norm_c) < EXACT_MIN_LEN:
        return None
    cands = [p for p in polygons
             if _has_identity(p["norm"])
             and _dong_ok(p["dong"], want_dong)
             and (region_contains is None
                  or region_contains(p["lon"], p["lat"]))]
    exact = [p for p in cands if p["norm"] == norm_c]
    if exact:
        if _span_km(exact) > SAME_NAME_SPAN_KM:
            return None
        return _best_of(exact)
    hits: dict[str, list[dict]] = {}
    for p in cands:
        norm_p = p["norm"]
        short = min(len(norm_c), len(norm_p))
        if short < CONTAIN_MIN_LEN:
            continue
        contains = norm_c in norm_p or norm_p in norm_c
        if not contains:
            continue
        if not _aligned(*sorted([norm_c, norm_p], key=len)):
            if short < MIDDLE_MIN_LEN:
                continue
        hits.setdefault(norm_p, []).append(p)
    if len(hits) != 1:
        return None
    group = next(iter(hits.values()))
    if _span_km(group) > SAME_NAME_SPAN_KM:
        return None
    return _best_of(group)
