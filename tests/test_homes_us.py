"""Stage 26b US homes (OSM + Zillow ZORI). Fixtures only, no real PBF/CSV."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import pipeline.extract as extract_mod
import pipeline.graph as graph_mod
import pipeline.osm_parse as osm_parse_mod
from pipeline.areas import US_RAW_PBF
from pipeline.homes_us import (build_us_homes, load_zori, nearest_address,
                               run_us_homes, zip_for)
from pipeline.scene import run_scene

LON0, LAT0 = -122.14823, 37.48485
ZORI = {"94025": {"monthly_usd": 4500, "month": "2026-09"}}

ZORI_CSV = """RegionID,SizeRank,RegionName,RegionType,StateName,State,City,Metro,CountyName,2026-07-31,2026-08-31,2026-09-30
1,1,94025,zip,California,CA,Menlo Park,San Jose,San Mateo,4500,4525,
2,2,94026,zip,California,CA,Menlo Park,San Jose,San Mateo,3000,,3100
3,3,94027,zip,California,CA,Atherton,San Jose,San Mateo,,,
"""


def test_load_zori_latest_non_empty(tmp_path: Path) -> None:
    csv_path = tmp_path / "zori.csv"
    csv_path.write_text(ZORI_CSV, encoding="utf-8")
    zori = load_zori(csv_path)
    assert zori["94025"] == {"monthly_usd": 4525, "month": "2026-08"}
    assert zori["94026"] == {"monthly_usd": 3100, "month": "2026-09"}
    assert "94027" not in zori


def test_zip_for_nearest_and_default() -> None:
    points = [(LON0, LAT0, "94025")]
    assert zip_for(LON0, LAT0 + 0.001, points) == ("94025", "osm_nearest")
    assert zip_for(0.0, 0.0, points) == ("94025", "default")


def _sq(lon: float, lat: float, half: float = 0.00009) -> list:
    return [[lon - half, lat - half], [lon + half, lat - half],
            [lon + half, lat + half], [lon - half, lat + half],
            [lon - half, lat - half]]


def _building(bid: str, building: str, name: str | None,
              lon: float, lat: float) -> dict:
    rec = {"id": bid, "building": building,
           "geometry": {"type": "Polygon",
                        "coordinates": [_sq(lon, lat)]}}
    if name is not None:
        rec["name"] = name
    return rec


def _write(area_dir: Path, name: str, payload: dict) -> None:
    area_dir.mkdir(parents=True, exist_ok=True)
    (area_dir / name).write_text(json.dumps(payload, ensure_ascii=False),
                                 encoding="utf-8")


def _write_area(area_dir: Path) -> None:
    _write(area_dir, "buildings.json", {"buildings": [
        _building("b1", "apartments", "Live Oak Apartments",
                  LON0 + 0.001, LAT0 + 0.00010),
        _building("b2", "apartments", "Live Oak Apartments",
                  LON0 + 0.001, LAT0 + 0.00055),
        _building("b3", "residential", "Building A",
                  LON0 + 0.002, LAT0),
        _building("b4", "apartments", None, LON0 + 0.003, LAT0),
        _building("b5", "dormitory", "Grad Housing",
                  LON0 + 0.004, LAT0),
    ]})
    _write(area_dir, "area.json", {
        "area": "us-menlo",
        "roads": [{"id": "w1", "highway": "residential", "name": "Oak Ave",
                   "geometry": {"type": "LineString",
                                "coordinates": [[LON0, LAT0],
                                                [LON0 + 0.004, LAT0]]}}],
        "pois": [{"id": "s1", "name": "Menlo Park",
                  "category": "railway:station",
                  "geometry": {"type": "Point",
                               "coordinates": [LON0 + 0.001, LAT0]}}],
        "workplaces": [{"id": "meta-hq", "lon": LON0, "lat": LAT0}],
    })
    nodes = {f"n{i}": [LON0 + i * 0.001, LAT0] for i in range(4)}
    walk, bike = [], []
    for i in range(3):
        for edges in (walk, bike):
            edges.append({"from": f"n{i}", "to": f"n{i + 1}",
                          "length_m": 88.0})
            edges.append({"from": f"n{i + 1}", "to": f"n{i}",
                          "length_m": 88.0})
    _write(area_dir, "graph.json",
           {"nodes": nodes,
            "edges": {"walk": walk, "bike": bike, "drive": []}})


def test_build_us_homes_grouping_and_fields(tmp_path: Path) -> None:
    area_dir = tmp_path / "us-menlo"
    _write_area(area_dir)
    points = [(LON0 + 0.001, LAT0, "94025")]
    homes = build_us_homes(area_dir, ZORI, points)

    assert [h["id"] for h in homes] == ["us-home-0001", "us-home-0002",
                                       "us-home-0003"]
    live, bldg_a, unnamed = homes
    assert live["name"] == "Live Oak Apartments"
    assert live["match"] == "osm_name"
    assert live["osm_name"] == "Live Oak Apartments"
    assert bldg_a["name"] == "Apartments on Oak Ave · 1"
    assert bldg_a["match"] == "osm"
    assert bldg_a["osm_name"] is None
    assert unnamed["name"] == "Apartments on Oak Ave · 2"
    assert not any(h["name"] == "Grad Housing" for h in homes)

    for h in homes:
        assert h["kind"] == "아파트"
        assert h["region"] == "us-menlo"
        assert h["scene"] == "us-menlo"
        assert h["currency"] == "USD"
        assert h["country"] == "US"
        assert h["build_year"] is None
        assert h["pnu"] is None
        monthly = h["buckets"][0]["wolse"]["monthly"]
        assert monthly["median_won"] == 4500
        assert monthly["min_won"] == 4500
        assert monthly["max_won"] == 4500
        assert h["price"]["zip"] == "94025"
        assert h["price"]["source"] == "zillow_zori_zip"
        assert isinstance(h["lon"], float) and isinstance(h["lat"], float)

    assert live["station"] == {"station": "Menlo Park",
                               "walk_minutes": 0.0}
    hq = live["work_targets"]["meta-hq"]
    assert hq["walk_m"] == 88.0
    assert hq["bike_m"] == 88.0
    assert hq["bike_minutes"] == round(88.0 / (15 / 3.6) / 60, 1)
    assert hq["bike_speed_kmh"] == 15
    assert hq["bike_speed_source"] == "assumed"


def test_nearest_address_near_and_far() -> None:
    addresses = [(LON0, LAT0, "12", "Bay Road")]
    assert nearest_address(LON0, LAT0 + 0.00009, addresses) == "12 Bay Road"
    assert nearest_address(LON0, LAT0 + 0.00060, addresses) is None


def test_nearest_address_inside_ring_wins() -> None:
    close = (LON0, LAT0 + 0.00009, "10", "Close Street")
    far_lat = LAT0 + 0.00027
    far = (LON0, far_lat, "30", "Far Street")
    ring = _sq(LON0, far_lat)
    assert nearest_address(LON0, LAT0, [close, far],
                           ring=ring) == "30 Far Street"


def test_build_us_homes_address_and_duplicates(tmp_path: Path) -> None:
    area_dir = tmp_path / "us-menlo"
    barch_lon = LON0 + 0.003
    b1_lat, b2_lat, b3_lat = LAT0 + 0.002, LAT0 + 0.001, LAT0
    _write(area_dir, "buildings.json", {"buildings": [
        _building("c1", "apartments", None, barch_lon, b1_lat),
        _building("c2", "apartments", None, barch_lon, b2_lat),
        _building("c3", "apartments", None, barch_lon, b3_lat),
    ]})
    _write(area_dir, "area.json", {
        "area": "us-menlo",
        "roads": [{"id": "w1", "highway": "residential", "name": "Bay Road",
                   "geometry": {"type": "LineString",
                                "coordinates": [[LON0, LAT0],
                                                [LON0 + 0.004, LAT0]]}}],
        "pois": [],
        "workplaces": [],
    })
    _write(area_dir, "graph.json",
           {"nodes": {}, "edges": {"walk": [], "bike": [], "drive": []}})
    points = [(barch_lon, b2_lat, "94025")]
    addresses = [(barch_lon, b1_lat + 0.000045, "12", "Bay Road")]
    homes = build_us_homes(area_dir, ZORI, points, addresses=addresses)

    assert homes[0]["name"] == "12 Bay Road"
    assert homes[0]["match"] == "osm_address"
    rest = sorted(homes[1:], key=lambda h: -h["lat"])
    assert rest[0]["name"] == "Apartments on Bay Road · 1"
    assert rest[1]["name"] == "Apartments on Bay Road · 2"
    assert len({h["name"] for h in homes}) == 3


def test_run_us_homes_summary_and_idempotent(tmp_path: Path) -> None:
    build_dir = tmp_path / "build"
    _write_area(build_dir / "us-menlo")
    raw_dir = tmp_path / "raw"
    zdir = raw_dir / "us" / "zillow"
    zdir.mkdir(parents=True)
    (zdir / "Zip_zori_uc_sfrcondomfr_sm_month.csv").write_text(
        ZORI_CSV, encoding="utf-8")
    summary_path = build_dir / "homes" / "summary.json"
    summary_path.parent.mkdir(parents=True)
    gangnam = {"homes": 5, "by_kind": {"아파트": 5}}
    summary_path.write_text(
        json.dumps({"regions": {"gangnam": gangnam}, "total": 5},
                   ensure_ascii=False), encoding="utf-8")

    report = run_us_homes(build_dir=build_dir, raw_dir=raw_dir)
    assert report["homes"] == 3
    assert report["dropped_no_zori"] == 0

    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary["regions"] == {"gangnam": gangnam}
    assert summary["total"] == 5
    assert summary["other_regions"]["us-menlo"] == {
        "homes": 3, "country": "US", "currency": "USD"}
    doc = json.loads(
        (build_dir / "homes" / "us-menlo.json").read_text(encoding="utf-8"))
    assert doc["region"] == "us-menlo"
    assert doc["country"] == "US"
    assert doc["currency"] == "USD"
    assert len(doc["homes"]) == 3

    before = summary_path.read_text(encoding="utf-8")
    run_us_homes(build_dir=build_dir, raw_dir=raw_dir)
    after = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary_path.read_text(encoding="utf-8") == before
    assert list(after["other_regions"]) == ["us-menlo"]


def test_graph_run_build_uses_us_raw_pbf(tmp_path: Path,
                                         monkeypatch) -> None:
    area_dir = tmp_path / "us-menlo"
    area_dir.mkdir()
    (area_dir / "area_def.json").write_text(json.dumps({
        "id": "us-menlo", "kind": "bbox",
        "bbox": [-122.190, 37.450, -122.125, 37.492],
        "country": "US"}), encoding="utf-8")
    (area_dir / "osm.json").write_text(json.dumps({}), encoding="utf-8")

    seen: dict = {}

    def _fake_extract(area_id, **kwargs):
        seen["area_id"] = area_id
        seen["kwargs"] = kwargs
        return {"buffered": True, "extract": "dummy"}

    monkeypatch.setattr(extract_mod, "ensure_buffered_extract",
                        _fake_extract)
    monkeypatch.setattr(osm_parse_mod, "parse_pbf", lambda path: {})
    meta = {"counts": {"nodes": 1, "walk_edges": 0, "bike_edges": 0,
                       "drive_edges": 0},
            "walk_lcc": {"share": 1.0}, "walk_lcc_box": {"share": 1.0},
            "walk_lcc_buffered": {"share": 1.0},
            "walk_lcc_clipped_raw": {"share": 1.0}, "method": "buffered"}
    monkeypatch.setattr(
        graph_mod, "build_buffered_graph",
        lambda area_id, osm, buffered_osm, bbox: {
            "meta": meta, "nodes": {}, "edges": {}})

    graph_mod.run_build(area_dir)
    assert seen["area_id"] == "us-menlo"
    assert seen["kwargs"]["raw_pbf"] == US_RAW_PBF


def test_scene_run_scene_us_menlo_known(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        run_scene("us-menlo", tmp_path)
