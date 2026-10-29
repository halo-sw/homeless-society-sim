import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { flatHeightAt, makeHeightAt, seatOnTerrain, slopeAt } from "../src/scene/height.js";
import { MASK_SIZE, buildTerrainMesh, isMaskedKind, maskClassFor,
  paintLandMask, sceneToMask } from "../src/scene/terrain.js";
import { buildRoadMeshes, buildWaterRibbons, resamplePoints,
  roadMaterialClass, roadOrder, specWidth } from "../src/scene/roads.js";
import { broadleafGeometry, coniferGeometry, patchDepthFragment,
  patchDepthVertex, shrubGeometry, treeRotation, treeTint,
  treeTriangleCount } from "../src/scene/trees3d.js";
import { loadScene } from "../src/scene/load.js";
import { DEFAULT_LOOK, resolveLook } from "../src/render/look.js";
import { parseQuality } from "../src/render/quality.js";
import { buildGround } from "../src/ground.js";
import { buildBuildings } from "../src/buildings.js";

const LOOK = { ...DEFAULT_LOOK };

describe("scene height", () => {
  it("bilinears the dm grid and clamps edges", () => {
    const h = makeHeightAt({ x0: 0, z0: 0, step: 10, nx: 2, nz: 2,
      dm: [0, 100, 200, 300] });
    assert.equal(h(0, 0), 0);
    assert.equal(h(10, 0), 10);
    assert.equal(h(5, 5), 15);
    assert.equal(h(-100, 5), h(0, 5));
    assert.equal(h(500, 500), h(10, 10));
  });
  it("falls back to flat zero", () => {
    assert.equal(flatHeightAt()(12, -34), 0);
  });
  it("measures slope and seats buildings", () => {
    const h = makeHeightAt({ x0: -10, z0: -10, step: 10, nx: 3, nz: 3,
      dm: [0, 0, 0, 0, 0, 0, 100, 100, 100] });
    assert.ok(slopeAt(h, 0, 5) > 20);
    assert.equal(slopeAt(() => 7, 0, 0), 0);
    const seat = seatOnTerrain(h, [[[0, -5], [0, 5]]]);
    assert.ok(seat.base <= seat.ceil);
    assert.deepEqual(seatOnTerrain(h, []), { base: 0, ceil: 0 });
  });
});

describe("scene terrain mesh + mask", () => {
  const terrain = { x0: -5, z0: -5, step: 5, nx: 3, nz: 3,
    dm: [0, 0, 0, 0, 100, 0, 0, 0, 0] };
  it("builds an indexed grid with uvs", () => {
    const t = buildTerrainMesh(terrain, LOOK);
    assert.equal(t.triangles, 8);
    assert.equal(t.vertices, 9);
    assert.equal(t.indices.length, 8 * 3);
    assert.equal(t.positions[4 * 3 + 1], 10); // centre bump
    assert.ok(t.uvs.every((v) => v >= 0 && v <= 1));
  });
  it("mixes rock past 35 degrees", () => {
    const flat = buildTerrainMesh({ x0: 0, z0: 0, step: 2.5, nx: 3, nz: 3,
      dm: new Array(9).fill(100) }, LOOK);
    assert.ok([...flat.colors].every((c) => c === 1));
    const cliff = buildTerrainMesh({ x0: 0, z0: 0, step: 2.5, nx: 3, nz: 3,
      dm: [0, 0, 0, 0, 0, 0, 0, 0, 2000] }, LOOK);
    assert.ok([...cliff.colors].some((c) => c < 1));
  });
  it("maps scene coords to mask pixels", () => {
    const [px, py] = sceneToMask(-5, -5, terrain, MASK_SIZE);
    assert.deepEqual([px, py], [0, 0]);
    const [qx, qy] = sceneToMask(5, 5, terrain, MASK_SIZE);
    assert.deepEqual([qx, qy], [MASK_SIZE, MASK_SIZE]);
  });
  it("classifies mask kinds", () => {
    assert.equal(maskClassFor("wood"), "forest");
    assert.equal(maskClassFor("forest"), "forest");
    assert.equal(maskClassFor("park"), "grass");
    assert.equal(maskClassFor("pitch"), "grass");
    assert.equal(maskClassFor("scrub"), "scrub");
    assert.equal(maskClassFor("water"), "water");
    assert.equal(maskClassFor("residential"), null);
    assert.ok(isMaskedKind("natural:wood"));
    assert.ok(!isMaskedKind("leisure:playground"));
  });
  it("paints base then lands with even-odd holes", () => {
    const calls = [];
    const ctx = {
      fillStyle: "", fillRect: (...a) => calls.push(["rect", ctx.fillStyle, ...a]),
      beginPath: () => calls.push(["begin"]), moveTo: () => {}, lineTo: () => {},
      closePath: () => {}, fill: (rule) => calls.push(["fill", ctx.fillStyle, rule]),
      lineJoin: "",
    };
    const out = paintLandMask(ctx,
      [{ k: "wood", r: [[[0, 0], [4, 0], [4, 4], [0, 0]]] },
       { k: "residential", r: [] }], terrain, LOOK);
    assert.equal(out.painted, 1);
    assert.equal(calls[0][0], "rect"); // base first
    const fills = calls.filter((c) => c[0] === "fill");
    assert.equal(fills.length, 1);
    assert.equal(fills[0][2], "evenodd");
  });
  it("loads null when scene.json is missing", async () => {
    const scene = await loadScene("nope", async () => { throw new Error("404"); });
    assert.equal(scene, null);
  });
});

