// Stage 13e5: orb pivots on its centre; sim scene clear of the drawer.
// 1. Idle drift is a ±6° oscillation about the map centre (pivot at
//    the fitted centre), so the map cannot swing off-camera.
// 2. The sim camera shifts its projection so the orbit target lands on
//    the stage centre (canvas minus drawer overlap).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ORB_DRIFT_DEG, rotatedOrbBounds } from "../src/orb.js";
import { simViewOffset } from "../src/stage-tags.js";

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

describe("13e5 orb pivot drift", () => {
  it("drift amplitude is ±6°", () => {
    assert.equal(ORB_DRIFT_DEG, 6);
  });

  for (const [name, shapes] of [["2 slabs", SHAPES], ["9 slabs", GRID9]]) {
    for (const deg of [-6, 6]) {
      it(`${name}: rotating ${deg}° about the pivot stays centred ±5 %`, () => {
        const p = rotatedOrbBounds(shapes, deg, 1000 / 811, 42);
        assert.ok(Math.abs(p.centerX) <= 0.05, `centerX=${p.centerX}`);
        assert.ok(Math.abs(p.centerY) <= 0.05, `centerY=${p.centerY}`);
      });
    }
  }
});

describe("13e5 sim view offset", () => {
  it("1440 wide with a 380 px drawer centres on the stage", () => {
    const o = simViewOffset(1440, 380);
    assert.equal(o.overlap, 380);
    assert.equal(o.x, 190);
    assert.equal(o.y, 0);
    assert.equal(o.fullW, 1440);
    assert.equal(o.width, 1440);
    assert.equal(o.stageWidth, 1060);
    assert.equal(o.stageCenterX, 530);
    // The orbit target (canvas centre 720) slides left by x → 530.
    assert.equal(1440 / 2 - o.x, o.stageCenterX);
  });

  it("no drawer means no offset", () => {
    const o = simViewOffset(1440, 0);
    assert.equal(o.overlap, 0);
    assert.equal(o.x, 0);
    assert.equal(o.stageWidth, 1440);
    assert.equal(o.stageCenterX, 720);
  });

  it("clamps overlap to the canvas", () => {
    const o = simViewOffset(1000, 2000);
    assert.equal(o.overlap, 1000);
    assert.equal(o.x, 500);
    assert.equal(o.stageWidth, 0);
    const neg = simViewOffset(1000, -50);
    assert.equal(neg.overlap, 0);
    assert.equal(neg.x, 0);
  });
});
