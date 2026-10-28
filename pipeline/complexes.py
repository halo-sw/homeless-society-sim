"""Group apartment buildings into residential complexes (단지).

Stage 2, pure function over the joined buildings + OSM landuse; called by
:mod:`pipeline.area_build` so the result lands in ``area.json`` as the
``complexes`` section. Only buildings with ``residential == "apartment"``
are grouped.

Grouping passes (first match wins; documented):

1. **Register name stem** — buildings sharing the same register building
   name (A24) form one complex. The dong suffix lives in A25
   (``101동``-style), so the stem is just the stripped A24; a trailing
   dong pattern inside A24 itself is stripped defensively. Name source:
   ``register``. An empty A24 never groups (even with an A25 dong).
2. **Named OSM residential landuse** — still-ungrouped apartments whose
   footprint centroid falls inside a named ``landuse=residential``
   polygon join that polygon's complex. Name source: ``osm_landuse``.
3. **Spatial clustering** — leftovers cluster by single linkage on
   footprint-to-footprint distance ≤ 40 m (local metres). These complexes
   are unnamed (``name: null``): a name is never invented. Anti-chaining
   guard: an unnamed cluster whose extent (member-centroid bbox diagonal)
   exceeds 150 m is split recursively at the median centroid coordinate
   along its longer axis, so dense low-rise fabric does not fuse into
   kilometre-scale pseudo-complexes (measured without the guard: 511
   buildings / 1.1 km in songpa). Named complexes are never split.

Output per complex: ``{id, name, name_source, building_ids, centroid,
households_hint, max_floors}``. ``households_hint`` is always null: no
세대수 signal exists in the register or OSM, and guessing from floor
area would invent residents. ``max_floors`` is the max member ``levels``
(null when no member has levels). ``centroid`` is the mean member
centroid in WGS84. Ids (``cx000001``…) are assigned in sorted
(name-or-last, first-building-id) order, so output is deterministic.
"""

from __future__ import annotations

import math
import re

from shapely.geometry import shape as shapely_shape
from shapely.ops import transform as shp_transform

METERS_PER_DEG_LAT = 111_320.0
CLUSTER_GAP_M = 40.0
CLUSTER_MAX_EXTENT_M = 150.0
COORD_NDIGITS = 7

# Trailing dong suffix occasionally embedded in A24 itself, e.g. "푸르지오 203동".
_DONG_SUFFIX_RE = re.compile(r"\s*\d+\s*동\s*$")


def complex_stem(name: str | None, sub_name: str | None = None) -> str | None:
    """Register name stem for complex grouping (A24; A25 is the dong).

    Returns None for an empty A24 — a bare dong (A25 ``102동``) carries no
    complex name. ``sub_name`` is accepted for signature symmetry with the
    register record and ignored.
    """
    _ = sub_name
    if not name:
        return None
    stem = _DONG_SUFFIX_RE.sub("", name).strip()
    return stem or None


def _to_local(geom, lon0: float, lat0: float):
    kx = METERS_PER_DEG_LAT * math.cos(math.radians(lat0))
    ky = METERS_PER_DEG_LAT
    return shp_transform(lambda x, y, z=None: ((x - lon0) * kx, (y - lat0) * ky),
                         geom)


def _centroid_lonlat(geom):
    c = geom.centroid
    return (round(float(c.x), COORD_NDIGITS), round(float(c.y), COORD_NDIGITS))


def _cluster_spatial(geoms_m: list, gap_m: float = CLUSTER_GAP_M) -> list[list[int]]:
    """Single-linkage clustering on footprint distance ≤ gap_m.

    Returns index groups (sorted); uses an STRtree so gu-sized areas stay
    fast. Deterministic: neighbours are visited in sorted index order.
    """
    from shapely import STRtree

    n = len(geoms_m)
    if n == 0:
        return []
    tree = STRtree(geoms_m)
    parent = list(range(n))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for i in range(n):
        buf = geoms_m[i].buffer(gap_m)
        for j in sorted(int(k) for k in tree.query(buf)):
            if j <= i:
                continue
            if geoms_m[i].distance(geoms_m[j]) <= gap_m:
                ra, rb = find(i), find(j)
                if ra != rb:
                    parent[max(ra, rb)] = min(ra, rb)
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    return [sorted(g) for g in groups.values()]


