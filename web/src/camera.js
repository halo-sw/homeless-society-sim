// Miniature tour camera framing (pure, no three.js).
//
// The tour reads as an architectural miniature: narrow field of view,
// 40-50° downward pitch, and the stop's complex plus its surroundings
// readable in frame — ~250-350 m across at stops, ~400-600 m during
// glides. main.js converts these metres into camera offsets; the maths
// stays here so it is unit-testable.
//
// Stage 3: in tower districts (잠실 46-storey slabs) the stop target can
// hide behind towers between the camera and the target. pickStopAzimuth
// keeps the 2b framing (same FOV/pitch/distance) but chooses, per stop,
// the camera azimuth with the least tower occlusion along the
// camera→target sight segment.

import { lonLatToXY } from "./frame.js";

export const TOUR_FOV_DEG = 24;
export const TOUR_PITCH_DEG = 45;
export const STOP_FRAME_M = 300;
export const GLIDE_FRAME_M = 500;
// Camera azimuth: offset direction (x east, z south-positive in the
// x-right/z-towards-viewer sense main.js uses), unnormalized.
export const TOUR_AZIMUTH = [0.45, 0.75];
// Per-stop candidates: the default first (stable tie-break prefers the
// 2b framing), then 7 compass directions.
export const STOP_AZIMUTHS = [
  TOUR_AZIMUTH,
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [1, 1], [-1, 1], [-1, -1],
];

// Visible frame width (m) at the target for a perspective camera.
export function frameWidthFor(distance, fovDeg, aspect) {
  return 2 * distance * Math.tan(((fovDeg * Math.PI) / 180) / 2) * aspect;
}

// Camera distance (m) needed to frame `width` metres across.
export function distanceForWidth(width, fovDeg, aspect) {
  return width / (2 * Math.tan(((fovDeg * Math.PI) / 180) / 2) * aspect);
}

// [dx, dy, dz] camera offset for a target, pitch looking down.
export function tourOffset(distance, pitchDeg = TOUR_PITCH_DEG,
                           azimuth = TOUR_AZIMUTH) {
  const len = Math.hypot(azimuth[0], azimuth[1]) || 1;
  const horiz = distance * Math.cos((pitchDeg * Math.PI) / 180);
  const vert = distance * Math.sin((pitchDeg * Math.PI) / 180);
  return [(horiz * azimuth[0]) / len, vert, (horiz * azimuth[1]) / len];
}

// --- tower occlusion (per-stop azimuth) ---

// Flattened occluder: exterior ring in local metres + prism height.
export function footprintsOf(buildings, origin) {
  const out = [];
  for (const b of buildings || []) {
    const g = b.geometry;
    if (!g) continue;
    const polys = g.type === "Polygon" ? [g.coordinates]
      : g.type === "MultiPolygon" ? g.coordinates : [];
    const height = Math.max(2.5, b.height_m || 6); // same clamp as buildings.js
    for (const poly of polys) {
      const ring = (poly[0] || []).map(([lon, lat]) => lonLatToXY(lon, lat, origin));
      if (ring.length < 4) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      out.push({ ring, minX, minY, maxX, maxY, height });
    }
  }
  return out;
}

function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Crossing parameters t in [0, 1] where segment p→q meets the ring edges.
function ringCrossings(p, q, ring) {
  const ts = [];
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[i + 1];
    const ex = bx - ax;
    const ey = by - ay;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue; // parallel
    const t = ((ax - p[0]) * ey - (ay - p[1]) * ex) / denom;
    const u = ((ax - p[0]) * dy - (ay - p[1]) * dx) / denom;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
      ts.push(Math.min(1, Math.max(0, t)));
    }
  }
  return ts;
}

// Inside-intervals of segment p→q within the ring, as [a, b] pairs.
function ringOverlaps(p, q, fp) {
  const ts = ringCrossings(p, q, fp.ring);
  ts.push(0, 1);
  ts.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const a = ts[i];
    const b = ts[i + 1];
    if (b - a < 1e-9) continue;
    const mx = p[0] + (q[0] - p[0]) * ((a + b) / 2);
    const my = p[1] + (q[1] - p[1]) * ((a + b) / 2);
    if (pointInRing(mx, my, fp.ring)) out.push([a, b]);
  }
  return out;
}

// Occlusion score of one sight line: the camera→target segment passes
// through a building prism when the sight height at the target-side end
// of an overlap interval is below the building top. Returns
// {occluders, overlapM} (deterministic).
export function sightOcclusion(targetXY, footprints, distance,
                               azimuth = TOUR_AZIMUTH,
                               pitchDeg = TOUR_PITCH_DEG,
                               targetH = 2) {
  const [ox, oy, oz] = tourOffset(distance, pitchDeg, azimuth);
  // World offset (x east, z = -north) back to local XY (x east, y north).
  const cam = [targetXY[0] + ox, targetXY[1] - oz];
  const segLen = Math.hypot(targetXY[0] - cam[0], targetXY[1] - cam[1]);
  if (segLen < 1e-9) return { occluders: 0, overlapM: 0 };
  const segMinX = Math.min(cam[0], targetXY[0]);
  const segMaxX = Math.max(cam[0], targetXY[0]);
  const segMinY = Math.min(cam[1], targetXY[1]);
  const segMaxY = Math.max(cam[1], targetXY[1]);
  let occluders = 0;
  let overlapM = 0;
  for (const fp of footprints) {
    if (fp.maxX < segMinX || fp.minX > segMaxX || fp.maxY < segMinY || fp.minY > segMaxY) continue;
    // The stop's own tower never counts as an occluder.
    if (pointInRing(targetXY[0], targetXY[1], fp.ring)) continue;
    for (const [a, b] of ringOverlaps(cam, targetXY, fp)) {
      const sightH = oy + (targetH - oy) * b;
      if (fp.height > sightH) {
        occluders++;
        overlapM += (b - a) * segLen;
        break; // one building counts once
      }
    }
  }
  return { occluders, overlapM };
}

// Pick the stop azimuth with the least occlusion (fewest occluders,
// then least occluded length). `targetXY` is one [x, y] pair or an array
// of them (scores summed: the stop anchor plus the settled path end).
// Candidates run default-first, so ties keep the 2b framing. Returns
// {azimuth, occluders, overlapM}.
export function pickStopAzimuth(targetXY, footprints, distance,
                                candidates = STOP_AZIMUTHS,
                                pitchDeg = TOUR_PITCH_DEG) {
  const targets = Array.isArray(targetXY[0]) ? targetXY : [targetXY];
  let best = null;
  for (const azimuth of candidates) {
    let occluders = 0;
    let overlapM = 0;
    for (const t of targets) {
      const score = sightOcclusion(t, footprints, distance, azimuth, pitchDeg);
      occluders += score.occluders;
      overlapM += score.overlapM;
    }
    if (best === null || occluders < best.occluders
        || (occluders === best.occluders && overlapM < best.overlapM - 1e-9)) {
      best = { azimuth, occluders, overlapM };
    }
  }
  return best;
}
