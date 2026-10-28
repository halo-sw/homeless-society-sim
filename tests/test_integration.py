"""Integration test: full pipeline build on the real national extract.

Skipped unless ``data/raw/south-korea-latest.osm.pbf`` exists (and the
building register is discoverable, which the songpa-jamsil scene-box
thresholds need). Runs ``build_area`` into a tmp build dir so the real
``data/build`` tree is untouched, then validates the deliverable.
"""

from __future__ import annotations

import json

import pytest

from pipeline.areas import DEFAULT_RAW_PBF
from pipeline.building_join import discover_register_files

pytestmark = pytest.mark.skipif(
    not DEFAULT_RAW_PBF.exists(), reason="data/raw not present")


def test_full_build_songpa_jamsil(tmp_path) -> None:
    if not discover_register_files():
        pytest.skip("building register not present under data/raw/buildings")
    from pipeline.cli import build_area
    from pipeline.validate import validate_area

    result = build_area("songpa-jamsil", DEFAULT_RAW_PBF, tmp_path,
                        osmium_bin=None, overwrite=True)
    area_dir = tmp_path / "songpa-jamsil"
    for name in ("area_def.json", "extract.osm.pbf", "osm.json",
                 "buildings.json", "graph.json", "area.json", "report.json"):
        assert (area_dir / name).exists(), f"{name} missing after build"

    stages = {s["stage"]: s for s in result["stages"]}
    assert stages["validate"]["status"] == "ok"
    assert validate_area(area_dir) == []

    report = json.loads((area_dir / "report.json").read_text(encoding="utf-8"))
    assert report["register_coverage"] == "full"
    assert report["inferred_share"] <= 0.30
    assert report["walk_lcc"]["share"] >= 0.95
    assert report["poi_counts"]["total"] >= 50
    assert stages["validate"]["failed"] is False
