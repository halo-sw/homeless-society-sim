import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { convexHull, crosswalkTriangles, findCrossings, isDrivableClass, isFootClass, landuseColor, ribbonTriangles, roadWidth } from "../src/ground.js";

describe("ground", () => {
  it("widths roads by highway class", () => {
    assert.ok(roadWidth("motorway") > roadWidth("residential"));
    assert.ok(roadWidth("residential") > roadWidth("footway"));
    assert.equal(roadWidth("primary_link"), 6);
    assert.equal(roadWidth("mystery"), 4);
  });

  it("classifies foot vs drivable ways", () => {
    assert.equal(isFootClass("footway"), true);
    assert.equal(isFootClass("residential"), false);
    assert.equal(isDrivableClass("residential"), true);
    assert.equal(isDrivableClass("footway"), false);
    assert.equal(isDrivableClass("trunk_link"), true);
  });

  it("builds ribbon quads along polylines", () => {
    const tris = ribbonTriangles([[0, 0], [10, 0], [10, 10]], 4);
    assert.equal(tris.length, 4); // 2 segments x 2 tris
  });

  it("finds footway/road crossings with zebra bars", () => {
    const roads = [
      { highway: "footway", layer: 0, bridge: null, tunnel: null, area: false, points: [[5, -5], [5, 5]] },
      { highway: "residential", layer: 0, bridge: null, tunnel: null, area: false, points: [[-5, 0], [15, 0]] },
    ];
    const crossings = findCrossings(roads);
    assert.equal(crossings.length, 1);
    assert.ok(Math.abs(crossings[0].x - 5) < 0.01 && Math.abs(crossings[0].y) < 0.01);
    assert.equal(crosswalkTriangles(crossings[0]).length, 8); // 4 bars x 2 tris
  });

  it("finds shared-node junctions (footway vertex on a road)", () => {
    const roads = [
      { highway: "footway", layer: 0, bridge: null, tunnel: null, area: false, points: [[5, -8], [5, 0], [5, 8]] },
      { highway: "tertiary", layer: 0, bridge: null, tunnel: null, area: false, points: [[-5, 0], [5, 0], [15, 0]] },
    ];
    const crossings = findCrossings(roads);
    assert.equal(crossings.length, 1);
    assert.ok(Math.abs(crossings[0].x - 5) < 0.01);
  });

  it("ignores grade-separated crossings", () => {
    const roads = [
      { highway: "footway", layer: 0, bridge: null, tunnel: null, area: false, points: [[5, -5], [5, 5]] },
      { highway: "primary", layer: 1, bridge: "yes", tunnel: null, area: false, points: [[-5, 0], [15, 0]] },
    ];
    assert.equal(findCrossings(roads).length, 0);
  });

  it("computes convex hulls", () => {
    const hull = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]]);
    assert.equal(hull.length, 4);
  });

  it("colors parks and water, skips built landuse", () => {
    assert.ok(landuseColor("leisure:park") !== null);
    assert.ok(landuseColor("natural:water") !== null);
    assert.equal(landuseColor("landuse:residential"), null);
  });
});
