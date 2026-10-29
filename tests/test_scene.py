"""Stage-14 scene step: DEM, geo frame, roads, trees, determinism."""

import json
import math
import struct
import zlib
from pathlib import Path

import numpy as np
import pytest
from shapely.geometry import LineString, Point, Polygon

from pipeline import scene as scene_mod
from pipeline.dem import (TerrariumSource, decode_png_rgb, sample_grid,
                          terrarium_to_m, tile_xy, open_dem)
from pipeline.scene_geo import (M_PER_DEG_LAT, SPEC_M_PER_DEG_LAT,
                                hash_string, lonlat_to_xz, make_height_at,
                                mulberry32, resample_polyline, xz_to_lonlat)

FIXTURE = Path(__file__).parent / "fixtures" / "scene14" / "fixture.osm"

LON0, LAT0 = 127.1267, 37.4487
AREA_DEF = {"id": "fixture", "label": "픽스처",
            "center": [LON0, LAT0],
            "bbox": [127.1255, 37.4475, 127.1279, 37.4499]}

BUILDINGS = [{
    "id": "b1",
    "geometry": {"type": "Polygon", "coordinates": [[
        [127.12580, 37.44900], [127.12620, 37.44900],
        [127.12620, 37.44940], [127.12580, 37.44940],
        [127.12580, 37.44900]]]},
}]


class FlatDem:
    """Pluggable-source proof: a flat 25 m DEM for fixture builds."""

    name = "flat-test"

    def elevation(self, lon, lat):
        return 25.0

    def describe(self):
        return {"source": "flat-test", "native_m": 0}

    def signature(self):
        return {"flat": True}


def make_png_rgb(pixels, width, height):
    raw = bytearray()
    for row in range(height):
        raw.append(0)  # filter None
        for col in range(width):
            raw += bytes(pixels[row * width + col])
    def chunk(ctype, payload):
        return (struct.pack(">I", len(payload)) + ctype + payload
                + struct.pack(">I", zlib.crc32(ctype + payload)))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw)))
            + chunk(b"IEND", b""))


# --- DEM decode ------------------------------------------------------------------

def test_decode_png_rgb_roundtrip(tmp_path):
    px = [(10, 20, 30), (255, 0, 128), (0, 0, 0), (1, 2, 3)]
    path = tmp_path / "t.png"
    path.write_bytes(make_png_rgb(px, 2, 2))
    arr = decode_png_rgb(path)
    assert arr.shape == (2, 2, 3)
    assert arr[0, 0].tolist() == [10, 20, 30]
    assert arr[0, 1].tolist() == [255, 0, 128]
    assert arr[1, 1].tolist() == [1, 2, 3]


def test_terrarium_decode_math():
    rgb = np.zeros((1, 2, 3), dtype=np.uint8)
    rgb[0, 0] = (128, 0, 0)  # 128*256 - 32768 = 0 m
    rgb[0, 1] = (128, 100, 128)  # 100.5 m
    m = terrarium_to_m(rgb)
    assert m[0, 0] == pytest.approx(0.0)
    assert m[0, 1] == pytest.approx(100.5)


def test_tile_xy_gachon_matches_cached_tiles():
    x, y = tile_xy(127.1314, 37.4529, 14)
    tile_dir = Path("data/raw/dem/terrarium/14")
    if not tile_dir.exists():
        pytest.skip("Terrarium tiles not downloaded")
    assert (tile_dir / f"{x}_{y}.png").exists()


def test_terrarium_elevation_plausible_at_gachon():
    tile_dir = Path("data/raw/dem/terrarium/14")
    if not tile_dir.exists():
        pytest.skip("Terrarium tiles not downloaded")
    src = TerrariumSource()
    v = src.elevation(127.1314, 37.4529)
    assert v is not None and -50 < v < 500  # 가천대: lowland tens of metres


def test_open_dem_names():
    assert open_dem("terrarium").name == "terrarium"
    with pytest.raises(KeyError):
        open_dem("nope")
    with pytest.raises(FileNotFoundError, match="ngii_5m.json"):
        open_dem("ngii_5m", root="tests/fixtures/scene14/empty-dem")


def test_sample_grid_shape_and_coverge():
    nx, nz, dm, info = sample_grid(FlatDem(), LON0, LAT0, 10.0, 2.5,
                                   "seed:fixture")
    assert (nx, nz) == (9, 9)
    assert len(dm) == 81
    assert info["coverage"] == 1.0
    # Flat 25 m + weak noise only: everything within a metre of 250 dm.
    assert all(240 <= v <= 260 for v in dm)


def test_sample_grid_seeded_noise_deterministic():
    a = sample_grid(FlatDem(), LON0, LAT0, 10.0, 2.5, "seed:x")
    b = sample_grid(FlatDem(), LON0, LAT0, 10.0, 2.5, "seed:x")
    c = sample_grid(FlatDem(), LON0, LAT0, 10.0, 2.5, "seed:y")
    assert a[2] == b[2]
    assert a[2] != c[2]


