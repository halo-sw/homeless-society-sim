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
    from .areas import is_station_box

    started = time.time()
    if area_id not in AREA_IDS and not is_station_box(area_id):
        raise KeyError(f"unknown area {area_id!r}; choose from {list(AREA_IDS)}, st-<station>, or station:*")
    area_dir = build_dir / area_id
    area_dir.mkdir(parents=True, exist_ok=True)

    # Station boxes are incremental: skip when the manifest matches.
    manifest_sig = _box_signature(area_id, build_dir, raw_pbf)
    if (manifest_sig is not None and not overwrite
            and _manifest_matches(area_dir, manifest_sig)):
        return {"area": area_id, "area_dir": str(area_dir),
                "skipped": True, "reason": "manifest matches (same inputs)",
                "seconds": round(time.time() - started, 1), "stages": []}

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
    summary = {"area": area_id, "area_dir": str(area_dir),
               "osm_json": str(osm_path),
               "seconds": round(time.time() - started, 1), "stages": stages}
    if is_station_box(area_id):
        _record_box_build(area_id, build_dir, raw_pbf, summary)
    return summary


def _box_signature(area_id: str, build_dir: Path,
                   raw_pbf: Path) -> dict | None:
    """Input signature for a station box, or None for legacy areas."""
    from .areas import is_station_box
    from .boxes import REGION_EXTRACT_DIR, load_boxes, manifest_signature

    if not is_station_box(area_id):
        return None
    boxes = load_boxes(build_dir)
    if not boxes:
        return None
    station = area_id[len("st-"):]
    hit = next((b for b in boxes.get("boxes", [])
                if b.get("station") == station), None)
    if hit is None or hit.get("lon") is None:
        return None
    region = hit.get("region")
    source = (build_dir / REGION_EXTRACT_DIR / f"{region}.osm.pbf"
              if region else raw_pbf)
    if not source.exists():
        source = raw_pbf
    try:
        return manifest_signature(hit, source)
    except (LookupError, OSError):
        return None


def _manifest_matches(area_dir: Path, sig: dict) -> bool:
    from .boxes import manifest_matches

    return manifest_matches(area_dir, sig)


def _record_box_build(area_id: str, build_dir: Path, raw_pbf: Path,
                      summary: dict) -> None:
    """Write the box manifest + per-box time/size report entry."""
    from .boxes import (dir_size_bytes, update_boxes_report, write_areas_index,
                        write_manifest)

    area_dir = build_dir / area_id
    sig = _box_signature(area_id, build_dir, raw_pbf)
    size = dir_size_bytes(area_dir)
    if sig is not None:
        write_manifest(area_dir, sig, {"seconds": summary["seconds"],
                                       "size_bytes": size})
    update_boxes_report(build_dir, {"box": area_id,
                                    "seconds": summary["seconds"],
                                    "size_bytes": size,
                                    "failed": bool(_stage_failed(
                                        summary["stages"]))})
    write_areas_index(build_dir)


def expand_area_patterns(patterns: list[str], build_dir: Path) -> list[str]:
    """Expand --areas patterns: ids, ``station:*``, ``region:<id>``.

    ``station:*`` selects every discovered station box;
    ``region:<id>`` selects that region's boxes. Unknown ids raise
    KeyError; duplicates collapse (order kept).
    """
    from .areas import is_station_box
    from .boxes import box_id_of, load_boxes

    out: list[str] = []
    for pat in patterns:
        pat = pat.strip()
        if not pat:
            continue
        if pat == "station:*":
            boxes = load_boxes(build_dir)
            if not boxes:
                raise KeyError("station:* needs data/build/station-boxes.json "
                               "(run `pipeline boxes` first)")
            for box in boxes.get("boxes", []):
                if box.get("lon") is not None:
                    out.append(box_id_of(box["station"]))
                else:
                    print(f"skip {box.get('station')}: no OSM coordinates",
                          file=sys.stderr)
        elif pat.startswith("region:"):
            region = pat[len("region:"):]
            boxes = load_boxes(build_dir)
            if not boxes:
                raise KeyError(f"{pat} needs data/build/station-boxes.json "
                               "(run `pipeline boxes` first)")
            for box in boxes.get("boxes", []):
                if box.get("region") == region and box.get("lon") is not None:
                    out.append(box_id_of(box["station"]))
        elif pat in AREA_IDS or is_station_box(pat):
            out.append(pat)
        else:
            raise KeyError(f"unknown area {pat!r}; choose from "
                           f"{list(AREA_IDS)}, st-<station>, station:*, "
                           "or region:<id>")
    seen: set[str] = set()
    ordered = []
    for area_id in out:
        if area_id not in seen:
            seen.add(area_id)
            ordered.append(area_id)
    return ordered


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
    # Comma-separated --areas: st-판교,station:*,region:bundang,pangyo.
    patterns = [args.area] if args.area else []
    if args.areas:
        patterns += args.areas.split(",")
    if not patterns:
        print("error: pass --area <id>, --areas <patterns> or --all",
              file=sys.stderr)
        return 2
    area_ids = expand_area_patterns(patterns, build_dir)
    if len(area_ids) == 1:
        result = build_area(area_ids[0], raw_pbf, build_dir, args.osmium,
                            args.overwrite)
        print(json.dumps(result, indent=2, sort_keys=True,
                         ensure_ascii=False))
        failures = _stage_failed(result.get("stages", []))
        for message in failures:
            print(f"VALIDATION FAILED: {message}", file=sys.stderr)
        return 1 if failures else 0
    from .boxes import write_areas_index

    results = {}
    for area_id in area_ids:
        try:
            results[area_id] = build_area(area_id, raw_pbf, build_dir,
                                          args.osmium, args.overwrite)
        except (FileNotFoundError, LookupError, KeyError,
                RuntimeError) as exc:
            results[area_id] = {"area": area_id, "error": str(exc)}
    write_areas_index(build_dir)
    print(json.dumps(results, indent=2, sort_keys=True,
                     ensure_ascii=False))
    failures = [m for r in results.values()
                for m in _stage_failed(r.get("stages", []))]
    failures += [f"{a}: {r['error']}" for a, r in results.items()
                 if "error" in r]
    for message in failures:
        print(f"BUILD FAILED: {message}", file=sys.stderr)
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


