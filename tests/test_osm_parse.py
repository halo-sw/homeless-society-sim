"""Unit tests for pipeline.osm_parse on small synthetic OSM fixtures.

No raw data needed: fixtures are tiny inline ``.osm`` XML files parsed with
the real pyosmium code path (``parse_pbf`` accepts any osmium-readable file).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pipeline import osm_parse
from pipeline.osm_parse import (
    _landuse_kind,
    _parse_float,
    _parse_int,
    _poi_category,
    parse_pbf,
)

FIXTURE_OSM = """<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="pytest-fixture">
  <node id="1" lat="37.3944000" lon="127.1111000"/>
  <node id="2" lat="37.3944000" lon="127.1121000"/>
  <node id="3" lat="37.3954000" lon="127.1121000"/>
  <node id="4" lat="37.3954000" lon="127.1111000"/>
  <node id="5" lat="37.3949000" lon="127.1116000">
    <tag k="name" v="Test Station"/>
    <tag k="railway" v="station"/>
  </node>
  <node id="6" lat="37.3948000" lon="127.1117000">
    <tag k="name" v="Uncategorised Place"/>
  </node>
  <node id="7" lat="37.3947000" lon="127.1118000">
    <tag k="natural" v="tree"/>
  </node>
  <node id="8" lat="37.3946000" lon="127.1119000">
    <tag k="amenity" v="cafe"/>
  </node>
  <node id="10" lat="37.3940000" lon="127.1110000"/>
  <node id="11" lat="37.3940000" lon="127.1120000"/>
  <node id="12" lat="37.3941000" lon="127.1120000"/>
  <node id="13" lat="37.3941000" lon="127.1110000"/>
  <node id="20" lat="37.3960000" lon="127.1130000"/>
  <node id="21" lat="37.3960000" lon="127.1140000"/>
  <node id="22" lat="37.3970000" lon="127.1140000"/>
  <node id="23" lat="37.3970000" lon="127.1130000"/>
  <way id="100">
    <nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
    <tag k="building" v="apartments"/>
    <tag k="building:levels" v="5"/>
    <tag k="height" v="15 m"/>
    <tag k="name" v="Fixture Apartments"/>
  </way>
  <way id="200">
    <nd ref="10"/><nd ref="11"/>
    <tag k="highway" v="residential"/>
    <tag k="name" v="Fixture-ro"/>
    <tag k="oneway" v="yes"/>
    <tag k="lanes" v="2"/>
  </way>
  <way id="201">
    <nd ref="12"/><nd ref="13"/>
    <tag k="highway" v="tertiary"/>
    <tag k="oneway" v="-1"/>
  </way>
  <way id="202">
    <nd ref="10"/><nd ref="11"/><nd ref="12"/><nd ref="13"/><nd ref="10"/>
    <tag k="highway" v="pedestrian"/>
    <tag k="name" v="Fixture Square"/>
  </way>
  <way id="204">
    <nd ref="10"/><nd ref="11"/><nd ref="12"/><nd ref="13"/><nd ref="10"/>
    <tag k="highway" v="pedestrian"/>
    <tag k="area" v="yes"/>
    <tag k="name" v="Fixture Plaza"/>
  </way>
  <way id="203">
    <nd ref="12"/><nd ref="10"/>
    <tag k="highway" v="service"/>
    <tag k="access" v="private"/>
    <tag k="foot" v="yes"/>
  </way>
  <way id="205">
    <nd ref="20"/><nd ref="21"/>
    <tag k="highway" v="trunk"/>
    <tag k="motorroad" v="yes"/>
    <tag k="name" v="Fixture Expressway"/>
  </way>
  <way id="300">
    <nd ref="20"/><nd ref="21"/><nd ref="22"/><nd ref="23"/><nd ref="20"/>
  </way>
  <relation id="400">
    <member type="way" ref="300" role="outer"/>
    <tag k="type" v="multipolygon"/>
    <tag k="building" v="school"/>
    <tag k="name" v="Fixture School"/>
  </relation>
