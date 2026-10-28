"""Validate a built area against the stage-1 acceptance thresholds.

Checks run against the deliverable itself (``area.json`` + part files):

* the area is not empty (at least one building),
* the street set and the POI set are present (non-empty),
* every ``{"$ref": ...}`` part file exists and parses,
* for 1.2 km scene boxes (``kind == "bbox"``): inferred-height share
  <= 30 %, walk-graph largest-component share >= 95 %, >= 50 named POIs.

Gu-sized boundary areas (``kind == "boundary"``) are exempt from the
scene-box thresholds but must still be non-empty with streets and POIs.

``run_build`` reports ``{"failed": bool, "errors": [...]}`` and the CLI
turns a failure into a non-zero exit with the messages on stderr.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

INFERRED_MAX_SHARE = 0.30
WALK_LCC_MIN_SHARE = 0.95
POIS_MIN_SCENE = 50

AREA_FILE = "area.json"
REPORT_FILE = "report.json"


def _resolve_sections(area_dir: Path, area: dict) -> tuple[dict, list[str]]:
    """Inline ``{"$ref": file}`` sections; returns (sections, errors)."""
    from .area_build import SECTIONS

    sections: dict = {}
    errors: list[str] = []
    for name in SECTIONS:
        value = area.get(name, "MISSING")
        if value == "MISSING":
            errors.append(f"{area_dir.name}: area.json has no {name!r} section")
            continue
        if isinstance(value, dict) and set(value) == {"$ref"}:
            part = area_dir / value["$ref"]
            if not part.exists():
                errors.append(f"{area_dir.name}: split part {value['$ref']!r} "
                              f"for section {name!r} is missing")
                continue
            try:
                sections[name] = json.loads(part.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                errors.append(f"{area_dir.name}: split part {value['$ref']!r} "
                              f"does not parse: {exc}")
        else:
            sections[name] = value
    return sections, errors


def _walk_lcc_share(graph: dict) -> float | None:
    from .graph import largest_component_share

    nodes = graph.get("nodes")
    edges = (graph.get("edges") or {}).get("walk")
    if not isinstance(nodes, dict) or not isinstance(edges, list):
        return None
    return largest_component_share(nodes, edges)["share"]


def validate_area(area_dir: str | Path) -> list[str]:
    """Return the list of validation errors (empty means the area passes)."""
    area_dir = Path(area_dir)
    area_id = area_dir.name
    errors: list[str] = []

    try:
        area = json.loads((area_dir / AREA_FILE).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [f"{area_id}: {AREA_FILE} is missing (run area_build first)"]
    except json.JSONDecodeError as exc:
        return [f"{area_id}: {AREA_FILE} does not parse: {exc}"]
    try:
        area_def = json.loads(
            (area_dir / "area_def.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [f"{area_id}: area_def.json is missing"]
    except json.JSONDecodeError as exc:
        return [f"{area_id}: area_def.json does not parse: {exc}"]

    sections, ref_errors = _resolve_sections(area_dir, area)
    errors.extend(ref_errors)

    buildings = sections.get("buildings", [])
    roads = sections.get("roads", [])
    pois = sections.get("pois", [])
    if not isinstance(buildings, list) or not buildings:
        errors.append(f"{area_id}: area empty — no buildings in {AREA_FILE}")
    if not isinstance(roads, list) or not roads:
        errors.append(f"{area_id}: street set missing — no roads in {AREA_FILE}")
    if not isinstance(pois, list) or not pois:
        errors.append(f"{area_id}: POI set missing — no POIs in {AREA_FILE}")

    if area_def.get("kind") == "bbox":
        n_pois = len(pois) if isinstance(pois, list) else 0
        if n_pois < POIS_MIN_SCENE:
            errors.append(
                f"{area_id}: only {n_pois} named POIs, "
                f"need >= {POIS_MIN_SCENE} per scene box")
        if isinstance(buildings, list) and buildings:
            inferred = sum(1 for b in buildings
                           if b.get("height_source") == "inferred")
            share = round(inferred / len(buildings), 4)
            if share > INFERRED_MAX_SHARE:
                errors.append(
                    f"{area_id}: inferred-height share {share:.1%} "
                    f"({inferred}/{len(buildings)}) exceeds "
                    f"{INFERRED_MAX_SHARE:.0%} per scene box")
        graph = sections.get("graph")
        share = _walk_lcc_share(graph) if isinstance(graph, dict) else None
        if share is None:
            errors.append(f"{area_id}: walk graph missing, cannot check LCC")
        elif share < WALK_LCC_MIN_SHARE:
            errors.append(
                f"{area_id}: walk-graph largest component {share:.1%} "
                f"below {WALK_LCC_MIN_SHARE:.0%} per scene box")

    # Cross-check the report against the deliverable (catches stale reports).
    try:
        report = json.loads(
            (area_dir / REPORT_FILE).read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"{area_id}: {REPORT_FILE} is missing")
        return errors
    except json.JSONDecodeError as exc:
        errors.append(f"{area_id}: {REPORT_FILE} does not parse: {exc}")
        return errors
    counts = report.get("counts", {})
    for name, section in (("buildings", buildings), ("roads", roads),
                          ("pois", pois)):
        if isinstance(section, list) and counts.get(name) != len(section):
            errors.append(
                f"{area_id}: {REPORT_FILE} counts[{name}]={counts.get(name)} "
                f"disagrees with {AREA_FILE} ({len(section)})")
    return errors


def run_build(area_dir: str | Path) -> dict:
    """CLI hook: validate the area, return failure flag + error messages."""
    errors = validate_area(area_dir)
    area_dir = Path(area_dir)
    try:
        report = json.loads((area_dir / REPORT_FILE).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        report = {}
    counts = report.get("counts", {}) if isinstance(report, dict) else {}
    return {
        "failed": bool(errors),
        "errors": errors,
        "checks": {
            "buildings": counts.get("buildings", 0),
            "roads": counts.get("roads", 0),
            "pois": counts.get("pois", 0),
            "inferred_share": report.get("inferred_share"),
            "walk_lcc_share": (report.get("walk_lcc") or {}).get("share"),
        },
    }


def main(argv: list[str] | None = None) -> int:
    """Standalone entry point: ``python -m pipeline.validate --all``."""
    from .areas import AREA_IDS, DEFAULT_BUILD_DIR

    parser = argparse.ArgumentParser(prog="pipeline.validate",
                                     description="Validate built areas")
    parser.add_argument("--area", choices=list(AREA_IDS), default=None)
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    args = parser.parse_args(argv)
    if not args.all and not args.area:
        print("error: pass --area <id> or --all", file=sys.stderr)
        return 2
    area_ids = list(AREA_IDS) if args.all else [args.area]
    failed = False
    for area_id in area_ids:
        errors = validate_area(Path(args.build_dir) / area_id)
        if errors:
            failed = True
            for message in errors:
                print(f"VALIDATION FAILED: {message}", file=sys.stderr)
        else:
            print(f"{area_id}: PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
