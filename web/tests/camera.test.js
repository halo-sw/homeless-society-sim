import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GLIDE_FRAME_M, STOP_FRAME_M, TOUR_FOV_DEG, TOUR_PITCH_DEG, distanceForWidth, frameWidthFor, tourOffset } from "../src/camera.js";

describe("camera", () => {
  it("stays in the miniature brief ranges", () => {
    assert.ok(TOUR_FOV_DEG >= 20 && TOUR_FOV_DEG <= 28, `fov ${TOUR_FOV_DEG}`);
    assert.ok(TOUR_PITCH_DEG >= 40 && TOUR_PITCH_DEG <= 50, `pitch ${TOUR_PITCH_DEG}`);
    assert.ok(STOP_FRAME_M >= 250 && STOP_FRAME_M <= 350, `stop ${STOP_FRAME_M}`);
    assert.ok(GLIDE_FRAME_M >= 400 && GLIDE_FRAME_M <= 600, `glide ${GLIDE_FRAME_M}`);
  });

  it("round-trips frame width and distance", () => {
    const aspect = 1280 / 860; // orchestrator capture size
    const d = distanceForWidth(300, TOUR_FOV_DEG, aspect);
    assert.ok(Math.abs(frameWidthFor(d, TOUR_FOV_DEG, aspect) - 300) < 1e-9);
    assert.ok(Math.abs(frameWidthFor(
      distanceForWidth(GLIDE_FRAME_M, TOUR_FOV_DEG, aspect),
      TOUR_FOV_DEG, aspect) - GLIDE_FRAME_M) < 1e-9);
  });

  it("offsets the camera at the briefed pitch and distance", () => {
    const [dx, dy, dz] = tourOffset(500);
    assert.ok(Math.abs(Math.hypot(dx, dy, dz) - 500) < 1e-9);
    const pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    assert.ok(Math.abs(pitch - TOUR_PITCH_DEG) < 1e-9);
  });
});