</osm>
"""


@pytest.fixture(scope="module")
def parsed(tmp_path_factory: pytest.TempPathFactory) -> dict:
    path = tmp_path_factory.mktemp("osm") / "fixture.osm"
    path.write_text(FIXTURE_OSM, encoding="utf-8")
    return parse_pbf(path)


def test_building_way_footprint_and_tags(parsed: dict) -> None:
    buildings = {b["id"]: b for b in parsed["buildings"]}
    apt = buildings["w100"]
    assert apt["building"] == "apartments"
    assert apt["name"] == "Fixture Apartments"
    assert apt["levels"] == 5
    assert apt["height_m"] == pytest.approx(15.0)
    assert apt["geometry"]["type"] == "Polygon"
    ring = apt["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1]  # closed footprint
    assert len(ring) == 5


def test_multipolygon_relation_building(parsed: dict) -> None:
    buildings = {b["id"]: b for b in parsed["buildings"]}
    school = buildings["r400"]
    assert school["osm_kind"] == "relation"
    assert school["building"] == "school"
    assert school["name"] == "Fixture School"
    assert school["geometry"]["type"] in ("Polygon", "MultiPolygon")


def test_road_oneway_variants(parsed: dict) -> None:
    roads = {r["id"]: r for r in parsed["roads"]}
    assert roads["w200"]["oneway"] is True
    assert roads["w200"]["oneway_reverse"] is False
    assert roads["w200"]["lanes"] == 2
    assert roads["w201"]["oneway"] is True
    assert roads["w201"]["oneway_reverse"] is True


def test_closed_highway_loop_stays_road(parsed: dict) -> None:
    roads = {r["id"]: r for r in parsed["roads"]}
    square = roads["w202"]
    assert square["highway"] == "pedestrian"
    assert square["geometry"]["type"] == "LineString"
    assert square["oneway"] is False


def test_area_yes_surface_flagged_on_road(parsed: dict) -> None:
    roads = {r["id"]: r for r in parsed["roads"]}
    assert roads["w204"]["area"] is True  # plaza surface, kept for rendering
    assert roads["w200"]["area"] is False  # ordinary linear way
    assert roads["w202"]["area"] is False  # closed loop without area=yes


def test_motorroad_flagged_on_road(parsed: dict) -> None:
    roads = {r["id"]: r for r in parsed["roads"]}
    assert roads["w205"]["motorroad"] is True
    assert roads["w200"]["motorroad"] is False


def test_road_access_tags_kept(parsed: dict) -> None:
    roads = {r["id"]: r for r in parsed["roads"]}
    assert roads["w203"]["access"] == {"access": "private", "foot": "yes"}


def test_named_poi_nodes_only(parsed: dict) -> None:
    pois = {p["id"]: p for p in parsed["pois"]}
    assert pois["n5"]["name"] == "Test Station"
    assert pois["n5"]["category"] == "railway:station"
    assert pois["n5"]["geometry"]["type"] == "Point"
    # Named but uncategorised, and categorised but unnamed, are not POIs.
    assert "n6" not in pois
    assert "n8" not in pois


def test_tree_nodes(parsed: dict) -> None:
    trees = {t["id"]: t for t in parsed["trees"]}
    assert "n7" in trees
    assert trees["n7"]["geometry"]["type"] == "Point"


def test_counts_match_lists(parsed: dict) -> None:
    counts = parsed["meta"]["counts"]
    for key in ("buildings", "roads", "pois", "landuse", "trees"):
        assert counts[key] == len(parsed[key])


def test_parse_is_deterministic(tmp_path: Path) -> None:
    path = tmp_path / "fixture.osm"
    path.write_text(FIXTURE_OSM, encoding="utf-8")
    assert parse_pbf(path) == parse_pbf(path)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("12", 12.0),
        ("12 m", 12.0),
        ("12m", 12.0),
        (" 9.1 M ", 9.1),
        ("1,234.5", 1234.5),
        ("unknown", None),
        ("", None),
        (None, None),
    ],
)
def test_parse_float_variants(text: str | None, expected: float | None) -> None:
    assert _parse_float(text) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [("3", 3), ("3;4", 3), (" 2 ", 2), ("x", None), (None, None)],
)
def test_parse_int_variants(text: str | None, expected: int | None) -> None:
    assert _parse_int(text) == expected


def test_poi_category_priority() -> None:
    assert _poi_category({"railway": "station", "name": "x"}) == "railway:station"
    assert _poi_category({"shop": "no"}) is None
    assert _poi_category({}) is None


def test_landuse_kind() -> None:
    assert _landuse_kind({"landuse": "residential"}) == "landuse:residential"
    assert _landuse_kind({"leisure": "park"}) == "leisure:park"
    assert _landuse_kind({"natural": "water"}) == "natural:water"
    assert _landuse_kind({"leisure": "sauna"}) is None
    assert _landuse_kind({}) is None


def test_roundtrip_write_read(tmp_path: Path, parsed: dict) -> None:
    out = osm_parse.write_osm_json(parsed, tmp_path / "osm.json")
    assert out.exists()
    import json

    assert json.loads(out.read_text(encoding="utf-8"))["meta"] == parsed["meta"]
