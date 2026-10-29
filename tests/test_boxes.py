"""Tests for pipeline/boxes.py + station-box CLI (stage 12a, Part A)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.boxes import (
    MAX_BOXES,
    REQUIRED_STATIONS,
    box_id_of,
    count_nearby,
    dedupe_stations,
    is_station_box,
    load_boxes,
    manifest_matches,
    manifest_signature,
    select_boxes,
    station_of,
    write_areas_index,
    write_manifest,
)

REPO = Path(__file__).resolve().parents[1]
BOXES_JSON = REPO / "data" / "build" / "station-boxes.json"


def test_box_id_round_trip():
    assert box_id_of("판교") == "st-판교"
    assert station_of("st-판교") == "판교"
    assert is_station_box("st-판교")
    assert not is_station_box("pangyo")


def test_required_stations_cover_brief_list():
    for name in ("왕십리", "강남", "삼성", "천호", "고덕", "남위례",
                 "모란", "정자", "서현", "미금", "수지구청",
                 "판교", "성수", "잠실"):
        assert name in REQUIRED_STATIONS


def test_count_nearby_radius():
    assert count_nearby([(127.10, 37.50)], 127.10, 37.50) == 1
    assert count_nearby([(127.20, 37.50)], 127.10, 37.50) == 0


def _station(name, lon=127.10, lat=37.50, railway="subway_station",
             network="수도권 전철", kind="node", oid=1):
    tags = {"name": name, "railway": railway}
    if network:
        tags["network"] = network
    return {"kind": kind, "id": oid, "tags": tags, "lon": lon, "lat": lat}


def test_dedupe_prefers_metro_node():
    a = _station("판교역", oid=5, kind="way", network=None)
    b = _station("판교", oid=9, kind="node")
    out = dedupe_stations([a, b])
    assert len(out) == 1 and out[0]["id"] == 9


def _scan(entries):
    # entries: [(station, count)] with `count` apartments at the station.
    stations, apartments = [], []
    for i, (name, count) in enumerate(entries):
        stations.append(_station(name, lon=127.0 + i * 0.01,
                                 lat=37.50, oid=100 + i))
        apartments.extend([(127.0 + i * 0.01, 37.50)] * count)
    return {"stations": stations, "apartments": apartments,
            "_label": "테스트"}


def test_select_boxes_orders_caps_and_logs_skipped():
    scanned = {"r1": _scan([(f"역{i:02d}", 100 - i) for i in range(70)])}
    out = select_boxes(scanned, max_boxes=60)
    assert len(out["boxes"]) == 60
    counts = [b["count"] for b in out["boxes"]
              if not b.get("required")]
    assert counts == sorted(counts, reverse=True)
    assert len(out["skipped"]) == 70 - (60 - len(REQUIRED_STATIONS))
    assert all("reason" in s for s in out["skipped"])


def test_select_boxes_guarantees_required_inside_cap():
    scanned = {"r1": _scan([("판교", 1)] + [(f"역{i:02d}", 500 - i)
                                               for i in range(59)])}
    out = select_boxes(scanned, max_boxes=60)
    assert len(out["boxes"]) == 60
    names = [b["station"] for b in out["boxes"]]
    for name in REQUIRED_STATIONS:
        assert name in names
    missing = [b for b in out["boxes"] if b.get("missing")]
    # Only 판교 was in the scan; the other required stations are flagged.
    assert {b["station"] for b in missing} == set(REQUIRED_STATIONS) - {"판교"}
    assert all(b["forced"] for b in missing)


def test_manifest_matches_and_rejects_changes(tmp_path):
    box = {"station": "판교", "lon": 127.1, "lat": 37.39}
    src = tmp_path / "bundang.osm.pbf"
    src.write_bytes(b"fake")
    sig = manifest_signature(box, src)
    area_dir = tmp_path / "st-판교"
    area_dir.mkdir()
    (area_dir / "area.json").write_text("{}")
    (area_dir / "report.json").write_text("{}")
    assert manifest_matches(area_dir, sig) is False
    write_manifest(area_dir, sig, {"seconds": 3})
    assert manifest_matches(area_dir, sig) is True
    assert manifest_matches(area_dir, {**sig, "code": "other"}) is False
    (area_dir / "report.json").unlink()
    assert manifest_matches(area_dir, sig) is False


def test_write_areas_index_lists_built_dirs(tmp_path):
    for area_id in ("pangyo", "st-판교"):
        d = tmp_path / area_id
        d.mkdir()
        (d / "area_def.json").write_text(json.dumps(
            {"id": area_id, "label": area_id, "center": [127.1, 37.3],
             "bbox": [127.0, 37.3, 127.2, 37.4],
             "station": {"name": "판교"}}))
        (d / "area.json").write_text("{}")
    out = write_areas_index(tmp_path)
    assert out["count"] == 2
    doc = json.loads((tmp_path / "areas-index.json").read_text(
        encoding="utf-8"))
    assert [a["id"] for a in doc["areas"]] == ["pangyo", "st-판교"]
    assert all("size_bytes" in a for a in doc["areas"])


def test_expand_area_patterns(tmp_path):
    from pipeline.cli import expand_area_patterns

    (tmp_path / "station-boxes.json").write_text(json.dumps({
        "boxes": [
            {"station": "판교", "lon": 127.1, "lat": 37.39,
             "region": "bundang"},
            {"station": "유령", "lon": None, "lat": None,
             "region": "bundang"},
            {"station": "잠실", "lon": 127.1, "lat": 37.51,
             "region": "songpa-gu"},
        ]}))
    assert expand_area_patterns(["station:*"], tmp_path) == [
        "st-판교", "st-잠실"]
    assert expand_area_patterns(["region:bundang"], tmp_path) == ["st-판교"]
    assert expand_area_patterns(["pangyo", "st-판교", "pangyo"],
                                tmp_path) == ["pangyo", "st-판교"]
    with pytest.raises(KeyError):
        expand_area_patterns(["station:*"], tmp_path / "empty")
    with pytest.raises(KeyError):
        expand_area_patterns(["busan"], tmp_path)


@pytest.mark.skipif(not BOXES_JSON.exists(),
                    reason="operator runs `pipeline boxes` first")
def test_real_station_boxes_shape():
    doc = json.loads(BOXES_JSON.read_text(encoding="utf-8"))
    assert len(doc["boxes"]) == MAX_BOXES
    names = [b["station"] for b in doc["boxes"]]
    for name in REQUIRED_STATIONS:
        assert name in names
    assert all(b["lon"] is not None for b in doc["boxes"])
    assert len(doc["skipped"]) > 0
