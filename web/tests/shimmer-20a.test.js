// Stage 20a: the 3D view stops crawling when the camera moves.
// Full-res painted pass, MSAA/FXAA, gentle Kuwahara, one road layer.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { paintedPixelFactor, kuwaharaRadiusFor, temporalStableKuwahara } from "../src/render/painted.js";
import { postChainSpec } from "../src/render/post.js";
import { qualitySettings } from "../src/render/quality.js";

const here = dirname(fileURLToPath(import.meta.url));
const mainSrc = readFileSync(join(here, "..", "src", "main.js"), "utf8");

describe("shimmer 20a: full-res painted pass", () => {
  it("defaults paintedPixelFactor to 1 on high, keeps ?px= override", () => {
    assert.equal(paintedPixelFactor("high"), 1);
    assert.equal(paintedPixelFactor("high", "2"), 2);
  });
});

describe("shimmer 20a: painted anti-aliasing", () => {
  it("shows an AA step in the painted chain (or paintedSamples: 4)", () => {
    const spec = postChainSpec("high", { style: "painted" });
    const hasAA = spec.includes("aa") || spec.includes("fxaa");
    const hasSamples = (qualitySettings("high").paintedSamples || 0) >= 4;
    assert.ok(hasAA || hasSamples,
      `painted chain needs AA: spec=${spec.join("+")}`);
  });
});

describe("shimmer 20a: gentle Kuwahara", () => {
  it("keeps the Kuwahara radius ≤ 1 by default", () => {
    assert.ok(temporalStableKuwahara("high") <= 1);
    assert.ok(temporalStableKuwahara("medium") <= 1);
    assert.ok(kuwaharaRadiusFor("high") <= 1);
    assert.ok(kuwaharaRadiusFor("medium") <= 1);
  });
});

describe("shimmer 20a: one road layer in painted scene mode", () => {
  it("hides the old ground next to the markMesh hide", () => {
    const lines = mainSrc.split("\n");
    const markIdx = lines.findIndex((l) => l.includes("markMesh.visible = false"));
    assert.ok(markIdx >= 0, "markMesh hide line exists");
    const near = lines.slice(Math.max(0, markIdx - 12), markIdx + 3).join("\n");
    assert.ok(near.includes('STYLE === "painted"'), "inside the painted scene-mode block");
    assert.ok(/groundMesh\.visible\s*=\s*false/.test(near),
      "old ground hidden next to the markMesh hide");
  });
});
