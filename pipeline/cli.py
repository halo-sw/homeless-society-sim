"""One CLI entry point for the area pipeline.

Usage:
    .venv/bin/python -m pipeline build --area pangyo
    .venv/bin/python -m pipeline build --all
    .venv/bin/python -m pipeline areas            # print resolved area defs

``build`` always runs extract + osm_parse and writes ``area_def.json``,
``extract.osm.pbf`` and ``osm.json`` into ``data/build/<area>/``. Downstream
stages plug in by providing a ``run_build(area_dir: Path) -> dict`` function
in ``pipeline.building_join``, ``pipeline.graph``, ``pipeline.area_build``
and ``pipeline.validate``; missing stages are skipped with a note so this
CLI works before and after they land.
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
import time
from pathlib import Path

from .areas import AREA_IDS, DEFAULT_BUILD_DIR, DEFAULT_RAW_PBF, REPO_ROOT

OSM_JSON_FILE = "osm.json"

# Downstream stages in run order; each optional until its module lands.
DOWNSTREAM_STAGES = ("building_join", "graph", "area_build", "validate")


def _run_stage(module_name: str, area_dir: Path) -> dict:
    try:
        module = importlib.import_module(f"pipeline.{module_name}")
    except ImportError:
        return {"stage": module_name, "status": "missing"}
    run_build = getattr(module, "run_build", None)
    if not callable(run_build):
        return {"stage": module_name, "status": "no-run_build"}
    started = time.time()
    summary = run_build(area_dir) or {}
    summary.update({"stage": module_name, "status": "ok",
                    "seconds": round(time.time() - started, 1)})
    return summary


def build_area(area_id: str, raw_pbf: Path, build_dir: Path,
               osmium_bin: str | None, overwrite: bool) -> dict:
    from . import extract as extract_mod
    from . import osm_parse

    started = time.time()
    if area_id not in AREA_IDS:
        raise KeyError(f"unknown area {area_id!r}; choose from {list(AREA_IDS)}")
    area_dir = build_dir / area_id
    area_dir.mkdir(parents=True, exist_ok=True)

    ext = extract_mod.ensure_extract(area_id, raw_pbf, build_dir,
                                     osmium_bin=osmium_bin,
                                     overwrite=overwrite)
    parsed = osm_parse.parse_extract(area_id, build_dir)
    osm_path = osm_parse.write_osm_json(parsed, area_dir / OSM_JSON_FILE)

    stages = [{"stage": "extract", "status": "ok",
               "cached": ext["cached"],
               "seconds": round(time.time() - started, 1)},
              {"stage": "osm_parse", "status": "ok",
               "counts": parsed["meta"]["counts"]}]
    for name in DOWNSTREAM_STAGES:
        result = _run_stage(name, area_dir)
        stages.append(result)
        if result["status"] == "ok" and name == "validate" and result.get("failed"):
            break
    return {"area": area_id, "area_dir": str(area_dir),
            "osm_json": str(osm_path),
            "seconds": round(time.time() - started, 1), "stages": stages}


def build_all(raw_pbf: Path, build_dir: Path, osmium_bin: str | None,
              overwrite: bool) -> dict[str, dict]:
    from . import extract as extract_mod
    from . import osm_parse

    # One national scan for every area, then clip each in turn.
    binary = extract_mod.find_osmium(osmium_bin)
    areas = extract_mod.ensure_all_extracts(raw_pbf, build_dir, binary,
                                            overwrite=overwrite)
    results = {}
    for area_id in AREA_IDS:
        started = time.time()
        area_dir = build_dir / area_id
        parsed = osm_parse.parse_extract(area_id, build_dir)
        osm_path = osm_parse.write_osm_json(parsed, area_dir / OSM_JSON_FILE)
        stages = [{"stage": "extract", "status": "ok",
                   "cached": areas[area_id]["cached"]},
                  {"stage": "osm_parse", "status": "ok",
                   "counts": parsed["meta"]["counts"]}]
        for name in DOWNSTREAM_STAGES:
            stages.append(_run_stage(name, area_dir))
        results[area_id] = {"area": area_id, "area_dir": str(area_dir),
                            "osm_json": str(osm_path),
                            "seconds": round(time.time() - started, 1),
                            "stages": stages}
    return results


def _stage_failed(stages: list[dict]) -> list[str]:
    """Collect validate-stage error messages (empty when nothing failed)."""
    messages: list[str] = []
    for stage in stages:
        if (stage.get("stage") == "validate"
                and stage.get("status") == "ok" and stage.get("failed")):
            messages.extend(stage.get("errors", ["validation failed"]))
    return messages


def cmd_build(args) -> int:
    raw_pbf = Path(args.raw)
    build_dir = Path(args.build_dir)
    if args.all:
        results = build_all(raw_pbf, build_dir, args.osmium, args.overwrite)
        print(json.dumps(results, indent=2, sort_keys=True,
                         ensure_ascii=False))
        failures = [m for r in results.values()
                    for m in _stage_failed(r["stages"])]
        for message in failures:
            print(f"VALIDATION FAILED: {message}", file=sys.stderr)
        return 1 if failures else 0
    if not args.area:
        print("error: pass --area <id> or --all", file=sys.stderr)
        return 2
    result = build_area(args.area, raw_pbf, build_dir, args.osmium,
                        args.overwrite)
    print(json.dumps(result, indent=2, sort_keys=True, ensure_ascii=False))
    failures = _stage_failed(result["stages"])
    for message in failures:
        print(f"VALIDATION FAILED: {message}", file=sys.stderr)
    return 1 if failures else 0


def cmd_congestion(args) -> int:
    from .congestion import run_build

    summary = run_build(xlsx=Path(args.xlsx) if args.xlsx else None,
                        build_dir=Path(args.build_dir))
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


def cmd_network(args) -> int:
    from .network import run_build

    summary = run_build(raw_pbf=Path(args.raw),
                        build_dir=Path(args.build_dir),
                        cache_dir=Path(args.cache_dir) if args.cache_dir else None,
                        osmium_bin=args.osmium or "osmium",
                        refresh=args.refresh)
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


def cmd_corridor(args) -> int:
    from .corridor import run_build

    summary = run_build(from_station=args.from_station, to_station=args.to_station,
                        raw_pbf=Path(args.raw),
                        build_dir=Path(args.build_dir),
                        register_dir=Path(args.register_dir) if args.register_dir else None,
                        criteria_path=Path(args.criteria) if args.criteria
                        else REPO_ROOT / "scenarios" / "criteria" / "kr-default.json",
                        osmium_bin=args.osmium or "osmium")
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


def cmd_areas(args) -> int:
    from .areas import resolve_all

    areas = resolve_all(Path(args.raw), Path(args.build_dir) / "_cache",
                        osmium_bin=args.osmium or "osmium")
    print(json.dumps({k: v.to_dict() for k, v in areas.items()},
                     indent=2, sort_keys=True, ensure_ascii=False))
    return 0


def cmd_register_fill(args) -> int:
    from .register_api import (DEFAULT_CACHE_DIR, RegisterApiError,
                               fill_area)

    build_dir = Path(args.build_dir)
    area_dir = build_dir / args.area
    if not (area_dir / "buildings.json").exists():
        print(f"error: {area_dir}/buildings.json missing "
              f"(build {args.area} first)", file=sys.stderr)
        return 1
    try:
        summary = fill_area(
            area_dir,
            cache_dir=Path(args.cache_dir) if args.cache_dir
            else DEFAULT_CACHE_DIR,
            overwrite=args.overwrite, limit=args.limit,
            dry_run=args.dry_run)
    except (RegisterApiError, ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    # The summary never contains the API key (only counts + area id).
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pipeline",
                                     description="Area data pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    b = sub.add_parser("build", help="build one area or all areas")
    b.add_argument("--area", choices=list(AREA_IDS), default=None)
    b.add_argument("--all", action="store_true")
    b.add_argument("--raw", default=str(DEFAULT_RAW_PBF))
    b.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    b.add_argument("--osmium", default=None,
                   help="osmium binary (default: PATH lookup)")
    b.add_argument("--overwrite", action="store_true",
                   help="re-clip even when an extract already exists")
    b.set_defaults(func=cmd_build)

    a = sub.add_parser("areas", help="print OSM-resolved area definitions")
    a.add_argument("--raw", default=str(DEFAULT_RAW_PBF))
    a.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    a.add_argument("--osmium", default=None)
    a.set_defaults(func=cmd_areas)

    n = sub.add_parser("congestion",
                       help="build data/build/region/congestion.json from the Seoul Metro xlsx")
    n.add_argument("--xlsx", default=None,
                   help="congestion xlsx (default: data/raw/traffic/서울교통공사_지하철혼잡도정보_20260930.xlsx)")
    n.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    n.set_defaults(func=cmd_congestion)

    n = sub.add_parser("network",
                       help="build data/build/region/network.json from OSM route relations")
    n.add_argument("--raw", default=str(DEFAULT_RAW_PBF))
    n.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    n.add_argument("--cache-dir", default=None,
                   help="prefilter cache (default: data/build/_cache)")
    n.add_argument("--osmium", default="osmium")
    n.add_argument("--refresh", action="store_true",
                   help="rebuild the cached prefilter even when fresh")
    n.set_defaults(func=cmd_network)

    n = sub.add_parser("corridor",
                       help="build a low-detail corridor along a station-ride path")
    n.add_argument("--from", dest="from_station", required=True,
                   help="boarding station (e.g. 잠실)")
    n.add_argument("--to", dest="to_station", required=True,
                   help="alighting station (e.g. 판교)")
    n.add_argument("--raw", default=str(DEFAULT_RAW_PBF))
    n.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    n.add_argument("--register-dir", default=None)
    n.add_argument("--criteria", default=None)
    n.add_argument("--osmium", default="osmium")
    n.set_defaults(func=cmd_corridor)

    r = sub.add_parser("register-fill",
                       help="fill inferred heights via the 건축HUB title API")
    r.add_argument("--area", choices=list(AREA_IDS), required=True)
    r.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    r.add_argument("--cache-dir", default=None,
                   help="raw-response cache (default: data/raw/register_api)")
    r.add_argument("--limit", type=int, default=None,
                   help="fill at most N parcels (debug)")
    r.add_argument("--overwrite", action="store_true",
                   help="refetch parcels that already have a cached response")
    r.add_argument("--dry-run", action="store_true",
                   help="print the planned request count without network")
    r.set_defaults(func=cmd_register_fill)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except (FileNotFoundError, LookupError, KeyError,
            RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
