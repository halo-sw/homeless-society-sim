"""DEM loading + resampling for the stage-14 scene build (no network).

Pluggable sources behind one interface — :func:`open_dem` picks by name so a
later source drops in without changes elsewhere:

* ``terrarium`` — AWS Terrain Tiles (Terrarium PNG, zoom 14) under
  ``data/raw/dem/terrarium/14/{x}_{y}.png``. In Korea these are SRTM (~30 m
  effective); the scene step resamples to the spec's 2.5 m grid with bilinear
  interpolation plus weak seeded noise to break flatness (spec §8).
* ``ngii_5m`` — 국토지리정보원 5 m DEM (국토정보플랫폼, sign-up download):
  ESRI ASCII grids (``*.asc``) plus a ``ngii_5m.json`` sidecar declaring the
  grid CRS. Missing data raises with download instructions instead of
  silently falling back.

PNG decoding is stdlib-only (``zlib`` + filters); no PIL dependency.
"""

from __future__ import annotations

import json
import math
import struct
import zlib
from pathlib import Path

import numpy as np

from .scene_geo import M_PER_DEG_LAT, mulberry32, xz_to_lonlat

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DEM_DIR = REPO_ROOT / "data" / "raw" / "dem"

TERRARIUM_OFFSET = 32768.0
TILE_PX = 256

# Weak smoothed value noise over the 2.5 m grid (spec §8: hide the 30 m
# flatness). Lattice every NOISE_CELL_M, bilinear, ±NOISE_AMP_M.
NOISE_CELL_M = 30.0
NOISE_AMP_M = 0.35


# --- stdlib PNG decode (8-bit truecolor, non-interlaced) ---------------------

def decode_png_rgb(path: str | Path) -> np.ndarray:
    """Decode an 8-bit RGB PNG to a (h, w, 3) uint8 array (stdlib only)."""
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path}: not a PNG")
    pos = 8
    width = height = 0
    bit_depth = color_type = interlace = None
    idat = bytearray()
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if ctype == b"IHDR":
            (width, height, bit_depth, color_type, _comp, _filt,
             interlace) = struct.unpack(">IIBBBBB", chunk)
        elif ctype == b"IDAT":
            idat += chunk
        elif ctype == b"IEND":
            break
        pos += 12 + length
    if bit_depth != 8 or color_type != 2 or interlace != 0:
        raise ValueError(
            f"{path}: need 8-bit truecolor non-interlaced "
            f"(got depth={bit_depth} type={color_type} lace={interlace})")
    raw = zlib.decompress(bytes(idat))
    stride = width * 3
    out = np.empty((height, width, 3), dtype=np.uint8)
    prev = bytearray(stride)
    p = 0
    for row in range(height):
        f = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        if f == 1:  # Sub
            for i in range(3, stride):
                line[i] = (line[i] + line[i - 3]) & 0xFF
        elif f == 2:  # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:  # Average
            for i in range(stride):
                a = line[i - 3] if i >= 3 else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:  # Paeth
            for i in range(stride):
                a = line[i - 3] if i >= 3 else 0
                b = prev[i]
                c = prev[i - 3] if i >= 3 else 0
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        elif f != 0:
            raise ValueError(f"{path}: unknown PNG filter {f}")
        out[row] = np.frombuffer(line, dtype=np.uint8).reshape(width, 3)
        prev = line
    return out


def terrarium_to_m(rgb: np.ndarray) -> np.ndarray:
    """Terrarium decode: R*256 + G + B/256 − 32768 (metres, float32)."""
    r = rgb[:, :, 0].astype(np.float64)
    g = rgb[:, :, 1].astype(np.float64)
    b = rgb[:, :, 2].astype(np.float64)
    return (r * 256.0 + g + b / 256.0 - TERRARIUM_OFFSET).astype(np.float32)


# --- WebMercator tile maths ----------------------------------------------------

def tile_xy(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    """Slippy-map tile containing (lon, lat)."""
    n = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(max(-85.0511, min(85.0511, lat)))
    y = int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi)
            / 2.0 * n)
    return (min(max(x, 0), n - 1), min(max(y, 0), n - 1))


