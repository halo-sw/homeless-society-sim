"""Tests for pipeline.congestion (stage 8, Part B).

Slot maths run on synthetic tables; the real-xlsx tests pin the header
shape, the 1–8호선 coverage, and the demo lookup (2호선 잠실 08:00 평일,
내선 vs 외선). Fixture values below are hand-written fakes, never copied
from the xlsx (공공누리 3유형: no redistribution of the file or derived
tables — these tests assert shapes and the few demo numbers the result
brief quotes).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pipeline.congestion import (
    load_workbook,
    lookup,
    slot_for_minute,
    slot_start_min,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
XLSX = (REPO_ROOT / "data" / "raw" / "traffic"
        / "서울교통공사_지하철혼잡도정보_20260930.xlsx")

needs_xlsx = pytest.mark.skipif(not XLSX.exists(),
                                reason="congestion xlsx missing")


def test_slot_start_min():
    assert slot_start_min("05:30~06:00") == 330
    assert slot_start_min("08:00~08:30") == 480
    assert slot_start_min("24:30~25:00") == 1470
    with pytest.raises(ValueError):
        slot_start_min("08:00")


def test_slot_for_minute_clamps():
    slots = [330, 360, 390]
    assert slot_for_minute(0, slots) == 0
    assert slot_for_minute(330, slots) == 0
    assert slot_for_minute(359, slots) == 0
    assert slot_for_minute(360, slots) == 1
    assert slot_for_minute(2000, slots) == 2


def test_lookup_on_synthetic_table():
    table = {"slots": [480, 510],
             "days": {"weekday": {"2호선": {"잠실": {"내선": [90.0, 80.0]}}}}}
    assert lookup(table, "weekday", "2호선", "잠실", "내선", 480) == 90.0
    assert lookup(table, "weekday", "2호선", "잠실", "내선", 509) == 90.0
    assert lookup(table, "weekday", "2호선", "잠실", "내선", 510) == 80.0
    assert lookup(table, "weekday", "2호선", "잠실", "외선", 480) is None
    assert lookup(table, "weekday", "신분당선", "강남", "하선", 480) is None
    assert lookup(table, "sunday", "2호선", "잠실", "내선", 480) is None


@needs_xlsx
def test_real_xlsx_shape_and_coverage():
    table = load_workbook(XLSX)
    assert table["meta"]["lines"] == ["1호선", "2호선", "3호선", "4호선",
                                      "5호선", "6호선", "7호선", "8호선"]
    assert set(table["days"]) == {"weekday", "saturday", "sunday"}
    assert len(table["slots"]) == 39
    assert table["slots"][0] == 330  # 05:30
    assert table["slot_labels"][5] == "08:00~08:30"
    assert table["station_numbers"]["2호선"]["잠실"] == 216
    # Uncovered lines stay absent (the engine must show 혼잡도 자료 없음).
    assert "신분당선" not in table["days"]["weekday"]
    assert "9호선" not in table["days"]["weekday"]


@needs_xlsx
def test_real_xlsx_jamsil_0800_weekday():
    table = load_workbook(XLSX)
    inner = lookup(table, "weekday", "2호선", "잠실", "내선", 480)
    outer = lookup(table, "weekday", "2호선", "잠실", "외선", 480)
    assert inner == pytest.approx(93.2, abs=0.05)
    assert outer == pytest.approx(43.2, abs=0.05)
    # The 08:00 slot is shared by the whole half hour.
    assert lookup(table, "weekday", "2호선", "잠실", "내선", 501) == inner
    assert lookup(table, "weekday", "2호선", "잠실", "내선", 510) != inner
    # 8호선 covers 잠실 too (different station number space).
    assert table["station_numbers"]["8호선"]["잠실"] == 2815
    assert lookup(table, "weekday", "8호선", "잠실", "상선", 480) is not None
    assert lookup(table, "weekday", "8호선", "잠실", "하선", 480) is not None


@needs_xlsx
def test_real_xlsx_deterministic():
    first = load_workbook(XLSX)
    second = load_workbook(XLSX)
    assert first == second
