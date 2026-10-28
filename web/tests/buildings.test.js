import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBuildings, floorsOf, isRoughlyRectangular, isSlab, roofKind } from "../src/buildings.js";

const ORIGIN = { lon: 127.0, lat: 37.5 };

function rectPoly(lon, lat, w, d) {
  return {
    type: "Polygon",
    coordinates: [[[lon, lat], [lon + w, lat], [lon + w, lat + d], [lon, lat + d], [lon, lat]]],
  };
}

function lPoly(lon, lat, s) {
  // L-shape: half the bbox filled.
  return {
    type: "Polygon",
    coordinates: [[[lon, lat], [lon + s, lat], [lon + s, lat + s / 2], [lon + s / 2, lat + s / 2],
      [lon + s / 2, lat + s], [lon, lat + s], [lon, lat]]],
  };
}

function building(id, over = {}) {
  return {
    id, residential: "apartment", levels: 15, height_m: 45,
    geometry: rectPoly(127.0, 37.5, 0.0002, 0.0002), ...over,
  };
}

describe("buildings", () => {
  it("selects slab for apartments >= 6 floors", () => {
    assert.equal(isSlab(building("a", { levels: 6 })), true);
    assert.equal(isSlab(building("b", { levels: 5 })), false);
    assert.equal(isSlab(building("c", { residential: "none", levels: 20 })), false);
  });

  it("derives floors from height when levels are missing", () => {
    assert.equal(floorsOf({ levels: null, height_m: 30 }), 10);
    assert.equal(floorsOf({ levels: 4, height_m: 30 }), 4);
  });

  it("detects roughly rectangular footprints", () => {
    const rect = [[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]];
    assert.equal(isRoughlyRectangular(rect), true);
    const lshape = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10], [0, 0]];
    assert.equal(isRoughlyRectangular(lshape), false);
    // 45°-rotated rectangle (diamond): axis-aligned fill is 0.5, but the
    // oriented fill still reads rectangular.
    const diamond = [[0, 7], [7, 0], [14, 7], [7, 14], [0, 7]];
    assert.equal(isRoughlyRectangular(diamond), true);
  });

  it("picks gable/hip/flat by footprint and levels", () => {
    const long = [[0, 0], [20, 0], [20, 8], [0, 8], [0, 0]];
    const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const house = { residential: "house", levels: 2 };
    assert.equal(roofKind(house, long), "gable");
    assert.equal(roofKind(house, square), "hip");
    assert.equal(roofKind({ residential: "house", levels: 4 }, long), "flat");
    assert.equal(roofKind(building("a"), long), "flat");
  });

  it("merges slabs with per-floor banding into the residential bucket", () => {
    const out = buildBuildings([building("w1")], [], ORIGIN);
    assert.ok(out.residential.triangles > 100);
    assert.equal(out.nonResidential.triangles, 0);
    assert.equal(out.stats.slab, 1);
    // Banding: wall vertices alternate between two shades along height.
    const { positions, colors } = out.residential;
    const bands = new Set();
    for (let i = 0; i < positions.length; i += 9) {
      const h = positions[i + 1];
      if (h > 0.1 && h < 44.9) bands.add(colors[i].toFixed(3));
    }
    assert.ok(bands.size >= 2, `expected wall+band shades, got ${bands.size}`);
  });

  it("shades slab short ends darker (three face tones)", () => {
    // Long 2:1 slab so the dominant-axis split is unambiguous.
    const slab = building("w2", { geometry: rectPoly(127.0, 37.5, 0.0004, 0.0002) });
    const out = buildBuildings([slab], [], ORIGIN);
    const { positions, colors } = out.residential;
    const tones = new Set();
    for (let i = 0; i < positions.length; i += 9) {
      const h = positions[i + 1];
      if (h > 0.1 && h < 44.9) tones.add(colors[i].toFixed(3));
    }
    assert.ok(tones.size >= 3, `expected wall+band+side tones, got ${tones.size}`);
  });

  it("builds pitched roofs for rectangular houses", () => {
    const house = building("h1", { residential: "house", levels: 2, height_m: 6,
      geometry: rectPoly(127.001, 37.501, 0.00015, 0.00008) });
    const out = buildBuildings([house], [], ORIGIN);
    assert.equal(out.stats.gable, 1);
    assert.ok(out.residential.triangles > 10);
    // Roof peak rises above the wall top (6 m).
    let maxH = 0;
    for (let i = 1; i < out.residential.positions.length; i += 3) {
      maxH = Math.max(maxH, out.residential.positions[i]);
    }
    assert.ok(maxH > 6.5, `peak ${maxH}`);
  });

  it("keeps non-residential muted in its own bucket", () => {
    const shop = building("s1", { residential: "none", levels: 3, height_m: 10 });
    const out = buildBuildings([shop], [], ORIGIN);
    assert.equal(out.stats.flat, 1);
    assert.equal(out.residential.triangles, 0);
    assert.ok(out.nonResidential.triangles > 0);
  });

  it("skips degenerate footprints without crashing", () => {
    const bad = building("bad", { geometry: { type: "Polygon", coordinates: [[[127, 37.5], [127, 37.5]]] } });
    const out = buildBuildings([bad, building("ok")], [], ORIGIN);
    assert.equal(out.stats.skipped, 1);
    assert.equal(out.stats.buildings, 1);
  });
});
