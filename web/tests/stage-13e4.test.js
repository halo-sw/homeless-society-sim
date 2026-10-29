// Stage 13e4: three leftovers from the 13e3 GPU capture.
// 1. Orb camera fits the PROJECTED bounds (84 % of the shorter side,
//    centred) at the current camera angle and container aspect.
// 2. Sim tags hide when their BOX intersects the drawer or top bar.
// 3. Rule chips show the Korean title, never the C- id.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { projectedOrbBounds } from "../src/orb.js";
import { rectsIntersect, tagBoxBlocked } from "../src/stage-tags.js";

const SHAPES = [
  { id: "seongdong", label: "성동", bbox: [127.0, 37.5, 127.08, 37.55] },
  { id: "songpa", label: "송파", bbox: [127.08, 37.45, 127.16, 37.52] },
];
// 3x3 grid of slabs around the orb origin, ~9-region scale.
const GRID9 = [];
for (let i = 0; i < 3; i++) {
  for (let j = 0; j < 3; j++) {
    const lon0 = 127.0 + i * 0.06, lat0 = 37.42 + j * 0.05;
    GRID9.push({ id: `r${i}${j}`, label: `R${i}${j}`,
      bbox: [lon0, lat0, lon0 + 0.055, lat0 + 0.045] });
  }
}

describe("13e4 orb projected fit", () => {
  for (const [name, shapes] of [["2 slabs", SHAPES], ["9 slabs", GRID9]]) {
    it(`${name}: projected box centred ±5 % at 1000x811`, () => {
      const p = projectedOrbBounds(shapes, 1000 / 811, 42);
      assert.ok(Math.abs(p.centerX) <= 0.05, `centerX=${p.centerX}`);
      assert.ok(Math.abs(p.centerY) <= 0.05, `centerY=${p.centerY}`);
    });
    it(`${name}: fill >= 75 % on the limiting axis at 1000x811`, () => {
      const p = projectedOrbBounds(shapes, 1000 / 811, 42);
      assert.ok(p.fill >= 0.75, `fill=${p.fill}`);
      assert.ok(Math.abs(p.fill - 0.84) < 0.02, `fill=${p.fill}`);
    });
  }
});

describe("13e4 tag box blockers", () => {
  // GPU capture: "직장" tag box x 1058-1092 over drawer at x=1060.
  const drawer = { left: 1060, top: 56, width: 380, height: 844 };
  const topbar = { left: 0, top: 0, width: 1440, height: 56 };
  const jobTag = { left: 1058, top: 55, width: 34, height: 13 };

  it("hides a tag whose box overlaps the drawer", () => {
    assert.equal(rectsIntersect(jobTag, drawer), true);
    assert.equal(tagBoxBlocked(jobTag, [drawer, topbar]), true);
  });

  it("hides a tag whose box overlaps the top bar", () => {
    const tag = { left: 500, top: 50, width: 60, height: 20 };
    assert.equal(rectsIntersect(tag, topbar), true);
    assert.equal(tagBoxBlocked(tag, [drawer, topbar]), true);
  });

  it("keeps a tag clear of both", () => {
    const tag = { left: 500, top: 400, width: 60, height: 20 };
    assert.equal(tagBoxBlocked(tag, [drawer, topbar]), false);
  });

  it("touching edges and empty rects do not block", () => {
    assert.equal(rectsIntersect(
      { left: 1000, top: 100, width: 60, height: 20 }, drawer), false);
    assert.equal(tagBoxBlocked(jobTag, []), false);
    assert.equal(tagBoxBlocked(jobTag, null), false);
    assert.equal(tagBoxBlocked(jobTag,
      [{ left: 0, top: 0, width: 0, height: 0 }]), false);
  });
});
