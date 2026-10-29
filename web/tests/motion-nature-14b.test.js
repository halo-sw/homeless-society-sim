import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { patchSwayVertex, setSway, treeMaterial } from "../src/scene/trees3d.js";
import { patchWaterFragment, patchWaterVertex, setWaterTime,
  waterMaterial } from "../src/render/textures.js";
import { swayDayFactor, swayOffset, swayPhase,
  waterWobble, SWAY_MAX_M } from "../src/motion/nature.js";

describe("14b tree sway + water", () => {
  it("bounds sway to 2 % of tree height", () => {
    for (const localY of [0, 1.6, 3.5, 7.0]) {
      for (const t of [0, 1.7, 42, 3600]) {
        for (const ph of [0, 1.3, 5.9]) {
          const [dx, dz] = swayOffset(t, ph, localY, 1);
          assert.ok(Math.hypot(dx, dz) <= SWAY_MAX_M + 1e-9,
            `y=${localY} t=${t} |d|=${Math.hypot(dx, dz)}`);
        }
      }
    }
    assert.ok(SWAY_MAX_M <= 0.02 * 7.0 + 1e-9);
  });
  it("sways deterministically and actually moves", () => {
    const a = swayOffset(100, 2.1, 7, 1);
    const b = swayOffset(100, 2.1, 7, 1);
    assert.deepEqual(a, b);
    const c = swayOffset(101, 2.1, 7, 1);
    assert.ok(Math.hypot(c[0] - a[0], c[1] - a[1]) > 1e-4);
  });
  it("rests at the trunk and calms at night", () => {
    assert.equal(Math.hypot(...swayOffset(10, 1, 0, 1)), 0);
    assert.equal(Math.hypot(...swayOffset(10, 1, 7, 0)), 0);
    assert.equal(swayDayFactor(0), 1);
    assert.equal(swayDayFactor(1), 0);
    assert.equal(swayDayFactor(0.5), 0.5);
    assert.equal(swayDayFactor(NaN), 1);
  });
  it("seeds phase per instance deterministically", () => {
    const p = swayPhase(12.3, -45.6);
    assert.equal(p, swayPhase(12.3, -45.6));
    assert.ok(p >= 0 && p < Math.PI * 2);
    assert.notEqual(p, swayPhase(-12.3, 45.6));
  });
  it("patches the tree vertex shader with time + seed", () => {
    const out = patchSwayVertex("#include <common>\nfoo\n#include <begin_vertex>\n");
    assert.ok(out.includes("uniform float uSwayTime;"));
    assert.ok(out.includes("uniform float uSwayAmp;"));
    assert.ok(out.includes("USE_INSTANCING"));
    assert.ok(out.includes("instanceMatrix[3]"));
    const mat = treeMaterial();
    setSway(mat, 123, 0.5);
    assert.equal(mat.userData.sway.uSwayTime.value, 123);
    assert.equal(mat.userData.sway.uSwayAmp.value, 0.5);
    setSway(null, 1, 1); // safe no-op
  });
  it("drifts water normals slowly and bounded", () => {
    for (const [x, z, t] of [[0, 0, 0], [100, -50, 99], [-33, 77, 3600]]) {
      const w = waterWobble(x, z, t);
      assert.ok(w >= -1 && w <= 1);
      assert.equal(w, waterWobble(x, z, t));
    }
    assert.notEqual(waterWobble(0, 0, 0), waterWobble(0, 0, 30));
    const v = patchWaterVertex("#include <common>\n#include <begin_vertex>\n");
    assert.ok(v.includes("varying vec2 vWaterXZ;"));
    const f = patchWaterFragment("#include <common>\n#include <normal_fragment_maps>\n");
    assert.ok(f.includes("uniform float uWaterTime;"));
    assert.ok(f.includes("normal = normalize("));
    const mat = waterMaterial();
    setWaterTime(mat, 77);
    assert.equal(mat.userData.water.uWaterTime.value, 77);
  });
});
