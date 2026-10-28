import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GLIDE_FRAME_M, HOST_FADE_MIN_M, STOP_AZIMUTHS, STOP_FRAME_M, TOUR_AZIMUTH, TOUR_FOV_DEG, TOUR_PITCH_DEG, distanceForWidth, footprintsOf, frameWidthFor, hostTowerIds, occludingIds, pickStopAzimuth, sightOcclusion, tourOffset } from "../src/camera.js";

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

// A 140 m tower (46 storeys) near the stop target on the default sight
// line; the picker must route the camera around it.
function towerScene() {
  const aspect = 1280 / 860;
  const dist = distanceForWidth(STOP_FRAME_M, TOUR_FOV_DEG, aspect);
  const target = [0, 0];
  const [ox, oy, oz] = tourOffset(dist, TOUR_PITCH_DEG, TOUR_AZIMUTH);
  const cam = [ox, -oz]; // local XY, target at origin
  const at = (t) => [cam[0] + (target[0] - cam[0]) * t, cam[1] + (target[1] - cam[1]) * t];
  const [cx, cy] = at(0.85); // close to the target: the sight is low here
  const h = 15;
  const ring = [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h], [cx - h, cy - h]];
  const tower = { ring, minX: cx - h, minY: cy - h, maxX: cx + h, maxY: cy + h, height: 140 };
  return { dist, target, tower };
}

describe("stop azimuth (tower occlusion)", () => {
  it("counts a tower on the sight line as an occluder", () => {
    const { dist, target, tower } = towerScene();
    const seen = sightOcclusion(target, [tower], dist, TOUR_AZIMUTH);
    assert.equal(seen.occluders, 1);
    assert.ok(seen.overlapM > 0);
    // From the opposite side the same tower is behind the target.
    const clear = sightOcclusion(target, [tower], dist, [-TOUR_AZIMUTH[0], -TOUR_AZIMUTH[1]]);
    assert.equal(clear.occluders, 0);
  });

  it("ignores low buildings under the sight line", () => {
    const { dist, target, tower } = towerScene();
    const low = { ...tower, height: 5 };
    assert.equal(sightOcclusion(target, [low], dist, TOUR_AZIMUTH).occluders, 0);
  });

  it("never counts the stop's own tower", () => {
    const { dist, target } = towerScene();
    const own = { ring: [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]],
      minX: -10, minY: -10, maxX: 10, maxY: 10, height: 140 };
    assert.equal(sightOcclusion(target, [own], dist, TOUR_AZIMUTH).occluders, 0);
  });

  it("picks a clear azimuth around the tower", () => {
    const { dist, target, tower } = towerScene();
    const picked = pickStopAzimuth(target, [tower], dist);
    assert.equal(picked.occluders, 0);
    assert.notDeepEqual(picked.azimuth, TOUR_AZIMUTH);
  });

  it("keeps the default framing when nothing occludes", () => {
    const { dist, target } = towerScene();
    const picked = pickStopAzimuth(target, [], dist);
    assert.deepEqual(picked.azimuth, TOUR_AZIMUTH);
    assert.equal(picked.occluders, 0);
  });

  it("sums occlusion over several targets", () => {
    const { dist, target, tower } = towerScene();
    const clear = [500, 500]; // far from the tower
    const single = pickStopAzimuth(target, [tower], dist);
    const multi = pickStopAzimuth([target, clear], [tower], dist);
    assert.deepEqual(multi.azimuth, single.azimuth);
    assert.equal(multi.occluders, single.occluders);
  });

  it("flattens building footprints with the renderer height clamp", () => {
    const origin = { lon: 127.0, lat: 37.5 };
    const buildings = [{
      id: "b1", height_m: null,
      geometry: { type: "Polygon", coordinates: [[[127.0, 37.5], [127.001, 37.5], [127.001, 37.501], [127.0, 37.5]]] },
    }];
    const fps = footprintsOf(buildings, origin);
    assert.equal(fps.length, 1);
    assert.equal(fps[0].height, 6);
    assert.equal(fps[0].id, "b1");
    assert.ok(fps[0].maxX > fps[0].minX);
    assert.deepEqual(STOP_AZIMUTHS[0], TOUR_AZIMUTH);
  });

  it("names occluding buildings for the fade fallback", () => {
    const { dist, target, tower } = towerScene();
    const a = { ...tower, id: "tower-a" };
    const clear = [500, 500];
    assert.deepEqual(occludingIds(target, [a], dist, TOUR_AZIMUTH), ["tower-a"]);
    assert.deepEqual(occludingIds(target, [a], dist, [-TOUR_AZIMUTH[0], -TOUR_AZIMUTH[1]]), []);
    assert.deepEqual(occludingIds([target, clear], [{ ...a, id: "b" }, { ...a, id: "a" }], dist, TOUR_AZIMUTH),
      ["a", "b"]); // deduped + sorted
    // Counts agree with the scorer.
    const score = sightOcclusion(target, [a], dist, TOUR_AZIMUTH);
    assert.equal(score.occluders, occludingIds(target, [a], dist, TOUR_AZIMUTH).length);
  });

  it("names tall host towers containing the target", () => {
    const { target } = towerScene();
    const host = { id: "host", ring: [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]],
      minX: -10, minY: -10, maxX: 10, maxY: 10, height: 149 };
    const low = { ...host, id: "low", height: HOST_FADE_MIN_M - 1 };
    const away = { ...host, id: "away",
      ring: [[90, 90], [110, 90], [110, 110], [90, 110], [90, 90]],
      minX: 90, minY: 90, maxX: 110, maxY: 110 };
    // The host is not an occluder (own building) but is named for fading.
    assert.deepEqual(hostTowerIds(target, [host, low, away]), ["host"]);
  });

  it("covers all eight compass points plus half-winds", () => {
    const dirs = STOP_AZIMUTHS.map(([x, y]) => `${Math.sign(x)},${Math.sign(y)}`);
    for (const d of ["1,0", "0,1", "-1,0", "0,-1", "1,1", "-1,1", "-1,-1", "1,-1"]) {
      assert.ok(dirs.includes(d), `candidate ${d}`);
    }
  });
});
