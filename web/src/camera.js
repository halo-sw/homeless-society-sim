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
// Stage 14e: painted (near-isometric) vs photo camera style.
export const PAINTED_FOV_DEG = 10;
export const PAINTED_PITCH_DEG = 32; // above the horizon (≈0.56 rad)
export const PAINTED_MIN_FRAME_M = 150;
export function cameraStyle(style) {
  if (style === "photo") {
    return {
      fovDeg: TOUR_FOV_DEG,
      pitchDeg: TOUR_PITCH_DEG,
      cruisePitchDeg: JOURNEY_CRUISE_PITCH_DEG,
      azimuth: TOUR_AZIMUTH,
      rotate: true,
    };
  }
  return {
    fovDeg: PAINTED_FOV_DEG,
    pitchDeg: PAINTED_PITCH_DEG,
    cruisePitchDeg: PAINTED_PITCH_DEG,
    azimuth: TOUR_AZIMUTH,
    rotate: false,
  };
}

// ?style=painted (default) vs ?style=photo (today's look, unchanged).
export function resolveStyle(search) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(typeof search === "string" ? search : "");
  return params.get("style") === "photo" ? "photo" : "painted";
}

// OrbitControls zoom clamp for the painted style: the framed width stays
// between 150 m and the box span, so the user can never zoom past the
// ground disc into the void. Returns {min, max} camera distances.
export function zoomClampDistances(spanM, fovDeg, aspect) {
  const span = Math.max(PAINTED_MIN_FRAME_M, Number(spanM) || PAINTED_MIN_FRAME_M);
  return {
    min: distanceForWidth(PAINTED_MIN_FRAME_M, fovDeg, aspect),
    max: distanceForWidth(span, fovDeg, aspect),
  };
}
// Per-stop candidates: the default first (stable tie-break prefers the
// 2b framing), then compass directions plus half-winds.
export const STOP_AZIMUTHS = [
  TOUR_AZIMUTH,
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [1, 1], [-1, 1], [-1, -1], [1, -1],
  [1, 0.5], [0.5, 1], [-0.5, 1], [-1, 0.5],
  [-1, -0.5], [-0.5, -1], [0.5, -1], [1, -0.5],
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

// --- journey cruise (oblique, train-following, stage 11b) ---
//
// The whole-path overview read as thin specks from near top-down. The
// cruise instead follows the train with ~3–4 km of corridor in frame at
// an oblique pitch (55° from vertical), so buildings read as blocks.
// Pure: train is [worldX, worldZ]; returns {pos, look, dist} in metres.
export const JOURNEY_CRUISE_PITCH_DEG = 35; // 55° from vertical
export const JOURNEY_CRUISE_FRAME_M = 3500;

export function journeyCruisePose(train, aspect,
    { frameM = JOURNEY_CRUISE_FRAME_M, pitchDeg = JOURNEY_CRUISE_PITCH_DEG,
      fovDeg = TOUR_FOV_DEG, azimuth = TOUR_AZIMUTH } = {}) {
  const [tx, tz] = train || [0, 0];
  const dist = distanceForWidth(frameM, fovDeg, aspect);
  const [ox, oy, oz] = tourOffset(dist, pitchDeg, azimuth);
  return { pos: [tx + ox, oy, tz + oz], look: [tx, 0, tz], dist };
}

// --- architectural lens (two-point perspective, stage 5b) ---
//
// A level camera keeps vertical lines vertical; a wide symmetric
// frustum plus a setViewOffset crop recentres the ground stop inside
// it (the shift-lens trick). archLensPose returns the camera offset
// (horizontal metres along the azimuth + height above the target) and
// the crop fractions for a renderer of any size:
//
//   const db = renderer.getDrawingBufferSize(new THREE.Vector2());
//   const fullH = db.y / viewH;
//   camera.fov = ARCH_FOV_DEG;
//   camera.setViewOffset(db.x, fullH, 0, yFrac * fullH, db.x, db.y);
//   camera.position.copy(camPos); // level: look at camera height
//   camera.lookAt(camPos.x + dirX, camPos.y, camPos.z + dirZ);
//
// Clear with camera.clearViewOffset() + fov restore when the user orbits.
export const ARCH_FOV_DEG = 100; // full wide frustum (vertical)
export const ARCH_VIEW_DEG = 24; // cropped view ≈ the 2b framing angle
export const ARCH_DEPRESSION_DEG = 35; // stop below the level axis

export function archLensPose(frameWidthM = STOP_FRAME_M, aspect = 1.49,
                             azimuth = TOUR_AZIMUTH) {
  const beta = ((ARCH_FOV_DEG / 2) * Math.PI) / 180;
  const gamma = ((ARCH_VIEW_DEG / 2) * Math.PI) / 180;
  const delta = (ARCH_DEPRESSION_DEG * Math.PI) / 180;
  const vertSpan = frameWidthM / aspect;
  const dist = vertSpan / 2 / Math.tan(gamma); // slant distance
  const horiz = dist * Math.cos(delta);
  const vert = dist * Math.sin(delta);
  const len = Math.hypot(azimuth[0], azimuth[1]) || 1;
  // Crop fractions (tangent-linear NDC): the view spans ±tanγ around
  // the −tanδ centre inside the ±tanβ frustum.
  const viewH = Math.tan(gamma) / Math.tan(beta);
  const yFrac = (1 + (Math.tan(delta) - Math.tan(gamma)) / Math.tan(beta)) / 2;
  return {
    horiz, vert, dist,
    dirX: azimuth[0] / len, dirZ: azimuth[1] / len,
    viewH, yFrac,
  };
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
    // Actual building heights with the renderer's clamp (buildings.js).
    const height = Math.max(2.5, b.height_m || 6);
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
      out.push({ id: b.id ?? null, ring, minX, minY, maxX, maxY, height });
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

// Camera ground position (local XY) and height for a target, using the
// same offset main.js applies to the real camera.
function sightParams(targetXY, distance, azimuth, pitchDeg) {
  const [ox, oy, oz] = tourOffset(distance, pitchDeg, azimuth);
  // World offset (x east, z = -north) back to local XY (x east, y north).
  return { cam: [targetXY[0] + ox, targetXY[1] - oz], camH: oy };
}

// Occluded metres of one sight line inside one footprint prism: the
// camera→target segment passes through the prism when the sight height
// at the target-side end of an overlap interval is below the building
// top. 0 when clear (shared by the scorer and the fade fallback).
function footprintHit(fp, cam, targetXY, camH, targetH) {
  const segLen = Math.hypot(targetXY[0] - cam[0], targetXY[1] - cam[1]);
  if (segLen < 1e-9) return 0;
  if (fp.maxX < Math.min(cam[0], targetXY[0]) || fp.minX > Math.max(cam[0], targetXY[0])
      || fp.maxY < Math.min(cam[1], targetXY[1]) || fp.minY > Math.max(cam[1], targetXY[1])) {
    return 0;
  }
  // The stop's own tower never counts as an occluder.
  if (pointInRing(targetXY[0], targetXY[1], fp.ring)) return 0;
  for (const [a, b] of ringOverlaps(cam, targetXY, fp)) {
    const sightH = camH + (targetH - camH) * b;
    if (fp.height > sightH) return (b - a) * segLen; // one building counts once
  }
  return 0;
}

// Occlusion score of one sight line. Returns {occluders, overlapM}
// (deterministic).
export function sightOcclusion(targetXY, footprints, distance,
                               azimuth = TOUR_AZIMUTH,
                               pitchDeg = TOUR_PITCH_DEG,
                               targetH = 2) {
  const { cam, camH } = sightParams(targetXY, distance, azimuth, pitchDeg);
  let occluders = 0;
  let overlapM = 0;
  for (const fp of footprints) {
    const hit = footprintHit(fp, cam, targetXY, camH, targetH);
    if (hit > 0) {
      occluders++;
      overlapM += hit;
    }
  }
  return { occluders, overlapM };
}

// Building ids occluding the sight line(s) — the fade fallback dims
// these when no azimuth is clear. `targetXY` is one [x, y] pair or an
// array; ids deduplicate and sort (deterministic).
export function occludingIds(targetXY, footprints, distance,
                             azimuth = TOUR_AZIMUTH,
                             pitchDeg = TOUR_PITCH_DEG,
                             targetH = 2) {
  const targets = Array.isArray(targetXY[0]) ? targetXY : [targetXY];
  const ids = new Set();
  for (const t of targets) {
    const { cam, camH } = sightParams(t, distance, azimuth, pitchDeg);
    for (const fp of footprints) {
      if (fp.id !== null && fp.id !== undefined
          && footprintHit(fp, cam, t, camH, targetH) > 0) {
        ids.add(fp.id);
      }
    }
  }
  return [...ids].sort();
}

// Tall host buildings containing the target: a POI stop embedded in a
// tower (e.g. 잠실 stop 2 inside a 149 m slab) scores "clear" — the
// host is excluded as the stop's own building — yet the host face fills
// the frame and hides the street-level subject. The fade fallback dims
// these hosts (POI stops only; a complex stop's towers are the subject).
export const HOST_FADE_MIN_M = 40;

export function hostTowerIds(targetXY, footprints) {
  const ids = new Set();
  for (const fp of footprints) {
    if (fp.id === null || fp.id === undefined || fp.height < HOST_FADE_MIN_M) continue;
    if (pointInRing(targetXY[0], targetXY[1], fp.ring)) ids.add(fp.id);
  }
  return [...ids].sort();
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
