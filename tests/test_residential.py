"""Unit tests for residential classification (stage 2).

Covers the documented precedence (register use > OSM tag > apartment
name > none), the 상가/공장 name exclusions, and the register summary's
new verbatim fields (pnu, name, sub_name). Synthetic fixtures only.
"""

from __future__ import annotations

from shapely.geometry import Polygon

from pipeline.building_join import classify_residential, has_apartment_name


def _sq() -> Polygon:
    return Polygon([(127.0, 37.5), (127.0002, 37.5), (127.0002, 37.5002),
                    (127.0, 37.5002)])


def test_register_use_wins() -> None:
    assert classify_residential("yes", None, "공동주택", 3) == (
        "apartment", "register:공동주택")
    assert classify_residential("apartments", None, "단독주택", 2) == (
        "house", "register:단독주택")
    # Officetel-style conflict: register use wins over the OSM tag.
    assert classify_residential("apartments", "성원상떼뷰오피스텔",
                                "업무시설", 11) == ("none", "register:업무시설")
    assert classify_residential("commercial", "금강빌딩",
                                "제2종근린생활시설", 5) == (
        "none", "register:제2종근린생활시설")


def test_geunrin_mixed_needs_strict_name_evidence() -> None:
    assert classify_residential("commercial", "푸르지오그랑블 203동",
                                "제2종근린생활시설", 5)[0] == "none"  # no keyword
    assert classify_residential("commercial", "푸르지오그랑블아파트 203동",
                                "제2종근린생활시설", 5) == (
        "mixed", "register:제2종근린생활시설+name")
    # 상가동 wings stay none even with an apartment name.
    assert classify_residential("commercial", "장미아파트 씨상가",
                                "제2종근린생활시설", 5) == (
        "none", "register:제2종근린생활시설")


def test_osm_tags_without_register() -> None:
    assert classify_residential("apartments", None, None, 15) == (
        "apartment", "osm:apartments")
    assert classify_residential("house", None, None, 2) == ("house", "osm:house")
    assert classify_residential("detached", None, None, 1) == (
        "house", "osm:detached")
    assert classify_residential("terrace", None, None, 3) == (
        "house", "osm:terrace")
    # building=residential splits on height (tag alone is unreliable).
    assert classify_residential("residential", "B", None, 8) == (
        "apartment", "osm:residential")
    assert classify_residential("residential", None, None, 2) == (
        "house", "osm:residential")
    assert classify_residential("yes", None, None, 1) == ("none", "none")


def test_apartment_name_fallback_and_exclusions() -> None:
    assert has_apartment_name("백현마을3단지휴먼시아아파트")
    assert has_apartment_name("안산연립주택")
    assert not has_apartment_name("안산연립")  # bare abbrev: not a keyword
    assert not has_apartment_name("신흥아파트형공장")
    assert not has_apartment_name("윈스타워 아파트형 공장")
    assert not has_apartment_name("뚝섬현대아파트 상가동")
    assert not has_apartment_name(None)
    assert classify_residential("yes", "백현마을3단지휴먼시아아파트",
                                None, 12) == ("apartment", "name")
    assert classify_residential("yes", "신흥아파트형공장",
                                None, 8) == ("none", "none")


def test_join_area_writes_residential_and_register_fields(monkeypatch) -> None:
    from pipeline import building_join

    poly = _sq()
    osm = {"buildings": [{
        "id": "w1", "osm_kind": "way", "osm_id": 1, "building": "apartments",
        "name": None, "height_m": None, "levels": 12, "geometry": {
            "type": "Polygon",
            "coordinates": [[list(c) for c in poly.exterior.coords]]},
    }]}
    reg = {
        "id": "reg:a", "region": "test", "shape_index": 0,
        "pnu": "4113510700105420001", "height": None, "floors_above": 12,
        "floors_below": 1, "use_code": "02000", "use": "공동주택",
        "structure_code": None, "structure": "철근콘크리트구조",
        "name": "푸르지오그랑블아파트", "sub_name": "203동",
        "footprint_area": 500.0, "approval_date": "2010-05-01",
        "address": "경기도 성남시", "lot": "542", "geometry_wgs84": poly,
    }
    area_def = {"id": "testbox", "kind": "bbox",
                "bbox": [126.99, 37.49, 127.01, 37.51],
                "center": [127.0, 37.5]}
    monkeypatch.setattr(building_join, "stream_register",
                        lambda files, bbox: [reg])
    payload = building_join.join_area("testbox", area_def, osm, [],
                                      area_dir=None)
    assert len(payload["buildings"]) == 1
    b = payload["buildings"][0]
    assert b["origin"] == "joined"
    assert b["residential"] == "apartment"
    assert b["residential_source"] == "register:공동주택"
    assert b["register"]["pnu"] == "4113510700105420001"
    assert b["register"]["name"] == "푸르지오그랑블아파트"
    assert b["register"]["sub_name"] == "203동"
    assert b["register"]["use"] == "공동주택"
    assert payload["meta"]["residential_counts"] == {"apartment": 1}


def test_bad_pnu_dropped_not_stored() -> None:
    from pipeline.building_join import _text
    assert _text("  ") is None
    assert _text("41135") == "41135"
