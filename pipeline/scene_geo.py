"""Local-metre frame + sampling helpers for the stage-14 scene build.

The scene frame matches the app frame (``web/src/frame.js``): equirectangular
metres around the box origin, ``x`` east, ``y`` north, and Three.js world
``z = -y`` (north is ``-z``). ``scene.json`` stores ``(x, z)`` pairs, which map
1:1 onto Three.js ``(x, y-up, z)``.

The user's spec (``docs/specs/osm-3d-scene-roads-forest-trees.md`` §4) uses
110540 m/deg for latitude while the app pipeline (``area_build.py``,
``frame.js``) uses 111320 for both axes. Scene data must align with the
existing buildings/graph metre-for-metre, so production uses 111320; the
conversion takes the constant as a parameter and the tests assert the spec
formula exactly with 110540.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator

M_PER_DEG_LAT = 111_320.0
SPEC_M_PER_DEG_LAT = 110_540.0  # spec §4 step 2


def lonlat_to_xz(lon: float, lat: float, lon0: float, lat0: float,
                 m_per_deg_lat: float = M_PER_DEG_LAT) -> tuple[float, float]:
    """WGS84 -> scene metres: x east, z south (Three.js z)."""
    import math

    x = (lon - lon0) * M_PER_DEG_LAT * math.cos(math.radians(lat0))
    z = -(lat - lat0) * m_per_deg_lat
    return (x, z)


def xz_to_lonlat(x: float, z: float, lon0: float, lat0: float,
                 m_per_deg_lat: float = M_PER_DEG_LAT) -> tuple[float, float]:
    """Scene metres -> WGS84 (inverse of :func:`lonlat_to_xz`)."""
    import math

    lon = lon0 + x / (M_PER_DEG_LAT * math.cos(math.radians(lat0)))
    lat = lat0 - z / m_per_deg_lat
    return (lon, lat)


def hash_string(text: str) -> int:
    """FNV-1a 32-bit, bit-identical to ``web/src/palette.js`` hashString.

    JS iterates UTF-16 code units; iterating the UTF-16LE encoding keeps
    the pipeline and the browser in agreement even past the BMP.
    """
    raw = text.encode("utf-16-le")
    h = 0x811C9DC5
    for i in range(0, len(raw), 2):
        h ^= raw[i] | (raw[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def mulberry32(seed: int) -> Iterator[float]:
    """Seeded stream mirroring ``web/src/walkers.js`` mulberry32."""
    a = seed & 0xFFFFFFFF

    def imul(x: int, y: int) -> int:
        return ((x & 0xFFFFFFFF) * (y & 0xFFFFFFFF)) & 0xFFFFFFFF

    while True:
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = imul(t ^ (t >> 15), t | 1)
        t ^= t + imul(t ^ (t >> 7), t | 61)
        yield (((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0)


def make_height_at(x0: float, z0: float, step: float, nx: int, nz: int,
                   dm: list[int]) -> Callable[[float, float], float]:
    """Bilinear height (metres) over a decimetre grid, edges clamped.

    Mirrors ``web/src/scene/height.js``; ``dm`` is row-major
    (``dm[iz * nx + ix]``), x east, z south.
    """
    def height_at(x: float, z: float) -> float:
        fx = (x - x0) / step
        fz = (z - z0) / step
        fx = min(max(fx, 0.0), nx - 1)
        fz = min(max(fz, 0.0), nz - 1)
        ix = min(int(fx), nx - 2) if nx > 1 else 0
        iz = min(int(fz), nz - 2) if nz > 1 else 0
        tx = fx - ix
        tz = fz - iz
        jx = min(ix + 1, nx - 1)
        jz = min(iz + 1, nz - 1)
        a = dm[iz * nx + ix]
        b = dm[iz * nx + jx]
        c = dm[jz * nx + ix]
        d = dm[jz * nx + jx]
        return ((a * (1 - tx) + b * tx) * (1 - tz)
                + (c * (1 - tx) + d * tx) * tz) / 10.0

    return height_at


def resample_polyline(points: list[tuple[float, float]],
                      step: float) -> list[tuple[float, float]]:
    """Evenly spaced points along a polyline (metres), ends kept.

    Used for the 2 m road resample (spec §5.2) and the 8 m tree rows /
    10 m street trees (spec §3.2).
    """
    import math

    if len(points) < 2 or step <= 0:
        return [tuple(p) for p in points]
    cum = [0.0]
    for (ax, az), (bx, bz) in zip(points, points[1:]):
        cum.append(cum[-1] + math.hypot(bx - ax, bz - az))
    total = cum[-1]
    if total <= 0:
        return [tuple(points[0])]
    n = max(1, int(round(total / step)))
    out: list[tuple[float, float]] = []
    seg = 0
    for i in range(n + 1):
        s = min(total, i * total / n)
        while seg < len(cum) - 2 and cum[seg + 1] < s:
            seg += 1
        span = cum[seg + 1] - cum[seg] or 1.0
        t = (s - cum[seg]) / span
        ax, az = points[seg]
        bx, bz = points[seg + 1]
        out.append((ax + (bx - ax) * t, az + (bz - az) * t))
    return out
