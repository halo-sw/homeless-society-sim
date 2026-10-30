"""Unit tests for the stage-26a US area (us-menlo).

Fixtures only, no real PBF: resolve_area never scans, the region clip
is monkeypatched, and validate/area_build use synthetic area dirs.
"""

from __future__ import annotations

import json
from pathlib import Path

import pipeline.areas as areas_mod
import pipeline.extract as extract_mod
from pipeline.area_build import assemble_area
from pipeline.areas import is_us_area, resolve_area
from pipeline.scene import terrain_step
from pipeline.regions import run_us_regions
from pipeline.validate import (
    US_HEIGHT_WARNING,
    run_build as validate_run_build,
    validate_area,
)

US_BBOX = (-122.190, 37.450, -122.125, 37.492)
US_CENTER = (-122.14823, 37.48485)
LON0, LAT0 = US_CENTER


def _no_scan(monkeypatch) -> None:
    def _boom(*args, **kwargs):
        raise AssertionError("must not scan a PBF for a US area")

    monkeypatch.setattr(areas_mod, "build_candidate_extract", _boom)


def test_resolve_us_menlo_no_scan(monkeypatch) -> None:
    _no_scan(monkeypatch)
    area = resolve_area("us-menlo")
    assert area.kind == "bbox"
    assert area.bbox == US_BBOX
    assert area.center == US_CENTER
    assert area.country == "US"
    assert area.currency == "USD"
    assert area.station is None
    assert area.boundary is None
    assert area.workplaces == [
        {"id": "meta-hq", "name": "Meta HQ (1 Hacker Way)",
         "lon": -122.14823, "lat": 37.48485},
    ]


def test_is_us_area() -> None:
    assert is_us_area("us-menlo")
    assert not is_us_area("st-판교")


def _kr_region_entry() -> dict:
    return {
        "id": "bundang",
        "label": "성남시 분당구",
        "bbox": [127.0, 37.3, 127.2, 37.5],
        "boundary_names": ["분당구"],
        "sigungu": ["41135"],
        "rtms_districts": ["bundang"],
        "rtms_files": ["apt_trade_bundang_2510-2610.csv"],
        "safety": [{"column": "경기도 성남시", "level": "city"}],
        "relations": [{"name": "분당구", "relation_id": 1,
                       "admin_level": "7"}],
    }


def test_run_us_regions_merges_without_touching_kr(tmp_path, monkeypatch) -> None:
    raw = tmp_path / "norcal-latest.osm.pbf"
    raw.write_bytes(b"fake")
    regions_path = tmp_path / "regions.json"
    kr = _kr_region_entry()
    regions_path.write_text(
        json.dumps({"regions": [kr], "places": [], "wirye_note": "",
                    "rtms_suffix": "2510-2610"}, ensure_ascii=False),
        encoding="utf-8")

    def _fake_clip(binary, src, bbox, dst):
        assert tuple(bbox) == US_BBOX
        Path(dst).parent.mkdir(parents=True, exist_ok=True)
        Path(dst).write_bytes(b"fake-clip")
        return Path(dst)

    monkeypatch.setattr(extract_mod, "clip_bbox", _fake_clip)
    monkeypatch.setattr(extract_mod, "find_osmium", lambda explicit=None: "osmium")

    run_us_regions(raw_pbf=raw, build_dir=tmp_path)
    doc = json.loads(regions_path.read_text(encoding="utf-8"))
    assert doc["regions"][0] == kr  # KR region untouched
    us = next(r for r in doc["regions"] if r["id"] == "us-menlo")
    assert us["country"] == "US"
    assert us["currency"] == "USD"
    assert us["label"] == "Menlo Park · East Palo Alto"
    assert us["relations"] == []
    assert us["rtms_files"] == []
    assert us["safety"] == []
    assert (tmp_path / "_cache" / "regions" / "us-menlo.osm.pbf").exists()

    before = json.loads(regions_path.read_text(encoding="utf-8"))
    run_us_regions(raw_pbf=raw, build_dir=tmp_path)
    after = json.loads(regions_path.read_text(encoding="utf-8"))
    assert after == before  # second run replaces, never duplicates
    assert sum(1 for r in after["regions"] if r["id"] == "us-menlo") == 1


# --- validate fixtures (same style as tests/test_area_build_validate.py) ---


def _building(i: int, source: str) -> dict:
    return {
        "id": f"b{i:03d}",
        "origin": "joined",
        "height_m": 12.0,
        "height_source": source,
        "residential": "apartment",
        "levels": 4,
        "area_m2": 120.0,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[LON0, LAT0], [LON0 + 0.001, LAT0],
                             [LON0 + 0.001, LAT0 + 0.001], [LON0, LAT0]]],
        },
    }


