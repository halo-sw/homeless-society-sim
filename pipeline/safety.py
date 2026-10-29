"""Police crime statistics by region (stage 9a, Part C).

Reads the National Police Agency table::

    data/raw/safety/경찰청_범죄 발생 지역별 통계_20251231.csv

(cp949; rows = 범죄대분류/범죄중분류, columns = 시군구 such as
"서울 송파구" or "경기도 성남시", values = occurrence counts for the
year ending 2025-12-31) and writes a small per-area view::

    data/build/region/safety.json

with counts by 대분류 and every 중분류 row, plus source, period, unit
and geographic level. The raw CSV and the derived JSON stay under
``data/`` (gitignored) — local compute/display only.

Caveats (also shown on screen, see ``web/src/safety.js``):
* 성남시 is a city-level column — 판교/분당 are NOT separable.
* Counts are where crimes were *recorded*, not a resident's risk.
* No per-population rates unless a population table is present
  (``data/raw/safety/population*.csv``, optional; skipped with a note
  when absent).
* No score, no ranking, no colour-coded "danger" — by design.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

SOURCE_NAME = "경찰청 범죄 발생 지역별 통계 (2025년)"
PERIOD = "2025-01-01…2025-12-31"
UNIT = "건"
CSV_NAME = "경찰청_범죄 발생 지역별 통계_20251231.csv"

# Built area -> statistics column + geographic level. songpa-jamsil sits
# inside 송파구, so it shares the district column (the column covers the
# whole district, not just Jamsil). pangyo shares the 성남시 city column
# (분당구/판교 not separable).
AREA_COLUMNS = {
    "songpa": ("서울 송파구", "district"),
    "songpa-jamsil": ("서울 송파구", "district"),
    "seongsu": ("서울 성동구", "district"),
    "pangyo": ("경기도 성남시", "city"),
}

CAT1_ORDER = [
    "강력범죄", "절도범죄", "폭력범죄", "지능범죄", "풍속범죄",
    "특별경제범죄", "마약범죄", "보건범죄", "환경범죄", "교통범죄",
    "노동범죄", "안보범죄", "선거범죄", "병역범죄", "기타범죄",
]


def region_safety_spec() -> list[dict]:
    """Region id -> safety (column, level) pairs (from regions spec)."""
    from .regions import REGION_SPECS

    return [{"id": spec["id"], "label": spec["label"],
             "safety": [{"column": col, "level": lvl}
                        for col, lvl in spec["safety"]]}
            for spec in REGION_SPECS]


def build_region_safety(raw_csv: str | Path) -> dict[str, dict]:
    """Per-region safety views. 위례 keeps one view per 관할 (never merged).

    Raises ValueError when the CSV lacks a needed column (same strictness
    as :func:`build_safety`); :func:`run_build` reports the skip instead
    of failing the area views.
    """
    parsed = load_crime_csv(raw_csv)
    needed = {entry["column"] for spec in region_safety_spec()
              for entry in spec["safety"]}
    missing = sorted(needed - set(parsed["columns"]))
    if missing:
        raise ValueError(f"safety: CSV lacks region columns {missing}")
    out: dict[str, dict] = {}
    for spec in region_safety_spec():
        parts = {entry["column"]: _area_view(entry["column"], entry["level"],
                                             parsed["rows"])
                 for entry in spec["safety"]}
        if len(parts) == 1:
            column = next(iter(parts))
            out[spec["id"]] = {"label": spec["label"], **parts[column]}
        else:
            out[spec["id"]] = {"label": spec["label"], "parts": parts,
                               "note": ("관할이 여러 개라 통계를 합치지 않습니다. "
                                        "각 관할 수치를 따로 보세요.")}
    return out


def _to_int(text: str, where: str) -> int:
    token = (text or "").strip().replace(",", "")
    try:
        value = int(token)
    except ValueError:
        raise ValueError(f"safety: bad count {text!r} at {where}")
    if value < 0:
        raise ValueError(f"safety: negative count {value} at {where}")
    return value


def load_crime_csv(path: str | Path) -> dict:
    """Parse the cp949 CSV. Returns {columns, rows} where rows carry
    cat1/cat2 plus one int per column header."""
    path = Path(path)
    with path.open(encoding="cp949", newline="") as f:
        reader = csv.reader(f)
        rows = [r for r in reader if r]
    if not rows:
        raise ValueError(f"safety: empty CSV {path}")
    header = [h.strip() for h in rows[0]]
    if header[0] != "범죄대분류" or header[1] != "범죄중분류":
        raise ValueError(
            f"safety: unexpected header {header[:2]} (want 범죄대분류,범죄중분류)")
    columns = header[2:]
    if not columns:
        raise ValueError("safety: no region columns")
    parsed = []
    for i, row in enumerate(rows[1:], start=2):
        if len(row) < 2 + len(columns):
            raise ValueError(f"safety: short row {i} ({len(row)} cells)")
        cat1, cat2 = row[0].strip(), row[1].strip()
        counts = {col: _to_int(row[2 + j], f"row {i} {col!r}")
                  for j, col in enumerate(columns)}
        parsed.append({"cat1": cat1, "cat2": cat2, "counts": counts})
    return {"columns": columns, "rows": parsed}


def _area_view(column: str, geo_level: str, rows: list[dict]) -> dict:
    by_cat1: dict[str, int] = {}
    mid_rows = []
    for r in rows:
        value = r["counts"][column]
        by_cat1[r["cat1"]] = by_cat1.get(r["cat1"], 0) + value
        mid_rows.append({"cat1": r["cat1"], "cat2": r["cat2"], "count": value})
    ordered = {k: by_cat1[k] for k in CAT1_ORDER if k in by_cat1}
    for k in sorted(by_cat1):
        if k not in ordered:
            ordered[k] = by_cat1[k]
    return {
        "column": column,
        "geo_level": geo_level,
        "unit": UNIT,
        "total": sum(ordered.values()),
        "by_cat1": ordered,
        "by_cat2": mid_rows,
    }


def find_population_csv(raw_safety_dir: str | Path) -> Path | None:
    hits = sorted(Path(raw_safety_dir).glob("population*.csv"))
    return hits[0] if hits else None


def build_safety(raw_csv: str | Path, raw_safety_dir: str | Path | None = None) -> dict:
    """Build the safety.json payload from the raw CSV path."""
    parsed = load_crime_csv(raw_csv)
    missing = sorted({col for col, _ in AREA_COLUMNS.values()}
                      - set(parsed["columns"]))
    if missing:
        raise ValueError(f"safety: CSV lacks columns {missing}")
    areas = {area: _area_view(col, level, parsed["rows"])
             for area, (col, level) in AREA_COLUMNS.items()}
    pop_path = find_population_csv(
        raw_safety_dir if raw_safety_dir is not None else Path(raw_csv).parent)
    return {
        "source": SOURCE_NAME,
        "period": PERIOD,
        "unit": UNIT,
        "areas": areas,
        "population": None,
        "population_note": ("인구 테이블(data/raw/safety/population*.csv)이 없어 "
                            "인구 대비 발생률은 계산하지 않습니다."
                            if pop_path is None else
                            f"population table present: {pop_path.name} (rates not computed in 9a)"),
        "caveats": [
            "수치는 범죄가 기록된 곳(관할) 기준 발생 건수이며, 거주자의 위험도가 아닙니다.",
            "성남시는 시(city) 단위 통계라 판교/분당을 분리할 수 없습니다.",
            "관할 단위가 다른 지역(구 vs 시)의 건수는 직접 비교할 수 없습니다.",
            "점수·순위·등급을 매기지 않습니다.",
        ],
    }


def run_build(raw_csv: str | Path | None = None,
              build_dir: str | Path = "data/build",
              raw_dir: str | Path = "data/raw") -> dict:
    """CLI entry: read the raw CSV, write data/build/region/safety.json."""
    raw_csv = Path(raw_csv) if raw_csv else Path(raw_dir) / "safety" / CSV_NAME
    if not raw_csv.exists():
        raise FileNotFoundError(
            f"safety CSV not found: {raw_csv} (operator-provided, gitignored)")
    doc = build_safety(raw_csv, Path(raw_dir) / "safety")
    try:
        doc["regions"] = build_region_safety(raw_csv)
        regions_note = None
    except ValueError as exc:
        doc["regions"] = {}
        regions_note = str(exc)
    doc["regions_note"] = regions_note
    out = Path(build_dir) / "region" / "safety.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8")
    return {"file": str(out),
            "areas": sorted(doc["areas"]),
            "regions": sorted(doc["regions"]),
            "regions_note": regions_note,
            "total_rows": sum(len(v["by_cat2"]) for v in doc["areas"].values())}