def tile_lon_lat(x: int, y: int, zoom: int, px: float, py: float) -> tuple[float, float]:
    """Lon/lat of pixel (px, py) inside tile (x, y) (fractional ok)."""
    n = 2 ** zoom
    lon = (x + px / TILE_PX) / n * 360.0 - 180.0
    t = math.pi * (1.0 - 2.0 * (y + py / TILE_PX) / n)
    lat = math.degrees(math.atan(math.sinh(t)))
    return (lon, lat)


# --- sources -------------------------------------------------------------------

class DemSource:
    """Interface: single-point elevation + provenance for scene meta."""

    name = "base"

    def elevation(self, lon: float, lat: float) -> float | None:
        raise NotImplementedError

    def describe(self) -> dict:
        raise NotImplementedError

    def signature(self) -> dict:
        raise NotImplementedError


class TerrariumSource(DemSource):
    """AWS Terrain Tiles (Terrarium PNG) mosaic with per-tile bilinear."""

    name = "terrarium"

    def __init__(self, root: str | Path = DEFAULT_DEM_DIR, zoom: int = 14):
        self.tile_dir = Path(root) / "terrarium" / str(zoom)
        self.zoom = zoom
        self._tiles: dict[tuple[int, int], np.ndarray | None] = {}

    def _tile(self, x: int, y: int) -> np.ndarray | None:
        key = (x, y)
        if key not in self._tiles:
            path = self.tile_dir / f"{x}_{y}.png"
            self._tiles[key] = (terrarium_to_m(decode_png_rgb(path))
                                if path.exists() else None)
        return self._tiles[key]

    def tiles_for_bbox(self, bbox: tuple[float, float, float, float]
                       ) -> list[tuple[int, int]]:
        x0, y0 = tile_xy(bbox[0], bbox[3], self.zoom)
        x1, y1 = tile_xy(bbox[2], bbox[1], self.zoom)
        return [(x, y) for x in range(min(x0, x1), max(x0, x1) + 1)
                for y in range(min(y0, y1), max(y0, y1) + 1)]

    def elevation(self, lon: float, lat: float) -> float | None:
        n = 2 ** self.zoom
        fx = (lon + 180.0) / 360.0 * n
        lat_r = math.radians(max(-85.0511, min(85.0511, lat)))
        fy = (1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r))
              / math.pi) / 2.0 * n
        # Clamp fractional tile coords into the available mosaic.
        tx = min(max(fx, 0.0), n - 1.0 - 1e-9)
        ty = min(max(fy, 0.0), n - 1.0 - 1e-9)
        x, y = int(tx), int(ty)
        grid = self._tile(x, y)
        if grid is None:
            return None
        # Bilinear inside the tile, clamped at its edge (the mosaic seam
        # error is sub-metre; NGII 5 m replaces this source later anyway).
        px = min(max((tx - x) * TILE_PX - 0.5, 0.0), TILE_PX - 1.001)
        py = min(max((ty - y) * TILE_PX - 0.5, 0.0), TILE_PX - 1.001)
        ix, iy = int(px), int(py)
        txf, tyf = px - ix, py - iy
        jx, jy = min(ix + 1, TILE_PX - 1), min(iy + 1, TILE_PX - 1)
        a = grid[iy, ix]
        b = grid[iy, jx]
        c = grid[jy, ix]
        d = grid[jy, jx]
        return float((a * (1 - txf) + b * txf) * (1 - tyf)
                     + (c * (1 - txf) + d * txf) * tyf)

    def describe(self) -> dict:
        return {"source": "terrarium", "zoom": self.zoom,
                "native_m": 30, "native_note": "SRTM via AWS Terrain Tiles"}

    def signature(self) -> dict:
        tiles = sorted(self.tile_dir.glob("*.png")) if self.tile_dir.exists() else []
        total = sum(t.stat().st_size for t in tiles)
        newest = max((int(t.stat().st_mtime) for t in tiles), default=0)
        return {"tiles": len(tiles), "bytes": total, "newest_mtime": newest}


