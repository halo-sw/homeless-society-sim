import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ARCH_DEPRESSION_DEG, ARCH_FOV_DEG, STOP_FRAME_M, archLensPose,
} from "../src/camera.js";
import { PINE } from "../src/palette.js";
import { placeTrees, speciesFor } from "../src/trees.js";

const RAD = Math.PI / 180;

describe("architectural lens (two-point perspective)", () => {
  it("crops the stop inside the wide frustum", () => {
    const p = archLensPose(STOP_FRAME_M, 1.49);
    assert.ok(p.viewH > 0 && p.viewH < 1, `viewH=${p.viewH}`);
    assert.ok(p.yFrac > 0 && p.yFrac < 1, `yFrac=${p.yFrac}`);
    assert.ok(p.yFrac + p.viewH <= 1, "crop inside the frustum");
  });

  it("centres the target: level sensor, shifted principal point", () => {
    const p = archLensPose();
    // NDC row of the crop centre...
    const ndcCentre = 1 - 2 * (p.yFrac + p.viewH / 2);
    // ...equals the depressed target's NDC row in the wide frustum.
    const beta = ((ARCH_FOV_DEG / 2) * RAD);
    const expect = -Math.tan(ARCH_DEPRESSION_DEG * RAD) / Math.tan(beta);
    assert.ok(Math.abs(ndcCentre - expect) < 1e-9, `${ndcCentre} vs ${expect}`);
  });

  it("frames the 2b stop width at the 2b distance", () => {
    const p = archLensPose(STOP_FRAME_M, 1280 / 860);
    // Same 474 m slant distance as the 2b stop frame (24° view).
    assert.ok(Math.abs(p.dist - 474) < 2, `dist=${p.dist}`);
    assert.ok(Math.abs(Math.hypot(p.dirX, p.dirZ) - 1) < 1e-9, "unit azimuth");
    assert.ok(p.vert > 200 && p.horiz > 300, `h=${p.horiz} v=${p.vert}`);
  });
});

describe("tree species", () => {
  function tinyArea() {
    return {
      area: "tiny",
      buildings: [],
      roads: [{
        id: "w1", highway: "residential", area: false,
        geometry: { type: "LineString", coordinates: [[127.0, 37.5], [127.004, 37.5]] },
      }],
      complexes: [],
    };
  }

  it("derives zelkova / ginkgo / pine from the rotation phase", () => {
    assert.equal(speciesFor(0), "zelkova");
    assert.equal(speciesFor(Math.PI), "ginkgo");
    assert.equal(speciesFor(Math.PI * 1.9), "pine");
    const { trees } = placeTrees(tinyArea(), { lon: 127.0, lat: 37.5 }, { seed: 7 });
    const species = new Set(trees.map((t) => t.species));
    assert.ok(species.has("zelkova") && species.has("ginkgo") && species.has("pine"),
      [...species].join(","));
    for (const t of trees) {
      if (t.species === "pine") assert.ok(PINE.includes(t.color), `pine ${t.color}`);
    }
  });
});