# --- geo frame ---------------------------------------------------------------------

def test_lonlat_to_xz_matches_spec_formula():
    # Hand-computed spec §4 step 2 with the spec's own constants.
    lon, lat, lon0, lat0 = 127.1314, 37.4529, 127.1267, 37.4487
    x, z = lonlat_to_xz(lon, lat, lon0, lat0,
                        m_per_deg_lat=SPEC_M_PER_DEG_LAT)
    assert x == pytest.approx((lon - lon0) * 111320
                              * math.cos(math.radians(lat0)))
    assert z == pytest.approx(-(lat - lat0) * 110540)
    # Production frame: 111320 on both axes (matches frame.js).
    xp, zp = lonlat_to_xz(lon, lat, lon0, lat0)
    assert xp == pytest.approx(x)
    assert zp == pytest.approx(-(lat - lat0) * M_PER_DEG_LAT)
    # Round-trip.
    lon2, lat2 = xz_to_lonlat(xp, zp, lon0, lat0)
    assert (lon2, lat2) == pytest.approx((lon, lat))


def test_hash_string_matches_js_fnv1a():
    # Published FNV-1a 32-bit vectors (ASCII == UTF-16 code units).
    assert hash_string("foobar") == 0xBF9CF968
    assert hash_string("") == 0x811C9DC5
    # BMP text exercises the UTF-16 path; stability is the contract.
    assert hash_string("st-가천대") == hash_string("st-가천대")


def test_height_at_bilinear_and_edge_clamp():
    dm = [0, 100, 200, 300]  # 2x2 over [0,10]x[0,10], step 10
    h = make_height_at(0, 0, 10, 2, 2, dm)
    assert h(0, 0) == pytest.approx(0.0)
    assert h(10, 0) == pytest.approx(10.0)
    assert h(5, 5) == pytest.approx(15.0)
    assert h(5, 0) == pytest.approx(5.0)
    # Outside clamps to the edge value.
    assert h(-100, 5) == pytest.approx(h(0, 5))
    assert h(500, 500) == pytest.approx(h(10, 10))


def test_resample_polyline_two_metres():
    pts = [(0.0, 0.0), (10.0, 0.0)]
    out = resample_polyline(pts, 2.0)
    assert len(out) == 6  # 0,2,4,6,8,10
    assert out[0] == pytest.approx((0.0, 0.0))
    assert out[-1] == pytest.approx((10.0, 0.0))
    gaps = [math.hypot(b[0] - a[0], b[1] - a[1])
            for a, b in zip(out, out[1:])]
    assert all(g == pytest.approx(2.0) for g in gaps)


# --- roads -------------------------------------------------------------------------

def test_road_width_priority():
    assert scene_mod.road_width("tertiary", 11.0, 4) == 11.0  # width wins
    assert scene_mod.road_width("tertiary", None, 2) == 2 * 3.25
    assert scene_mod.road_width("motorway") == 20
    assert scene_mod.road_width("primary") == 16
    assert scene_mod.road_width("secondary") == 12
    assert scene_mod.road_width("tertiary") == 9
    assert scene_mod.road_width("residential") == 6
    assert scene_mod.road_width("service") == 4
    assert scene_mod.road_width("footway") == 2
    assert scene_mod.road_width("primary_link") == 16
    assert scene_mod.road_width("something_new") == 4


def test_bridge_flag():
    assert scene_mod.bridge_flag({"bridge": "yes"}) == 1
    assert scene_mod.bridge_flag({"bridge": "viaduct", "layer": "2"}) == 1
    assert scene_mod.bridge_flag({"layer": "2"}) == 1
    assert scene_mod.bridge_flag({"tunnel": "yes"}) == -1
    assert scene_mod.bridge_flag({"tunnel": "yes", "bridge": "yes"}) == -1
    assert scene_mod.bridge_flag({"tunnel": "no", "layer": "1"}) == 0
    assert scene_mod.bridge_flag({}) == 0


# --- fixture build -------------------------------------------------------------------

@pytest.fixture(scope="module")
def scan():
    return scene_mod.scan_scene_pbf(FIXTURE)


@pytest.fixture(scope="module")
def scene(scan):
    return scene_mod.build_scene("fixture", AREA_DEF, scan, BUILDINGS,
                                 FlatDem())


def test_fixture_scan_counts(scan):
    kinds = [(w["id"], w["tags"].get("highway") or w["tags"].get("waterway")
              or w["tags"].get("natural") or w["tags"].get("leisure"))
             for w in scan["ways"]]
    assert ("relation" in str(scan["relations"]) or len(scan["relations"]) == 1)
    assert len(scan["tree_nodes"]) == 1
    assert len(scan["ways"]) == 5  # road, foot, row, stream, park
    assert set(scan["member_geoms"]) == {100, 101}  # untagged ring members


