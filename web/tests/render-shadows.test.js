// Shadow-frustum maths tests (stage 7, Part C): the ortho extent
// follows the frame, near/far hug the scene depth, texel snapping is
// idempotent and sub-texel, and normalBias scales with texel size.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SHADOW_BIAS, shadowFit, shadowHalfExtent, snapTargetToTexel,
} from "../src/render/shadows.js";

describe("shadowHalfExtent", () => {
  it("tightens on close frames and caps at the span", () => {
    assert.equal(shadowHalfExtent({ framedWidthM: 60 }), 90); // floor
    assert.equal(shadowHalfExtent({ framedWidthM: 200 }), 120); // 200 × 0.6
    assert.equal(shadowHalfExtent({ framedWidthM: 800 }), 240); // span cap
    assert.equal(shadowHalfExtent({}), 240);
  });
});

describe("shadowFit", () => {
  it("hugs near/far to the scene instead of 1..far", () => {
    const f = shadowFit({ halfM: 120, distM: 900, maxHeightM: 200, mapSize: 2048 });
    // half-depth = 120 × 1.2 + 200 = 344 → near 556, far 1244.
    assert.equal(f.near, 556);
    assert.equal(f.far, 1244);
    assert.ok(Math.abs(f.texelM - (240 / 2048)) < 1e-9);
    assert.ok(f.normalBias >= 0.05 && f.normalBias <= 0.5);
    assert.equal(f.bias, SHADOW_BIAS);
  });

  it("scales normalBias with the texel size", () => {
    const tight = shadowFit({ halfM: 90, distM: 900, mapSize: 2048 });
    const wide = shadowFit({ halfM: 240, distM: 900, mapSize: 1024 });
    assert.ok(tight.normalBias < wide.normalBias);
    assert.ok(tight.normalBias < 0.5); // far below the old fixed 1.5 m
  });
});

describe("snapTargetToTexel", () => {
  const sun = [0.5, 0.7, 0.35];

  it("moves less than one texel and is idempotent", () => {
    const texelM = 0.2;
    const s1 = snapTargetToTexel({ x: 123.456, z: -78.912, sunDir: sun, texelM });
    const shift = Math.hypot(s1.x - 123.456, s1.y - 0, s1.z - -78.912);
    assert.ok(shift < texelM, `shift ${shift} exceeds one texel`);
    const s2 = snapTargetToTexel({ x: s1.x, y: s1.y, z: s1.z, sunDir: sun, texelM });
    assert.ok(Math.abs(s2.x - s1.x) < 1e-9 && Math.abs(s2.y - s1.y) < 1e-9
      && Math.abs(s2.z - s1.z) < 1e-9);
  });

  it("passes through degenerate texels", () => {
    assert.deepEqual(snapTargetToTexel({ x: 1, z: 2, sunDir: sun, texelM: 0 }), { x: 1, y: 0, z: 2 });
  });
});
