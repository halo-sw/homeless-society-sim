import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { placeTrees } from "../src/trees.js";

const ORIGIN = { lon: 127.0, lat: 37.5 };

// One residential street (east-west at lat 37.5) + one house footprint north of it.
function tinyArea() {
  return {
    area: "tiny",
    buildings: [{
      id: "h1",
      geometry: { type: "Polygon", coordinates: [[
        [127.0005, 37.5002], [127.0007, 37.5002], [127.0007, 37.5004],
        [127.0005, 37.5004], [127.0005, 37.5002]]],
      },
    }],
    roads: [{
      id: "w1", highway: "residential", area: false,
      geometry: { type: "LineString", coordinates: [[127.0, 37.5], [127.002, 37.5]] },
    }],
    complexes: [],
  };
}

describe("trees", () => {
  it("is deterministic for a fixed seed", () => {
    const a = placeTrees(tinyArea(), ORIGIN, { seed: 7 });
    const b = placeTrees(tinyArea(), ORIGIN, { seed: 7 });
    assert.deepEqual(a, b);
    assert.ok(a.trees.length > 0, "expected street trees");
  });

  it("never plants inside building footprints", () => {
    const { trees } = placeTrees(tinyArea(), ORIGIN, { seed: 7 });
    // Footprint x in [~44, ~62] m east, y in [~22, ~44] m north of origin.
    for (const t of trees) {
      const inside = t.x > 40 && t.x < 66 && t.y > 18 && t.y < 48;
      assert.equal(inside, false, `tree at ${t.x},${t.y}`);
    }
  });

  it("respects the tree cap", () => {
    const { trees } = placeTrees(tinyArea(), ORIGIN, { seed: 7, maxTrees: 3 });
    assert.ok(trees.length <= 3);
  });

  it("plants inside named complexes", () => {
    const area = tinyArea();
    area.buildings.push({
      id: "a1",
      geometry: { type: "Polygon", coordinates: [[
        [127.001, 37.501], [127.0012, 37.501], [127.0012, 37.5012],
        [127.001, 37.5012], [127.001, 37.501]]],
      },
    });
    area.complexes = [{ id: "cx000001", name: "단지", name_source: "register",
      building_ids: ["a1"], centroid: [127.0011, 37.5011], households_hint: null, max_floors: 15 }];
    const { trees } = placeTrees(area, ORIGIN, { seed: 7 });
    assert.ok(trees.length > 0);
  });
});
