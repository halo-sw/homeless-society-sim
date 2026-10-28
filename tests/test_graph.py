"""Unit tests for pipeline.graph on synthetic road fixtures.

Covers oneway handling (including ``oneway=-1``), the walk / bike / drive
access rules, stable node ids, edge lengths and the LCC computation.
No raw data needed.
"""

from __future__ import annotations

import pytest

from pipeline.graph import (
    bike_allowed,
    build_graph,
    drive_allowed,
    haversine_m,
    largest_component_share,
    walk_allowed,
)

LON, LAT = 127.0, 37.5

_next_osm_id = 0


def _road(
    coords: list[tuple[float, float]],
    highway: str = "residential",
    oneway: bool = False,
    oneway_reverse: bool = False,
    access: dict | None = None,
    name: str | None = None,
    rid: str | None = None,
) -> dict:
    global _next_osm_id
    _next_osm_id += 1
    return {
        "id": rid or f"w{_next_osm_id}",
        "osm_kind": "way",
        "osm_id": _next_osm_id,
        "highway": highway,
        "name": name,
        "oneway": oneway,
        "oneway_reverse": oneway_reverse,
        "access": access or {},
        "geometry": {"type": "LineString", "coordinates": [list(c) for c in coords]},
    }


@pytest.fixture
def seg() -> list[tuple[float, float]]:
    return [(LON, LAT), (LON + 0.001, LAT)]


def test_two_way_road_gives_both_directions_all_modes(seg) -> None:
    graph = build_graph([_road(seg)])
    for mode in ("walk", "bike", "drive"):
        edges = graph["edges"][mode]
        assert len(edges) == 2
        assert {(e["from"], e["to"]) for e in edges} == {
            ("n000000", "n000001"),
            ("n000001", "n000000"),
        }


def test_oneway_keeps_forward_only_all_modes(seg) -> None:
    graph = build_graph([_road(seg, oneway=True)])
    for mode in ("walk", "bike", "drive"):
        edges = graph["edges"][mode]
        assert [(e["from"], e["to"]) for e in edges] == [("n000000", "n000001")]


def test_oneway_reverse_keeps_reverse_only_all_modes(seg) -> None:
    graph = build_graph([_road(seg, oneway=True, oneway_reverse=True)])
    for mode in ("walk", "bike", "drive"):
        edges = graph["edges"][mode]
        assert [(e["from"], e["to"]) for e in edges] == [("n000001", "n000000")]


def test_motorway_not_walkable_but_drivable(seg) -> None:
    road = _road(seg, highway="motorway")
    assert walk_allowed(road) is False
    assert bike_allowed(road) is False
    assert drive_allowed(road) is True
    graph = build_graph([road])
    assert graph["edges"]["walk"] == []
    assert len(graph["edges"]["drive"]) == 2


def test_motorway_with_bicycle_yes_allows_bike(seg) -> None:
    road = _road(seg, highway="motorway", access={"bicycle": "yes"})
    assert bike_allowed(road) is True
    assert walk_allowed(road) is False  # motorways are never walkable


def test_foot_no_closes_walk_only(seg) -> None:
    road = _road(seg, access={"foot": "no"})
    assert walk_allowed(road) is False
    assert bike_allowed(road) is True
    assert drive_allowed(road) is True


def test_access_no_with_explicit_override(seg) -> None:
    assert walk_allowed(_road(seg, access={"access": "no"})) is False
    assert (
        walk_allowed(_road(seg, access={"access": "no", "foot": "yes"})) is True
    )
    assert (
        drive_allowed(
            _road(seg, access={"access": "private", "motor_vehicle": "yes"})
        )
        is True
    )


def test_steps_excluded_from_bike_unless_allowed(seg) -> None:
    assert bike_allowed(_road(seg, highway="steps")) is False
    assert (
        bike_allowed(_road(seg, highway="steps", access={"bicycle": "yes"}))
        is True
    )
    assert walk_allowed(_road(seg, highway="steps")) is True