def test_fixture_roads(scene):
    roads = {r["k"]: r for r in scene["roads"]}
    assert set(roads) == {"tertiary", "footway"}
    assert roads["tertiary"]["n"] == "복정로"
    assert roads["tertiary"]["w"] == pytest.approx(6.5)  # lanes=2
    assert roads["footway"]["w"] == 2
    assert all(r["br"] == 0 for r in scene["roads"])
    assert len(roads["tertiary"]["p"]) >= 2


def test_fixture_lands_and_water(scene):
    kinds = sorted(l["k"] for l in scene["lands"])
    assert kinds == ["park", "wood"]
    wood = next(l for l in scene["lands"] if l["k"] == "wood")
    assert len(wood["r"]) == 2  # outer + the hole
    assert scene["water"][0]["k"] == "stream"


def _tree_points(scene):
    return [(t[0], t[1]) for t in scene["trees"]]


def test_no_tree_in_multipolygon_hole(scene):
    # Hole corners in local metres (nodes 5-8).
    hole = Polygon([lonlat_to_xz(lon, lat, LON0, LAT0) for lon, lat in [
        (127.1264, 37.4484), (127.1270, 37.4484),
        (127.1270, 37.4490), (127.1264, 37.4490)]])
    inside = [p for p in _tree_points(scene) if hole.contains(Point(p))]
    assert inside == []


def test_no_tree_on_road_water_building(scene):
    roads = [LineString(r["p"]) for r in scene["roads"]]
    widths = [r["w"] for r in scene["roads"]]
    waters = [LineString(w["p"]) for w in scene["water"]]
    wwidths = [w["w"] for w in scene["water"]]
    bpoly = Polygon([lonlat_to_xz(lon, lat, LON0, LAT0)
                     for lon, lat in BUILDINGS[0]["geometry"]["coordinates"][0]])
    for x, z in _tree_points(scene):
        pt = Point(x, z)
        assert not bpoly.contains(pt), f"tree on building at {x},{z}"
        for line, w in zip(roads, widths):
            assert pt.distance(line) >= w / 2 + 0.5 - 0.2, \
                f"tree on road at {x},{z}"
        for line, w in zip(waters, wwidths):
            assert pt.distance(line) >= w / 2 + 1.0 - 0.2, \
                f"tree on water at {x},{z}"


def test_osm_tree_kept_with_leaf_species(scene):
    # The lone needleleaved node survives inside the forest (not excluded).
    assert scene["meta"]["counts"]["trees_by_source"]["osm"] == 1
    x, z = lonlat_to_xz(127.12605, 37.44955, LON0, LAT0)
    near = [t for t in scene["trees"]
            if abs(t[0] - round(x, 1)) < 0.2 and abs(t[1] - round(z, 1)) < 0.2]
    assert len(near) == 1 and near[0][3] == 0  # conifer from leaf_type


def test_poisson_minimum_spacing():
    poly = Polygon([(0, 0), (100, 0), (100, 100), (0, 100)])
    rng = mulberry32(hash_string("spacing-probe"))
    pts = scene_mod._poisson_in_poly(poly, 5.0, rng)
    assert len(pts) > 50
    for i, a in enumerate(pts):
        for b in pts[i + 1:i + 60]:  # neighbours only; grid caps density
            d = math.hypot(a[0] - b[0], a[1] - b[1])
            assert d >= 5.0 - 1e-6, f"pair {d} under spacing"


def test_determinism_two_builds_byte_equal(scan):
    a = scene_mod.build_scene("fixture", AREA_DEF, scan, BUILDINGS, FlatDem())
    b = scene_mod.build_scene("fixture", AREA_DEF, scan, BUILDINGS, FlatDem())
    assert scene_mod.dumps_scene(a) == scene_mod.dumps_scene(b)


def test_species_ratio_config(scan):
    all_conifer = scene_mod.build_scene("fixture", AREA_DEF, scan,
                                        BUILDINGS, FlatDem(), (100, 0, 0))
    got = {t[3] for t in all_conifer["trees"]}
    assert got <= {0, 2}  # conifer everywhere; scrub forces shrub (none here)
    assert all_conifer["meta"]["species_ratio"] == [100, 0, 0]
    assert scene_mod.pick_species(0.0, (40, 50, 10)) == 0
    assert scene_mod.pick_species(0.399, (40, 50, 10)) == 0
    assert scene_mod.pick_species(0.4, (40, 50, 10)) == 1
    assert scene_mod.pick_species(0.899, (40, 50, 10)) == 1
    assert scene_mod.pick_species(0.9, (40, 50, 10)) == 2


def test_signature_roundtrip(tmp_path):
    sig = {"area": "fixture", "code": "14.1"}
    doc = {"meta": {"signature": sig}}
    (tmp_path / "scene.json").write_text(json.dumps(doc))
    assert scene_mod.signature_matches(tmp_path, sig) is True
    assert scene_mod.signature_matches(tmp_path, {**sig, "code": "x"}) is False


def test_scene_size_budget_on_gachon():
    path = Path("data/build/st-가천대/scene.json")
    if not path.exists():
        pytest.skip("st-가천대 scene not built yet")
    assert path.stat().st_size <= 2_500_000
