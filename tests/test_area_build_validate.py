"""Unit tests for pipeline.area_build + pipeline.validate.

Builds synthetic area dirs in tmp_path (no raw data) and checks the schema
of ``area.json`` / ``report.json``, the >2 MB section splitting, the local
metre frame, and every validation rule including the boundary-area
exemption from scene-box thresholds.
"""

from __future__ import annotations

import json
from pathlib import Path

from pipeline import area_build
from pipeline.area_build import (
    assemble_area,
    feature_bounds,
    local_origin,
    local_xy,
    run_build,
)
from pipeline.validate import validate_area

LON0, LAT0 = 127.111, 37.394


def _building(i: int, source: str = "register_height",
              residential: str = "apartment") -> dict:
    return {
        "id": f"b{i:03d}",
        "origin": "joined",
        "height_m": 12.0,
        "height_source": source,
        "residential": residential,
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


def _area_def(**overrides) -> dict:
    base = {
        "id": "testbox",
        "label": "Test Box",
        "kind": "bbox",
        "bbox": [LON0 - 0.01, LAT0 - 0.01, LON0 + 0.01, LAT0 + 0.01],
        "center": [LON0, LAT0],
        "station": {"name": "Test", "lon": LON0, "lat": LAT0,
                    "osm_kind": "node", "osm_id": 1},
        "boundary": None,
    }
    base.update(overrides)
    return base


def _write(area_dir: Path, name: str, payload: dict | list) -> None:
    area_dir.mkdir(parents=True, exist_ok=True)
    (area_dir / name).write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _passing_sections(n_pois: int = 55, n_buildings: int = 10,
                      inferred: int = 2) -> dict:
    buildings = [_building(i, "inferred" if i < inferred else "register_height")
                 for i in range(n_buildings)]
    return {
        "buildings": buildings,
        "roads": [{"id": f"w{i}", "highway": "residential",
                   "geometry": {"type": "LineString",
                                "coordinates": [[LON0, LAT0],
                                                [LON0 + 0.001, LAT0]]}}
                  for i in range(2)],
        "pois": [{"id": f"p{i}", "name": f"POI {i}",
                  "category": "amenity:cafe",
                  "geometry": {"type": "Point", "coordinates": [LON0, LAT0]}}
                 for i in range(n_pois)],
        "landuse": [],
        "trees": [],
        "graph": _connected_graph(),
        # Stage 2 adds the complexes section to the area contract.
        "complexes": [],
    }


def _write_valid_area(area_dir: Path, **overrides) -> dict:
    """Write a validate-passing bbox area; returns the section payloads."""
    sections = _passing_sections(**overrides) if overrides else _passing_sections()
    _write(area_dir, "area_def.json", _area_def())
    area = {"area": "testbox", "counts": {}}
    area.update(sections)
    _write(area_dir, "area.json", area)
    _write(area_dir, "report.json", {
        "area": "testbox",
        "counts": {"buildings": len(sections["buildings"]),
                   "roads": len(sections["roads"]),
                   "pois": len(sections["pois"])},
    })
    return sections


# --- local frame ------------------------------------------------------------


def test_origin_is_station_centre_for_boxes() -> None:
    osm = {"buildings": [], "roads": [], "pois": [], "landuse": [], "trees": []}
    assert local_origin(_area_def(), osm) == (LON0, LAT0)


def test_origin_is_bounds_midpoint_without_centre() -> None:
    area_def = _area_def(center=None, kind="boundary")
    osm = {"buildings": [
        {"geometry": {"type": "Point", "coordinates": [126.0, 37.0]}},
        {"geometry": {"type": "Point", "coordinates": [128.0, 38.0]}},
    ]}
    assert local_origin(area_def, osm) == (127.0, 37.5)


def test_local_xy_origin_maps_to_zero() -> None:
    assert local_xy(LON0, LAT0, LON0, LAT0) == (0.0, 0.0)
    x, _ = local_xy(LON0 + 0.001, LAT0, LON0, LAT0)
    assert x == abs(x) > 80.0  # ~88 m east at this latitude


def test_feature_bounds_none_when_empty() -> None:
    assert feature_bounds({}) is None


# --- assemble / split / round trip -------------------------------------------


def test_assemble_carries_counts_and_crs() -> None:
    sections = _passing_sections()
    area, out = assemble_area(
        _area_def(),
        {"buildings": [], "roads": sections["roads"], "pois": sections["pois"],
         "landuse": [], "trees": []},
        {"buildings": sections["buildings"], "meta": {}},
        {**sections["graph"], "meta": {}},
    )
    assert area["crs"]["geographic"] == "EPSG:4326"
    assert area["crs"]["local"]["origin"] == {"lon": LON0, "lat": LAT0}
    assert area["counts"]["buildings"] == 10
    assert area["counts"]["pois"] == 55
    assert set(out) == {"buildings", "roads", "pois", "landuse", "trees",
                          "graph", "complexes"}


def test_run_build_round_trip_validates(tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    sections = _passing_sections()
    _write(area_dir, "area_def.json", _area_def())
    _write(area_dir, "osm.json", {
        "buildings": [], "roads": sections["roads"], "pois": sections["pois"],
        "landuse": [], "trees": [], "meta": {},
    })
    _write(area_dir, "buildings.json", {
        "buildings": sections["buildings"],
        "meta": {"register_coverage": "full", "register_files": ["r/f.shp"],
                 "height_sources": {"register_height": 8, "inferred": 2},
                 "inferred_share": 0.2},
    })
    _write(area_dir, "graph.json", {
        **sections["graph"],
        "meta": {"counts": {}, "walk_lcc": {"nodes": 4, "largest": 4,
                                            "share": 1.0}},
    })
    summary = run_build(area_dir)
    assert summary["register_coverage"] == "full"
    assert (area_dir / "area.json").exists()
    report = json.loads((area_dir / "report.json").read_text(encoding="utf-8"))
    assert report["register_coverage"] == "full"
    assert report["inferred_share"] == 0.2
    assert report["residential_inferred_share"] == 0.2
    assert report["residential_counts"] == {"apartment": 10}
    assert report["poi_counts"]["total"] == 55
    assert "area_build_seconds" in report["timings"]
    assert validate_area(area_dir) == []


def test_large_section_splits_and_resolves(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(area_build, "SECTION_SPLIT_BYTES", 100)
    area_dir = tmp_path / "testbox"
    area_dir.mkdir(parents=True, exist_ok=True)  # the CLI creates this
    sections = _passing_sections(n_pois=55)
    area = {"area": "testbox", "counts": {}}
    sizes, parts = area_build.write_area(area_dir, area, sections)
    assert parts["pois"] == "area.pois.json"
    assert (area_dir / "area.pois.json").exists()
    assert "area.pois.json" in sizes
    stored = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    assert stored["pois"] == {"$ref": "area.pois.json"}
    # Stale parts from an earlier layout are cleaned up.
    (area_dir / "area.stale.json").write_text("[]", encoding="utf-8")
    monkeypatch.setattr(area_build, "SECTION_SPLIT_BYTES", 10 ** 9)
    area_build.write_area(area_dir, area, sections)
    assert not (area_dir / "area.stale.json").exists()


# --- validation rules --------------------------------------------------------


def test_validate_passes_on_good_area(tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    _write_valid_area(area_dir)
    assert validate_area(area_dir) == []


def test_validate_split_part_resolves(tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    sections = _write_valid_area(area_dir)
    area = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    area["pois"] = {"$ref": "area.pois.json"}
    _write(area_dir, "area.json", area)
    _write(area_dir, "area.pois.json", sections["pois"])
    assert validate_area(area_dir) == []


def test_validate_empty_area_fails(tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    _write_valid_area(area_dir)
    area = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    area["buildings"] = []
    _write(area_dir, "area.json", area)
    errors = validate_area(area_dir)
    assert any("no buildings" in e for e in errors)


def test_validate_missing_streets_and_pois_fail(tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    _write_valid_area(area_dir)
    area = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    area["roads"] = []
    area["pois"] = []
    _write(area_dir, "area.json", area)
    errors = validate_area(area_dir)
    assert any("no roads" in e for e in errors)
    assert any("no POIs" in e for e in errors)


def test_validate_too_few_pois_fails_for_scene_box(tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    _write_valid_area(area_dir, n_pois=10)
    report = json.loads((area_dir / "report.json").read_text(encoding="utf-8"))
    report["counts"]["pois"] = 10  # keep the cross-check consistent
    _write(area_dir, "report.json", report)
    errors = validate_area(area_dir)
    assert any("named POIs" in e for e in errors)


def test_validate_high_inferred_share_fails(tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    _write_valid_area(area_dir, n_buildings=10, inferred=10)
    errors = validate_area(area_dir)
    assert any("inferred-height" in e for e in errors)


def test_validate_gate_is_residential_not_all_buildings(
        tmp_path: Path) -> None:
    # All-buildings inferred is 80 % but every home has a real height:
    # the stage-3 gate passes (all-share stays a reported number).
    area_dir = tmp_path / "testbox"
    sections = _passing_sections(n_buildings=0)
    sections["buildings"] = (
        [_building(i, "register_height", "apartment") for i in range(4)]
        + [_building(100 + i, "inferred", "none") for i in range(16)])
    _write(area_dir, "area_def.json", _area_def())
    area = {"area": "testbox", "counts": {}}
    area.update(sections)
    _write(area_dir, "area.json", area)
    _write(area_dir, "report.json", {
        "area": "testbox",
        "counts": {"buildings": 20, "roads": len(sections["roads"]),
                   "pois": len(sections["pois"])},
    })
    assert validate_area(area_dir) == []


def test_validate_high_residential_inferred_fails(tmp_path: Path) -> None:
    # Residential inferred is 40 % (all-buildings only 20 %): the gate
    # fails and the message cites both shares.
    area_dir = tmp_path / "testbox"
    sections = _passing_sections(n_buildings=0)
    sections["buildings"] = (
        [_building(i, "inferred", "apartment") for i in range(4)]
        + [_building(100 + i, "register_height", "apartment")
            for i in range(6)]
        + [_building(200 + i, "register_height", "none") for i in range(10)])
    _write(area_dir, "area_def.json", _area_def())
    area = {"area": "testbox", "counts": {}}
    area.update(sections)
    _write(area_dir, "area.json", area)
    _write(area_dir, "report.json", {
        "area": "testbox",
        "counts": {"buildings": 20, "roads": len(sections["roads"]),
                   "pois": len(sections["pois"])},
    })
    errors = validate_area(area_dir)
    assert any("residential inferred-height" in e and "4/10" in e
               and "all-buildings 20.0%" in e for e in errors)


def test_validate_no_homes_passes_height_gate_vacuously(
        tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    sections = _passing_sections(n_buildings=0)
    sections["buildings"] = [_building(i, "inferred", "none")
                             for i in range(5)]
    _write(area_dir, "area_def.json", _area_def())
    area = {"area": "testbox", "counts": {}}
    area.update(sections)
    _write(area_dir, "area.json", area)
    _write(area_dir, "report.json", {
        "area": "testbox",
        "counts": {"buildings": 5, "roads": len(sections["roads"]),
                   "pois": len(sections["pois"])},
    })
    assert validate_area(area_dir) == []


def test_validate_low_walk_lcc_fails(tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    _write_valid_area(area_dir)
    area = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    area["graph"] = {"nodes": {"a": [0, 0], "b": [1, 1]},
                     "edges": {"walk": [], "bike": [], "drive": []}}
    _write(area_dir, "area.json", area)
    errors = validate_area(area_dir)
    assert any("largest component" in e or "walk graph missing" in e
               for e in errors)


def test_validate_missing_split_part_fails(tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    _write_valid_area(area_dir)
    area = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    area["pois"] = {"$ref": "area.pois.json"}  # part file not written
    _write(area_dir, "area.json", area)
    errors = validate_area(area_dir)
    assert any("split part" in e for e in errors)


def test_validate_stale_report_counts_fail(tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    _write_valid_area(area_dir)
    report = json.loads((area_dir / "report.json").read_text(encoding="utf-8"))
    report["counts"]["pois"] = 1
    _write(area_dir, "report.json", report)
    errors = validate_area(area_dir)
    assert any("disagrees" in e for e in errors)


def test_validate_missing_area_file_fails(tmp_path: Path) -> None:
    area_dir = tmp_path / "testbox"
    area_dir.mkdir()
    _write(area_dir, "area_def.json", _area_def())
    assert any("area.json is missing" in e for e in validate_area(area_dir))


def test_boundary_area_exempt_from_scene_thresholds(tmp_path: Path) -> None:
    area_dir = tmp_path / "testgu"
    sections = _passing_sections(n_pois=1, n_buildings=2, inferred=2)
    sections["graph"] = {"nodes": {}, "edges": {"walk": [], "bike": [],
                                                "drive": []}}
    _write(area_dir, "area_def.json", _area_def(id="testgu", kind="boundary",
                                                center=None,
                                                boundary={"name": "Test-gu",
                                                          "relation_id": 1,
                                                          "admin_level": 7}))
    area = {"area": "testgu", "counts": {}}
    area.update(sections)
    _write(area_dir, "area.json", area)
    _write(area_dir, "report.json", {
        "area": "testgu",
        "counts": {"buildings": 2, "roads": 2, "pois": 1},
    })
    assert validate_area(area_dir) == []
