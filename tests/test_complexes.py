"""Unit tests for apartment-complex grouping (stage 2, synthetic).

Covers register-stem grouping (with dong handling), named residential
landuse grouping, ≤40 m spatial clustering, and the never-invent-names
rule. No raw data needed.
"""

from __future__ import annotations

from pipeline.complexes import complex_stem, find_complexes

LON0, LAT0 = 127.0, 37.5


def _poly(lon: float, lat: float, side: float = 0.0002) -> dict:
    return {"type": "Polygon", "coordinates": [[
        [lon, lat], [lon + side, lat], [lon + side, lat + side],
        [lon, lat + side], [lon, lat]]]}


def _apt(bid: str, lon: float, lat: float, reg_name=None, sub=None,
         levels: int = 15, residential: str = "apartment") -> dict:
    reg = None
    if reg_name is not None or sub is not None:
        reg = {"name": reg_name, "sub_name": sub, "use": "공동주택"}
    return {"id": bid, "residential": residential, "levels": levels,
            "register": reg, "geometry": _poly(lon, lat)}


def _lu(name, lon0, lat0, lon1, lat1) -> dict:
    ring = [[lon0, lat0], [lon1, lat0], [lon1, lat1],
            [lon0, lat1], [lon0, lat0]]
    return {"id": "w9", "kind": "landuse:residential", "name": name,
            "geometry": {"type": "Polygon", "coordinates": [ring]}}


def test_complex_stem_strips_dong_suffix() -> None:
    assert complex_stem("푸르지오그랑블아파트", "203동") == "푸르지오그랑블아파트"
    assert complex_stem("푸르지오 203동", None) == "푸르지오"
    assert complex_stem("", "102동") is None
    assert complex_stem(None, None) is None
    # 단지/차 markers are kept: different phases stay separate complexes.
    assert complex_stem("목동현대1차아파트", "101동") == "목동현대1차아파트"


def test_stem_grouping_and_max_floors() -> None:
    buildings = [
        _apt("w1", LON0, LAT0, "푸르지오그랑블아파트", "201동", levels=20),
        _apt("w2", LON0 + 0.001, LAT0, "푸르지오그랑블아파트", "202동",
             levels=25),
        _apt("w3", LON0 + 0.002, LAT0, "백현마을3단지아파트", "101동",
             levels=12),
    ]
    complexes = find_complexes(buildings, [], LON0, LAT0)
    assert len(complexes) == 2
    first = complexes[0]
    assert first["name"] == "백현마을3단지아파트"  # sorted by name
    assert first["name_source"] == "register"
    assert first["building_ids"] == ["w3"]
    assert first["max_floors"] == 12
    second = complexes[1]
    assert second["name"] == "푸르지오그랑블아파트"
    assert second["building_ids"] == ["w1", "w2"]
    assert second["max_floors"] == 25
    assert second["households_hint"] is None
    assert [c["id"] for c in complexes] == ["cx000001", "cx000002"]


def test_landuse_grouping_for_unnamed() -> None:
    buildings = [
        _apt("w1", LON0, LAT0),  # no register name
        _apt("w2", LON0 + 0.0003, LAT0),  # same polygon
        _apt("w3", LON0 + 0.05, LAT0),  # far away: spatial singleton
    ]
    lu = [_lu("장미1차아파트", LON0 - 0.001, LAT0 - 0.001,
              LON0 + 0.001, LAT0 + 0.001)]
    complexes = find_complexes(buildings, lu, LON0, LAT0)
    assert len(complexes) == 2
    named = [c for c in complexes if c["name"] == "장미1차아파트"]
    assert len(named) == 1
    assert named[0]["name_source"] == "osm_landuse"
    assert named[0]["building_ids"] == ["w1", "w2"]
    unnamed = [c for c in complexes if c["name"] is None]
    assert len(unnamed) == 1
    assert unnamed[0]["name_source"] is None
    assert unnamed[0]["building_ids"] == ["w3"]


def test_stem_wins_over_landuse() -> None:
    buildings = [_apt("w1", LON0, LAT0, "푸르지오그랑블아파트", "201동")]
    lu = [_lu("다른이름아파트", LON0 - 0.001, LAT0 - 0.001,
              LON0 + 0.001, LAT0 + 0.001)]
    complexes = find_complexes(buildings, lu, LON0, LAT0)
    assert len(complexes) == 1
    assert complexes[0]["name"] == "푸르지오그랑블아파트"
    assert complexes[0]["name_source"] == "register"


def test_spatial_clustering_gap_40m() -> None:
    # ~22 m apart (0.0002° lat ≈ 22 m): one cluster.
    near = [_apt("w1", LON0, LAT0), _apt("w2", LON0, LAT0 + 0.0002)]
    assert len(find_complexes(near, [], LON0, LAT0)) == 1
    # ~111 m apart: two unnamed singletons, never merged, never named.
    far = [_apt("w1", LON0, LAT0), _apt("w2", LON0, LAT0 + 0.001)]
    complexes = find_complexes(far, [], LON0, LAT0)
    assert len(complexes) == 2
    assert all(c["name"] is None for c in complexes)


def test_chained_fabric_splits_to_block_scale() -> None:
    # A 300 m row of villas 30 m apart: single linkage would chain all
    # ten into one pseudo-complex; the extent guard splits them.
    row = [_apt(f"w{i}", LON0, LAT0 + i * 0.00027) for i in range(10)]
    complexes = find_complexes(row, [], LON0, LAT0)
    assert len(complexes) >= 2
    assert all(c["name"] is None for c in complexes)
    total = sum(len(c["building_ids"]) for c in complexes)
    assert total == 10
    # Small clusters are untouched.
    pair = [_apt("w1", LON0, LAT0), _apt("w2", LON0, LAT0 + 0.0002)]
    assert len(find_complexes(pair, [], LON0, LAT0)) == 1


def test_only_apartments_grouped() -> None:
    buildings = [
        _apt("w1", LON0, LAT0, residential="house"),
        _apt("w2", LON0, LAT0 + 0.0001, residential="none"),
        _apt("w3", LON0 + 0.05, LAT0 + 0.05, "푸르지오", "101동"),
    ]
    complexes = find_complexes(buildings, [], LON0, LAT0)
    assert len(complexes) == 1
    assert complexes[0]["building_ids"] == ["w3"]


def test_deterministic_ids_and_centroid() -> None:
    buildings = [_apt("w2", LON0 + 0.0003, LAT0),
                 _apt("w1", LON0, LAT0)]
    first = find_complexes(buildings, [], LON0, LAT0)
    second = find_complexes(list(reversed(buildings)), [], LON0, LAT0)
    assert first == second
    assert first[0]["building_ids"] == ["w1", "w2"]
    cx, cy = first[0]["centroid"]
    assert abs(cx - (LON0 + 0.00025)) < 0.00001
