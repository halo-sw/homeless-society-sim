// 19g-8 demo-sim white disc: the journey station dots (a white
// sphere over a dark ×1.25 hull) are authored 36 m across, which reads
// as a ~45 px white disc with a dark ring at cruise distance whenever
// a frame skips the distance rescale. Pins: dots seed at scale 0 and
// every frame rescales them (the rescale no-ops while hidden).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { markerScaleFor } from "../src/journey.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const mainSrc = () => readFileSync(join(ROOT, "web/src/main.js"), "utf8");
const sceneSrc = () => readFileSync(join(ROOT, "web/src/journey-scene.js"), "utf8");

// Screen px of a world-height object at a camera distance.
const pxFor = (worldH, scale, d, fov = 10, vh = 800) =>
  (scale * worldH * vh) / (2 * d * Math.tan((fov * Math.PI) / 180 / 2));

describe("19g-8 journey dots never show unscaled", () => {
  it("unscaled 36 m dots match the ~45 px disc at cruise distance", () => {
    const bare = pxFor(36, 1, 4000);
    assert.ok(bare > 35 && bare < 60, `unscaled dot renders ${bare.toFixed(1)} px`);
    const s = markerScaleFor(4000, 10, 800, 36, 14);
    assert.ok(s < 1, "rescale shrinks cruise dots");
    assert.ok(pxFor(36, s, 4000) <= 14, "rescaled dot obeys the ceiling");
  });

  it("main rescales every frame with no phase gate", () => {
    const src = mainSrc();
    const at = src.indexOf("journeyLayer.updateMarkerScale(camera");
    assert.ok(at !== -1, "rescale call exists");
    // Walk up past blanks/comments: the enclosing statement must not
    // be phase-gated, or a visible phase could show unscaled dots.
    const lines = src.slice(0, at).split("\n");
    let code = "";
    while (lines.length > 0) {
      const t = lines.pop().trim();
      if (t === "" || t.startsWith("//")) continue;
      code = t;
      break;
    }
    assert.ok(!code.includes("phase"), `rescale unconditional (above: ${code})`);
  });

  it("fresh path dots seed invisible until the rescale sizes them", () => {
    const src = sceneSrc();
    assert.ok(src.includes("dummy.scale.setScalar(0)"), "dots seed at scale 0");
    assert.ok(src.includes("if (!camera || !group.visible) return;"),
      "rescale no-ops while the layer is hidden");
  });
});
