"""Unit tests for the register-API fill (stage 2, code only).

All API responses come from hand-written synthetic fixtures under
``tests/fixtures/register_api/`` (marked synthetic inside each file);
no network is touched — the fetcher is injected or monkeypatched.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from pipeline import register_api
from pipeline.register_api import (
    RateLimiter,
    RegisterApiError,
    apply_item,
    assign_parcel,
    attach_complex_recaps,
    build_query,
    eligible_buildings,
    fetch_parcel,
    fetch_title,
    fill_area,
    footprint_area_m2,
    is_main_building_record,
    match_by_area,
    parse_recap_response,
    parse_title_response,
    pick_title,
    recap_parcels,
    recap_summary,
    split_pnu,
    title_height,
    title_summary,
)

FIXTURES = Path(__file__).parent / "fixtures" / "register_api"


def _body(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_split_pnu_land_types() -> None:
    assert split_pnu("4113510700105420001") == {
        "sigunguCd": "41135", "bjdongCd": "10700", "platGbCd": "0",
        "bun": "0542", "ji": "0001"}
    assert split_pnu("4113510700205420001")["platGbCd"] == "1"
    with pytest.raises(ValueError):
        split_pnu("41135")
    with pytest.raises(ValueError):
        split_pnu("4113510700X05420001")
    with pytest.raises(ValueError):
        split_pnu("4113510700305420001")  # land type 3


def test_build_query_shape() -> None:
    query = build_query(split_pnu("4113510700105420001"), "KEY")
    assert "sigunguCd=41135" in query
    assert "bjdongCd=10700" in query
    assert "platGbCd=0" in query
    assert "bun=0542" in query
    assert "ji=0001" in query
    assert "numOfRows=100" in query and "pageNo=1" in query
    assert "_type=json" in query


def test_parse_title_response_shapes() -> None:
    single = parse_title_response(_body("single.json"))
    assert len(single) == 1
    assert single[0]["dongNm"] == "203동"
    multi = parse_title_response(_body("multi.json"))
    assert [i["dongNm"] for i in multi] == ["201동", "202동"]
    assert parse_title_response(_body("empty.json")) == []
    # Single dict item (not a list) is accepted.
    floors = parse_title_response(_body("floors_only.json"))
    assert len(floors) == 1
    with pytest.raises(RegisterApiError):
        parse_title_response(json.dumps({
            "response": {"header": {"resultCode": "99",
                                    "resultMsg": "FAIL"},
                         "body": {}}}))


def test_pick_title_dong_single_ambiguous() -> None:
    multi = parse_title_response(_body("multi.json"))
    assert pick_title(multi, "202동")["mgmBldrgstPk"] == "41135-100233"
    assert pick_title(multi, "202 동")["dongNm"] == "202동"  # spacing tolerant
    assert pick_title(multi, None) is None  # ambiguous multi-record parcel
    assert pick_title(multi, "999동") is None
    single = parse_title_response(_body("single.json"))
    assert pick_title(single, None) == single[0]
    assert pick_title([], "101동") is None


def test_title_height_priority() -> None:
    single = parse_title_response(_body("single.json"))[0]
    assert title_height(single) == (55.5, "api_height", 20)
    floors = parse_title_response(_body("floors_only.json"))[0]
    assert title_height(floors) == (15.0, "api_floors", 5)
    assert title_height({}) is None
    assert title_height({"heit": "abc", "grndFlrCnt": "xx"}) is None


def test_apply_item_sets_api_source() -> None:
    building = {"id": "reg:a", "height_m": 9.0, "height_source": "inferred",
                "levels": 3,
                "register": {"pnu": "4113510700105420001", "use": None,
                             "sub_name": "203동"}}
    item = parse_title_response(_body("single.json"))[0]
    assert apply_item(building, item) is True
    assert building["height_m"] == 55.5
    assert building["height_source"] == "api_height"
    assert building["levels"] == 20
    assert building["register"]["api"]["use"] == "공동주택"
    assert building["register"]["api"]["dongNm"] == "203동"
    assert building["register"]["api"]["households"] == 90
    # Shapefile snapshot stays verbatim.
    assert building["register"]["use"] is None
    assert apply_item({"id": "x", "register": {}}, {}) is False


def test_eligible_groups_by_pnu() -> None:
    buildings = [
        {"id": "b1", "height_source": "inferred",
         "register": {"pnu": "4113510700105420001"}},
        {"id": "b2", "height_source": "inferred",
         "register": {"pnu": "4113510700105420001"}},
        {"id": "b3", "height_source": "inferred", "register": {"pnu": None}},
        {"id": "b4", "height_source": "register_height",
         "register": {"pnu": "4113510700105420002"}},
        {"id": "b5", "height_source": "inferred", "register": None},
    ]
    groups = eligible_buildings(buildings)
    assert list(groups) == ["4113510700105420001"]
    assert [b["id"] for b in groups["4113510700105420001"]] == ["b1", "b2"]


def test_rate_limiter_spacing() -> None:
    now = [100.0]
    slept = []

    limiter = RateLimiter(min_interval=0.25, clock=lambda: now[0],
                          sleeper=slept.append)
    limiter.wait()
    now[0] += 0.1
    limiter.wait()
    assert slept == [pytest.approx(0.15)]


def test_fetch_retries_then_raises_sleepless() -> None:
    import urllib.error

    calls = []

    def opener(url: str) -> bytes:
        calls.append(url)
        raise urllib.error.URLError("down")

    with pytest.raises(RegisterApiError):
        fetch_title("4113510700105420001", "KEY", opener=opener,
                    sleeper=lambda s: None)
    assert len(calls) == 3


def test_dry_run_counts_without_network(tmp_path: Path) -> None:
    area_dir = tmp_path / "pangyo"
    area_dir.mkdir()
    (area_dir / "buildings.json").write_text(json.dumps({
        "buildings": [
            {"id": "b1", "height_source": "inferred",
             "residential": "apartment",
             "register": {"pnu": "4113510700105420001"}},
            {"id": "b2", "height_source": "inferred",
             "residential": "none",
             "register": {"pnu": "4113510700105420002"}},
        ],
        "meta": {},
    }), encoding="utf-8")

    def boom(pnu: str) -> bytes:
        raise AssertionError("dry-run must not fetch")

    summary = fill_area(area_dir, cache_dir=tmp_path / "cache",
                        dry_run=True, fetcher=boom)
    assert summary == {"area": "pangyo", "pnus": 2, "buildings": 2,
                       "recap_pnus": 1, "dry_run": True}
    assert not (tmp_path / "cache").exists()


def test_fill_applies_cache_and_rewrites_area(tmp_path: Path,
                                              monkeypatch) -> None:
    area_dir = tmp_path / "pangyo"
    area_dir.mkdir()
    (area_dir / "buildings.json").write_text(json.dumps({
        "buildings": [
            {"id": "b1", "height_m": 9.0, "height_source": "inferred",
             "levels": 3, "building": "apartments", "name": None,
             "residential": "apartment", "residential_source": "osm:apartments",
             "register": {"pnu": "4113510700105420001", "use": None,
                          "sub_name": "203동"},
             "geometry": {"type": "Polygon", "coordinates": [[[127.0, 37.5],
                            [127.0002, 37.5], [127.0002, 37.5002],
                            [127.0, 37.5002], [127.0, 37.5]]]}},
        ],
        "meta": {"register_coverage": "full", "register_files": [],
                 "height_sources": {"inferred": 1}, "inferred_share": 1.0,
                 "residential_counts": {"apartment": 1}},
    }), encoding="utf-8")
    for name, payload in (
            ("area_def.json", {"id": "pangyo", "label": "P", "kind": "bbox",
                               "bbox": [126.99, 37.49, 127.01, 37.51],
                               "center": [127.0, 37.5], "station": None,
                               "boundary": None}),
            ("osm.json", {"buildings": [], "roads": [], "pois": [],
                          "landuse": [], "trees": []}),
            ("graph.json", {"nodes": {}, "edges": {},
                            "meta": {"counts": {}, "walk_lcc": {}}})):
        (area_dir / name).write_text(json.dumps(payload), encoding="utf-8")

    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    (cache_dir / "4113510700105420001.json").write_bytes(_body("single.json"))

    def boom(pnu: str) -> bytes:
        raise AssertionError("cached PNU must not refetch")

    summary = fill_area(area_dir, cache_dir=cache_dir, fetcher=boom)
    assert summary["cache_hits"] == 1
    assert summary["fetched"] == 0
    assert summary["filled"] == 1
    assert summary["ambiguous"] == 0
    stored = json.loads((area_dir / "buildings.json").read_text(
        encoding="utf-8"))
    assert stored["buildings"][0]["height_source"] == "api_height"
    # area.json + report.json were refreshed from the filled buildings.
    area = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    assert area["buildings"][0]["height_source"] == "api_height"


REAL_SAMPLE = (Path(__file__).parent.parent / "data" / "raw" /
               "register_api_samples" /
               "getBrTitleInfo_4113511000105530000.json")


@pytest.mark.skipif(not REAL_SAMPLE.exists(),
                    reason="real API sample not present under data/raw")
def test_real_sample_response_parses_and_matches() -> None:
    # Verification against the first REAL response (not a fixture): the
    # brief-listed field names, the dong match, and the height fill.
    items = parse_title_response(REAL_SAMPLE.read_bytes())
    assert len(items) == 36
    for item in items:
        for key in ("grndFlrCnt", "ugrndFlrCnt", "heit", "mainPurpsCdNm",
                    "bldNm", "dongNm", "useAprDay", "mgmBldrgstPk", "hhldCnt"):
            assert key in item, key
    picked = pick_title(items, "414동")
    assert picked["bldNm"] == "백현마을"
    assert title_height(picked) == (42.4, "api_height", 15)
    assert title_summary(picked)["households"] == 90
    assert pick_title(items, None) is None  # multi-record, no dong


def test_fill_missing_key_errors_without_leak(
        tmp_path: Path, monkeypatch, capsys) -> None:
    area_dir = tmp_path / "pangyo"
    area_dir.mkdir()
    (area_dir / "buildings.json").write_text(
        json.dumps({"buildings": [], "meta": {}}), encoding="utf-8")
    monkeypatch.delenv("DATA_GO_KR_KEY", raising=False)
    # No eligible buildings → fill_area still needs no key... to exercise
    # the key check, add one eligible building.
    (area_dir / "buildings.json").write_text(json.dumps({
        "buildings": [{"id": "b1", "height_source": "inferred",
                       "register": {"pnu": "4113510700105420001"}}],
        "meta": {},
    }), encoding="utf-8")
    with pytest.raises(RegisterApiError, match="DATA_GO_KR_KEY is not set"):
        fill_area(area_dir, cache_dir=tmp_path / "cache")
    # The key value can never appear: it is only read, never formatted.
    out = capsys.readouterr().out
    assert "KEY" not in out


# --- stage 2b: footprint-area match --------------------------------------

LON0, LAT0 = 127.0, 37.5


def _square(side_deg: float, lon: float = LON0, lat: float = LAT0) -> dict:
    h = side_deg / 2
    return {"type": "Polygon", "coordinates": [[
        [lon - h, lat - h], [lon + h, lat - h],
        [lon + h, lat + h], [lon - h, lat + h],
        [lon - h, lat - h]]]}


def _area_building(bid: str, target_m2: float, lon: float = LON0,
                   **kw) -> dict:
    kx = 111320.0 * math.cos(math.radians(LAT0))
    side = math.sqrt(target_m2 / (kx * 111320.0))
    building = {"id": bid, "height_source": "inferred",
                "geometry": _square(side, lon),
                "register": {"pnu": "4113510700105420001"}}
    building.update(kw)
    return building


def test_footprint_area_m2_matches_equirectangular_spec() -> None:
    area = footprint_area_m2(_square(0.001))
    kx = 111320.0 * math.cos(math.radians(LAT0))
    assert area == pytest.approx(0.001 * kx * 0.001 * 111320.0, rel=1e-9)
    assert round(area) == 9831  # pinned literal, not recomputed
    assert footprint_area_m2({}) is None
    assert footprint_area_m2({"type": "Polygon", "coordinates": []}) is None
    assert footprint_area_m2(None) is None


def test_main_building_record_filter() -> None:
    items = parse_title_response(_body("area_match.json"))
    mains = [i for i in items if is_main_building_record(i)]
    assert [i["dongNm"] for i in mains] == ["201동", "202동"]
    # 부속건축물, 0 floors and 경비실/주차장 names are all excluded.
    assert len(items) == 5


def test_match_by_area_assigns_one_to_one_within_tolerance() -> None:
    items = parse_title_response(_body("area_match.json"))
    buildings = [
        _area_building("b1", 505.0),   # → 201동 (1 % off 500)
        _area_building("b2", 790.0),   # → 202동 (12.9 % off 700)
        _area_building("b3", 100.0),   # out of tolerance everywhere
        _area_building("b4", 508.0),   # closest is 201동, but b1 wins it
    ]
    matched = match_by_area(buildings, items)
    assert matched["b1"]["dongNm"] == "201동"
    assert matched["b2"]["dongNm"] == "202동"
    assert "b3" not in matched
    assert "b4" not in matched  # one-to-one: 201동 went to b1


def test_match_by_area_tie_break_is_deterministic() -> None:
    items = parse_title_response(_body("area_match.json"))
    rec_b = [i for i in items if i["dongNm"] == "202동"]
    buildings = [_area_building("bb", 702.0), _area_building("aa", 702.0)]
    first = match_by_area(buildings, rec_b)
    second = match_by_area(list(reversed(buildings)), rec_b)
    assert first == second
    assert list(first) == ["aa"]  # identical diffs: lower building id wins


def test_assign_parcel_dong_first_then_area() -> None:
    items = parse_title_response(_body("area_match.json"))
    buildings = [
        _area_building("b1", 505.0,
                       register={"pnu": "4113510700105420001",
                                 "sub_name": "202동"}),  # dong match
        _area_building("b2", 505.0),  # area match → 201동 (202동 is taken)
        _area_building("b3", 100.0),  # stays inferred
    ]
    assigned = assign_parcel(buildings, items)
    assert assigned["b1"]["dongNm"] == "202동"
    assert assigned["b2"]["dongNm"] == "201동"
    assert "b3" not in assigned


def test_assign_parcel_single_record_applies_to_all() -> None:
    items = parse_title_response(_body("single.json"))
    buildings = [
        _area_building("b1", 505.0,
                       register={"pnu": "4113510700105420001",
                                 "sub_name": "999동"}),
        _area_building("b2", 505.0),
    ]
    assigned = assign_parcel(buildings, items)
    assert set(assigned) == {"b1", "b2"}  # legacy single-record rule


def test_recap_parcels_only_apartment_parcels() -> None:
    groups = {
        "p1": [{"id": "a", "residential": "apartment"},
               {"id": "b", "residential": "none"}],
        "p2": [{"id": "c", "residential": "house"}],
        "p3": [{"id": "d"}],  # unknown class: no recap call
    }
    assert recap_parcels(groups) == ["p1"]


# --- stage 2b: platGbCd=2 retry -------------------------------------------

def test_fetch_parcel_retries_block_when_empty() -> None:
    calls = []

    def opener(url: str) -> bytes:
        calls.append(url)
        if "platGbCd=2" in url:
            return _body("single.json")
        assert "platGbCd=0" in url
        return _body("empty.json")

    body, plat = fetch_parcel("4113510700105420001", "KEY", opener=opener,
                              sleeper=lambda s: None)
    assert plat == "2"
    assert parse_title_response(body)[0]["dongNm"] == "203동"
    assert len(calls) == 2


def test_fetch_parcel_no_retry_when_records_present() -> None:
    calls = []

    def opener(url: str) -> bytes:
        calls.append(url)
        return _body("single.json")

    body, plat = fetch_parcel("4113510700105420001", "KEY", opener=opener,
                              sleeper=lambda s: None)
    assert plat == "0"
    assert len(calls) == 1


def test_fetch_parcel_no_retry_for_mountain_parcels() -> None:
    calls = []

    def opener(url: str) -> bytes:
        calls.append(url)
        assert "platGbCd=1" in url
        return _body("empty.json")

    _, plat = fetch_parcel("4113510700205420001", "KEY", opener=opener,
                           sleeper=lambda s: None)
    assert plat == "1"
    assert len(calls) == 1  # 블록 retry applies to platGbCd=0 only


# --- stage 2b: recap -------------------------------------------------------

def test_parse_recap_response_shapes() -> None:
    item = parse_recap_response(_body("recap.json"))
    assert item["hhldCnt"] == "1520"
    assert item["mainBldCnt"] == "8"
    assert parse_recap_response(_body("recap_empty.json")) is None
    with pytest.raises(RegisterApiError):
        parse_recap_response(json.dumps({
            "response": {"header": {"resultCode": "99",
                                    "resultMsg": "FAIL"},
                         "body": {}}}))
    assert recap_summary(item) == {"households": 1520, "main_bld_cnt": 8}
    assert recap_summary({}) == {}


def test_attach_complex_recaps_inline_and_ref(tmp_path: Path) -> None:
    area_dir = tmp_path / "a"
    area_dir.mkdir()
    (area_dir / "area.json").write_text(json.dumps({
        "complexes": [
            {"id": "cx000001", "name": "A"},
            {"id": "cx000002", "name": None},
        ],
    }), encoding="utf-8")
    updates = {"cx000001": {"households": 100, "main_bld_cnt": 3,
                            "households_source": "register_recap",
                            "households_pnus": ["p1"]}}
    assert attach_complex_recaps(area_dir, updates) == 1
    stored = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    assert stored["complexes"][0]["households"] == 100
    assert "households" not in stored["complexes"][1]
    # $ref part-file layout.
    (area_dir / "area.complexes.json").write_text(json.dumps([
        {"id": "cx000001", "name": "A"},
    ]), encoding="utf-8")
    (area_dir / "area.json").write_text(json.dumps({
        "complexes": {"$ref": "area.complexes.json"},
    }), encoding="utf-8")
    assert attach_complex_recaps(area_dir, updates) == 1
    part = json.loads((area_dir / "area.complexes.json").read_text(
        encoding="utf-8"))
    assert part[0]["households_source"] == "register_recap"
    assert attach_complex_recaps(area_dir, {}) == 0


def test_fill_applies_titles_and_recap_to_complex(tmp_path: Path) -> None:
    area_dir = tmp_path / "pangyo"
    area_dir.mkdir()
    pnu = "4113510700105420001"
    (area_dir / "buildings.json").write_text(json.dumps({
        "buildings": [
            {"id": "b1", "height_m": 9.0, "height_source": "inferred",
             "levels": 3, "building": "apartments", "name": None,
             "residential": "apartment", "residential_source": "osm:apartments",
             "register": {"pnu": pnu, "use": None, "sub_name": "203동"},
             "geometry": _square(0.0002, LON0, LAT0)},
            {"id": "b2", "height_m": 9.0, "height_source": "inferred",
             "levels": 3, "building": "apartments", "name": None,
             "residential": "apartment", "residential_source": "osm:apartments",
             "register": {"pnu": pnu, "use": None, "sub_name": None},
             "geometry": _square(0.0002, LON0 + 0.0003, LAT0)},
        ],
        "meta": {"register_coverage": "full", "register_files": [],
                 "height_sources": {"inferred": 2}, "inferred_share": 1.0,
                 "residential_counts": {"apartment": 2}},
    }), encoding="utf-8")
    for name, payload in (
            ("area_def.json", {"id": "pangyo", "label": "P", "kind": "bbox",
                               "bbox": [126.99, 37.49, 127.01, 37.51],
                               "center": [127.0, 37.5], "station": None,
                               "boundary": None}),
            ("osm.json", {"buildings": [], "roads": [], "pois": [],
                          "landuse": [], "trees": []}),
            ("graph.json", {"nodes": {}, "edges": {},
                            "meta": {"counts": {}, "walk_lcc": {}}})):
        (area_dir / name).write_text(json.dumps(payload), encoding="utf-8")

    title_body, recap_body = _body("single.json"), _body("recap.json")
    summary = fill_area(area_dir, cache_dir=tmp_path / "cache",
                        fetcher=lambda p: title_body,
                        recap_fetcher=lambda p: recap_body)
    assert summary["filled"] == 2
    assert summary["recap_fetched"] == 1
    assert summary["recap_complexes"] == 1
    stored = json.loads((area_dir / "buildings.json").read_text(
        encoding="utf-8"))
    # Title hhldCnt lands per building; the height fill still works.
    assert stored["buildings"][0]["register"]["api"]["households"] == 90
    assert stored["buildings"][0]["height_source"] == "api_height"
    area = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    assert len(area["complexes"]) == 1
    complex = area["complexes"][0]
    assert complex["households"] == 1520
    assert complex["main_bld_cnt"] == 8
    assert complex["households_source"] == "register_recap"
    assert complex["households_pnus"] == [pnu]


def test_fill_skips_recap_without_recap_fetcher(tmp_path: Path) -> None:
    area_dir = tmp_path / "pangyo"
    area_dir.mkdir()
    (area_dir / "buildings.json").write_text(json.dumps({
        "buildings": [
            {"id": "b1", "height_m": 9.0, "height_source": "inferred",
             "levels": 3, "building": "apartments", "name": None,
             "residential": "apartment", "residential_source": "osm:apartments",
             "register": {"pnu": "4113510700105420001", "use": None,
                          "sub_name": "203동"},
             "geometry": _square(0.0002)},
        ],
        "meta": {"register_coverage": "full", "register_files": [],
                 "height_sources": {"inferred": 1}, "inferred_share": 1.0,
                 "residential_counts": {"apartment": 1}},
    }), encoding="utf-8")
    for name, payload in (
            ("area_def.json", {"id": "pangyo", "label": "P", "kind": "bbox",
                               "bbox": [126.99, 37.49, 127.01, 37.51],
                               "center": [127.0, 37.5], "station": None,
                               "boundary": None}),
            ("osm.json", {"buildings": [], "roads": [], "pois": [],
                          "landuse": [], "trees": []}),
            ("graph.json", {"nodes": {}, "edges": {},
                            "meta": {"counts": {}, "walk_lcc": {}}})):
        (area_dir / name).write_text(json.dumps(payload), encoding="utf-8")
    summary = fill_area(area_dir, cache_dir=tmp_path / "cache",
                        fetcher=lambda p: _body("single.json"))
    assert summary["filled"] == 1
    assert summary["recap_fetched"] == 0
    area = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    assert "households" not in area["complexes"][0]


# --- stage 2b: 503 is transient --------------------------------------------

def test_fetch_retries_503_then_succeeds() -> None:
    import urllib.error

    calls = []

    def opener(url: str) -> bytes:
        calls.append(url)
        if len(calls) < 3:
            raise urllib.error.HTTPError(url, 503, "Service Unavailable",
                                         {}, None)
        return _body("single.json")

    slept = []
    body = fetch_title("4113510700105420001", "KEY", opener=opener,
                       sleeper=slept.append)
    assert parse_title_response(body)[0]["dongNm"] == "203동"
    assert len(calls) == 3
    assert slept == [1.0, 2.0]


def test_real_sample_main_filter_read_only() -> None:
    if not REAL_SAMPLE.exists():
        pytest.skip("real API sample not present under data/raw")
    items = parse_title_response(REAL_SAMPLE.read_bytes())
    mains = [i for i in items if is_main_building_record(i)]
    assert len(mains) == 21  # 20 numbered dongs + 상가동
    names = [i["dongNm"] for i in mains]
    assert "상가동" in names
    assert not [n for n in names if "경비실" in n or "주차장" in n]
