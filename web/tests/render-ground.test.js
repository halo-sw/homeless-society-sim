import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Y_KERB, Y_MARK, Y_ROAD, buildGround, laneMarkingTriangles, markingColor, roadWidth,
} from "../src/ground.js";
import { LANE_WHITE, LANE_YELLOW } from "../src/palette.js";

const ORIGIN = { lon: 127.0, lat: 37.5 };

describe("lane markings", () => {
  it("paints arterials yellow, local streets white", () => {
    assert.equal(markingColor("primary"), LANE_YELLOW);
    assert.equal(markingColor("motorway"), LANE_YELLOW);
    assert.equal(markingColor("residential"), LANE_WHITE);
    assert.equal(markingColor("service"), LANE_WHITE);
  });

  it("dashes two-lane streets, with edge lines + kerbs on wide roads", () => {
    const straight = [[0, 0], [100, 0]];
    const local = laneMarkingTriangles(straight, roadWidth("residential"), "residential");
    assert.ok(local.tris.length >= 2, "centre dashes");
    assert.ok(local.kerbs.length >= 2, "kerb strips");
    const arterial = laneMarkingTriangles(straight, roadWidth("primary"), "primary");
    assert.ok(arterial.tris.length > local.tris.length, "edge lines extra");
    const foot = laneMarkingTriangles(straight, roadWidth("footway"), "footway");
    assert.equal(foot.tris.length, 0);
    assert.equal(foot.kerbs.length, 0);
  });

  it("keeps dashes on short segments empty, not crashing", () => {
    const { tris } = laneMarkingTriangles([[0, 0], [3, 0]], 6, "residential");
    assert.equal(tris.length, 0);
  });
});

describe("ground overlays", () => {
  function area() {
    return {
      roads: [{
        id: "w1", highway: "residential", area: false,
        geometry: { type: "LineString", coordinates: [[127.0, 37.5], [127.002, 37.5]] },
      }],
      landuse: [
        { kind: "leisure:park",
          geometry: { type: "Polygon", coordinates: [[
            [127.0005, 37.5002], [127.0009, 37.5002], [127.0009, 37.5006],
            [127.0005, 37.5006], [127.0005, 37.5002]]] } },
        { kind: "natural:water",
          geometry: { type: "Polygon", coordinates: [[
            [127.0012, 37.5002], [127.0016, 37.5002], [127.0016, 37.5006],
            [127.0012, 37.5006], [127.0012, 37.5002]]] } },
      ],
      complexes: [],
    };
  }

  it("emits paint above the road and a water skin above the base", () => {
    assert.ok(Y_MARK > Y_ROAD && Y_KERB > Y_ROAD);
    const out = buildGround(area().roads, area().landuse, [], new Map(), ORIGIN);
    assert.ok(out.stats.markingTris > 0, "lane paint");
    assert.ok(out.stats.kerbTris > 0, "kerbs");
    assert.ok(out.markings.triangles > 0);
    // Marking heights sit on the paint layers.
    const ys = new Set();
    for (let i = 1; i < out.markings.positions.length; i += 3) {
      ys.add(out.markings.positions[i].toFixed(2));
    }
    assert.ok(ys.has(Y_MARK.toFixed(2)));
    assert.ok(ys.has(Y_KERB.toFixed(2)));
    // Water skin duplicates the base water triangles, lifted.
    assert.ok(out.water.triangles > 0);
    assert.equal(out.water.triangles, out.stats.water);
    for (let i = 1; i < out.water.positions.length; i += 3) {
      assert.ok(out.water.positions[i] > 0.05);
    }
  });

  it("varies grass deterministically", () => {
    const a = buildGround(area().roads, area().landuse, [], new Map(), ORIGIN);
    const b = buildGround(area().roads, area().landuse, [], new Map(), ORIGIN);
    assert.deepEqual(a.colors, b.colors);
    const reds = new Set();
    for (let i = 0; i < a.colors.length; i += 3) reds.add(a.colors[i].toFixed(4));
    assert.ok(reds.size > 3, `distinct grass tones: ${reds.size}`);
  });
});
