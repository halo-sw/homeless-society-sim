"""Unit tests for pipeline.building_join on synthetic footprints.

Covers the documented overlap match rule, the height-source priority and
the seeded inference. No shapefiles are touched: register records are plain
dicts, and ``join_area`` is exercised with an empty file list (OSM-only) or
a monkeypatched ``stream_register``.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from shapely.geometry import Polygon

from pipeline import building_join
from pipeline.building_join import (
    infer_height,
    join_area,
    match_buildings,
)

LON0, LAT0 = 127.0, 37.5


def _square(lon: float, lat: float, side_deg: float) -> Polygon:
    return Polygon(
        [
            (lon, lat),
            (lon + side_deg, lat),
            (lon + side_deg, lat + side_deg),
            (lon, lat + side_deg),
        ]
    )


def _osm_building(
    bid: str,
    poly: Polygon,
    building: str | None = "apartments",
    height_m: float | None = None,
    levels: int | None = None,
    name: str | None = None,
) -> dict:
    return {
        "id": bid,
        "osm_kind": "way",
        "osm_id": int(bid[1:]),
        "building": building,
        "name": name,
        "height_m": height_m,
        "levels": levels,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[list(c) for c in poly.exterior.coords]],
        },
    }


def _register(
    rid: str,
    poly: Polygon,
    height: float | None = None,
    floors_above: int | None = None,
    use: str | None = "공동주택",
    name: str | None = None,
) -> dict:
    return {
        "id": rid,
        "region": "test-region",
        "shape_index": 0,
        "height": height,
        "floors_above": floors_above,
        "floors_below": None,
        "use_code": None,
        "use": use,
        "structure_code": None,
        "structure": None,
        "name": name,
        "sub_name": None,
        "footprint_area": None,
        "approval_date": None,
        "address": None,
        "lot": None,
        "geometry_wgs84": poly,
    }


AREA_DEF = {
    "id": "testbox",
    "kind": "bbox",
    "bbox": [126.99, 37.49, 127.01, 37.51],
    "center": [LON0, LAT0],
}


# --- match rule -----------------------------------------------------------


def test_match_identical_footprints() -> None:
    poly = _square(LON0, LAT0, 0.0002)
    matches = match_buildings(
        [_osm_building("w1", poly)], [_register("reg:a", poly)]
    )
    assert list(matches) == ["w1"]
    assert matches["w1"]["id"] == "reg:a"


def test_match_small_osm_inside_large_register_via_min_cover() -> None:
    # IoU ~ 0.01 (below 0.25) but intersection/min-area ~ 1.0 (>= 0.50).
    osm_poly = _square(LON0, LAT0, 0.0001)
    reg_poly = _square(LON0 - 0.0005, LAT0 - 0.0005, 0.0012)
    matches = match_buildings(
        [_osm_building("w1", osm_poly)], [_register("reg:big", reg_poly)]
    )
    assert list(matches) == ["w1"]


def test_no_match_when_disjoint() -> None:
    osm_poly = _square(LON0, LAT0, 0.0002)
    reg_poly = _square(LON0 + 0.01, LAT0 + 0.01, 0.0002)
    assert (
        match_buildings(
            [_osm_building("w1", osm_poly)], [_register("reg:far", reg_poly)]
        )
        == {}
    )


def test_no_match_on_slight_overlap() -> None:
    # ~10 % overlap: IoU ~ 0.05 and cover ~ 0.1, both below the thresholds.
    side = 0.0002
    osm_poly = _square(LON0, LAT0, side)
    reg_poly = _square(LON0 + side * 0.9, LAT0, side)
    assert (
        match_buildings(
            [_osm_building("w1", osm_poly)], [_register("reg:edge", reg_poly)]
        )
        == {}
    )


def test_match_is_one_to_one_first_claim_wins() -> None:
    poly = _square(LON0, LAT0, 0.0002)
    other = _square(LON0 + 0.00002, LAT0, 0.0002)  # near-identical twin
    matches = match_buildings(
        [_osm_building("w1", poly), _osm_building("w2", other)],
        [_register("reg:one", poly)],
    )
    assert list(matches) == ["w1"]  # lower id claims the register polygon


def test_match_prefers_best_iou() -> None:
    osm_poly = _square(LON0, LAT0, 0.0002)
    good = _square(LON0, LAT0, 0.0002)
    shifted = _square(LON0 + 0.00005, LAT0, 0.0002)
    matches = match_buildings(
        [_osm_building("w1", osm_poly)],
        [_register("reg:shifted", shifted), _register("reg:exact", good)],
    )
    assert matches["w1"]["id"] == "reg:exact"


def test_match_empty_register() -> None:
    assert match_buildings([_osm_building("w1", _square(LON0, LAT0, 0.0002))], []) == {}


# --- height-source priority (OSM-only join) --------------------------------


def _osm_only_join(buildings: list[dict]) -> dict:
    osm = {"buildings": buildings, "roads": [], "pois": [],
           "landuse": [], "trees": []}
    return join_area("testbox", AREA_DEF, osm, [])


def test_height_priority_osm_height_first() -> None:
    payload = _osm_only_join(
        [_osm_building("w1", _square(LON0, LAT0, 0.0002),
                       height_m=12.5, levels=5)]
    )
    (b,) = payload["buildings"]
    assert (b["height_m"], b["height_source"], b["levels"]) == (12.5, "osm_height", 5)


def test_height_priority_levels_then_inferred() -> None:
    payload = _osm_only_join(
        [
            _osm_building("w1", _square(LON0, LAT0, 0.0002), levels=4),
            _osm_building("w2", _square(LON0 + 0.001, LAT0, 0.0002)),
        ]
    )
    by_id = {b["id"]: b for b in payload["buildings"]}
    assert (by_id["w1"]["height_m"], by_id["w1"]["height_source"]) == (12.0, "osm_levels")
    assert by_id["w2"]["height_source"] == "inferred"
    assert payload["meta"]["register_coverage"] == "none"


def test_invalid_osm_height_falls_through() -> None:
    payload = _osm_only_join(
        [
            _osm_building("w1", _square(LON0, LAT0, 0.0002),
                          height_m=-3.0, levels=2),
            _osm_building("w2", _square(LON0 + 0.001, LAT0, 0.0002),
                          height_m=1500.0),
        ]
    )
    by_id = {b["id"]: b for b in payload["buildings"]}
    assert by_id["w1"]["height_source"] == "osm_levels"
    assert by_id["w2"]["height_source"] == "inferred"


def test_osm_only_join_is_deterministic() -> None:
    buildings = [
        _osm_building("w1", _square(LON0, LAT0, 0.0002)),
        _osm_building("w2", _square(LON0 + 0.001, LAT0, 0.0003),
                      building="house"),
    ]
    first = _osm_only_join(buildings)
    second = _osm_only_join(buildings)
    assert first == second


# --- register paths (monkeypatched stream) ---------------------------------


def _join_with_register(
    monkeypatch: pytest.MonkeyPatch,
    osm_buildings: list[dict],
    register: list[dict],
) -> dict:
    monkeypatch.setattr(
        building_join, "stream_register", lambda shp_files, bbox: register
    )
    osm = {"buildings": osm_buildings, "roads": [], "pois": [],
           "landuse": [], "trees": []}
    return join_area(
        "testbox", AREA_DEF, osm, [("test-region", Path("dummy.shp"))]
    )


def test_register_only_building_added_with_own_footprint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reg_poly = _square(LON0 + 0.005, LAT0, 0.0002)
    payload = _join_with_register(
        monkeypatch, [], [_register("reg:solo", reg_poly, height=21.0,
                                    name="Solo Block")]
    )
    (b,) = payload["buildings"]
    assert b["origin"] == "register"
    assert b["height_source"] == "register_height"
    assert b["height_m"] == 21.0
    assert b["name"] == "Solo Block"
    assert b["geometry"]["type"] == "Polygon"
    assert payload["meta"]["register_coverage"] == "full"
    assert payload["meta"]["counts"]["register_only"] == 1


def test_joined_building_takes_register_height_and_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    poly = _square(LON0, LAT0, 0.0002)
    payload = _join_with_register(
        monkeypatch,
        [_osm_building("w1", poly)],
        [_register("reg:m", poly, height=33.0, floors_above=10,
                   name="Matched Block")],
    )
    (b,) = payload["buildings"]
    assert b["origin"] == "joined"
    assert b["register_id"] == "reg:m"
    assert (b["height_m"], b["height_source"]) == (33.0, "register_height")
    assert b["name"] == "Matched Block"
    assert b["levels"] == 10


def test_register_floors_used_when_no_register_height(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reg_poly = _square(LON0 + 0.005, LAT0, 0.0002)
    payload = _join_with_register(
        monkeypatch, [], [_register("reg:f", reg_poly, floors_above=3)]
    )
    (b,) = payload["buildings"]
    assert (b["height_m"], b["height_source"]) == (9.0, "register_floors")


def test_osm_height_beats_register_height(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    poly = _square(LON0, LAT0, 0.0002)
    payload = _join_with_register(
        monkeypatch,
        [_osm_building("w1", poly, height_m=7.5)],
        [_register("reg:m", poly, height=33.0)],
    )
    (b,) = payload["buildings"]
    assert (b["height_m"], b["height_source"]) == (7.5, "osm_height")


# --- seeded inference -------------------------------------------------------


def test_infer_height_deterministic_and_shaped() -> None:
    first = infer_height("apartments", 100.0, "testbox", "w1")
    second = infer_height("apartments", 100.0, "testbox", "w1")
    assert first == second
    height, floors = first
    assert 3 <= floors <= 15
    assert height == pytest.approx(floors * 3.0)


def test_infer_height_area_bump_and_cap() -> None:
    height, floors = infer_height("yes", 3000.0, "testbox", "wbig")
    assert 6 <= floors <= 9  # base 1-4 plus the >2000 m2 bump of +5
    assert height == pytest.approx(floors * 3.0)
    assert infer_height("house", 100.0, "testbox", "whouse")[1] <= 2