describe("scene roads", () => {
  it("resamples to even 2 m stations", () => {
    const out = resamplePoints([[0, 0], [10, 0]], 2);
    assert.equal(out.length, 6);
    assert.deepEqual(out[0], [0, 0]);
    assert.deepEqual(out[5], [10, 0]);
  });
  it("maps classes, orders and widths", () => {
    assert.equal(roadMaterialClass("primary"), "road");
    assert.equal(roadMaterialClass("footway"), "foot");
    assert.equal(roadMaterialClass("cycleway"), "cycle");
    assert.equal(roadMaterialClass("railway"), "rail");
    assert.equal(roadOrder("motorway"), 1);
    assert.equal(roadOrder("footway"), 7);
    assert.equal(specWidth("primary"), 16);
    assert.equal(specWidth("tertiary", 2), 6.5);
    assert.equal(specWidth("footway"), 2);
  });
  it("drapes ribbons, skips tunnels, lifts bridges", () => {
    const h = () => 10;
    const { meshes, stats } = buildRoadMeshes([
      { k: "tertiary", n: null, w: 9, br: 0, p: [[0, 0], [10, 0]] },
      { k: "footway", n: null, w: 2, br: 0, p: [[0, 5], [10, 5]] },
      { k: "primary", n: null, w: 16, br: -1, p: [[0, 9], [10, 9]] },
      { k: "secondary", n: null, w: 12, br: 1, p: [[0, 20], [10, 20]] },
    ], h, LOOK);
    assert.equal(stats.roads, 3);
    assert.equal(stats.skippedTunnel, 1);
    assert.equal(stats.bridges, 1);
    // Class order offsets: foot sits above tertiary.
    const roadY = meshes.road.positions[1];
    const footY = meshes.foot.positions[1];
    assert.ok(Math.abs(roadY - (10 + 0.05 + 4 * 0.01)) < 0.01);
    assert.ok(footY > roadY);
    // Bridge clears the lerped ends.
    const ys = [];
    for (let i = 1; i < meshes.road.positions.length; i += 3) {
      ys.push(meshes.road.positions[i]);
    }
    assert.ok(Math.max(...ys) >= 10 + 1.0);
    // Ribbon triangle count: 5 segments × 2.
    assert.equal(meshes.foot.triangles, 10);
  });
  it("winds ribbon triangles upward", () => {
    const { meshes } = buildRoadMeshes(
      [{ k: "service", n: null, w: 4, br: 0, p: [[0, 0], [4, 0]] }],
      () => 0, LOOK);
    const P = meshes.road.positions;
    const I = meshes.road.indices;
    const v = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    for (let t = 0; t < I.length; t += 3) {
      const [ax, , az] = v(I[t]);
      const [bx, , bz] = v(I[t + 1]);
      const [cx, , cz] = v(I[t + 2]);
      // Cross-product y of (b-a)×(c-a): up is positive.
      const crossY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      assert.ok(crossY > 0, `triangle ${t / 3} faces up`);
    }
  });
  it("drops waterways 0.3 m below ground", () => {
    const w = buildWaterRibbons([{ k: "stream", w: 4, p: [[0, 0], [6, 0]] }],
      () => 20, LOOK);
    assert.equal(w.triangles, 6);
    // 14b: positions are Float32Array now, so compare with tolerance.
    assert.ok(w.positions.filter((_, i) => i % 3 === 1)
      .every((y) => Math.abs(y - 19.7) < 1e-5));
  });
});

