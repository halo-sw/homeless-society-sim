"""Assemble the self-contained area file plus the per-area build report.

Reads ``area_def.json``, ``osm.json``, ``buildings.json`` and ``graph.json``
from an area dir and writes:

* ``area.json`` — everything later stages need (buildings, roads, POIs,
  landuse, trees, walk/bike/drive graph) in WGS84, plus the local metre
  frame origin. Sections larger than :data:`SECTION_SPLIT_BYTES` are
  externalised to ``area.<section>.json`` and referenced as
  ``{"$ref": <filename>}`` so gu-sized areas stay loadable.
* ``report.json`` — station coordinates used, POI counts, inferred-height
  share, walk-graph largest-component share, the ``register_coverage``
  flag, per-phase timings and file sizes.

No wall-clock values are written, so rebuilding an unchanged area produces
byte-identical ``area.json`` (and identical part files).
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

AREA_FILE = "area.json"
REPORT_FILE = "report.json"
SECTION_SPLIT_BYTES = 2_000_000  # sections bigger than this become part files

SECTIONS = ("buildings", "roads", "pois", "landuse", "trees", "graph",
            "complexes")

METERS_PER_DEG_LAT = 111_320.0
COORD_NDIGITS = 7


def _dumps(obj) -> bytes:
    return (json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False)
            + "\n").encode("utf-8")


def _load(area_dir: Path, name: str) -> dict:
    path = area_dir / name
    if not path.exists():
        raise FileNotFoundError(f"{area_dir.name}: {name} missing "
                                f"(run the earlier pipeline stages first)")
    return json.loads(path.read_text(encoding="utf-8"))


def local_xy(lon: float, lat: float, lon0: float, lat0: float) -> tuple[float, float]:
    """Equirectangular projection (metres) around the stored origin."""
    kx = METERS_PER_DEG_LAT * math.cos(math.radians(lat0))
    return ((lon - lon0) * kx, (lat - lat0) * METERS_PER_DEG_LAT)


def feature_bounds(osm: dict) -> tuple[float, float, float, float] | None:
    """Bounds over every geometry in the parsed OSM payload (WGS84)."""
    box = [math.inf, math.inf, -math.inf, -math.inf]

    def walk(coords) -> None:
        if isinstance(coords[0], (int, float)):
            box[0] = min(box[0], coords[0])
            box[1] = min(box[1], coords[1])
            box[2] = max(box[2], coords[0])
            box[3] = max(box[3], coords[1])
        else:
            for part in coords:
                walk(part)

    for key in ("buildings", "roads", "pois", "landuse", "trees"):
        for feat in osm.get(key, []):
            geom = feat.get("geometry") or {}
            if geom.get("coordinates"):
                walk(geom["coordinates"])
    if box[0] == math.inf:
        return None
    return (round(box[0], COORD_NDIGITS), round(box[1], COORD_NDIGITS),
            round(box[2], COORD_NDIGITS), round(box[3], COORD_NDIGITS))


def local_origin(area_def: dict, osm: dict) -> tuple[float, float]:
    """Local-frame origin: station centre for boxes, bounds mid for gu areas."""
    if area_def.get("center"):
        lon0, lat0 = area_def["center"]
        return (float(lon0), float(lat0))
    bounds = feature_bounds(osm)
    if bounds is None:
        raise ValueError(f"{area_def.get('id')}: no features for a local origin")
    return (round((bounds[0] + bounds[2]) / 2, COORD_NDIGITS),
            round((bounds[3] + bounds[1]) / 2, COORD_NDIGITS))


def assemble_area(area_def: dict, osm: dict, buildings: dict,
                  graph: dict) -> tuple[dict, dict[str, object]]:
    """Return the area.json skeleton plus the (possibly split) sections."""
    from .complexes import find_complexes

    area_id = area_def["id"]
    lon0, lat0 = local_origin(area_def, osm)
    bounds = feature_bounds(osm)
    bbox = list(area_def["bbox"]) if area_def.get("bbox") else (
        list(bounds) if bounds else None)
    building_list = buildings.get("buildings", [])
    complexes = find_complexes(building_list, osm.get("landuse", []),
                               lon0, lat0)
    sections: dict[str, object] = {
        "buildings": building_list,
        "roads": osm.get("roads", []),
        "pois": osm.get("pois", []),
        "landuse": osm.get("landuse", []),
        "trees": osm.get("trees", []),
        "graph": {"nodes": graph.get("nodes", {}),
                  "edges": graph.get("edges", {})},
        "complexes": complexes,
    }
    edges = graph.get("edges", {})
    area = {
        "area": area_id,
        "label": area_def.get("label"),
        "kind": area_def.get("kind"),
        "bbox": bbox,
        "center": area_def.get("center"),
        "station": area_def.get("station"),
        "boundary": area_def.get("boundary"),
        "crs": {
            "geographic": "EPSG:4326",
            "local": {
                "type": "equirectangular",
                "origin": {"lon": lon0, "lat": lat0},
                "units": "metre",
            },
        },
        "counts": {
            "buildings": len(sections["buildings"]),
            "roads": len(sections["roads"]),
            "pois": len(sections["pois"]),
            "landuse": len(sections["landuse"]),
            "trees": len(sections["trees"]),
            "graph_nodes": len(graph.get("nodes", {})),
            "walk_edges": len(edges.get("walk", [])),
            "bike_edges": len(edges.get("bike", [])),
            "drive_edges": len(edges.get("drive", [])),
            "complexes": len(sections["complexes"]),
        },
    }
    # Stage 26a: carry country/currency/workplaces when the area_def has
    # them (US areas). Absent keys stay absent, so KR areas are unchanged.
    for _key in ("country", "currency", "workplaces"):
        if _key in area_def:
            area[_key] = area_def[_key]
    return area, sections


def write_area(area_dir: Path, area: dict,
               sections: dict[str, object]) -> dict[str, int]:
    """Write area.json (+ part files); return {filename: bytes}."""
    parts: dict[str, str] = {}
    payload = dict(area)
    for name in SECTIONS:
        blob = _dumps(sections[name])
        if len(blob) > SECTION_SPLIT_BYTES:
            fname = f"area.{name}.json"
            (area_dir / fname).write_bytes(blob)
            payload[name] = {"$ref": fname}
            parts[name] = fname
        else:
            payload[name] = sections[name]
            parts[name] = "inline"
    # Drop part files left over from an earlier layout (e.g. after shrinking).
    for stale in area_dir.glob("area.*.json"):
        if stale.name != AREA_FILE and stale.name not in parts.values():
            stale.unlink()
    blob = _dumps(payload)
    (area_dir / AREA_FILE).write_bytes(blob)
    sizes = {AREA_FILE: len(blob)}
    for fname in sorted(set(parts.values()) - {"inline"}):
        sizes[fname] = (area_dir / fname).stat().st_size
    return sizes, parts


def build_report(area_def: dict, osm: dict, buildings: dict, graph: dict,
                 sizes: dict[str, int], parts: dict[str, str],
                 timings: dict[str, float],
                 complexes: list | None = None) -> dict:
    """Per-area build report (metrics + provenance, no wall-clock stamps)."""
    bmeta = buildings.get("meta", {})
    gmeta = graph.get("meta", {})
    poi_cats: dict[str, int] = {}
    for poi in osm.get("pois", []):
        cat = poi.get("category", "unknown")
        poi_cats[cat] = poi_cats.get(cat, 0) + 1
    edges = graph.get("edges", {})
    complexes = complexes if complexes is not None else []
    building_list = buildings.get("buildings", [])
    residential_counts: dict[str, int] = {}
    for b in building_list:
        key = b.get("residential", "none")
        residential_counts[key] = residential_counts.get(key, 0) + 1
    homes = [b for b in building_list
             if b.get("residential") in ("apartment", "house", "mixed")]
    residential_inferred_share = (
        round(sum(1 for b in homes
                  if b.get("height_source") == "inferred") / len(homes), 4)
        if homes else None)
    return {
        "area": area_def["id"],
        "label": area_def.get("label"),
        "kind": area_def.get("kind"),
        "station": area_def.get("station"),
        "bbox": area_def.get("bbox"),
        "center": area_def.get("center"),
        "boundary": area_def.get("boundary"),
        "register_coverage": bmeta.get("register_coverage"),
        "register_files": bmeta.get("register_files", []),
        "counts": {
            "buildings": len(building_list),
            "roads": len(osm.get("roads", [])),
            "pois": len(osm.get("pois", [])),
            "landuse": len(osm.get("landuse", [])),
            "trees": len(osm.get("trees", [])),
            "graph_nodes": len(graph.get("nodes", {})),
            "walk_edges": len(edges.get("walk", [])),
            "bike_edges": len(edges.get("bike", [])),
            "drive_edges": len(edges.get("drive", [])),
            "complexes": len(complexes),
        },
        "poi_counts": {"total": len(osm.get("pois", [])),
                       "by_category": poi_cats},
        "height_sources": bmeta.get("height_sources", {}),
        "inferred_share": bmeta.get("inferred_share"),
        "residential_inferred_share": residential_inferred_share,
        "residential_counts": residential_counts,
        "complexes": {
            "total": len(complexes),
            "named": sum(1 for c in complexes if c.get("name")),
            "largest": max((len(c.get("building_ids", [])) for c in complexes),
                           default=0),
        },
        "graph_method": gmeta.get("method", "box"),
        "walk_lcc": gmeta.get("walk_lcc", {}),
        "walk_lcc_box": gmeta.get("walk_lcc_box", gmeta.get("walk_lcc", {})),
        "walk_lcc_buffered": gmeta.get("walk_lcc_buffered",
                                       gmeta.get("walk_lcc", {})),
        "walk_lcc_clipped_raw": gmeta.get("walk_lcc_clipped_raw",
                                          gmeta.get("walk_lcc", {})),
        "split": any(v != "inline" for v in parts.values()),
        "parts": parts,
        "timings": timings,
        "sizes": sizes,
    }


def run_build(area_dir: str | Path) -> dict:
    """CLI hook: read stage outputs, write area.json + report.json."""
    area_dir = Path(area_dir)
    started = time.perf_counter()
    phases: dict[str, float] = {}

    step = time.perf_counter()
    area_def = _load(area_dir, "area_def.json")
    osm = _load(area_dir, "osm.json")
    buildings = _load(area_dir, "buildings.json")
    graph = _load(area_dir, "graph.json")
    phases["load"] = round(time.perf_counter() - step, 2)

    step = time.perf_counter()
    area, sections = assemble_area(area_def, osm, buildings, graph)
    phases["assemble"] = round(time.perf_counter() - step, 2)

    step = time.perf_counter()
    sizes, parts = write_area(area_dir, area, sections)
    # Stage 3: re-apply cached recap households offline (no network, no
    # key), so a rebuild after register-fill keeps complex households.
    from .register_api import reapply_cached_recaps

    recap_counts = reapply_cached_recaps(area_dir)
    if recap_counts["recap_complexes"]:
        # Recap attach rewrites area.json (or its complexes part file).
        sizes[AREA_FILE] = (area_dir / AREA_FILE).stat().st_size
        if parts.get("complexes") != "inline":
            fname = parts["complexes"]
            sizes[fname] = (area_dir / fname).stat().st_size
    # Input sizes for scale reporting (songpa peak output size).
    for name in ("osm.json", "buildings.json", "graph.json"):
        sizes[name] = (area_dir / name).stat().st_size
    timings = {"area_build_seconds": 0.0, "phases": phases}
    report = build_report(area_def, osm, buildings, graph, sizes, parts,
                          timings, sections.get("complexes"))
    (area_dir / REPORT_FILE).write_bytes(_dumps(report))
    phases["write"] = round(time.perf_counter() - step, 2)
    timings["area_build_seconds"] = round(time.perf_counter() - started, 2)
    # Rewrite once so the report carries the final timings (still no clock).
    (area_dir / REPORT_FILE).write_bytes(_dumps(report))

    counts = report["counts"]
    return {
        "buildings": counts["buildings"],
        "pois": counts["pois"],
        "complexes": counts["complexes"],
        "register_recaps": recap_counts,
        "split": report["split"],
        "parts": parts,
        "register_coverage": report["register_coverage"],
        "inferred_share": report["inferred_share"],
        "residential_inferred_share": report["residential_inferred_share"],
        "residential_counts": report["residential_counts"],
        "walk_lcc_share": report["walk_lcc"].get("share"),
        "walk_lcc_box_share": report["walk_lcc_box"].get("share"),
        "bytes_total": sum(sizes.values()),
    }
