"""Tests for pipeline.network (stage 8, Part A).

Pure-geometry tests run on synthetic data; the real-pbf test reuses the
cached prefilter (``data/build/_cache/network-*.osm.pbf``) so it is fast
after the first pipeline run. The real test pins the demo facts: 잠실/강남
on 2호선 in 내선 order, 강남/판교 on the 신분당선, and the 강남 transfer
joining them — the graph facts the engine's 잠실→판교 path rests on.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.network import (
    _canonical_pair,
    _chain_ways,
    _chainage_km,
    _direction_for,
    _mirror_pattern,
    build_network,
    ensure_prefilter,
    haversine_m,
    normalize_station,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_PBF = REPO_ROOT / "data" / "raw" / "south-korea-latest.osm.pbf"
CACHE_DIR = REPO_ROOT / "data" / "build" / "_cache"

needs_raw = pytest.mark.skipif(not RAW_PBF.exists(),
                               reason="national pbf missing")


def test_normalize_station():
    assert normalize_station("잠실") == "잠실"
    assert normalize_station("잠실역") == "잠실"
    assert normalize_station(" 교대(법원·검찰청) ") == "교대"
    assert normalize_station("서울대입구(관악구청)") == "서울대입구"
    assert normalize_station("  강남  ") == "강남"


def test_haversine_m():
    # 잠실역 (127.1001, 37.5133) → 강남역 (127.0276, 37.4979): ~6.6 km.
    d = haversine_m(127.1001, 37.5133, 127.0276, 37.4979)
    assert 6300 < d < 6900
    assert haversine_m(127.0, 37.5, 127.0, 37.5) == 0.0


def test_chain_ways_sequential_and_greedy():
    a = [(0.0, 0.0), (1.0, 0.0)]
    b = [(1.0, 0.0), (2.0, 0.0)]
    c = [(3.0, 0.0), (2.0, 0.0)]  # reversed
    assert _chain_ways([a, b, c]) in (
        [(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (3.0, 0.0)],
        [(3.0, 0.0), (2.0, 0.0), (1.0, 0.0), (0.0, 0.0)])
    # Scrambled order still chains by endpoint (either direction —
    # chainage tries both).
    assert _chain_ways([c, a, b]) in (
        [(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (3.0, 0.0)],
        [(3.0, 0.0), (2.0, 0.0), (1.0, 0.0), (0.0, 0.0)])
    assert _chain_ways([]) == []


def test_chainage_km_geometry_and_reversed_chain():
    stops = [{"lon": 0.0, "lat": 0.0}, {"lon": 0.01, "lat": 0.0},
             {"lon": 0.02, "lat": 0.0}]
    fwd = [(0.0, 0.0), (0.01, 0.0), (0.02, 0.0)]
    kms, methods = _chainage_km(fwd, stops)
    assert methods == ["geometry", "geometry"]
    assert kms[0] == 0.0
    assert abs(kms[2] - 2 * haversine_m(0, 0, 0.01, 0) / 1000) < 0.01
    # A chain running against travel still measures forward.
    rev = list(reversed(fwd))
    kms2, methods2 = _chainage_km(rev, stops)
    assert methods2 == ["geometry", "geometry"]
    assert kms2 == pytest.approx(kms)


def test_chainage_km_loop_wraps():
    stops = [{"lon": 1.0, "lat": 0.0}, {"lon": 0.0, "lat": 1.0},
             {"lon": 1.0, "lat": 0.0}]
    chain = [(1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -1.0), (1.0, 0.0)]
    kms, methods = _chainage_km(chain, stops)
    assert methods[0] == "geometry"
    assert kms[1] > 0 and kms[2] > kms[1]


def test_chainage_km_falls_back_per_segment():
    stops = [{"lon": 0.0, "lat": 0.0}, {"lon": 50.0, "lat": 0.0}]
    kms, methods = _chainage_km([(0.0, 0.0), (0.001, 0.0)], stops)
    assert methods == ["haversine"]
    assert kms[1] > 1000.0


def test_direction_for_line2_and_numbers():
    stops = [{"name": "a"}, {"name": "b"}]
    assert _direction_for("line2", "서울 지하철 2호선: 내선순환", stops, None) == ("inner", "내선")
    assert _direction_for("line2", "서울 지하철 2호선: 외선순환", stops, None) == ("outer", "외선")
    cong = {"station_numbers": {"8호선": {"별내": 2804, "모란": 2822}}}
    assert _direction_for("line8", "8호선: 별내 → 모란",
                          [{"name": "별내"}, {"name": "모란"}], cong) == ("down", "하선")
    assert _direction_for("line8", "8호선: 모란 → 별내",
                          [{"name": "모란"}, {"name": "별내"}], cong) == ("up", "상선")
    assert _direction_for("sinbundang", "신분당선: 신사 → 광교",
                          [{"name": "신사"}, {"name": "광교"}], None) == ("toward", "광교 방면")


def test_canonical_pair_prefers_opposite_and_deterministic():
    def pat(rid, name, stops):
        return {"rel_id": rid, "name": name,
                "stops": [{"name": s} for s in stops]}
    inner = pat(9, "2호선: 내선순환", ["a", "b", "c"])
    outer = pat(4, "2호선: 외선순환", ["c", "b", "a"])
    branch = pat(1, "2호선 성수지선: x → y", ["x", "y"])
    spec = {"id": "line2"}
    assert _canonical_pair(spec, [branch, inner, outer]) == [outer, inner]
    spec8 = {"id": "line8"}
    fwd = pat(7, "8호선: 별내 → 모란", ["별내", "모란"])
    rev = pat(8, "8호선: 모란 → 별내", ["모란", "별내"])
    assert _canonical_pair(spec8, [rev, fwd]) == [fwd, rev]


def test_mirror_pattern_reverses_chainage_and_geometry():
    long = {"id": "l:up:1", "stops": ["a", "b", "c"],
            "chainage_km": [0.0, 1.0, 3.0], "distance_km": 3.0,
            "distance_method": "geometry", "geometry": [[0, 0], [1, 0], [3, 0]]}
    short = {"id": "l:down:2", "stops": ["c", "b", "a"],
             "chainage_km": [0.0, 0.5, 1.0], "distance_km": 1.0,
             "distance_method": "geometry", "geometry": [[3, 0], [1, 0]]}
    _mirror_pattern(short, long)
    assert short["chainage_km"] == [0.0, 2.0, 3.0]
    assert short["distance_km"] == 3.0
    assert short["geometry"] == [[3, 0], [1, 0], [0, 0]]
    assert short["mirrored_from"] == "l:up:1"


FIXTURE_OSM = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="pytest-fixture">
  <node id="1" lat="37.5000000" lon="127.0000000">
    <tag k="name" v="김역"/>
    <tag k="railway" v="stop_position"/>
  </node>
  <node id="2" lat="37.5100000" lon="127.0100000">
    <tag k="name" v="이역"/>
    <tag k="public_transport" v="stop_position"/>
  </node>
  <node id="3" lat="37.5200000" lon="127.0200000"/>
  <node id="4" lat="37.5000000" lon="127.0050000"/>
  <way id="10">
    <nd ref="1"/><nd ref="4"/><nd ref="3"/>
    <tag k="railway" v="subway"/>
  </way>
  <way id="11">
    <nd ref="3"/><nd ref="2"/>
    <tag k="railway" v="subway"/>
  </way>
  <relation id="100">
    <member type="node" ref="1" role="stop"/>
    <member type="node" ref="2" role="stop"/>
    <member type="way" ref="10" role=""/>
    <member type="way" ref="11" role=""/>
    <tag k="type" v="route"/>
    <tag k="route" v="subway"/>
    <tag k="name" v="서울 지하철 9호선: 김역 → 이역"/>
  </relation>
</osm>
"""