def _connected_graph(n: int = 4) -> dict:
    nodes = {f"n{i:06d}": [LON0 + i * 0.001, LAT0] for i in range(n)}
    walk = [
        {"from": f"n{i:06d}", "to": f"n{i + 1:06d}", "way": 1,
         "highway": "residential", "name": None, "length_m": 88.0}
        for i in range(n - 1)
    ]
    walk += [
        {"from": e["to"], "to": e["from"], "way": 1,
         "highway": "residential", "name": None, "length_m": 88.0}
        for e in walk
    ]
    return {"nodes": nodes, "edges": {"walk": walk, "bike": [], "drive": []}}


def _write(area_dir: Path, name: str, payload: dict | list) -> None:
    area_dir.mkdir(parents=True, exist_ok=True)
    (area_dir / name).write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _area_def(**overrides) -> dict:
    base = {
        "id": "us-menlo",
        "label": "Menlo Park · Meta HQ",
        "kind": "bbox",
        "bbox": [US_BBOX[0], US_BBOX[1], US_BBOX[2], US_BBOX[3]],
        "center": [LON0, LAT0],
        "station": None,
        "boundary": None,
    }
    base.update(overrides)
    return base


def _write_high_inferred_area(area_dir: Path, **area_def_overrides) -> None:
    """10 homes, 8 inferred (80 %); otherwise a passing scene box."""
    buildings = [_building(i, "inferred" if i < 8 else "register_height")
                 for i in range(10)]
    roads = [{"id": f"w{i}", "highway": "residential",
              "geometry": {"type": "LineString",
                           "coordinates": [[LON0, LAT0],
                                           [LON0 + 0.001, LAT0]]}}
             for i in range(2)]
    pois = [{"id": f"p{i}", "name": f"POI {i}",
             "category": "amenity:cafe",
             "geometry": {"type": "Point", "coordinates": [LON0, LAT0]}}
            for i in range(55)]
    graph = _connected_graph()
    _write(area_dir, "area_def.json", _area_def(**area_def_overrides))
    area = {"area": "us-menlo", "counts": {}, "buildings": buildings,
            "roads": roads, "pois": pois, "landuse": [], "trees": [],
            "graph": graph, "complexes": []}
    _write(area_dir, "area.json", area)
    _write(area_dir, "report.json", {
        "area": "us-menlo",
        "counts": {"buildings": len(buildings), "roads": len(roads),
                   "pois": len(pois)},
    })


def test_validate_us_high_inferred_is_warning_only(tmp_path: Path) -> None:
    area_dir = tmp_path / "us-menlo"
    _write_high_inferred_area(area_dir, country="US", currency="USD",
                              workplaces=[{"id": "meta-hq"}])
    assert validate_area(area_dir) == []
    result = validate_run_build(area_dir)
    assert not result["failed"]
    assert US_HEIGHT_WARNING in result["warnings"]
    assert ("US area: no building register; heights are OSM or inferred "
            "(warning only)") in result["warnings"]


def test_validate_kr_high_inferred_still_fails(tmp_path: Path) -> None:
    area_dir = tmp_path / "kr-box"
    _write_high_inferred_area(area_dir)
    errors = validate_area(area_dir)
    assert any("inferred-height share" in e for e in errors)
    result = validate_run_build(area_dir)
    assert result["failed"]
    assert result["warnings"] == []


def test_terrain_step_small_boxes_keep_default_step() -> None:
    assert terrain_step(600) == (2.5, 600.0)
    assert terrain_step(1500) == (2.5, 1500.0)  # exactly 1200 cells
    assert terrain_step(600.00001) == (2.5, 602.5)


def test_terrain_step_big_box_coarsens() -> None:
    step, half_m = terrain_step(3880)
    assert step == 6.5
    assert half_m == 3880.5
    assert 2 * half_m / step <= 1200


def test_terrain_step_just_over_limit() -> None:
    assert terrain_step(1501)[0] == 3.0


def test_assemble_area_carries_us_keys_only_when_present() -> None:
    osm = {"buildings": [], "roads": [], "pois": [], "landuse": [],
           "trees": []}
    buildings = {"buildings": [], "meta": {}}
    graph = {"nodes": {}, "edges": {}, "meta": {}}
    kr_area, _ = assemble_area(_area_def(), osm, buildings, graph)
    assert "country" not in kr_area
    assert "currency" not in kr_area
    assert "workplaces" not in kr_area
    us_def = _area_def(country="US", currency="USD",
                       workplaces=[{"id": "meta-hq"}])
    us_area, _ = assemble_area(us_def, osm, buildings, graph)
    assert us_area["country"] == "US"
    assert us_area["currency"] == "USD"
    assert us_area["workplaces"] == [{"id": "meta-hq"}]
