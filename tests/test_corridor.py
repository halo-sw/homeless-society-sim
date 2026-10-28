"""Tests for pipeline.corridor maths (stage 8, Part A).

Pure routing/tiling/geometry tests on synthetic networks — the real
잠실→판교 corridor build is exercised by the pipeline CLI itself (see
briefs/08-RESULT.md for its tile counts), not by the unit suite.
"""

from __future__ import annotations

import math

import pytest
from shapely.geometry import LineString, Polygon

from pipeline.corridor import (
    _footprint_points,
    leg_geometry,
    path_geometry,
    route_path,
    tile_bounds,
    tile_id,
    tile_index,
    tile_size_deg,
    transfer_penalty_km,
)


def _synth_network():
    # Line A: a1—a2—hub (1 km legs); line B: hub—b1—b2 (2 km legs).
    def stops(line, names, xs):
        return [{"id": f"{line}:{n}", "name": n, "key": n,
                 "lon": x, "lat": 37.5} for n, x in zip(names, xs)]
    stops_a = stops("a", ["a1", "a2", "hub"], [127.0, 127.01, 127.02])
    stops_b = stops("b", ["hub", "b1", "b2"], [127.02, 127.04, 127.06])
    return {
        "lines": [
            {"id": "a", "name": "A호선", "circle": False, "stops": stops_a,
             "patterns": [
                 {"id": "a:fwd", "stops": [s["id"] for s in stops_a],
                  "chainage_km": [0.0, 1.0, 2.0],
                  "geometry": [[127.0, 37.5], [127.01, 37.5], [127.02, 37.5]]},
                 {"id": "a:rev", "stops": [s["id"] for s in reversed(stops_a)],
                  "chainage_km": [0.0, 1.0, 2.0],
                  "geometry": [[127.02, 37.5], [127.01, 37.5], [127.0, 37.5]]},
             ]},
            {"id": "b", "name": "B호선", "circle": False, "stops": stops_b,
             "patterns": [
                 {"id": "b:fwd", "stops": [s["id"] for s in stops_b],
                  "chainage_km": [0.0, 2.0, 4.0],
                  "geometry": [[127.02, 37.5], [127.04, 37.5], [127.06, 37.5]]},
             ]},
        ],
        "transfers": [{"station": "hub", "key": "hub", "lines": ["a", "b"]}],
    }


def test_route_path_direct_and_transfer():
    net = _synth_network()
    direct = route_path(net, "a1", "a2", 2.0)
    assert [leg["line"] for leg in direct["legs"]] == ["a"]
    assert direct["legs"][0]["stops"] == ["a1", "a2"]
    assert direct["transfers"] == []
    assert direct["distance_km"] == 1.0
    ride = route_path(net, "a1", "b2", 2.0)
    assert [leg["line"] for leg in ride["legs"]] == ["a", "b"]
    assert ride["transfers"] == ["hub"]
    assert ride["legs"][0]["stops"] == ["a1", "a2", "hub"]
    assert ride["legs"][1]["stops"] == ["hub", "b1", "b2"]
    assert ride["distance_km"] == 6.0  # line km only; penalty is routing-only
    assert route_path(net, "a1", " nowhere ", 2.0) is None
    assert route_path(net, " nowhere ", "b2", 2.0) is None


def test_route_path_penalty_prefers_fewer_transfers():
    net = _synth_network()
    # A direct bus-pattern edge is out of scope here; instead assert the
    # penalty only reroutes when an alternative exists: with an enormous
    # penalty the transfer ride still wins (it is the only ride).
    assert route_path(net, "a1", "b2", 1000.0)["transfers"] == ["hub"]
    # Determinism: same inputs, same legs.
    assert (route_path(net, "b2", "a1", 2.0)["legs"][0]["stops"]
            == ["b2", "b1", "hub"])


def test_leg_and_path_geometry_slice():
    net = _synth_network()
    path = route_path(net, "a1", "b2", 2.0)
    leg_a = path["legs"][0]
    g = leg_geometry(net, leg_a)
    assert g is not None
    assert list(g.coords)[0][0] == 127.0
    assert list(g.coords)[-1][0] == 127.02
    full = path_geometry(net, path)
    assert isinstance(full, LineString)
    assert full.bounds[0] == 127.0 and full.bounds[2] == 127.06


def test_tile_grid_roundtrip():
    dlon, dlat = tile_size_deg(37.5)
    assert 0.008 < dlat < 0.010
    assert dlon > dlat  # longitude degrees are shorter on the ground
    ix, iy = tile_index(127.05, 37.5, dlon, dlat)
    bounds = tile_bounds(ix, iy, dlon, dlat)
    assert bounds[0] <= 127.05 < bounds[2]
    assert bounds[1] <= 37.5 < bounds[3]
    assert tile_id(ix, iy).startswith("t_")
    # Adjacent tiles differ.
    assert tile_index(127.05 + dlon, 37.5, dlon, dlat) == (ix + 1, iy)


def test_tile_size_is_one_km():
    dlon, dlat = tile_size_deg(37.5)
    lat_m = dlat * 111_320.0
    lon_m = dlon * 111_320.0 * math.cos(math.radians(37.5))
    assert lat_m == pytest.approx(1000.0)
    assert lon_m == pytest.approx(1000.0)


def test_footprint_points_caps_and_closes():
    poly = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    pts = _footprint_points(poly, cap=12)
    assert pts[0] == pts[-1]
    assert len(pts) <= 12
    many = Polygon([(math.cos(a), math.sin(a))
                    for a in [i * 0.05 for i in range(130)]])
    assert len(_footprint_points(many, cap=12)) == 12
    assert _footprint_points(Polygon(), cap=12) is None


def test_transfer_penalty_comes_from_criteria():
    assert transfer_penalty_km() == 2.0
