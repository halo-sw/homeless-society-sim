import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QUALITY_SETTINGS } from "../src/render/quality.js";
import { postChainSpec, frameIsUniform } from "../src/render/post.js";
import { fogRangeFor, SKY_COLORS } from "../src/render/sky.js";
import {
  litFractionFor, litFractionWithFallback, globalHomeFraction, eveningHomeFraction,
} from "../src/render/facades.js";
import { buildStreetMeshes } from "../src/render/streetmeshes.js";

describe("stage 6 render", () => {
  it("specs the post chain: SAO before bloom, output last, no MSAA with SAO", () => {
    assert.deepEqual(postChainSpec("high"), ["render", "sao", "bloom", "tilt", "grade", "output"]);
    assert.deepEqual(postChainSpec("medium"), ["render", "bloom", "tilt", "grade", "output"]);
    assert.deepEqual(postChainSpec("low"), ["render"]);
    assert.deepEqual(postChainSpec("high", { saoOff: true }),
      ["render", "bloom", "tilt", "grade", "output"]);
    for (const level of ["high", "medium", "low"]) {
      const s = QUALITY_SETTINGS[level];
      if (s.sao) assert.equal(s.composerSamples, 0); // ANGLE Metal black-frame fix
      const spec = postChainSpec(level);
      assert.equal(spec[spec.length - 1], level === "low" ? "render" : "output");
    }
  });

  it("detects uniform dark frames (black-frame guard)", () => {
    const black = new Uint8Array(8 * 8 * 4).fill(0);
    assert.equal(frameIsUniform(black), true);
    const varied = new Uint8Array(black);
    varied[0] = 200;
    assert.equal(frameIsUniform(varied), false);
    const bright = new Uint8Array(8 * 8 * 4).fill(200);
    assert.equal(frameIsUniform(bright), false); // uniform but not dark
    const near = new Uint8Array(8 * 8 * 4).fill(5);
    near[4] = 6;
    assert.equal(frameIsUniform(near), true); // within eps
    assert.equal(frameIsUniform(new Uint8Array(0)), false);
    assert.equal(frameIsUniform(null), false);
  });

  it("starts fog beyond 1.5x the framed width", () => {
    assert.deepEqual(fogRangeFor(300), { near: 450, far: 1800 });
    assert.deepEqual(fogRangeFor(2000), { near: 3000, far: 12000 });
    assert.deepEqual(fogRangeFor(null), { near: 450, far: 1800 });
  });

  it("keeps night sky deep blue and blue hour distinct", () => {
    assert.equal(SKY_COLORS.skyNight, 0x1a2650);
    assert.notEqual(SKY_COLORS.skyBlue, SKY_COLORS.skyNight);
    assert.notEqual(SKY_COLORS.fogNight, SKY_COLORS.fogBlue);
  });

  it("lights residential buildings with exact or fallback shares", () => {
    assert.equal(litFractionFor({ home: 3, total: 4 }), 0.75);
    assert.equal(litFractionFor(null), 0);
    // Exact share wins when agents live there.
    assert.equal(litFractionWithFallback({ home: 1, total: 2 },
      { households: 50, globalHomeFrac: 0.9, hash01: 0 }), 0.5);
    // Fallback: global share ±20% by hash.
    assert.equal(litFractionWithFallback(null,
      { households: 50, globalHomeFrac: 0.9, hash01: 0.5 }), 0.9);
    assert.ok(Math.abs(litFractionWithFallback(undefined,
      { households: 50, globalHomeFrac: 0.9, hash01: 0 }) - 0.72) < 1e-9);
    // No households or nobody home: dark.
    assert.equal(litFractionWithFallback(null,
      { households: 0, globalHomeFrac: 0.9, hash01: 0.5 }), 0);
    assert.equal(litFractionWithFallback(null,
      { households: 50, globalHomeFrac: 0, hash01: 0.5 }), 0);
    assert.equal(globalHomeFraction(new Map([
      ["a", { home: 3, total: 4 }], ["b", { home: 1, total: 2 }],
    ])), 4 / 6);
    assert.equal(globalHomeFraction(new Map()), 0);
  });

  it("ramps the tour lighting estimate through the evening", () => {
    assert.equal(eveningHomeFraction(720), 0); // noon: dark
    assert.equal(eveningHomeFraction(1110), 0.8); // 18:30 evening
    assert.equal(eveningHomeFraction(1260), 0.9); // 21:00 night
    assert.equal(eveningHomeFraction(180), 0.55); // small hours
    assert.equal(eveningHomeFraction(NaN), 0);
  });

  it("builds lamp halos that glow at night (headless three.js)", () => {
    const meshes = buildStreetMeshes({
      cars: [], movers: [],
      lamps: [{ x: 0, y: 0 }, { x: 10, y: 5 }],
    });
    assert.equal(meshes.lampCount, 2);
    assert.ok(meshes.halo);
    assert.equal(meshes.halo.geometry.attributes.position.count, 2);
    meshes.setLampGlow(0);
    assert.equal(meshes.halo.visible, false);
    meshes.setLampGlow(1);
    assert.equal(meshes.halo.visible, true);
    assert.ok(meshes.halo.material.opacity > 0.5);
  });
});
