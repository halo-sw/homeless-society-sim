// Stage 19e: the train is a constant-size HTML pin (no 3D cone), the
// station-dot clamp is a true ceiling, and sim members are 나/배우자/아이.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { markerScaleFor } from "../src/journey.js";
import { memberLabelFor } from "../src/profile.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

// Screen px of a world-height object at a camera distance.
const pxFor = (worldH, scale, d, fov = 10, vh = 900) =>
  (scale * worldH * vh) / (2 * d * Math.tan((fov * Math.PI) / 180 / 2));

describe("19e marker ceiling + member names", () => {
  it("caps station dots at 14 px near, mid and far", () => {
    for (const d of [30, 300, 3000]) {
      const s = markerScaleFor(d, 10, 900, 36, 14);
      assert.ok(pxFor(36, s, d) <= 14.001, `d=${d}m renders ${pxFor(36, s, d)} px`);
    }
  });

  it("names members 나/배우자/아이, never 구성원 N", () => {
    assert.equal(memberLabelFor({ label: "구성원 1", role: "adult" }, 0), "나");
    assert.equal(memberLabelFor({ label: "구성원 2", role: "adult" }, 1), "배우자");
    assert.equal(memberLabelFor({ label: "구성원 2", role: "child" }, 1), "아이");
  });

  it("renders the train as an HTML pin, not a cone", () => {
    const src = readFileSync(join(ROOT, "web/src/journey-scene.js"), "utf8");
    assert.ok(!src.includes("ConeGeometry(30, 90"), "cone removed");
    assert.ok(src.includes("trainpin"), "HTML pin present");
  });
});
