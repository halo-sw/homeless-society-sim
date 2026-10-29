"""Tests for pipeline/walkgraph.py (13, Part 8): pure builder rules."""

import json

from pipeline.walkgraph import build_walkgraph, way_walkable, walkgraph_coverage


def test_way_walkable_rules():
    assert way_walkable({"highway": "footway"})
    assert way_walkable({"highway": "residential"})
    assert way_walkable({"highway": "steps"})
    assert not way_walkable({"highway": "motorway"})
    assert not way_walkable({"highway": "motorway_link"})
    assert not way_walkable({"highway": "footway", "foot": "no"})
    assert not way_walkable({"highway": "service", "access": "private"})
    assert way_walkable({"highway": "service", "access": "private",
                         "foot": "permissive"})
    assert not way_walkable({"highway": "pedestrian", "area": "yes"})
    assert not way_walkable({"highway": "residential", "motorroad": "yes"})
    assert not way_walkable({"building": "apartments"})
    assert not way_walkable({})


def test_build_walkgraph_nodes_edges_stations():
    ways = [
        {"nodes": [(127.0, 37.4), (127.001, 37.4), (127.002, 37.4)],
         "tags": {"highway": "footway"}},
        {"nodes": [(127.0, 37.4), (127.0, 37.401)],
         "tags": {"highway": "motorway"}},
    ]
    stations = [{"name": "서현", "lon": 127.002, "lat": 37.4},
                {"name": "먼역", "lon": 130.0, "lat": 38.0}]
    g = build_walkgraph(ways, stations)
    assert len(g["nodes"]) == 3
    # Motorway way contributes no edges or nodes.
    assert len(g["edges"]["walk"]) == 2
    for e in g["edges"]["walk"]:
        assert e["length_m"] > 0
    assert set(g["stations"]) == {"서현"}
    assert g["unlinked_stations"] == ["먼역"]


def test_build_walkgraph_stable_ids():
    ways = [{"nodes": [(127.002, 37.4), (127.0, 37.4)],
             "tags": {"highway": "path"}}]
    g1 = build_walkgraph(ways, [])
    g2 = build_walkgraph(list(reversed(ways)), [])
    assert g1["nodes"] == g2["nodes"]
    assert g1["edges"] == g2["edges"]


def test_walkgraph_coverage_counts(tmp_path):
    build = tmp_path / "build"
    (build / "walkgraph").mkdir(parents=True)
    (build / "homes-index.json").write_text(json.dumps({"homes": [
        {"region": "bundang", "scene": "st-x"},
        {"region": "bundang"},
        {"region": "suji"},
    ]}), encoding="utf-8")
    (build / "walkgraph" / "bundang.json").write_text("{}", encoding="utf-8")
    cov = walkgraph_coverage(build)
    assert (cov["d3"], cov["map"], cov["none"]) == (1, 1, 1)
    assert cov["total"] == 3
    assert cov["none_reasons"] == {"no-walkgraph:suji": 1}
