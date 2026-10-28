"""Tests for pipeline/safety.py (stage 9a, Part C)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.safety import (
    AREA_COLUMNS,
    CSV_NAME,
    SOURCE_NAME,
    build_safety,
    load_crime_csv,
    run_build,
)

REPO = Path(__file__).resolve().parents[1]
RAW_CSV = REPO / "data" / "raw" / "safety" / CSV_NAME


def _fixture_csv(tmp_path: Path) -> Path:
    # Hand-written toy numbers, never copied from the real table.
    text = (
        "범죄대분류,범죄중분류,서울 송파구,서울 성동구,경기도 성남시\n"
        "강력범죄,살인기수,1,2,3\n"
        "강력범죄,강도,4,5,6\n"
        "절도범죄,절도범죄,10,20,30\n"
    )
    path = tmp_path / "crime.csv"
    path.write_text(text, encoding="cp949")
    return path


def test_load_fixture_cp949(tmp_path):
    parsed = load_crime_csv(_fixture_csv(tmp_path))
    assert parsed["columns"] == ["서울 송파구", "서울 성동구", "경기도 성남시"]
    assert len(parsed["rows"]) == 3
    assert parsed["rows"][0] == {
        "cat1": "강력범죄", "cat2": "살인기수",
        "counts": {"서울 송파구": 1, "서울 성동구": 2, "경기도 성남시": 3},
    }


def test_build_fixture_areas_and_levels(tmp_path):
    doc = build_safety(_fixture_csv(tmp_path), tmp_path)
    assert doc["source"] == SOURCE_NAME
    assert doc["period"] == "2025-01-01…2025-12-31"
    assert doc["unit"] == "건"
    assert sorted(doc["areas"]) == ["pangyo", "seongsu", "songpa", "songpa-jamsil"]
    assert doc["areas"]["songpa"]["by_cat1"] == {"강력범죄": 5, "절도범죄": 10}
    assert doc["areas"]["songpa"]["total"] == 15
    assert doc["areas"]["songpa"]["geo_level"] == "district"
    # 성남시 is city-level, shared by the pangyo area.
    assert doc["areas"]["pangyo"]["column"] == "경기도 성남시"
    assert doc["areas"]["pangyo"]["geo_level"] == "city"
    assert doc["areas"]["pangyo"]["total"] == 39
    assert len(doc["areas"]["pangyo"]["by_cat2"]) == 3
    assert "인구" in doc["population_note"]
    assert len(doc["caveats"]) >= 3


def test_build_rejects_bad_tables(tmp_path):
    bad = tmp_path / "bad.csv"
    bad.write_text("a,b,c\n1,2,3\n", encoding="cp949")
    with pytest.raises(ValueError, match="header"):
        load_crime_csv(bad)
    neg = tmp_path / "neg.csv"
    neg.write_text("범죄대분류,범죄중분류,서울 송파구\n강력범죄,강도,-1\n",
                   encoding="cp949")
    with pytest.raises(ValueError, match="negative"):
        load_crime_csv(neg)
    missing_col = tmp_path / "missing.csv"
    missing_col.write_text("범죄대분류,범죄중분류,서울 송파구\n강력범죄,강도,1\n",
                           encoding="cp949")
    with pytest.raises(ValueError, match="lacks columns"):
        build_safety(missing_col, tmp_path)


def test_run_build_writes_region_file(tmp_path):
    out = run_build(raw_csv=_fixture_csv(tmp_path), build_dir=tmp_path / "build",
                    raw_dir=tmp_path)
    doc = json.loads(Path(out["file"]).read_text(encoding="utf-8"))
    assert doc["areas"]["seongsu"]["total"] == 27
    assert out["areas"] == ["pangyo", "seongsu", "songpa", "songpa-jamsil"]


@pytest.mark.skipif(not RAW_CSV.exists(), reason="operator-provided CSV absent")
def test_real_csv_cp949_columns_and_totals():
    parsed = load_crime_csv(RAW_CSV)
    for want in ("서울 송파구", "서울 성동구", "경기도 성남시"):
        assert want in parsed["columns"], want
    assert "서울 분당구" not in parsed["columns"]
    assert not [c for c in parsed["columns"] if "판교" in c]
    doc = build_safety(RAW_CSV, RAW_CSV.parent)
    for area, (column, _level) in AREA_COLUMNS.items():
        entry = doc["areas"][area]
        cat1_sum = sum(entry["by_cat1"].values())
        cat2_sum = sum(r["count"] for r in entry["by_cat2"])
        assert cat1_sum == entry["total"] == cat2_sum, area
        assert entry["total"] > 0, area
    # Spot totals (year ending 2025-12-31) — pinned against silent swaps.
    assert doc["areas"]["songpa"]["total"] == doc["areas"]["songpa-jamsil"]["total"]
    assert doc["areas"]["songpa"]["by_cat1"]["절도범죄"] > 0
    assert doc["areas"]["seongsu"]["by_cat1"]["폭력범죄"] > 0
    assert doc["areas"]["pangyo"]["geo_level"] == "city"
    assert "population" in doc["population_note"] or "인구" in doc["population_note"]