def test_build_network_on_fixture(tmp_path):
    osm_file = tmp_path / "fixture.osm"
    osm_file.write_text(FIXTURE_OSM, encoding="utf-8")
    network = build_network(osm_file, osm_file, None)
    assert [line["id"] for line in network["lines"]] == ["line9"]
    line = network["lines"][0]
    assert [s["name"] for s in line["stops"]] == ["김", "이"]
    assert len(line["patterns"]) == 1
    pat = line["patterns"][0]
    assert pat["direction"] == "toward"
    assert pat["distance_km"] > 0
    assert len(pat["geometry"]) >= 2


@needs_raw
def test_real_pbf_demo_stations_and_transfers():
    rel_file, mem_file = ensure_prefilter(RAW_PBF, CACHE_DIR,
                                          osmium_bin="osmium")
    network = build_network(rel_file, mem_file, None)
    by_id = {line["id"]: line for line in network["lines"]}
    assert {"line2", "line8", "line9", "bundang", "sinbundang"} <= set(by_id)
    names = {lid: [s["name"] for s in line["stops"]]
             for lid, line in by_id.items()}
    assert "잠실" in names["line2"] and "강남" in names["line2"]
    assert "강남" in names["sinbundang"] and "판교" in names["sinbundang"]
    # The 강남 transfer joins 2호선 and the 신분당선.
    gangnam = next(t for t in network["transfers"] if t["key"] == "강남")
    assert set(gangnam["lines"]) >= {"line2", "sinbundang"}
    # 잠실→강남 runs on the 내선 pattern in stop order …
    inner = next(p for p in by_id["line2"]["patterns"]
                 if p["direction"] == "inner")
    stop_names = {s["id"]: s["name"] for s in by_id["line2"]["stops"]}
    order = [stop_names[i] for i in inner["stops"]]
    assert order.index("잠실") < order.index("강남")
    assert order[order.index("잠실"):order.index("강남") + 1] == [
        "잠실", "잠실새내", "종합운동장", "삼성", "선릉", "역삼", "강남"]
    # … and 강남→판교 on the 신분당선 in stop order.
    sin = by_id["sinbundang"]
    sin_names = {s["id"]: s["name"] for s in sin["stops"]}
    fwd = next(p for p in sin["patterns"]
               if [sin_names[i] for i in p["stops"]].index("강남")
               < [sin_names[i] for i in p["stops"]].index("판교"))
    journey = [sin_names[i] for i in fwd["stops"]]
    assert journey[journey.index("강남"):journey.index("판교") + 1] == [
        "강남", "양재", "양재시민의숲", "청계산입구", "판교"]
    # Geometry-backed distances on the demo legs.
    assert inner["distance_method"] == "geometry"
    assert fwd["distance_method"] == "geometry"


@needs_raw
def test_real_pbf_deterministic():
    rel_file, mem_file = ensure_prefilter(RAW_PBF, CACHE_DIR,
                                          osmium_bin="osmium")
    first = build_network(rel_file, mem_file, None)
    second = build_network(rel_file, mem_file, None)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
