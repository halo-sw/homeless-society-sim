"""Clip the national PBF to one area via the osmium CLI.

Box areas use ``osmium extract --bbox``; the Songpa-gu full boundary area
fetches its boundary relation (``osmium getid -r``) and clips with
``osmium extract --polygon``. Writes ``area_def.json`` (the recorded OSM
lookup) and ``extract.osm.pbf`` into ``data/build/<area>/``.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from .areas import (AREA_IDS, DEFAULT_BUILD_DIR, DEFAULT_RAW_PBF, AreaDef,
                    resolve_all, resolve_area)

CANDIDATE_FILE = "candidates.osm.pbf"
BOUNDARY_FILE = "songpa-boundary.osm.pbf"
AREA_DEF_FILE = "area_def.json"
EXTRACT_FILE = "extract.osm.pbf"
BUFFERED_FILE = "extract.buffered.osm.pbf"

# Stage 2: scene-box graphs are built from a buffered extract so paths that
# connect just outside the box count as connected (no invented connectors).
BUFFER_M = 300.0
METERS_PER_DEG_LAT = 111_320.0


def buffered_bbox(bbox: tuple[float, float, float, float],
                  meters: float = BUFFER_M) -> tuple[float, float, float, float]:
    """Expand a WGS84 bbox by ``meters`` on every side (equirectangular)."""
    import math

    minlon, minlat, maxlon, maxlat = bbox
    lat0 = (minlat + maxlat) / 2
    dlat = meters / METERS_PER_DEG_LAT
    dlon = meters / (METERS_PER_DEG_LAT * math.cos(math.radians(lat0)))
    return (minlon - dlon, minlat - dlat, maxlon + dlon, maxlat + dlat)


def find_osmium(explicit: str | None = None) -> str:
    if explicit:
        return explicit
    found = shutil.which("osmium") or "/opt/homebrew/bin/osmium"
    if not shutil.which(found) and not Path(found).exists():
        raise FileNotFoundError("osmium CLI not found; expected it on PATH")
    return found


def run_osmium(osmium_bin: str, args: list[str]) -> None:
    proc = subprocess.run([osmium_bin, *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"osmium {' '.join(args)} failed: {proc.stderr.strip()}")


def clip_bbox(osmium_bin: str, src_pbf: Path,
              bbox: tuple[float, float, float, float], dst_pbf: Path) -> Path:
    dst_pbf.parent.mkdir(parents=True, exist_ok=True)
    left, bottom, right, top = (f"{v:.7f}" for v in bbox)
    run_osmium(osmium_bin, ["extract", "-b", f"{left},{bottom},{right},{top}",
                            str(src_pbf), "-o", str(dst_pbf), "-O",
                            "--no-progress"])
    return dst_pbf


def fetch_relation(osmium_bin: str, src_pbf: Path, relation_id: int,
                   dst_pbf: Path) -> Path:
    """Fetch one relation plus everything it references."""
    dst_pbf.parent.mkdir(parents=True, exist_ok=True)
    run_osmium(osmium_bin, ["getid", "-r", str(src_pbf), f"r{relation_id}",
                            "-o", str(dst_pbf), "-O", "--no-progress"])
    return dst_pbf


def clip_polygon(osmium_bin: str, src_pbf: Path, polygon_file: Path,
                 dst_pbf: Path) -> Path:
    dst_pbf.parent.mkdir(parents=True, exist_ok=True)
    run_osmium(osmium_bin, ["extract", "-p", str(polygon_file), str(src_pbf),
                            "-o", str(dst_pbf), "-O", "--no-progress"])
    return dst_pbf


def area_dir(build_dir: Path, area_id: str) -> Path:
    return build_dir / area_id


def ensure_extract(area_id: str, raw_pbf: Path = DEFAULT_RAW_PBF,
                   build_dir: Path = DEFAULT_BUILD_DIR,
                   osmium_bin: str | None = None,
                   overwrite: bool = False,
                   area: AreaDef | None = None) -> dict:
    """Resolve the area (OSM lookup) and clip the national PBF to it."""
    from .areas import write_area_def

    if area_id not in AREA_IDS:
        raise KeyError(f"unknown area {area_id!r}; expected one of {list(AREA_IDS)}")
    binary = find_osmium(osmium_bin)
    raw_pbf, build_dir = Path(raw_pbf), Path(build_dir)
    if not raw_pbf.exists():
        raise FileNotFoundError(f"national extract not found: {raw_pbf}")

    if area is None:
        from .areas import build_candidate_extract, scan_candidates

        cand = build_candidate_extract(raw_pbf,
                                       build_dir / "_cache" / CANDIDATE_FILE,
                                       osmium_bin=binary, refresh=overwrite)
        area = resolve_area(area_id, raw_pbf, hits=scan_candidates(cand))

    adir = area_dir(build_dir, area_id)
    extract_path = adir / EXTRACT_FILE
    if area.kind == "boundary":
        # The register stream clips to this file; make sure it exists even
        # when the area extract itself is a cache hit.
        ensure_boundary_file(binary, raw_pbf, build_dir, area,
                             overwrite=overwrite)
    if extract_path.exists() and not overwrite:
        return {"area": area.to_dict(), "extract": str(extract_path),
                "cached": True}

    write_area_def(area, adir / AREA_DEF_FILE)
    if area.kind == "bbox":
        assert area.bbox is not None
        clip_bbox(binary, raw_pbf, area.bbox, extract_path)
    else:
        assert area.boundary is not None
        boundary_file = build_dir / "_cache" / BOUNDARY_FILE
        clip_polygon(binary, raw_pbf, boundary_file, extract_path)
    return {"area": area.to_dict(), "extract": str(extract_path),
            "cached": False}


def ensure_boundary_file(osmium_bin: str, raw_pbf: Path, build_dir: Path,
                         area: AreaDef, overwrite: bool = False) -> Path:
    """Fetch the admin-boundary relation PBF into the build cache."""
    assert area.boundary is not None
    boundary_file = build_dir / "_cache" / BOUNDARY_FILE
    if overwrite or not boundary_file.exists():
        fetch_relation(osmium_bin, raw_pbf, area.boundary["relation_id"],
                       boundary_file)
    return boundary_file


def ensure_buffered_extract(area_id: str, raw_pbf: Path = DEFAULT_RAW_PBF,
                            build_dir: Path = DEFAULT_BUILD_DIR,
                            osmium_bin: str | None = None,
                            overwrite: bool = False) -> dict:
    """Clip the national PBF to the scene box + 300 m buffer (bbox areas).

    Reads the already-resolved ``area_def.json`` (written by
    :func:`ensure_extract`); boundary areas have no box to buffer and
    return ``{"buffered": False}``.
    """
    import json

    if area_id not in AREA_IDS:
        raise KeyError(f"unknown area {area_id!r}; expected one of {list(AREA_IDS)}")
    binary = find_osmium(osmium_bin)
    raw_pbf, build_dir = Path(raw_pbf), Path(build_dir)
    adir = area_dir(build_dir, area_id)
    area_def_path = adir / AREA_DEF_FILE
    if not area_def_path.exists():
        raise FileNotFoundError(
            f"{area_id}: {AREA_DEF_FILE} missing (run extract first)")
    area_def = json.loads(area_def_path.read_text(encoding="utf-8"))
    if area_def.get("kind") != "bbox" or not area_def.get("bbox"):
        return {"area": area_id, "buffered": False}
    out = adir / BUFFERED_FILE
    if out.exists() and not overwrite:
        return {"area": area_id, "buffered": True,
                "extract": str(out), "cached": True}
    clip_bbox(binary, raw_pbf, buffered_bbox(tuple(area_def["bbox"])), out)
    return {"area": area_id, "buffered": True,
            "extract": str(out), "cached": False}


def ensure_all_extracts(raw_pbf: Path = DEFAULT_RAW_PBF,
                        build_dir: Path = DEFAULT_BUILD_DIR,
                        osmium_bin: str | None = None,
                        overwrite: bool = False) -> dict[str, dict]:
    """Resolve all areas with one national scan, then clip each in turn."""
    binary = find_osmium(osmium_bin)
    raw_pbf, build_dir = Path(raw_pbf), Path(build_dir)
    areas = resolve_all(raw_pbf, build_dir / "_cache", osmium_bin=binary,
                        refresh=overwrite)
    return {aid: ensure_extract(aid, raw_pbf, build_dir, binary, overwrite,
                                area=area)
            for aid, area in areas.items()}
