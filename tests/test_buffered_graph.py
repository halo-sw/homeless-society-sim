"""Unit tests for the stage-2 buffered graph method (synthetic fixtures).

Covers the bbox clip rule (edges kept when their segment intersects the
box), the buffered-LCC share (connectivity from the buffered graph, node
set from the clipped graph), and the before/after meta block. No raw data
or osmium needed.
"""

from __future__ import annotations

from pipeline.extract import buffered_bbox
from pipeline.graph import (
    build_buffered_graph,
    buffered_lcc_share,
    clip_graph_to_bbox,
    largest_component_share,
    segment_intersects_box,
)

BOX = (127.0, 37.5, 127.01, 37.51)  # minlon, minlat, maxlon, maxlat


def _road(coords, highway="residential", oid=1):
    return {
        "id": f"w{oid}", "osm_kind": "way", "osm_id": oid,
        "highway": highway, "name": None, "oneway": False,
        "oneway_reverse": False, "access": {},
        "geometry": {"type": "LineString",
                     "coordinates": [list(c) for c in coords]},
    }


def _box_osm():
    # Two in-box fragments, disconnected inside the box.
    return {"roads": [
        _road([(127.002, 37.505), (127.004, 37.505)], oid=1),
        _road([(127.006, 37.505), (127.008, 37.505)], oid=2),
    ]}


def _buffered_osm():
    # Same fragments plus a connector that runs outside the box.
    return {"roads": [
        _road([(127.002, 37.505), (127.004, 37.505)], oid=1),
        _road([(127.006, 37.505), (127.008, 37.505)], oid=2),
        _road([(127.004, 37.505), (127.004, 37.52),
               (127.006, 37.52), (127.006, 37.505)], oid=3),
    ]}


def test_buffered_bbox_expands_by_300m() -> None:
    out = buffered_bbox(BOX, 300.0)
    assert out[0] < BOX[0] and out[1] < BOX[1]
    assert out[2] > BOX[2] and out[3] > BOX[3]
    # 300 m in degrees latitude, symmetric.
    assert abs((BOX[1] - out[1]) * 111320.0 - 300.0) < 0.01


def test_segment_intersects_box_cases() -> None:
    inside = ((127.002, 37.505), (127.004, 37.506))
    assert segment_intersects_box(*inside, BOX)
    crossing = ((126.99, 37.505), (127.02, 37.505))
    assert segment_intersects_box(*crossing, BOX)
    touching = ((126.99, 37.5), (127.0, 37.5))
    assert segment_intersects_box(*touching, BOX)
    outside = ((126.98, 37.49), (126.99, 37.495))
    assert not segment_intersects_box(*outside, BOX)
    # Parallel miss just south of the box.
    miss = ((126.99, 37.499), (127.02, 37.499))
    assert not segment_intersects_box(*miss, BOX)


def test_clip_keeps_intersecting_edges_and_stubs() -> None:
    buffered = {"nodes": {"n1": [127.004, 37.505], "n2": [127.004, 37.52]},
                "edges": {"walk": [
                    {"from": "n1", "to": "n2", "way": 3,
                     "highway": "residential", "name": None,
                     "length_m": 10.0},
                    {"from": "n2", "to": "n1", "way": 3,
                     "highway": "residential", "name": None,
                     "length_m": 10.0},
                ]}}
    clipped = clip_graph_to_bbox(buffered, BOX)
    # The in-box endpoint keeps the stub edge; the outside node survives.
    assert len(clipped["edges"]["walk"]) == 2
    assert set(clipped["nodes"]) == {"n1", "n2"}
    far = {"nodes": {"a": [126.9, 37.4], "b": [126.91, 37.4]},
           "edges": {"walk": [{"from": "a", "to": "b", "way": 9,
                               "highway": "residential", "name": None,
                               "length_m": 10.0}]}}
    assert clip_graph_to_bbox(far, BOX)["edges"]["walk"] == []


def test_buffered_lcc_counts_outside_connections() -> None:
    graph = build_buffered_graph("testbox", _box_osm(), _buffered_osm(), BOX)
    meta = graph["meta"]
    assert meta["method"] == "buffered-300m"
    # Before: two in-box fragments → 50 %.
    assert meta["walk_lcc_box"]["share"] == 0.5
    # After: every clipped node sits in the buffered LCC → 100 %.
    assert meta["walk_lcc"]["share"] == 1.0
    # The raw clipped LCC still sees the fragments (no fake connectors).
    assert meta["walk_lcc_clipped_raw"]["share"] == 0.5
    assert meta["walk_lcc_buffered"]["share"] == 1.0


def test_buffered_lcc_genuine_gap_stays_low() -> None:
    # Buffered graph itself has two components: nothing connects them.
    graph = build_buffered_graph("testbox", _box_osm(), _box_osm(), BOX)
    assert graph["meta"]["walk_lcc"]["share"] == 0.5
    assert graph["meta"]["walk_lcc_buffered"]["share"] == 0.5


def test_buffered_share_node_set_is_clipped() -> None:
    buffered_walk = [
        {"from": "a", "to": "b"}, {"from": "b", "to": "a"},
        {"from": "b", "to": "c"}, {"from": "c", "to": "b"},
    ]
    clipped_walk = [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}]
    share = buffered_lcc_share(buffered_walk, clipped_walk)
    assert share == {"nodes": 2, "largest": 2, "share": 1.0}
    assert buffered_lcc_share([], []) == {"nodes": 0, "largest": 0,
                                          "share": 0.0}


def test_clipped_graph_node_ids_are_stable() -> None:
    first = build_buffered_graph("t", _box_osm(), _buffered_osm(), BOX)
    second = build_buffered_graph("t", _box_osm(), _buffered_osm(), BOX)
    assert first["nodes"] == second["nodes"]
    assert first["edges"] == second["edges"]
    assert first["meta"] == second["meta"]


def test_largest_component_share_unchanged() -> None:
    # Share is over edge-incident nodes only: isolated "c" is not counted.
    nodes = {"a": [0, 0], "b": [0, 0], "c": [0, 0]}
    edges = [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}]
    assert largest_component_share(nodes, edges) == {
        "nodes": 2, "largest": 2, "share": 1.0}
