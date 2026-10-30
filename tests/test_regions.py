"""Tests for pipeline/regions.py (stage 12a, Part A)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.regions import (
    PLACE_IDS,
    REGION_IDS,
    REGION_SPECS,
    WIRYE_NOTE,
    candidate_names,
    pick_region_relations,
    rtms_file_names,
)

REPO = Path(__file__).resolve().parents[1]
REGIONS_JSON = REPO / "data" / "build" / "regions.json"


def test_nine_regions_with_files_and_safety():
    assert list(REGION_IDS) == [
        "seongdong", "songpa-gu", "gangnam", "gangdong",
        "bundang", "sujeong", "jungwon", "suji", "wirye",
    ]
    for spec in REGION_SPECS:
        assert spec["sigungu"], spec["id"]
        assert all(len(code) == 5 and code.isdigit()
                   for code in spec["sigungu"]), spec["id"]
        assert spec["rtms"], spec["id"]
        assert spec["safety"], spec["id"]
        for _column, level in spec["safety"]:
            assert level in ("district", "city"), spec["id"]


def test_rtms_file_names_match_stage6_format():
    names = rtms_file_names("gangnam")
    assert len(names) == 6
    assert "apt_trade_gangnam_2510-2610.csv" in names
    assert "officetel_rent_gangnam_2510-2610.csv" in names
    assert "rowhouse_trade_gangnam_2510-2610.csv" in names


def test_wirye_spans_three_districts_and_three_columns():
    wirye = next(s for s in REGION_SPECS if s["id"] == "wirye")
    assert list(wirye["rtms"]) == ["songpa", "sujeong", "hanam"]
    assert [c for c, _ in wirye["safety"]] == [
        "서울 송파구", "경기도 성남시", "경기도 하남시"]
    assert "합집합" in WIRYE_NOTE


def test_places_are_stations_not_statistics_units():
    assert list(PLACE_IDS) == ["pangyo", "jeongja", "bundang-central", "migeum"]
    from pipeline.regions import PLACES

    for place in PLACES:
        assert place["region"] == "bundang"
        assert place["station_names"]


def test_candidate_names_cover_boundaries():
    names = candidate_names()
    assert {"성동구", "송파구", "강남구", "강동구", "분당구", "수정구",
            "중원구", "수지구", "위례동"} <= names


def _hit(rel_id, name, level):
    return {"id": rel_id,
            "tags": {"name": name, "admin_level": level,
                     "type": "boundary", "boundary": "administrative"},
            "members": []}


def test_pick_gu_prefers_best_admin_level():
    spec = next(s for s in REGION_SPECS if s["id"] == "bundang")
    hits = [_hit(9, "분당구", "8"), _hit(7, "분당구", "7")]
    picked = pick_region_relations(spec, hits)
    assert [h["id"] for h in picked] == [7]


def test_pick_wirye_keeps_every_match():
    spec = next(s for s in REGION_SPECS if s["id"] == "wirye")
    hits = [_hit(2, "위례동", "8"), _hit(1, "위례동", "8"),
            _hit(3, "분당구", "7")]
    picked = pick_region_relations(spec, hits)
    assert sorted(h["id"] for h in picked) == [1, 2]


def test_pick_missing_boundary_raises():
    spec = next(s for s in REGION_SPECS if s["id"] == "suji")
    with pytest.raises(LookupError):
        pick_region_relations(spec, [_hit(1, "분당구", "7")])


@pytest.mark.skipif(not REGIONS_JSON.exists(),
                    reason="operator runs `pipeline regions` first")
def test_real_regions_json_shape():
    doc = json.loads(REGIONS_JSON.read_text(encoding="utf-8"))
    kr = [r for r in doc["regions"] if r.get("country", "KR") == "KR"]
    assert [r["id"] for r in kr] == list(REGION_IDS)
    for region in kr:
        assert region["relations"], region["id"]
        assert region["bbox"] and len(region["bbox"]) == 4
        minlon, minlat, maxlon, maxlat = region["bbox"]
        assert minlon < maxlon and minlat < maxlat
        assert region["rtms_files"]
    for region in doc["regions"]:
        if region.get("country", "KR") == "KR":
            continue
        assert region["country"] == "US", region["id"]
        assert region["currency"] == "USD", region["id"]
        assert region["bbox"] and len(region["bbox"]) == 4
    wirye = next(r for r in kr if r["id"] == "wirye")
    # OSM carries 서울 + 하남 위례동; 성남 위례동 has no boundary here.
    assert len(wirye["relations"]) == 2
    assert {r["relation_id"] for r in wirye["relations"]} == {11117000, 13316464}
    assert len(doc["places"]) == 4
