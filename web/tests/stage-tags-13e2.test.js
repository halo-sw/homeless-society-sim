// Stage 13e2-7: sim map tags stay inside the stage — NDC maps to
// the canvas rect, and tags past the drawer edge (or outside the
// stage vertically) hide.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { placeTag, stageRect } from "../src/stage-tags.js";

const CANVAS = { left: 0, top: 0, width: 1000, height: 800 };

describe("13e2 stage tags", () => {
  it("stage rect subtracts the drawer only when open", () => {
    assert.deepEqual(stageRect(CANVAS, {}),
      { left: 0, top: 0, width: 1000, height: 800 });
    assert.deepEqual(stageRect(CANVAS, { drawerOpen: true, drawerWidth: 380 }),
      { left: 0, top: 0, width: 620, height: 800 });
    assert.equal(
      stageRect(CANVAS, { drawerOpen: false, drawerWidth: 380 }).width, 1000);
    assert.equal(
      stageRect(CANVAS, { drawerOpen: true, drawerWidth: 2000 }).width, 0);
  });

  it("maps NDC to canvas px", () => {
    assert.deepEqual(placeTag(-1, 1, CANVAS, {}), { x: 0, y: 0, visible: true });
    assert.deepEqual(placeTag(1, -1, CANVAS, {}), { x: 1000, y: 800, visible: true });
    assert.deepEqual(placeTag(0, 0, CANVAS, {}), { x: 500, y: 400, visible: true });
  });

  it("hides tags past the drawer edge or outside vertically", () => {
    const drawer = { drawerOpen: true, drawerWidth: 380 };
    assert.equal(placeTag(0.4, 0, CANVAS, drawer).visible, false);
    assert.equal(placeTag(0, 0, CANVAS, drawer).visible, true);
    assert.equal(placeTag(0, 1.5, CANVAS, {}).visible, false);
    assert.equal(placeTag(0, -1.5, CANVAS, {}).visible, false);
    assert.equal(placeTag(0.4, 0, CANVAS, {}).visible, true);
  });
});