def test_footway_never_drivable(seg) -> None:
    road = _road(seg, highway="footway")
    assert drive_allowed(road) is False
    assert walk_allowed(road) is True
    graph = build_graph([road])
    assert graph["edges"]["drive"] == []
    assert len(graph["edges"]["walk"]) == 2


def test_node_ids_stable_and_sorted() -> None:
    roads = [
        _road([(LON + 0.002, LAT), (LON, LAT)], rid="w2"),
        _road([(LON, LAT), (LON + 0.001, LAT)], rid="w1"),
    ]
    first = build_graph(roads)
    second = build_graph(list(reversed(roads)))
    assert first["nodes"] == second["nodes"]
    assert first["edges"] == second["edges"]
    assert list(first["nodes"]) == ["n000000", "n000001", "n000002"]
    assert first["nodes"]["n000000"] == [LON, LAT]


def test_edge_length_is_haversine_metres(seg) -> None:
    (lon1, lat1), (lon2, lat2) = seg
    expected = round(haversine_m(lon1, lat1, lon2, lat2), 2)
    assert expected == pytest.approx(88.2, abs=1.0)
    graph = build_graph([_road(seg)])
    for mode in ("walk", "bike", "drive"):
        assert graph["edges"][mode][0]["length_m"] == expected


def test_degenerate_road_with_single_point_ignored() -> None:
    road = _road([(LON, LAT)], rid="w9")  # one point: no segments
    assert len(road["geometry"]["coordinates"]) == 1
    graph = build_graph([road])
    assert graph["nodes"] == {}
    assert all(v == [] for v in graph["edges"].values())


def test_largest_component_share() -> None:
    connected = [
        {"from": "a", "to": "b"},
        {"from": "b", "to": "c"},
    ]
    assert largest_component_share({}, connected)["share"] == 1.0
    split = connected + [{"from": "x", "to": "y"}]
    lcc = largest_component_share({}, split)
    assert (lcc["nodes"], lcc["largest"], lcc["share"]) == (5, 3, 0.6)
    assert largest_component_share({}, []) == {"nodes": 0, "largest": 0, "share": 0.0}


def test_motorroad_expressway_like_motorway(seg) -> None:
    road = _road(seg, highway="trunk")
    road["motorroad"] = True
    assert walk_allowed(road) is False
    assert bike_allowed(road) is False
    assert drive_allowed(road) is True
    road["access"] = {"bicycle": "yes"}
    assert bike_allowed(road) is True
    assert walk_allowed(road) is False  # still never walkable
    graph = build_graph([road])
    assert graph["edges"]["walk"] == []
    assert len(graph["edges"]["drive"]) == 2


def test_area_yes_surface_excluded_from_all_modes(seg) -> None:
    road = _road(seg, highway="pedestrian")
    road["area"] = True  # a plaza surface, not a linear path
    graph = build_graph([road])
    assert graph["nodes"] == {}
    assert all(v == [] for v in graph["edges"].values())


def test_area_yes_surface_does_not_break_lcc() -> None:
    plaza = _road(
        [(LON, LAT), (LON + 0.001, LAT), (LON + 0.001, LAT + 0.001),
         (LON, LAT + 0.001), (LON, LAT)],
        highway="pedestrian",
        rid="wplaza",
    )
    plaza["area"] = True
    street = _road([(LON + 0.01, LAT), (LON + 0.011, LAT)], rid="wstreet")
    graph = build_graph([plaza, street])
    lcc = largest_component_share(graph["nodes"], graph["edges"]["walk"])
    assert (lcc["nodes"], lcc["largest"], lcc["share"]) == (2, 2, 1.0)


def test_multi_segment_way_makes_chained_edges() -> None:
    coords = [(LON, LAT), (LON + 0.001, LAT), (LON + 0.002, LAT)]
    graph = build_graph([_road(coords, oneway=True)])
    assert [(e["from"], e["to"]) for e in graph["edges"]["walk"]] == [
        ("n000000", "n000001"),
        ("n000001", "n000002"),
    ]