describe("scene trees", () => {
  it("builds three species under 200 triangles with vertex colours", () => {
    for (const geo of [coniferGeometry(), broadleafGeometry(), shrubGeometry()]) {
      assert.ok(treeTriangleCount(geo) <= 200, `tris=${treeTriangleCount(geo)}`);
      assert.ok(treeTriangleCount(geo) > 8);
      assert.ok(geo.attributes.color);
      assert.equal(geo.attributes.color.count, geo.attributes.position.count);
    }
  });
  it("tints ±8 % and rotates deterministically", () => {
    for (const [x, z] of [[0, 0], [12.3, -45.6], [600, 600]]) {
      const t = treeTint(x, z);
      assert.ok(t >= 0.92 && t <= 1.08, `tint=${t}`);
      assert.equal(treeTint(x, z), t);
      assert.equal(treeRotation(x, z), treeRotation(x, z));
    }
    assert.notEqual(treeRotation(0, 0), treeRotation(10, 0));
  });
  it("cuts tree shadows past 150 m", () => {
    const v = patchDepthVertex("#include <common>\nfoo\n#include <begin_vertex>\n");
    assert.match(v, /vTreeWorld/);
    assert.match(v, /instanceMatrix/);
    const f = patchDepthFragment("#include <common>\n#include <clipping_planes_fragment>\n");
    assert.match(f, /distance\( vTreeWorld, cameraPosition \) > 150\.0/);
    assert.match(f, /discard/);
  });
});

describe("scene look + quality", () => {
  it("carries the stage-14 colours, tunable via ?look=", () => {
    for (const k of ["terrainBase", "terrainGrass", "terrainForest",
        "terrainScrub", "terrainWater", "terrainRock", "sceneRoad",
        "sceneFoot", "sceneCycle", "sceneRail"]) {
      assert.ok(Number.isFinite(LOOK[k]), k);
    }
    const tuned = resolveLook("?look=sceneRoad:123,terrainForest:456");
    assert.equal(tuned.sceneRoad, 123);
    assert.equal(tuned.terrainForest, 456);
  });
  it("auto-selects low on narrow screens unless ?q= says otherwise", () => {
    assert.equal(parseQuality(new URLSearchParams(""), { viewportWidth: 700 }), "low");
    assert.equal(parseQuality(new URLSearchParams(""), { viewportWidth: 768 }), "low");
    assert.equal(parseQuality(new URLSearchParams(""), { viewportWidth: 769 }), "medium");
    assert.equal(parseQuality(new URLSearchParams(""), {}), "medium");
    assert.equal(parseQuality(new URLSearchParams("?q=high"), { viewportWidth: 700 }), "high");
  });
});

describe("terrain-aware ground + buildings", () => {
  const origin = { lon: 127, lat: 37.5 };
  const road = (highway, coords) => ({ highway, lanes: null,
    geometry: { type: "LineString", coordinates: coords } });
  it("hands roads and masked green to the scene layers", () => {
    const roads = [road("tertiary", [[127, 37.5], [127.001, 37.5]])];
    const landuse = [
      { kind: "natural:wood", geometry: { type: "Polygon", coordinates: [[
        [127, 37.5], [127.001, 37.5], [127.001, 37.501], [127, 37.5]]] } },
      { kind: "leisure:playground", geometry: { type: "Polygon", coordinates: [[
        [127.002, 37.5], [127.003, 37.5], [127.003, 37.501], [127.002, 37.5]]] } },
    ];
    const flat = buildGround(roads, landuse, [], new Map(), origin);
    assert.ok(flat.stats.roadTris > 0);
    assert.ok(flat.stats.green >= 2);
    const lifted = buildGround(roads, landuse, [], new Map(), origin,
      { heightAt: () => 50, sceneRoads: true, specWidths: true });
    assert.equal(lifted.stats.roadTris, 0); // scene ribbons own the roads
    assert.equal(lifted.stats.green, 1); // wood masked, playground kept
    assert.ok(lifted.stats.markingTris > 0); // paint stays, on the ribbons
    const ys = lifted.markings.positions.filter((_, i) => i % 3 === 1);
    assert.ok(ys.every((y) => y > 49 && y < 51));
  });
  it("seats buildings on the terrain with a footing on slopes", () => {
    const buildings = [{
      id: "b1", residential: "house", height_m: 6, levels: 2,
      geometry: { type: "Polygon", coordinates: [[
        [127, 37.5], [127.0005, 37.5], [127.0005, 37.5005],
        [127, 37.5005], [127, 37.5]]] } },
    ];
    const flat = buildBuildings(buildings, [], origin);
    const minFlat = Math.min(...flat.detail.walls.house.positions
      .filter((_, i) => i % 3 === 1));
    assert.equal(minFlat, 0);
    const slope = (x) => (x > 20 ? 30 : 10);
    const seated = buildBuildings(buildings, [], origin,
      { baseAt: (rings) => {
        const hs = rings.flat().map(([x, y]) => slope(x, -y));
        return { base: Math.min(...hs), ceil: Math.max(...hs) };
      } });
    const ys = seated.detail.walls.house.positions.filter((_, i) => i % 3 === 1);
    assert.equal(Math.min(...ys), 10 - 0.6); // footing below the low corner
    assert.ok(Math.max(...ys) >= 16); // walls ride the base
  });
});