def _split_by_extent(group: list[int], xs: list[float], ys: list[float],
                     max_diag: float = CLUSTER_MAX_EXTENT_M) -> list[list[int]]:
    """Recursively median-split a cluster wider than ``max_diag`` metres.

    Splits along the longer centroid-bbox axis at the median member
    (sorted by coordinate, then index — deterministic). Terminates:
    every split strictly shrinks both halves.
    """
    if len(group) <= 1:
        return [group]
    gx = [xs[i] for i in group]
    gy = [ys[i] for i in group]
    dx, dy = max(gx) - min(gx), max(gy) - min(gy)
    if math.hypot(dx, dy) <= max_diag:
        return [sorted(group)]
    along_x = dx >= dy
    ordered = sorted(group, key=lambda i: (xs[i] if along_x else ys[i], i))
    mid = len(ordered) // 2
    out: list[list[int]] = []
    for half in (ordered[:mid], ordered[mid:]):
        out.extend(_split_by_extent(half, xs, ys, max_diag))
    return out


def find_complexes(buildings: list[dict], landuse: list[dict],
                   lon0: float, lat0: float) -> list[dict]:
    """Group apartment buildings; returns the ``complexes`` section."""
    apartments = [b for b in buildings if b.get("residential") == "apartment"]
    geoms: dict[str, object] = {}
    for b in apartments:
        try:
            geom = shapely_shape(b["geometry"])
        except (ValueError, KeyError):
            continue
        if geom.is_empty:
            continue
        geoms[b["id"]] = geom

    # Pass 1: register name stems.
    grouped: dict[str, str] = {}  # building_id -> group key
    stem_groups: dict[str, list[str]] = {}
    for b in apartments:
        if b["id"] not in geoms:
            continue
        reg = b.get("register") or {}
        stem = complex_stem(reg.get("name"), reg.get("sub_name"))
        if stem is None:
            continue
        key = f"stem:{stem}"
        stem_groups.setdefault(key, []).append(b["id"])
        grouped[b["id"]] = key

    # Pass 2: named residential landuse polygons.
    named_lu: list[tuple[str, object]] = []
    for feat in landuse:
        if feat.get("kind") != "landuse:residential" or not feat.get("name"):
            continue
        try:
            geom = shapely_shape(feat["geometry"])
        except (ValueError, KeyError):
            continue
        if geom.is_empty:
            continue
        named_lu.append((feat["name"], geom))
    lu_groups: dict[str, list[str]] = {}
    for b in apartments:
        if b["id"] in grouped or b["id"] not in geoms:
            continue
        centroid = geoms[b["id"]].centroid
        for lname, lgeom in named_lu:
            if lgeom.contains(centroid) or lgeom.touches(centroid):
                key = f"lu:{lname}"
                lu_groups.setdefault(key, []).append(b["id"])
                grouped[b["id"]] = key
                break

    # Pass 3: spatial clustering of the leftovers.
    leftovers = [b for b in apartments
                 if b["id"] not in grouped and b["id"] in geoms]
    leftovers.sort(key=lambda b: b["id"])
    local = [_to_local(geoms[b["id"]], lon0, lat0) for b in leftovers]
    centroids = [g.centroid for g in local]
    xs = [float(c.x) for c in centroids]
    ys = [float(c.y) for c in centroids]
    spatial_groups: list[list[int]] = []
    for grp in _cluster_spatial(local):
        spatial_groups.extend(_split_by_extent(grp, xs, ys))

    complexes: list[dict] = []
    by_id = {b["id"]: b for b in apartments}

    def make_complex(name: str | None, name_source: str | None,
                     member_ids: list[str]) -> dict:
        member_ids = sorted(member_ids)
        lons = [geoms[mid].centroid.x for mid in member_ids]
        lats = [geoms[mid].centroid.y for mid in member_ids]
        levels = [by_id[mid].get("levels") for mid in member_ids]
        levels = [lv for lv in levels if isinstance(lv, int)]
        return {
            "name": name,
            "name_source": name_source,
            "building_ids": member_ids,
            "centroid": [round(sum(lons) / len(lons), COORD_NDIGITS),
                         round(sum(lats) / len(lats), COORD_NDIGITS)],
            "households_hint": None,
            "max_floors": max(levels) if levels else None,
        }

    for key in sorted(stem_groups):
        stem = key[len("stem:"):]
        complexes.append(make_complex(stem, "register", stem_groups[key]))
    for key in sorted(lu_groups):
        lname = key[len("lu:"):]
        complexes.append(make_complex(lname, "osm_landuse", lu_groups[key]))
    spatial_members = [[leftovers[i]["id"] for i in grp]
                       for grp in spatial_groups]
    for members in sorted(spatial_members, key=lambda m: m[0]):
        complexes.append(make_complex(None, None, members))

    complexes.sort(key=lambda c: (c["name"] is None, c["name"] or "",
                                  c["building_ids"][0]))
    for i, comp in enumerate(complexes):
        ordered = {"id": f"cx{i + 1:06d}"}
        ordered.update(comp)
        complexes[i] = ordered
    return complexes
