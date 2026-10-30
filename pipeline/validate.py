"""Validate a built area against the stage-1 acceptance thresholds.

Checks run against the deliverable itself (``area.json`` + part files):

* the area is not empty (at least one building),
* the street set and the POI set are present (non-empty),
* every ``{"$ref": ...}`` part file exists and parses,
* for 1.2 km scene boxes (``kind == "bbox"``): inferred-height share
  among residential buildings (``apartment`` + ``house`` + ``mixed``)
  <= 30 %, walk-graph largest-component share >= 95 %, >= 50 named
  POIs. The all-buildings inferred share stays a reported number
  (``report.json`` → ``inferred_share``), not a gate.

Stage 2 notes: the walk-LCC threshold applies to the buffered share
(``report.json`` → ``walk_lcc``, connectivity on the 300 m buffered
graph), cross-checked by recomputing the raw clipped LCC from the
deliverable itself against ``walk_lcc_clipped_raw``. The ``complexes``
section (when present) must reference real building ids, and any
``residential`` value present must be in the documented enum.

Stage 3 notes: buildings without a ``residential`` key (pre-stage-2
areas) are excluded from the residential gate; a scene box with no
residential buildings passes the height gate vacuously.

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

# Stage 26a: the US has no national building register and OSM heights
# are sparse, so the inferred-height share gate is a warning for US
# areas, not a failure.
US_HEIGHT_WARNING = ("US area: no building register; heights are OSM "
                     "or inferred (warning only)")

AREA_FILE = "area.json"
REPORT_FILE = "report.json"

RESIDENTIAL_VALUES = ("apartment", "house", "mixed", "none")
RESIDENTIAL_HOME_VALUES = ("apartment", "house", "mixed")  # the gate set
COMPLEX_NAME_SOURCES = ("register", "osm_landuse")
# Sections that may be absent (stage-1 areas predate them): validated when
# present, silently defaulted when missing.
OPTIONAL_SECTIONS = ("complexes",)


def _resolve_sections(area_dir: Path, area: dict) -> tuple[dict, list[str]]:
    """Inline ``{"$ref": file}`` sections; returns (sections, errors)."""
    from .area_build import SECTIONS

    sections: dict = {}
    errors: list[str] = []
    for name in SECTIONS:
        value = area.get(name, "MISSING")
        if value == "MISSING":
            if name in OPTIONAL_SECTIONS:
                sections[name] = []
                continue
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
    complexes = sections.get("complexes", [])
    if not isinstance(buildings, list) or not buildings:
        errors.append(f"{area_id}: area empty — no buildings in {AREA_FILE}")
    if not isinstance(roads, list) or not roads:
        errors.append(f"{area_id}: street set missing — no roads in {AREA_FILE}")
    if not isinstance(pois, list) or not pois:
        errors.append(f"{area_id}: POI set missing — no POIs in {AREA_FILE}")

    # Stage-2 section checks (validated when present).
    if isinstance(buildings, list):
        bad_res = sorted({b.get("residential") for b in buildings
                          if "residential" in b
                          and b.get("residential") not in RESIDENTIAL_VALUES})
        if bad_res:
            errors.append(
                f"{area_id}: buildings carry unknown residential values: "
                f"{bad_res}")
    if isinstance(complexes, list) and complexes:
        building_ids = {b.get("id") for b in buildings
                        if isinstance(b, dict)}
        for comp in complexes:
            if not isinstance(comp, dict):
                errors.append(f"{area_id}: complex entry is not an object")
                break
            missing = {"id", "name", "name_source", "building_ids",
                       "centroid", "households_hint",
                       "max_floors"} - set(comp)
            if missing:
                errors.append(
                    f"{area_id}: complex {comp.get('id')} misses keys: "
                    f"{sorted(missing)}")
                continue
            unknown = [bid for bid in comp.get("building_ids", [])
                       if bid not in building_ids]
            if unknown:
                errors.append(
                    f"{area_id}: complex {comp.get('id')} references "
                    f"unknown buildings: {unknown[:5]}")
            name, source = comp.get("name"), comp.get("name_source")
            if (name is None) != (source is None):
                errors.append(
                    f"{area_id}: complex {comp.get('id')} has "
                    f"name={name!r} with name_source={source!r}")
            elif source is not None and source not in COMPLEX_NAME_SOURCES:
                errors.append(
                    f"{area_id}: complex {comp.get('id')} has unknown "
                    f"name_source={source!r}")

    try:
        report = json.loads(
            (area_dir / REPORT_FILE).read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"{area_id}: {REPORT_FILE} is missing")
        return errors
    except json.JSONDecodeError as exc:
        errors.append(f"{area_id}: {REPORT_FILE} does not parse: {exc}")
        return errors

    if area_def.get("kind") == "bbox":
        is_us = area_def.get("country") == "US"
        n_pois = len(pois) if isinstance(pois, list) else 0
        if n_pois < POIS_MIN_SCENE:
            errors.append(
                f"{area_id}: only {n_pois} named POIs, "
                f"need >= {POIS_MIN_SCENE} per scene box")
        if isinstance(buildings, list) and buildings:
            homes = [b for b in buildings
                     if b.get("residential") in RESIDENTIAL_HOME_VALUES]
            inferred = sum(1 for b in buildings
                           if b.get("height_source") == "inferred")
            all_share = round(inferred / len(buildings), 4)
            if homes:
                res_inferred = sum(1 for b in homes
                                   if b.get("height_source") == "inferred")
                share = round(res_inferred / len(homes), 4)
                if share > INFERRED_MAX_SHARE and not is_us:
                    errors.append(
                        f"{area_id}: residential inferred-height share "
                        f"{share:.1%} ({res_inferred}/{len(homes)}) exceeds "
                        f"{INFERRED_MAX_SHARE:.0%} per scene box "
                        f"(all-buildings {all_share:.1%})")
        graph = sections.get("graph")
        raw = _walk_lcc_share(graph) if isinstance(graph, dict) else None
        rep_lcc = report.get("walk_lcc") or {}
        after = rep_lcc.get("share")
        if after is None:
            # Pre-stage-2 report: threshold on the recomputed share.
            if raw is None:
                errors.append(f"{area_id}: walk graph missing, cannot check LCC")
            elif raw < WALK_LCC_MIN_SHARE:
                errors.append(
                    f"{area_id}: walk-graph largest component {raw:.1%} "
                    f"below {WALK_LCC_MIN_SHARE:.0%} per scene box")
        else:
            rep_raw = (report.get("walk_lcc_clipped_raw") or {}).get("share")
            if raw is None:
                errors.append(f"{area_id}: walk graph missing, cannot check LCC")
            elif rep_raw is not None and raw != rep_raw:
                errors.append(
                    f"{area_id}: {REPORT_FILE} walk_lcc_clipped_raw={rep_raw} "
                    f"disagrees with {AREA_FILE} ({raw})")
            box_share = (report.get("walk_lcc_box") or {}).get("share")
            if after < WALK_LCC_MIN_SHARE:
                detail = (f" (box-only {box_share:.1%})"
                          if isinstance(box_share, float) else "")
                errors.append(
                    f"{area_id}: walk-graph largest component {after:.1%} "
                    f"buffered{detail} below {WALK_LCC_MIN_SHARE:.0%} "
                    f"per scene box")

    # Cross-check the report against the deliverable (catches stale reports).
    counts = report.get("counts", {})
    for name, section in (("buildings", buildings), ("roads", roads),
                          ("pois", pois)):
        if isinstance(section, list) and counts.get(name) != len(section):
            errors.append(
                f"{area_id}: {REPORT_FILE} counts[{name}]={counts.get(name)} "
                f"disagrees with {AREA_FILE} ({len(section)})")
    if (isinstance(complexes, list) and "complexes" in counts
            and counts.get("complexes") != len(complexes)):
        errors.append(
            f"{area_id}: {REPORT_FILE} counts[complexes]={counts.get('complexes')} "
            f"disagrees with {AREA_FILE} ({len(complexes)})")
    return errors


def run_build(area_dir: str | Path) -> dict:
    """CLI hook: validate the area, return failure flag + error messages."""
    errors = validate_area(area_dir)
    area_dir = Path(area_dir)
    try:
        report = json.loads((area_dir / REPORT_FILE).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        report = {}
    try:
        area_def = json.loads(
            (area_dir / "area_def.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        area_def = {}
    warnings = ([US_HEIGHT_WARNING]
                if isinstance(area_def, dict)
                and area_def.get("country") == "US" else [])
    counts = report.get("counts", {}) if isinstance(report, dict) else {}
    return {
        "failed": bool(errors),
        "errors": errors,
        "warnings": warnings,
        "checks": {
            "buildings": counts.get("buildings", 0),
            "roads": counts.get("roads", 0),
            "pois": counts.get("pois", 0),
            "inferred_share": report.get("inferred_share"),
            "residential_inferred_share": report.get(
                "residential_inferred_share"),
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
