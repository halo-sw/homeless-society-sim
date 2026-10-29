// Stage 13e4: three leftovers from the 13e3 GPU capture.
// 1. Orb camera fits the PROJECTED bounds (84 % of the shorter side,
//    centred) at the current camera angle and container aspect.
// 2. Sim tags hide when their BOX intersects the drawer or top bar.
// 3. Rule chips show the Korean title, never the C- id.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { projectedOrbBounds } from "../src/orb.js";

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
