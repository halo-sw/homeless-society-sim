// Stage 14e painted post: chain order per style x quality plus the pure
// helpers behind outlines, Kuwahara and the pixel step (no GPU needed).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { postChainSpec, resolvePostDebug } from "../src/render/post.js";
import { DebugDepthShader, DebugEdgeShader, KuwaharaShader, OutlineAOShader, PaintedPass, aoEps, aoScale, aoTap, kuwaharaRadiusFor, lapDepth,
  outlineEdge, outlineStrengthFor, paintedPixelFactor } from "../src/render/painted.js";

describe("painted post chain (14e)", () => {
  it("orders render → ao → kuwahara → outline → bloom → grade → output (14f)", () => {
    // 14f: AO before Kuwahara (low-frequency, survives it), 1 px edges
    // after (the least-variance selector would erase them before it).
    const painted = ["render", "ao", "kuwahara", "outline", "bloom", "grade", "output"];
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

describe("painted debug routing (14f)", () => {
  it("resolves ?debug= for painted only, anything else is a normal frame", () => {
    assert.equal(resolvePostDebug("?debug=albedo", "painted"), "albedo");
    assert.equal(resolvePostDebug("?debug=depth", "painted"), "depth");
    assert.equal(resolvePostDebug("?debug=outline", "painted"), "outline");
    assert.equal(resolvePostDebug("?debug=albedo", "photo"), null);
    assert.equal(resolvePostDebug("?debug=nope", "painted"), null);
    assert.equal(resolvePostDebug("", "painted"), null);
    assert.equal(resolvePostDebug(null, "painted"), null);
    assert.equal(resolvePostDebug(new URLSearchParams("debug=depth"), "painted"), "depth");
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

  it("fades outlines out past a 5 km framed width (14f)", () => {
    assert.equal(outlineStrengthFor(150), 1);
    assert.equal(outlineStrengthFor(1500), 1);
    assert.equal(outlineStrengthFor(5000), 0);
    assert.equal(outlineStrengthFor(20000), 0);
    assert.equal(outlineStrengthFor(3250), 0.5);
    assert.equal(outlineStrengthFor(null), 1);
    assert.equal(outlineStrengthFor(undefined), 1);
    // The regional journey view (~3.5 km) keeps partial edges.
    const regional = outlineStrengthFor(3500);
    assert.ok(regional > 0.4 && regional < 0.45, `regional ${regional}`);
    const mid = outlineStrengthFor(2000);
    assert.ok(mid > 0 && mid < 1);
  });

  it("edges depth steps from 0.8 % and occludes contacts at any range (14f)", () => {
    // Flat field: no edge, no occlusion.
    assert.equal(outlineEdge(1000, 1000, 1000, 1000, 1000), 0);
    assert.equal(aoTap(1000, 1000), 0);
    // A 10 m silhouette step at 1 km exceeds the threshold …
    assert.equal(lapDepth(1000, 1000, 1000, 1000, 990), 0.01);
    assert.ok(outlineEdge(1000, 1000, 1000, 1000, 990) > 0, "10 m step edges");
    // … a 50 m tower-vs-ground step edges hard (≈35 % × ~0.9) …
    assert.ok(outlineEdge(1000, 1000, 1000, 1000, 950) > 0.85, "50 m step");
    // … building-vs-sky saturates, and 2 m facade relief stays clean.
    assert.equal(outlineEdge(1000, 1000, 1000, 1000, 15000), 1);
    assert.equal(outlineEdge(1000, 1000, 1000, 1000, 998), 0);
    // AO tolerance tracks the footprint: a wall 1 m nearer at 1 km — the
    // 14e eps (5 m here) swallowed it — now occludes.
    assert.ok(aoEps(1000) < 1.5, `eps(1 km) = ${aoEps(1000)}`);
    assert.ok(aoTap(1000, 999) > 0, "1 m contact occludes");
    assert.ok(aoEps(5000) > aoEps(1000), "eps grows with distance");
    assert.ok(aoScale(1000) > 0, "finite scale");
  });

  it("shares one depth prepass between the AO and edge passes (14f)", () => {
    const scene = {};
    const camera = { near: 1, far: 1000 };
    const ao = new PaintedPass(scene, camera);
    const edge = new PaintedPass(scene, camera, { shareDepthFrom: ao });
    assert.equal(edge.depthTarget, ao.depthTarget);
    assert.equal(ao.ownsDepth, true);
    assert.equal(edge.ownsDepth, false);
    ao.setOutlineStrength(0);
    assert.equal(ao.uniforms.outlineStrength.value, 0);
    assert.equal(ao.uniforms.aoStrength.value, 1);
    edge.setAOStrength(0);
    assert.equal(edge.uniforms.aoStrength.value, 0);
    assert.equal(typeof edge.renderDebug, "function");
  });

  it("exposes depth-driven outline/AO and radius-baked Kuwahara shaders", () => {
    for (const k of ["tDiffuse", "tDepth", "cameraNear", "cameraFar",
        "resolution", "outlineStrength", "aoStrength"]) {
      assert.ok(k in OutlineAOShader.uniforms, `outline uniform ${k}`);
    }
    assert.match(OutlineAOShader.fragmentShader, /unpackRGBAToDepth/);
    assert.match(OutlineAOShader.fragmentShader, /perspectiveDepthToViewZ/);
    assert.match(OutlineAOShader.fragmentShader, /0\.35/); // 35 % darker
    assert.match(OutlineAOShader.fragmentShader, /1\.0 - 0\.4 \* occ/); // AO ≤ 40 %
    assert.match(OutlineAOShader.fragmentShader, /0\.008, 0\.06/); // 14f edge band
    assert.match(OutlineAOShader.fragmentShader, /0\.0006/); // footprint AO
    for (const dbg of [DebugDepthShader, DebugEdgeShader]) {
      assert.match(dbg.fragmentShader, /unpackRGBAToDepth/);
      assert.match(dbg.fragmentShader, /perspectiveDepthToViewZ/);
    }
    assert.match(DebugEdgeShader.fragmentShader, /outlineStrength/);
    const k3 = KuwaharaShader(3).fragmentShader;
    assert.match(k3, /x = -3; x <= 0/);
    assert.match(k3, /x = 0; x <= 3/);
    assert.match(k3, /\/ 16\.0/);
    const k2 = KuwaharaShader(2).fragmentShader;
    assert.match(k2, /x = -2; x <= 0/);
    assert.match(k2, /\/ 9\.0/);
  });
});
