import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { flatHeightAt, makeHeightAt, seatOnTerrain, slopeAt } from "../src/scene/height.js";
import { MASK_SIZE, buildTerrainMesh, isMaskedKind, maskClassFor,
  paintLandMask, sceneToMask } from "../src/scene/terrain.js";
import { buildRoadMarkings, buildRoadMeshes, buildWaterRibbons,
  findRoadCrossings, hasYellowCentre, hexToLinearRgb, lanesOf, resamplePoints,
  roadMaterialClass, roadOrder, roadTone, specWidth } from "../src/scene/roads.js";
import { LEAF_AUTUMN, LEAF_GREENS, broadleafGeometry, coniferGeometry,
  fillStreetTrees, inAutumnWindow, patchDepthFragment, patchDepthVertex,
  shrubGeometry, treeColour, treeRotation, treeTint,
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
  it("paints arterials dark and minor streets lighter (14e two-tone)", () => {
    assert.equal(roadTone("primary"), "major");
    assert.equal(roadTone("secondary"), "major");
    assert.equal(roadTone("motorway"), "major");
    assert.equal(roadTone("trunk_link"), "major");
    assert.equal(roadTone("tertiary"), "minor");
    assert.equal(roadTone("residential"), "minor");
    assert.equal(roadTone("service"), "minor");
    const painted = resolveLook("", "painted");
    const { meshes } = buildRoadMeshes([
      { k: "primary", n: null, w: 16, br: 0, p: [[0, 0], [4, 0]] },
      { k: "residential", n: null, w: 6, br: 0, p: [[0, 30], [4, 30]] },
    ], () => 0, painted);
    // Same merged mesh; per-ribbon vertex colours carry the tone.
    // 17b: vertex colours are linear working-space values.
    const major = hexToLinearRgb(painted.sceneRoad);
    const minor = hexToLinearRgb(painted.sceneRoadMinor);
    const [r0, g0, b0] = meshes.road.colors.slice(0, 3);
    assert.ok(Math.abs(r0 - major[0]) < 1e-6 && Math.abs(g0 - major[1]) < 1e-6
      && Math.abs(b0 - major[2]) < 1e-6, "first ribbon is arterial asphalt");
    const tail = meshes.road.colors.slice(-3);
    assert.ok(Math.abs(tail[0] - minor[0]) < 1e-6 && Math.abs(tail[1] - minor[1]) < 1e-6
      && Math.abs(tail[2] - minor[2]) < 1e-6, "last ribbon is the lighter minor tone");
    // Photo keeps one tone: minor equals major.
    const photo = buildRoadMeshes([
      { k: "primary", n: null, w: 16, br: 0, p: [[0, 0], [4, 0]] },
      { k: "residential", n: null, w: 6, br: 0, p: [[0, 30], [4, 30]] },
    ], () => 0, { ...DEFAULT_LOOK });
    assert.deepEqual([...photo.meshes.road.colors.slice(0, 3)],
      [...photo.meshes.road.colors.slice(-3)]);
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

describe("painted road paint (14e)", () => {
  it("counts lanes from the ribbon width (3.25 m lanes)", () => {
    assert.equal(lanesOf({ w: 16 }), 5);
    assert.equal(lanesOf({ w: 12 }), 4);
    assert.equal(lanesOf({ w: 9 }), 3);
    assert.equal(lanesOf({ w: 6 }), 2);
    assert.equal(lanesOf({ w: 4 }), 1);
    assert.equal(lanesOf({ w: 6, lanes: 4 }), 4); // explicit tag wins
    assert.equal(hasYellowCentre("primary"), true);
    assert.equal(hasYellowCentre("secondary"), true);
    assert.equal(hasYellowCentre("primary_link"), true);
    assert.equal(hasYellowCentre("tertiary"), false);
    assert.equal(hasYellowCentre("motorway"), false); // brief: primary/secondary
  });

  it("paints dashes on multi-lane roads, yellow on arterials", () => {
    const { mesh, stats } = buildRoadMarkings([
      { k: "primary", n: null, w: 16, br: 0, p: [[0, 0], [20, 0]] },
      { k: "residential", n: null, w: 6, br: 0, p: [[0, 30], [20, 30]] },
      { k: "service", n: null, w: 4, br: 0, p: [[0, 60], [20, 60]] },
      { k: "secondary", n: null, w: 12, br: 1, p: [[0, 100], [20, 100]] },
      { k: "tertiary", n: null, w: 9, br: -1, p: [[0, 140], [20, 140]] },
    ], () => 0);
    assert.equal(stats.roads, 4); // tunnel skipped
    assert.equal(stats.yellowRoads, 2);
    // 20 m roads → 4 dashes per divider: primary 4 dividers, residential
    // 1, secondary 2 (centre skipped for the yellow double).
    assert.equal(stats.dashes, 16 + 4 + 8);
    assert.ok(mesh.triangles > 0);
    // Paint rides above its ribbon (bridge deck paint clears 1 m).
    const ys = [];
    for (let i = 1; i < mesh.positions.length; i += 3) ys.push(mesh.positions[i]);
    assert.ok(Math.min(...ys) >= 0.089);
    assert.ok(Math.max(...ys) > 1.0);
    // Both paint colours land in the merged mesh (17b: linear values).
    const has = (hex) => {
      const t = hexToLinearRgb(hex);
      for (let i = 0; i < mesh.colors.length; i += 3) {
        if (Math.abs(mesh.colors[i] - t[0]) < 1e-6
            && Math.abs(mesh.colors[i + 1] - t[1]) < 1e-6
            && Math.abs(mesh.colors[i + 2] - t[2]) < 1e-6) return true;
      }
      return false;
    };
    assert.ok(has(0xf4f2ec), "white dashes present"); // LANE_WHITE
    assert.ok(has(0xe0b93c), "yellow centre present"); // LANE_YELLOW
  });

  it("paints nothing for single-lane streets", () => {
    const { mesh, stats } = buildRoadMarkings(
      [{ k: "service", n: null, w: 4, br: 0, p: [[0, 0], [20, 0]] }], () => 0);
    assert.equal(stats.roads, 1);
    assert.equal(stats.dashes, 0);
    assert.equal(mesh.triangles, 0);
  });

  it("finds at-grade footway crossings over multi-lane roads", () => {
    const road = (k, w, p, br = 0) => ({ k, n: null, w, br, p });
    const hits = findRoadCrossings([
      road("tertiary", 9, [[0, 0], [20, 0]]),
      road("footway", 2, [[10, -10], [10, 10]]),
    ]);
    assert.equal(hits.length, 1);
    assert.ok(Math.abs(hits[0].x - 10) < 1e-9);
    assert.ok(Math.abs(hits[0].z - 0) < 1e-9);
    assert.equal(hits[0].width, 9);
    // Parallel ways never meet; bridges and single-lane roads excluded.
    assert.equal(findRoadCrossings([
      road("tertiary", 9, [[0, 0], [20, 0]]),
      road("footway", 2, [[0, -10], [20, -10]]),
    ]).length, 0);
    assert.equal(findRoadCrossings([
      road("tertiary", 9, [[0, 0], [20, 0]], 1),
      road("footway", 2, [[10, -10], [10, 10]]),
    ]).length, 0);
    assert.equal(findRoadCrossings([
      road("service", 4, [[0, 0], [20, 0]]),
      road("footway", 2, [[10, -10], [10, 10]]),
    ]).length, 0);
  });

  it("lays zebra bars across the road at crossings, facing up", () => {
    const { mesh, stats } = buildRoadMarkings([
      { k: "tertiary", n: null, w: 9, br: 0, p: [[0, 0], [20, 0]] },
      { k: "footway", n: null, w: 2, br: 0, p: [[10, -10], [10, 10]] },
    ], () => 0);
    assert.equal(stats.crossings, 1);
    // 3 bars × 2 triangles of pure crosswalk white.
    let white = 0;
    for (let i = 0; i < mesh.colors.length; i += 3) {
      if (mesh.colors[i] === 1 && mesh.colors[i + 1] === 1 && mesh.colors[i + 2] === 1) white++;
    }
    assert.equal(white, 3 * 4); // 3 bars × 4 corners
    const P = mesh.positions;
    const I = mesh.indices;
    const v = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    for (let t = 0; t < I.length; t += 3) {
      const [ax, , az] = v(I[t]);
      const [bx, , bz] = v(I[t + 1]);
      const [cx, , cz] = v(I[t + 2]);
      const crossY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      assert.ok(crossY > 0, `triangle ${t / 3} faces up`);
    }
  });
});

describe("painted trees (14e)", () => {
  it("clusters broadleaf crowns as overlapping spheres under 60 tris", () => {
    const tris = treeTriangleCount(broadleafGeometry());
    assert.ok(tris <= 60, `tris=${tris}`);
    assert.ok(tris > 20, `tris=${tris}`);
  });

  it("opens the autumn window mid-October through November", () => {
    assert.equal(inAutumnWindow("2026-10-14"), false);
    assert.equal(inAutumnWindow("2026-10-15"), true);
    assert.equal(inAutumnWindow("2026-11-30"), true);
    assert.equal(inAutumnWindow("2026-12-01"), false);
    assert.equal(inAutumnWindow("2026-06-01"), false);
    assert.equal(inAutumnWindow(null), false);
    assert.equal(inAutumnWindow("bogus"), false);
  });

  it("colours leaves by seed and sim date (autumn share in season)", () => {
    assert.deepEqual(LEAF_AUTUMN, [0xd9b13b, 0xc8742f, 0xa84232]);
    assert.equal(treeColour("a", "2026-10-20"), treeColour("a", "2026-10-20"));
    for (let i = 0; i < 50; i++) {
      assert.ok(LEAF_GREENS.includes(treeColour(`t${i}`, "2026-06-01")));
    }
    const kinds = new Set();
    const autumns = new Set();
    for (let i = 0; i < 300; i++) {
      const c = treeColour(`t${i}`, "2026-10-20");
      kinds.add(LEAF_AUTUMN.includes(c) ? "a" : "g");
      if (LEAF_AUTUMN.includes(c)) autumns.add(c);
    }
    assert.deepEqual([...kinds].sort(), ["a", "g"]);
    assert.equal(autumns.size, 3); // yellow, orange and red all appear
  });

  it("fills empty roadsides every 9 m on both sidewalks", () => {
    const roads = [
      { k: "residential", w: 6, br: 0, p: [[0, 0], [36, 0]] },
      { k: "residential", w: 6, br: 0, p: [[0, 40], [36, 40]] },
      { k: "service", w: 4, br: 0, p: [[0, 80], [36, 80]] },
      { k: "tertiary", w: 9, br: 1, p: [[0, 120], [36, 120]] },
    ];
    const trees = [[18, 40, 1, 1]]; // the second road already has trees
    const { trees: fill, stats } = fillStreetTrees(roads, trees, []);
    assert.equal(stats.roads, 2); // service + bridge ineligible
    assert.equal(stats.emptyRoads, 1);
    // 36 m at 9 m spacing → stations 4.5…31.5 × 2 sides.
    assert.equal(fill.length, 8);
    assert.ok(fill.every((t) => t[3] === 1 && t[2] >= 0.9 && t[2] <= 1.1));
    assert.ok(fill.every((t) => Math.abs(Math.abs(t[1]) - 5) < 1e-9));
    assert.deepEqual(fillStreetTrees(roads, trees, []).trees, fill);
    assert.equal(fillStreetTrees(roads, trees, [], { maxTrees: 3 }).trees.length, 3);
  });

  it("skips fill spots near buildings and existing trees", () => {
    const roads = [{ k: "residential", w: 6, br: 0, p: [[0, 0], [18, 0]] }];
    const rings = [[[2, 3], [7, 3], [7, 8], [2, 8]]];
    const trees = [[13.5, -7.5, 1, 1]]; // 2.5 m from the (13.5,-5) spot
    const { trees: fill, stats } = fillStreetTrees(roads, trees, rings);
    // (4.5,5) blocked by the ring, (13.5,-5) by the tree → 2 placed.
    assert.equal(fill.length, 2);
    assert.equal(stats.skippedBuilding, 1);
    assert.equal(stats.skippedTree, 1);
  });
});
