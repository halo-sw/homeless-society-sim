// Shadow-frustum fit maths (pure, no three.js).
//
// The torn-shadow fix (stage 7, Part C) rests on three pure rules:
// the ortho half-extent follows the framed area (never wider than the
// caller's span, never below the readability floor); near/far hug the
// scene depth along the light instead of spanning 1..2200+ m; and the
// shadow target snaps to the shadow-map texel grid in light space so
// the map stops swimming. normalBias scales with the texel size
// (metres), replacing the fixed 1.5 m that lifted shadows off their
// buildings (peter-panning). rig.js applies what these return.

export const SHADOW_BIAS = -0.0002;
export const SHADOW_SPAN_MAX_M = 240;
export const SHADOW_SPAN_MIN_M = 90;
export const SHADOW_FRAME_FACTOR = 0.6;
export const SHADOW_DEPTH_SLACK = 1.2;
export const SHADOW_NORMAL_BIAS_MIN = 0.05;
export const SHADOW_NORMAL_BIAS_MAX = 0.5;

// Ortho half-extent from the framed width: tight when zoomed in, the
// caller's span at overviews.
export function shadowHalfExtent({ framedWidthM, spanMaxM = SHADOW_SPAN_MAX_M,
  spanMinM = SHADOW_SPAN_MIN_M, factor = SHADOW_FRAME_FACTOR } = {}) {
  const w = Number(framedWidthM);
  if (!Number.isFinite(w) || w <= 0) return spanMaxM;
  return Math.min(spanMaxM, Math.max(spanMinM, w * factor));
}

// Near/far planes hugging the scene: the light sits distM from the
// target, and content reaches halfM sideways plus maxHeightM up.
export function shadowFit({ halfM, distM, maxHeightM = 250, mapSize = 2048 } = {}) {
  const half = Math.max(1, Number(halfM) || 1);
  const dist = Math.max(1, Number(distM) || 1);
  const height = Math.max(0, Number(maxHeightM) || 0);
  const map = Math.max(1, Math.round(Number(mapSize) || 2048));
  const halfDepth = half * SHADOW_DEPTH_SLACK + height;
  const near = Math.max(1, dist - halfDepth);
  const far = dist + halfDepth;
  const texelM = (2 * half) / map;
  const normalBias = Math.min(SHADOW_NORMAL_BIAS_MAX,
    Math.max(SHADOW_NORMAL_BIAS_MIN, texelM * 1.5));
  return { half, near, far, texelM, normalBias, bias: SHADOW_BIAS };
}

// Snap the shadow target to the texel grid in light space: project
// onto the light's right/up axes, round to whole texels, reproject.
// The rig moves the sun by the same delta, so the ortho frustum shifts
// by whole texels perpendicular to the light and the map stops
// swimming. y rides along (sub-texel, ≈ 0) and must be carried back in.
export function snapTargetToTexel({ x, y = 0, z, sunDir, texelM }) {
  const t = Number(texelM);
  if (!Number.isFinite(t) || t <= 0) return { x, y, z };
  // Orthonormal light basis (the sun direction is normalised first so
  // the v axis is unit-length and the snap grid is square).
  const [ix, iy, iz] = sunDir;
  const il = Math.hypot(ix, iy, iz) || 1;
  const sx = ix / il;
  const sy = iy / il;
  const sz = iz / il;
  let rx = sz;
  let ry = 0;
  let rz = -sx;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = sy * rz - sz * ry;
  const uy = sz * rx - sx * rz;
  const uz = sx * ry - sy * rx;
  const px = x;
  const py = y;
  const pz = z;
  const u = px * rx + py * ry + pz * rz;
  const v = px * ux + py * uy + pz * uz;
  const du = Math.round(u / t) * t - u;
  const dv = Math.round(v / t) * t - v;
  return { x: px + rx * du + ux * dv, y: py + ry * du + uy * dv, z: pz + rz * du + uz * dv };
}
