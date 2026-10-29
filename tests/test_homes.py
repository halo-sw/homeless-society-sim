"""Tests for pipeline/homes.py (stage 12a, Part B)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from shapely.geometry import Polygon

from pipeline.homes import (
    bucket_center,
    bucketize,
    build_homes_index,
    build_pnu_index,
    containing_box,
    match_row,
    nearest_station_walk,
    parse_pnu,
    parse_rtms_file,
)

REPO = Path(__file__).resolve().parents[1]
RTMS_DIR = REPO / "data" / "raw" / "rtms"


def _reg(rec_id, pnu, address, lot, cx=127.1, cy=37.5, approval="2010-05-01"):
    return {"id": rec_id, "pnu": pnu, "address": address, "lot": lot,
            "approval_date": approval,
            "geometry_wgs84": Polygon([(cx - 0.0001, cy - 0.0001),
                                       (cx + 0.0001, cy - 0.0001),
                                       (cx + 0.0001, cy + 0.0001),
                                       (cx - 0.0001, cy + 0.0001)])}


def test_parse_pnu_slices():
    p = parse_pnu("1171010700109130000")
    assert (p["bjdong"], p["bon"], p["bu"]) == ("1171010700", "0913", "0000")
    assert parse_pnu("short") is None
    assert parse_pnu(None) is None


def test_match_row_exact_and_land_type_agnostic():
    recs = [
        _reg("r1", "1171010700109130000", "서울특별시 송파구 가락동", "913"),
        # 산 번지: land digit 2, same bon/bu — still matches.
        _reg("r2", "1171010700209130000", "서울특별시 송파구 가락동", "산913"),
    ]
    index = build_pnu_index(recs)
    hits, pnu = match_row({"sigungu": "서울특별시 송파구 가락동",
                           "bonbun": "0913", "bubun": "0000"}, index)
    assert len(hits) == 2 and pnu == "1171010700109130000"


def test_match_row_bubun_zero_and_padding():
    recs = [_reg("r1", "1120000000000010000", "서울특별시 성동구 행당동",
                 "1")]
    index = build_pnu_index(recs)
    # 부번 0 pads to 0000; 본번 "1" pads to 0001.
    hits, pnu = match_row({"sigungu": "서울특별시 성동구 행당동",
                           "bonbun": "1", "bubun": "0"}, index)
    assert len(hits) == 1 and pnu == "1120000000000010000"
    # Address mismatch never matches, even with equal numbers.
    hits, pnu = match_row({"sigungu": "서울특별시 성동구 성수동",
                           "bonbun": "1", "bubun": "0"}, index)
    assert hits == [] and pnu is None


def test_bucket_center_and_stats():
    assert bucket_center(59.97) == 60
    assert bucket_center(84.9) == 80
    rows = [
        {"area_m2": 59.0, "deal": "trade", "trade_won": 500_000_000},
        {"area_m2": 61.0, "deal": "trade", "trade_won": 600_000_000},
        {"area_m2": 59.5, "deal": "rent", "rent_kind": "jeonse",
         "deposit_won": 300_000_000},
        {"area_m2": 59.2, "deal": "rent", "rent_kind": "wolse",
         "deposit_won": 50_000_000, "monthly_won": 1_000_000},
        {"area_m2": None, "deal": "trade", "trade_won": 1},  # skipped
    ]
    buckets = bucketize(rows)
    assert len(buckets) == 1
    b = buckets[0]
    assert b["center_m2"] == 60 and b["range_m2"] == [55.0, 65.0]
    assert b["trade"] == {"count": 2, "median_won": 550_000_000,
                          "min_won": 500_000_000, "max_won": 600_000_000}
    assert b["jeonse"]["median_won"] == 300_000_000
    assert b["wolse"]["monthly"]["median_won"] == 1_000_000


def test_parse_rtms_file_cancels_and_kinds(tmp_path):
    text = ('"disclaimer line"\n'
            "시군구,본번,부번,단지명,전용면적(㎡),계약년월,계약일,"
            "거래금액(만원),보증금(만원),월세금(만원),전월세구분,"
            "건축년도,해제사유발생일\n"
            "서울특별시 송파구 잠실동,27,0,레이크팰리스,59.97,202601,15,"
            "120000,,,전세,2006,\n"
            "서울특별시 송파구 잠실동,27,0,레이크팰리스,59.97,202601,16,"
            "110000,,,전세,2006,2026-01-20\n")
    trade = tmp_path / "trade.csv"
    trade.write_text(text, encoding="cp949")
    rows = parse_rtms_file(trade, "apt", "trade")
    assert len(rows) == 1  # cancelled deal excluded
    assert rows[0]["trade_won"] == 1_200_000_000
    assert rows[0]["build_year"] == 2006
    rent = tmp_path / "rent.csv"
    rent.write_text(text, encoding="cp949")
    rows = parse_rtms_file(rent, "apt", "rent")
    assert len(rows) == 2  # rent files carry no 해제 column use
    assert rows[0]["rent_kind"] == "jeonse"


def _tiny_box():
    return {"id": "st-가상", "bbox": [127.09, 37.49, 127.11, 37.51],
            "graph": {"nodes": {"n1": [127.10, 37.50],
                                "n2": [127.105, 37.505]},
                      "edges": {"walk": [{"from": "n1", "to": "n2",
                                          "length_m": 780.0}]}},
            "stations": [{"name": "가상역", "category": "railway:subway_station",
                          "geometry": {"type": "Point",
                                       "coordinates": [127.105, 37.505]}}]}


def test_load_box_graphs_reads_station_categories(tmp_path):
    from pipeline.homes import load_box_graphs

    area_dir = tmp_path / "st-가상"
    area_dir.mkdir()
    (area_dir / "area_def.json").write_text(json.dumps(
        {"id": "st-가상", "kind": "bbox",
         "bbox": [127.09, 37.49, 127.11, 37.51]}))
    (area_dir / "area.json").write_text(json.dumps({
        "graph": {"nodes": {}, "edges": {}},
        "pois": [
            {"name": "가상역", "category": "railway:subway_station"},
            {"name": "버스정류장", "category": "public_transport:platform"},
        ]}))
    boxes = load_box_graphs(tmp_path)
    assert len(boxes) == 1
    assert [p["name"] for p in boxes[0]["stations"]] == ["가상역"]


def test_containing_box_picks_smallest():
    big = {"id": "big", "bbox": [127.0, 37.4, 127.2, 37.6]}
    small = {"id": "small", "bbox": [127.09, 37.49, 127.11, 37.51]}
    assert containing_box(127.10, 37.50, [big, small])["id"] == "small"
    assert containing_box(127.0, 37.0, [big, small]) is None


def test_nearest_station_walk_on_graph():
    hit = nearest_station_walk(127.10, 37.50, _tiny_box())
    assert hit["station"] == "가상역"
    assert hit["source"] == "graph"
    assert hit["walk_minutes"] == round(780.0 / 1.3 / 60, 1)
    # No stations -> null, never a straight-line guess.
    box = {**_tiny_box(), "stations": []}
    assert nearest_station_walk(127.10, 37.50, box) is None


def test_build_homes_index_groups_and_reports():
    recs = [_reg("r1", "1171010700109130000", "서울특별시 송파구 가락동",
                 "913", cx=127.10, cy=37.50)]
    rows = [
        {"sigungu": "서울특별시 송파구 가락동", "bonbun": "0913",
         "bubun": "0000", "complex": "헬리오시티", "area_m2": 59.0,
         "deal": "trade", "housing_type": "apt",
         "trade_won": 900_000_000, "build_year": 2018},
        {"sigungu": "서울특별시 송파구 가락동", "bonbun": "0913",
         "bubun": "0000", "complex": "헬리오시티", "area_m2": 84.0,
         "deal": "rent", "rent_kind": "jeonse", "housing_type": "apt",
         "deposit_won": 500_000_000, "monthly_won": 0,
         "build_year": 2018},
        {"sigungu": "서울특별시 송파구 가락동", "bonbun": "9999",
         "bubun": "0000", "complex": "없는단지", "area_m2": 59.0,
         "deal": "trade", "housing_type": "apt",
         "trade_won": 1, "build_year": None},
    ]
    photos = [{"lon": 127.1005, "lat": 37.5005},
              {"lon": 127.50, "lat": 37.90}]
    homes, report = build_homes_index({"songpa-gu": rows}, recs,
                                      [_tiny_box()], photos)
    assert len(homes) == 1
    home = homes[0]
    assert home["name"] == "헬리오시티"
    assert home["kind"] == "아파트"
    assert home["region"] == "songpa-gu"
    assert (home["lon"], home["lat"]) == (127.10, 37.50)
    assert home["build_year"] == 2018
    assert len(home["buckets"]) == 2
    assert home["scene"] == "st-가상"
    assert home["station"]["station"] == "가상역"
    assert home["photos_700m"] == 1
    rep = report["songpa-gu"]
    assert (rep["rows_read"], rep["rows_matched"]) == (3, 2)
    assert rep["matched_pct"] == round(2 / 3 * 100, 1)
    assert rep["unmatched_examples"][0]["complex"] == "없는단지"


def test_build_homes_index_outside_boxes_stays_null():
    recs = [_reg("r1", "1171010700109130000", "서울특별시 송파구 가락동",
                 "913", cx=127.00, cy=37.40)]
    rows = [{"sigungu": "서울특별시 송파구 가락동", "bonbun": "0913",
             "bubun": "0000", "complex": "헬리오시티", "area_m2": 59.0,
             "deal": "trade", "housing_type": "apt",
             "trade_won": 900_000_000, "build_year": 2018}]
    homes, _ = build_homes_index({"songpa-gu": rows}, recs, [_tiny_box()],
                                 [])
    assert homes[0]["scene"] is None
    assert homes[0]["station"] is None


def test_build_homes_index_wirye_filter():
    recs = [_reg("r1", "1171010700109130000", "서울특별시 송파구 가락동",
                 "913", cx=127.10, cy=37.50)]
    rows = [{"sigungu": "서울특별시 송파구 가락동", "bonbun": "0913",
             "bubun": "0000", "complex": "헬리오시티", "area_m2": 59.0,
             "deal": "trade", "housing_type": "apt",
             "trade_won": 900_000_000, "build_year": 2018}]
    homes, report = build_homes_index(
        {"wirye": rows}, recs, [], [],
        wirye_within=lambda lon, lat: False)
    assert homes == []
    assert report["wirye"]["groups_kept"] == 0
    homes, _ = build_homes_index(
        {"wirye": rows}, recs, [], [],
        wirye_within=lambda lon, lat: True)
    assert len(homes) == 1


@pytest.mark.skipif(not (RTMS_DIR / "apt_trade_songpa_2510-2610.csv").exists(),
                    reason="operator-provided RTMS absent")
def test_real_csv_bucket_medians_sane():
    rows = parse_rtms_file(RTMS_DIR / "apt_trade_songpa_2510-2610.csv",
                           "apt", "trade")
    assert len(rows) > 1000
    buckets = bucketize(rows)
    assert len(buckets) > 3
    for b in buckets:
        for key in ("trade", "jeonse"):
            stat = b[key]
            if stat:
                assert stat["min_won"] <= stat["median_won"] <= stat["max_won"]
                assert stat["count"] > 0


@pytest.mark.skipif(not (REPO / "data" / "build" / "homes-index.json").exists(),
                    reason="operator runs `pipeline homes` first")
def test_real_homes_index_shape():
    doc = json.loads(
        (REPO / "data" / "build" / "homes-index.json").read_text(
            encoding="utf-8"))
    assert len(doc["homes"]) > 1000
    for home in doc["homes"][:50]:
        assert home["kind"] in ("아파트", "연립·다세대", "오피스텔")
        assert home["buckets"]
        if home["station"] is not None:
            assert home["station"]["source"] == "graph"
            assert home["scene"] is not None


def _osm_poly(osm_id="w474304292", name="송파헬리오시티", cx=127.10,
              cy=37.50, dong="가락동"):
    from pipeline.osm_names import normalize_complex
    return {"osm_id": osm_id, "name": name,
            "norm": normalize_complex(name), "lon": cx, "lat": cy,
            "area_deg2": 1.0, "dong": dong, "district": "송파구",
            "kind": "landuse"}


def test_build_homes_index_osm_name_second_join():
    # Register knows nothing (부번 9999); OSM names the complex.
    rows = [
        {"sigungu": "서울특별시 송파구 가락동", "bonbun": "0913",
         "bubun": "9999", "complex": "헬리오시티", "area_m2": 59.0,
         "deal": "trade", "housing_type": "apt",
         "trade_won": 900_000_000, "build_year": 2018},
    ]
    recs = [_reg("r1", "1171010700109130000", "서울특별시 송파구 가락동",
                 "913", cx=127.00, cy=37.40)]
    homes, report = build_homes_index(
        {"songpa-gu": rows}, recs, [_tiny_box()], [],
        osm_polygons=[_osm_poly()])
    assert len(homes) == 1
    home = homes[0]
    assert home["match"] == "osm_name"
    assert home["pnu"] is None
    assert home["osm"] == {"id": "w474304292", "name": "송파헬리오시티"}
    assert (home["lon"], home["lat"]) == (127.10, 37.50)
    assert home["build_year"] == 2018  # RTMS only, no register year
    rep = report["songpa-gu"]
    assert (rep["rows_matched"], rep["rows_matched_osm"]) == (1, 1)
    assert rep["rows_matched_register"] == 0
    assert rep["groups_kept_osm"] == 1


def test_build_homes_index_register_wins_over_osm():
    recs = [_reg("r1", "1171010700109130000", "서울특별시 송파구 가락동",
                 "913", cx=127.00, cy=37.40)]
    rows = [{"sigungu": "서울특별시 송파구 가락동", "bonbun": "0913",
             "bubun": "0000", "complex": "헬리오시티", "area_m2": 59.0,
             "deal": "trade", "housing_type": "apt",
             "trade_won": 900_000_000, "build_year": 2018}]
    homes, _ = build_homes_index(
        {"songpa-gu": rows}, recs, [], [],
        osm_polygons=[_osm_poly()])
    assert homes[0]["match"] == "register"
    assert homes[0]["pnu"] == "1171010700109130000"
    assert homes[0]["osm"] is None


def test_build_homes_index_osm_respects_wirye_filter():
    recs = []
    rows = [{"sigungu": "서울특별시 송파구 장지동", "bonbun": "0001",
             "bubun": "0000", "complex": "래미안위례", "area_m2": 59.0,
             "deal": "trade", "housing_type": "apt",
             "trade_won": 1, "build_year": 2020}]
    polys = [_osm_poly(osm_id="w2", name="래미안위례", dong="장지동")]
    homes, _ = build_homes_index(
        {"wirye": rows}, recs, [], [], wirye_within=lambda lon, lat: False,
        osm_polygons=polys)
    assert homes == []
    homes, _ = build_homes_index(
        {"wirye": rows}, recs, [], [], wirye_within=lambda lon, lat: True,
        osm_polygons=polys)
    assert len(homes) == 1 and homes[0]["match"] == "osm_name"


def test_slim_home_and_indexes(tmp_path):
    from pipeline.homes import slim_home, write_slim_indexes

    home = {"id": "home-1", "name": "헬리오시티", "kind": "아파트",
            "housing_type": "apt", "region": "songpa-gu",
            "lon": 127.1, "lat": 37.5, "pnu": "11710",
            "footprints": 3, "build_year": 2018, "buckets": [{"center_m2": 60}],
            "station": {"station": "송파", "walk_minutes": 5,
                        "source": "graph"},
            "scene": "st-송파", "photos_700m": 9, "match": "osm_name",
            "osm": {"id": "w1", "name": "송파헬리오시티"}}
    slim = slim_home(home)
    assert slim["station"] == {"station": "송파", "walk_minutes": 5}
    assert slim["osm_name"] == "송파헬리오시티"
    # 12b: the browser joins picked homes to scene complexes via PNU
    # (same as the server's build_scenario), so slim keeps it.
    assert slim["pnu"] == "11710"
    for dropped in ("housing_type", "footprints", "photos_700m",
                    "osm"):
        assert dropped not in slim
    out = write_slim_indexes([home,
                              {**home, "id": "home-2", "region": "wirye",
                               "match": "register", "osm": None}],
                             tmp_path)
    assert out["summary"]["total"] == 2
    assert out["summary"]["regions"]["songpa-gu"]["by_match"] == {"osm_name": 1}
    assert (tmp_path / "homes" / "songpa-gu.json").exists()
    assert (tmp_path / "homes" / "summary.json").exists()
    assert out["total_bytes"] > 0
