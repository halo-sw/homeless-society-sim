// Stage 14e painted post: chain order per style x quality plus the pure
// helpers behind outlines, Kuwahara and the pixel step (no GPU needed).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { postChainSpec } from "../src/render/post.js";
import { KuwaharaShader, OutlineAOShader, kuwaharaRadiusFor,
  outlineStrengthFor, paintedPixelFactor } from "../src/render/painted.js";

describe("painted post chain (14e)", () => {
  it("orders render → outline → kuwahara → bloom → grade → output", () => {
    const painted = ["render", "outline", "kuwahara", "bloom", "grade", "output"];
    assert.deepEqual(postChainSpec("high", { style: "painted" }), painted);
    assert.deepEqual(postChainSpec("medium", { style: "painted" }), painted);
    assert.deepEqual(postChainSpec("low", { style: "painted" }), ["render"]);
  });

  it("keeps the photo chain (SAO on high, tilt-shift, output last)", () => {
    assert.deepEqual(postChainSpec("high", { style: "photo" }),
      ["render", "sao", "bloom", "tilt", "grade", "output"]);
    assert.deepEqual(postChainSpec("medium", { style: "photo" }),
      ["render", "bloom", "tilt", "grade", "output"]);
    assert.deepEqual(postChainSpec("low", { style: "photo" }), ["render"]);
    // Default style is photo, so old callers keep today's chain.
    assert.deepEqual(postChainSpec("high"),
      ["render", "sao", "bloom", "tilt", "grade", "output"]);
  });

  it("has no tilt-shift in painted, SAO only in photo high", () => {
    for (const level of ["high", "medium", "low"]) {
      const spec = postChainSpec(level, { style: "painted" });
      assert.ok(!spec.includes("tilt"), `${level}: no tilt`);
      assert.ok(!spec.includes("sao"), `${level}: no SAO`);
      assert.equal(spec[0], "render");
      assert.equal(spec[spec.length - 1], level === "low" ? "render" : "output");
    }
    assert.ok(!postChainSpec("high", { style: "painted", saoOff: true })
      .includes("sao"));
  });
});

describe("painted post helpers (14e)", () => {
  it("renders the main pass at 1/1.5 on high, full below (?px= wins)", () => {
    assert.equal(paintedPixelFactor("high"), 1.5);
    assert.equal(paintedPixelFactor("medium"), 1);
    assert.equal(paintedPixelFactor("low"), 1);
    assert.equal(paintedPixelFactor("high", "1"), 1); // ?px=1 disables
    assert.equal(paintedPixelFactor("high", "2"), 2);
    assert.equal(paintedPixelFactor("medium", "2"), 2);
    assert.equal(paintedPixelFactor("high", "nope"), 1.5);
    assert.equal(paintedPixelFactor("high", null), 1.5);
    assert.equal(paintedPixelFactor("high", "0"), 1);
  });

  it("sizes the Kuwahara radius by quality (3 high, 2 medium)", () => {
    assert.equal(kuwaharaRadiusFor("high"), 3);
    assert.equal(kuwaharaRadiusFor("medium"), 2);
  });

  it("fades outlines out past a 3 km framed width", () => {
    assert.equal(outlineStrengthFor(150), 1);
    assert.equal(outlineStrengthFor(1500), 1);
    assert.equal(outlineStrengthFor(3000), 0);
    assert.equal(outlineStrengthFor(20000), 0);
    assert.equal(outlineStrengthFor(2250), 0.5);
    assert.equal(outlineStrengthFor(null), 1);
    assert.equal(outlineStrengthFor(undefined), 1);
    const mid = outlineStrengthFor(2000);
    assert.ok(mid > 0 && mid < 1);
  });

  it("exposes depth-driven outline/AO and radius-baked Kuwahara shaders", () => {
    for (const k of ["tDiffuse", "tDepth", "cameraNear", "cameraFar",
        "resolution", "outlineStrength"]) {
      assert.ok(k in OutlineAOShader.uniforms, `outline uniform ${k}`);
    }
    assert.match(OutlineAOShader.fragmentShader, /unpackRGBAToDepth/);
    assert.match(OutlineAOShader.fragmentShader, /perspectiveDepthToViewZ/);
    assert.match(OutlineAOShader.fragmentShader, /0\.35/); // 35 % darker
    assert.match(OutlineAOShader.fragmentShader, /0\.40/); // AO ≤ 40 %
    const k3 = KuwaharaShader(3).fragmentShader;
    assert.match(k3, /x = -3; x <= 0/);
    assert.match(k3, /x = 0; x <= 3/);
    assert.match(k3, /\/ 16\.0/);
    const k2 = KuwaharaShader(2).fragmentShader;
    assert.match(k2, /x = -2; x <= 0/);
    assert.match(k2, /\/ 9\.0/);
  });
});
