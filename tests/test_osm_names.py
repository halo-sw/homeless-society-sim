"""Tests for pipeline/osm_names.py (12a2, Part 3)."""

from __future__ import annotations

from pipeline.osm_names import (
    collect_residential_polygons,
    match_osm_name,
    normalize_complex,
    row_dong,
)


def test_normalize_complex_drops_spaces_suffixes_parens():
    assert normalize_complex("송파 헬리오시티") == "송파헬리오시티"
    assert normalize_complex("헬리오시티") == "헬리오시티"
    assert normalize_complex("하얀마을5단지주공아파트") == "하얀마을5단지주공"
    assert normalize_complex("판교밸리자이 1단지") == "판교밸리자이1"
    assert normalize_complex("위례자이 더 시티") == "위례자이더시티"
    assert normalize_complex("양지빌라A동(449-10)") == "양지빌라a동"
    assert normalize_complex("XX APT") == "xx"
    assert normalize_complex(None) == ""


def test_row_dong_takes_last_token():
    assert row_dong("서울특별시 송파구 가락동") == "가락동"
    assert row_dong("경기도 성남시 수정구 창곡동") == "창곡동"
    assert row_dong("") is None
    assert row_dong(None) is None


def _poly(osm_id, name, lon=127.1, lat=37.5, dong=None,
          kind="landuse", area=1.0):
    return {"osm_id": osm_id, "name": name,
            "norm": normalize_complex(name), "lon": lon, "lat": lat,
            "area_deg2": area, "dong": dong, "district": None,
            "kind": kind}


def test_match_exact_wins_over_containment():
    polys = [_poly("w1", "위례자이 더 시티"),
             _poly("w2", "위례자이"),
             _poly("w3", "101"), _poly("w4", "3")]
    hit = match_osm_name("위례자이", "창곡동", polys)
    assert hit["osm_id"] == "w2"
    hit = match_osm_name("위례자이더시티", "창곡동", polys)
    assert hit["osm_id"] == "w1"


def test_match_unique_containment_and_ambiguity():
    pool = [_poly("w1", "송파헬리오시티", dong="가락동")]
    hit = match_osm_name("헬리오시티", "가락동", pool)
    assert hit["osm_id"] == "w1"
    # Building numbers never match ("1" ⊂ "위례31단지" is not a match).
    nums = [_poly("w2", "1"), _poly("w3", "3"),
            _poly("w4", "103동"), _poly("w5", "가동")]
    assert match_osm_name("위례31단지", "창곡동", nums) is None
    assert match_osm_name("그린빌II101~103동", "창곡동", nums) is None
    # Bare generic types never match either.
    assert match_osm_name("K타워 오피스텔", None,
                          [_poly("w6", "오피스텔")]) is None
    # Two distinct complex names containing the 단지명: no match.
    amb = [_poly("w7", "위례자이"), _poly("w8", "위례자이 더 시티")]
    assert match_osm_name("자이", "창곡동", amb) is None


def test_match_middle_containment_needs_seven_chars():
    # "신동아파밀리에" (7) in the middle passes; shorter middles don't.
    assert match_osm_name("강남신동아파밀리에1단지", None,
                          [_poly("w1", "신동아파밀리에아파트")])["osm_id"] == "w1"
    assert match_osm_name("리체힐 신논현 오피스텔A동", None,
                          [_poly("w2", "논현오피스텔")]) is None
    assert match_osm_name("위례아트리버푸르지오1단지", None,
                          [_poly("w3", "푸르지오아파트")]) is None


def test_match_same_name_must_cluster():
    near = [_poly("w1", "둔촌푸르지오", lon=127.10, lat=37.50),
            _poly("w2", "둔촌푸르지오", lon=127.101, lat=37.501)]
    assert match_osm_name("둔촌푸르지오", None, near)["osm_id"] in ("w1", "w2")
    far = [_poly("w3", "현대아파트", lon=127.00, lat=37.50),
           _poly("w4", "현대아파트", lon=127.20, lat=37.50)]
    assert match_osm_name("현대", None, far) is None
    assert match_osm_name("반포현대", None, far) is None


def test_match_requires_dong_and_region():
    pool = [_poly("w1", "송파헬리오시티", dong="가락동")]
    assert match_osm_name("헬리오시티", "문정동", pool) is None
    # No dong on either side: region containment still applies.
    pool2 = [_poly("w2", "산성역포레스티아")]
    assert match_osm_name("산성역포레스티아", None, pool2)["osm_id"] == "w2"
    assert match_osm_name("산성역포레스티아", None, pool2,
                          region_contains=lambda lon, lat: False) is None


def test_match_prefers_landuse_over_building():
    pool = [_poly("w1", "래미안위례", kind="building", area=0.5),
            _poly("w2", "래미안위례", kind="landuse", area=2.0)]
    assert match_osm_name("래미안위례", None, pool)["osm_id"] == "w2"


FIXTURE_OSM = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="pytest-fixture">
  <node id="1" lat="37.5000" lon="127.1000"/>
  <node id="2" lat="37.5000" lon="127.1010"/>
  <node id="3" lat="37.5010" lon="127.1010"/>
  <node id="4" lat="37.5010" lon="127.1000"/>
  <node id="5" lat="37.5100" lon="127.1100"/>
  <node id="6" lat="37.5100" lon="127.1110"/>
  <node id="7" lat="37.5110" lon="127.1110"/>
  <node id="8" lat="37.5110" lon="127.1100"/>
  <way id="10">
    <nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
    <tag k="landuse" v="residential"/>
    <tag k="name" v="송파헬리오시티"/>
    <tag k="addr:subdistrict" v="가락동"/>
  </way>
  <way id="11">
    <nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="8"/><nd ref="5"/>
    <tag k="building" v="apartments"/>
    <tag k="name" v="래미안위례"/>
  </way>
  <way id="12">
    <nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="8"/><nd ref="5"/>
    <tag k="building" v="yes"/>
    <tag k="name" v="헬리오시티 경로당"/>
  </way>
</osm>
"""


def test_collect_residential_polygons_fixture(tmp_path):
    osm_file = tmp_path / "fixture.osm"
    osm_file.write_text(FIXTURE_OSM, encoding="utf-8")
    polys = collect_residential_polygons(osm_file)
    by_name = {p["name"]: p for p in polys}
    # landuse + apartments kept with centroids; plain buildings skipped.
    assert set(by_name) == {"송파헬리오시티", "래미안위례"}
    assert by_name["송파헬리오시티"]["dong"] == "가락동"
    assert by_name["송파헬리오시티"]["kind"] == "landuse"
    assert abs(by_name["송파헬리오시티"]["lon"] - 127.1005) < 0.0001
    assert abs(by_name["래미안위례"]["lat"] - 37.5105) < 0.0001
    assert match_osm_name("헬리오시티", "가락동", polys)["name"] == "송파헬리오시티"