def cmd_safety(args) -> int:
    from .safety import run_build

    summary = run_build(raw_csv=Path(args.csv) if args.csv else None,
                        build_dir=Path(args.build_dir),
                        raw_dir=Path(args.raw_dir))
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


def cmd_regions(args) -> int:
    from .regions import run_build

    summary = run_build(raw_pbf=Path(args.raw),
                        build_dir=Path(args.build_dir),
                        osmium_bin=args.osmium or "osmium",
                        refresh=args.refresh)
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


def cmd_boxes(args) -> int:
    from .boxes import run_discovery, write_areas_index

    if args.index_only:
        summary = write_areas_index(Path(args.build_dir))
        print(json.dumps(summary, indent=2, sort_keys=True,
                         ensure_ascii=False))
        return 0
    summary = run_discovery(raw_pbf=Path(args.raw),
                            build_dir=Path(args.build_dir),
                            regions_path=Path(args.regions)
                            if args.regions else None,
                            osmium_bin=args.osmium or "osmium",
                            overwrite=args.overwrite,
                            max_boxes=args.max_boxes)
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


def cmd_homes(args) -> int:
    from .homes import run_build

    summary = run_build(raw_dir=Path(args.raw_dir),
                        build_dir=Path(args.build_dir),
                        regions_path=Path(args.regions)
                        if args.regions else None,
                        photos_path=Path(args.photos)
                        if args.photos else None,
                        limit=args.limit,
                        skip_osm_names=args.skip_osm_names)
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


def cmd_walkgraph(args) -> int:
    from .walkgraph import cmd_walkgraph as run

    return run(args)


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

    b = sub.add_parser("build", help="build one area, a pattern list, or all areas")
    b.add_argument("--area", default=None,
                   help="one area id (legacy id or st-<station>)")
    b.add_argument("--areas", default=None,
                   help="comma-separated ids/patterns: st-판교, station:*, region:bundang")
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

    s = sub.add_parser("safety",
                       help="build data/build/region/safety.json from the police crime CSV")
    s.add_argument("--csv", default=None,
                   help="crime CSV (default: data/raw/safety/경찰청_범죄 발생 지역별 통계_20251231.csv)")
    s.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    s.add_argument("--raw-dir", default="data/raw")
    s.set_defaults(func=cmd_safety)

    g = sub.add_parser("regions",
                       help="resolve the 9 search regions, write data/build/regions.json")
    g.add_argument("--raw", default=str(DEFAULT_RAW_PBF))
    g.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    g.add_argument("--osmium", default="osmium")
    g.add_argument("--refresh", action="store_true",
                   help="rebuild cached prefilters/relation files even when fresh")
    g.set_defaults(func=cmd_regions)

    x = sub.add_parser("boxes",
                       help="discover station scene boxes (region extracts clipped once)")
    x.add_argument("--raw", default=str(DEFAULT_RAW_PBF))
    x.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    x.add_argument("--regions", default=None,
                   help="regions.json path (default: <build-dir>/regions.json)")
    x.add_argument("--osmium", default="osmium")
    x.add_argument("--overwrite", action="store_true",
                   help="re-clip region extracts even when cached")
    x.add_argument("--max-boxes", type=int, default=60)
    x.add_argument("--index-only", action="store_true",
                   help="only rewrite data/build/areas-index.json from built dirs")
    x.set_defaults(func=cmd_boxes)

    h = sub.add_parser("homes",
                       help="build data/build/homes-index.json from RTMS + register + boxes")
    h.add_argument("--raw-dir", default="data/raw")
    h.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    h.add_argument("--regions", default=None,
                   help="regions.json path (default: <build-dir>/regions.json)")
    h.add_argument("--photos", default=None,
                   help="commons-photos.json path (default: scenarios/places/commons-photos.json)")
    h.add_argument("--limit", type=int, default=None,
                   help="debug: stop after N RTMS rows per file")
    h.add_argument("--skip-osm-names", action="store_true",
                   help="debug: skip the OSM complex-name second join")
    h.set_defaults(func=cmd_homes)

    w = sub.add_parser("walkgraph",
                       help="build data/build/walkgraph/<region>.json from the region extracts")
    w.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    w.add_argument("--regions", default=None,
                   help="comma-separated region ids (default: all 9)")
    w.set_defaults(func=cmd_walkgraph)

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