class Ngii5mSource(DemSource):
    """국토지리정보원 5 m DEM: ESRI ASCII grids + ``ngii_5m.json`` sidecar.

    Expected layout (the user downloads after 국토정보플랫폼 sign-up)::

        data/raw/dem/ngii_5m/
          ngii_5m.json        # {"crs": "EPSG:5186", "nodata": -9999}
          3760*.asc           # ESRI ASCII grids, any tiling

    Convert other deliveries with e.g.
    ``gdal_translate -of AAIGrid in.img out.asc``. Anything missing raises
    with these instructions instead of silently falling back.
    """

    name = "ngii_5m"
    SIDECAR = "ngii_5m.json"

    def __init__(self, root: str | Path = DEFAULT_DEM_DIR):
        from pyproj import Transformer

        self.root = Path(root) / "ngii_5m"
        sidecar = self.root / self.SIDECAR
        if not sidecar.exists():
            raise FileNotFoundError(
                f"NGII 5 m DEM not downloaded: {sidecar} missing. "
                "Get 수치표고모델 from 국토정보플랫폼 "
                "(https://map.ngii.go.kr, sign-up), convert each sheet "
                "with `gdal_translate -of AAIGrid <in> <out.asc>` into "
                f"{self.root}/, and add {self.SIDECAR} "
                'with {"crs": "<grid EPSG>", "nodata": -9999}.')
        cfg = json.loads(sidecar.read_text(encoding="utf-8"))
        self.crs = cfg.get("crs", "EPSG:5186")
        self.nodata = cfg.get("nodata", -9999)
        self._to_grid = Transformer.from_crs("EPSG:4326", self.crs,
                                             always_xy=True)
        self._grids: list[dict] | None = None

    def _load(self) -> list[dict]:
        if self._grids is not None:
            return self._grids
        grids = []
        for path in sorted(self.root.glob("*.asc")):
            grids.append(_read_ascii_grid(path, self.nodata))
        if not grids:
            raise FileNotFoundError(
                f"NGII 5 m DEM: no *.asc grids in {self.root}/ "
                "(see pipeline/dem.py Ngii5mSource for the layout).")
        self._grids = grids
        return self._grids

    def elevation(self, lon: float, lat: float) -> float | None:
        gx, gy = self._to_grid.transform(lon, lat)
        for g in self._load():
            v = _sample_ascii_grid(g, gx, gy)
            if v is not None:
                return v
        return None

    def describe(self) -> dict:
        return {"source": "ngii_5m", "crs": self.crs, "native_m": 5,
                "native_note": "국토지리정보원 수치표고모델"}

    def signature(self) -> dict:
        files = sorted(self.root.glob("*.asc")) if self.root.exists() else []
        total = sum(f.stat().st_size for f in files)
        newest = max((int(f.stat().st_mtime) for f in files), default=0)
        return {"tiles": len(files), "bytes": total, "newest_mtime": newest}


def _read_ascii_grid(path: Path, nodata: float) -> dict:
    header: dict[str, float] = {}
    with path.open(encoding="utf-8") as fh:
        while len(header) < 6:
            parts = fh.readline().split()
            if len(parts) < 2:
                raise ValueError(f"{path}: bad ASCII grid header")
            header[parts[0].lower()] = float(parts[1])
        data = np.loadtxt(fh, dtype=np.float32)
    return {"ncols": int(header["ncols"]), "nrows": int(header["nrows"]),
            "xll": header["xllcorner"], "yll": header["yllcorner"],
            "cell": header["cellsize"], "nodata": float(nodata),
            "grid": np.atleast_2d(data)}


