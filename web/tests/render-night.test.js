// Night calm (stage 9c): clamped bloom, window emissive gain, and small
// warm lamp points — pure response functions, no GPU needed.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BLOOM_MAX, clampBloom } from "../src/render/post.js";
import { FACADE_NIGHT_GAIN } from "../src/render/textures.js";
import {
  LAMP_HALO_OPACITY, LAMP_HALO_SIZE, LAMP_HEAD_GAIN, lampGlowFor,
} from "../src/render/streetmeshes.js";

describe("night calm", () => {
  it("ceilings bloom below the blowout", () => {
    assert.equal(BLOOM_MAX, 0.45);
    assert.equal(clampBloom(0.9), 0.45);
    assert.equal(clampBloom(1), 0.45);
    assert.equal(clampBloom(0.2), 0.2);
    assert.equal(clampBloom(0), 0);
    assert.equal(clampBloom(-3), 0);
    assert.equal(clampBloom(NaN), 0);
  });

  it("keeps the facade gain near unity so the window grid survives", () => {
    assert.ok(FACADE_NIGHT_GAIN > 1 && FACADE_NIGHT_GAIN <= 1.2);
  });

  it("glows lamps as small warm points", () => {
    assert.deepEqual(lampGlowFor(1),
      { head: LAMP_HEAD_GAIN, haloOpacity: LAMP_HALO_OPACITY, visible: true });
    assert.ok(LAMP_HEAD_GAIN < 3.2);
    assert.ok(LAMP_HALO_OPACITY > 0.5 && LAMP_HALO_OPACITY < 0.85);
    assert.ok(LAMP_HALO_SIZE < 2.4);
    assert.deepEqual(lampGlowFor(0), { head: 0, haloOpacity: 0, visible: false });
    const half = lampGlowFor(0.5);
    assert.equal(half.head, LAMP_HEAD_GAIN / 2);
    assert.equal(half.visible, true);
  });
});
