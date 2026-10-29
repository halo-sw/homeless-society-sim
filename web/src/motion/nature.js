// Procedural nature math (pure, no three.js).
//
// JS mirror of the sway/drift shader formulas (the GLSL lives in
// scene/trees3d.js and render/textures.js; float precision differs,
// so this mirrors the formula for bounds/determinism tests, not for
// pixel equality).
//
// Tree sway: per-vertex offset grows with (localY / 7)² and never
// exceeds 2 % of tree height at any instance scale; calm at night
// (day factor 0), breezy by day (1). Water: a slow bounded normal
// wobble from world xz + t.

import { hashString, hashUnit } from "../palette.js";

export const SWAY_REF_HEIGHT_M = 7.0; // tallest crown top (local units)
export const SWAY_K = 0.12; // local metres at the crown, amp = 1
export const SWAY_Z_RATIO = 0.6; // z wobble is gentler than x
export const SWAY_FREQ_X = 1.1; // rad/s
export const SWAY_FREQ_Z = 0.9;
export const SWAY_MAX_M = 0.14; // ≤ 2 % of 7 m at any instance scale

// Per-instance phase from world xz (same convention family as
// treeRotation/treeTint: stable without storing it).
export function swayPhase(x, z) {
  return hashUnit(hashString(`${x.toFixed(1)},${z.toFixed(1)}`), 13)
    * Math.PI * 2;
}

// Day factor from the sky emissive gate (0 by day, 1 at night).
export function swayDayFactor(emissive) {
  const e = Number(emissive);
  if (!Number.isFinite(e)) return 1;
  return 1 - Math.min(1, Math.max(0, e));
}

// Local-space [dx, dz] at crown-relative height localY.
export function swayOffset(tSec, phase, localY, amp) {
  const tH = Math.min(1, Math.max(0, localY / SWAY_REF_HEIGHT_M));
  const k = amp * SWAY_K * tH * tH;
  return [
    Math.sin(tSec * SWAY_FREQ_X + phase) * k,
    Math.cos(tSec * SWAY_FREQ_Z + phase * 1.7) * k * SWAY_Z_RATIO,
  ];
}

export const WATER_WOBBLE = 0.06;

// Bounded normal wobble in [-1, 1] (shader scales by WATER_WOBBLE).
export function waterWobble(x, z, tSec) {
  const u = x * 0.08;
  const v = z * 0.08;
  return Math.sin(u * 3.1 + tSec * 0.35) * Math.sin(v * 2.7 - tSec * 0.28);
}