def _sample_ascii_grid(g: dict, gx: float, gy: float) -> float | None:
    fx = (gx - g["xll"]) / g["cell"] - 0.5
    # ASCII grids run north-up from the top row.
    fy = (g["nrows"] - 0.5) - (gy - g["yll"]) / g["cell"]
    if not (-1 <= fx <= g["ncols"] and -1 <= fy <= g["nrows"]):
        return None
    fx = min(max(fx, 0.0), g["ncols"] - 1.001)
    fy = min(max(fy, 0.0), g["nrows"] - 1.001)
    ix, iy = int(fx), int(fy)
    txf, tyf = fx - ix, fy - iy
    jx, jy = min(ix + 1, g["ncols"] - 1), min(iy + 1, g["nrows"] - 1)
    vals = [g["grid"][iy, ix], g["grid"][iy, jx],
            g["grid"][jy, ix], g["grid"][jy, jx]]
    if any(v == g["nodata"] for v in vals):
        return None
    a, b, c, d = (float(v) for v in vals)
    return ((a * (1 - txf) + b * txf) * (1 - tyf)
            + (c * (1 - txf) + d * txf) * tyf)


DEM_SOURCES = {"terrarium": TerrariumSource, "ngii_5m": Ngii5mSource}


def open_dem(name: str = "terrarium",
             root: str | Path = DEFAULT_DEM_DIR) -> DemSource:
    """Open a DEM source by name (``--dem terrarium|ngii_5m``)."""
    try:
        cls = DEM_SOURCES[name]
    except KeyError:
        raise KeyError(f"unknown DEM {name!r}; choose from "
                       f"{sorted(DEM_SOURCES)}") from None
    if cls is Ngii5mSource:
        return cls(root)
    return cls(root)


# --- 2.5 m grid resample ---------------------------------------------------------

def sample_grid(source: DemSource, lon0: float, lat0: float, half_m: float,
                step_m: float, seed_text: str,
                m_per_deg_lat: float = M_PER_DEG_LAT
                ) -> tuple[int, int, list[int], dict]:
    """Resample the DEM onto the scene grid; returns (nx, nz, dm, info).

    Grid covers ``[-half_m, +half_m]`` on both axes (x east, z south),
    ``dm`` row-major decimetres. Missing samples fill with the grid mean
    and lower ``info["coverage"]`` below 1 (all 60 boxes are fully covered
    by the Terrarium tiles, so this path is a guard, not the norm).
    """
    n = int(round(half_m * 2 / step_m)) + 1
    nx = nz = n
    x0 = z0 = -half_m
    rng = mulberry32(seed_text_to_int(seed_text))
    # Smoothed value-noise lattice (seeded): bilinear over NOISE_CELL_M.
    cells = int(math.ceil(half_m * 2 / NOISE_CELL_M)) + 3
    lattice = [[(next(rng) * 2 - 1) * NOISE_AMP_M for _ in range(cells)]
               for _ in range(cells)]

    def noise(x: float, z: float) -> float:
        fx = (x - x0) / NOISE_CELL_M
        fz = (z - z0) / NOISE_CELL_M
        ix, iz = int(fx), int(fz)
        txf, tzf = fx - ix, fz - iz
        a = lattice[iz][ix]
        b = lattice[iz][ix + 1]
        c = lattice[iz + 1][ix]
        d = lattice[iz + 1][ix + 1]
        return ((a * (1 - txf) + b * txf) * (1 - tzf)
                + (c * (1 - txf) + d * txf) * tzf)

    metros: list[float | None] = []
    for iz in range(nz):
        z = z0 + iz * step_m
        for ix in range(nx):
            x = x0 + ix * step_m
            lon, lat = xz_to_lonlat(x, z, lon0, lat0, m_per_deg_lat)
            v = source.elevation(lon, lat)
            metros.append(v + noise(x, z) if v is not None else None)
    valid = [v for v in metros if v is not None]
    mean = sum(valid) / len(valid) if valid else 0.0
    filled = sum(1 for v in metros if v is None)
    dm = [int(round((v if v is not None else mean) * 10)) for v in metros]
    info = {"nx": nx, "nz": nz, "x0": x0, "z0": z0, "step": step_m,
            "coverage": round(1 - filled / len(metros), 6),
            "min_m": round(min(dm) / 10, 1), "max_m": round(max(dm) / 10, 1)}
    return (nx, nz, dm, info)


def seed_text_to_int(text: str) -> int:
    from .scene_geo import hash_string

    return hash_string(text)
