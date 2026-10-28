import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_DROP_FPS, AUTO_DROP_FRAMES,
  effectiveQuality, parseQuality, qualitySettings, shouldDropToLow,
} from "../src/render/quality.js";

describe("quality levels", () => {
  it("parses ?q= with a medium default", () => {
    assert.equal(parseQuality(new URLSearchParams("")), "medium");
    assert.equal(parseQuality(new URLSearchParams("q=high")), "high");
    assert.equal(parseQuality(new URLSearchParams("q=low")), "low");
    assert.equal(parseQuality(new URLSearchParams("q=ultra")), "medium");
  });

  it("steps cost down from high to low", () => {
    const high = qualitySettings("high");
    const medium = qualitySettings("medium");
    const low = qualitySettings("low");
    assert.ok(high.pixelRatio >= medium.pixelRatio && medium.pixelRatio >= low.pixelRatio);
    assert.ok(high.shadowMapSize >= low.shadowMapSize);
    assert.equal(low.composer, false);
    assert.equal(medium.composer, true);
    assert.equal(high.sao, true);
    assert.equal(medium.sao, false);
    assert.equal(qualitySettings("bogus"), qualitySettings("medium"));
  });

  it("auto-drops when the first 60 frames average below 25 fps", () => {
    assert.equal(AUTO_DROP_FRAMES, 60);
    assert.equal(AUTO_DROP_FPS, 25);
    const fast = new Array(60).fill(1000 / 60);
    const slow = new Array(60).fill(1000 / 20);
    assert.equal(shouldDropToLow(fast), false);
    assert.equal(shouldDropToLow(slow), true);
    assert.equal(shouldDropToLow(new Array(30).fill(100)), false); // too few
    assert.equal(effectiveQuality("medium", slow), "low");
    assert.equal(effectiveQuality("medium", fast), "medium");
    assert.equal(effectiveQuality("low", fast), "low"); // never upgrades
    assert.equal(effectiveQuality("high", slow), "low");
  });
});
