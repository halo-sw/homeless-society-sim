// Night window slots for residential façades (pure, no three.js).
//
// planWindows(buildings, origin) computes deterministic window anchor
// slots on the two long façades of each residential building (grid over
// floors × bays along the dominant axis). litCounts(plan, occupancy,
// nightF) lights up to 2 windows per at-home resident — the count comes
// from the run (homeOccupancy), so only buildings with residents at
// home glow. main.js renders the lit slots as small warm rectangles
// (one InstancedMesh, rebuilt at 30-minute granularity).

import { lonLatToXY } from "./frame.js";
import { floorsOf } from "./buildings.js";

export const WINDOW_W = 1.4;
export const WINDOW_H = 1.8;
export const WINDOW_SPACING = 7; // metres between bays
export const WINDOW_INSET = 2.5; // metres clear of the façade ends
export const WINDOW_FACADE_OFF = 0.15; // metres outside the wall
export const WINDOW_MAX_PER_BUILDING = 60;
export const LIT_PER_RESIDENT = 2;
export const LIT_NIGHT_MIN = 0.05;

function exteriorRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates[0]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map((p) => p[0]);
  return [];
}

function longestEdgeAngle(ring) {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < ring.length - 1; i++) {
    const dx = ring[i + 1][0] - ring[i][0];
    const dy = ring[i + 1][1] - ring[i][1];
    const len = Math.hypot(dx, dy);
    if (len > bestLen) {
      bestLen = len;
      best = Math.atan2(dy, dx);
    }
  }
  return best;
}

// Slots for one building in world space ({x, y, z, rotY}); empty when
// the footprint is degenerate. Order is deterministic: +v façade rows
// bottom-up, bays sorted, then the −v façade.
export function slotsForBuilding(building, origin) {
  const rings = exteriorRings(building.geometry);
  if (rings.length === 0) return [];
  let ring = null;
  for (const r of rings) {
    if (Array.isArray(r) && r.length >= 4 && (!ring || r.length > ring.length)) ring = r;
  }
  if (!ring) return [];
  const xy = ring.map(([lon, lat]) => lonLatToXY(lon, lat, origin));
  const theta = longestEdgeAngle(xy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const vx = -uy;
  const vy = ux;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [x, y] of xy) {
    const u = x * ux + y * uy;
    const v = x * vx + y * vy;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  const halfU = (maxU - minU) / 2;
  const halfV = (maxV - minV) / 2;
  if (!(halfU > 0.5) || !(halfV > 0.5)) return [];
  const height = Math.max(2.5, building.height_m || 6);
  const floors = Math.max(1, floorsOf(building));
  const floorH = height / floors;
  const rows = [];
  for (let f = 0; f < floors; f++) {
    const y = (f + 0.55) * floorH;
    if (y > height - 0.8) break;
    rows.push(y);
  }
  if (rows.length === 0) return [];
  const cols = [];
  for (let u = cu - halfU + WINDOW_INSET; u <= cu + halfU - WINDOW_INSET + 1e-9; u += WINDOW_SPACING) {
    cols.push(u);
  }
  if (cols.length === 0) cols.push(cu);
  const slots = [];
  const push = (v, nx, ny, limit) => {
    // Local (u, v) -> world (x east, z = −north); the plane faces +z
    // rotated to the outward normal.
    let n = 0;
    for (const y of rows) {
      for (const u of cols) {
        if (n >= limit) return;
        const x = u * ux + v * vx;
        const yy = u * uy + v * vy;
        slots.push({ x, y, z: -yy, rotY: Math.atan2(nx, -ny) });
        n++;
      }
    }
  };
  // The cap splits evenly so both façades stay populated.
  const half = Math.ceil(WINDOW_MAX_PER_BUILDING / 2);
  push(cv + halfV + WINDOW_FACADE_OFF, vx, vy, half);
  push(cv - halfV - WINDOW_FACADE_OFF, -vx, -vy, WINDOW_MAX_PER_BUILDING - half);
  return slots;
}

export function planWindows(buildings, origin) {
  const out = [];
  for (const b of [...(buildings || [])].sort((a, c) => (a.id < c.id ? -1 : 1))) {
    if (!["apartment", "house", "mixed"].includes(b.residential)) continue;
    const slots = slotsForBuilding(b, origin);
    if (slots.length === 0) continue;
    out.push({ id: b.id, slots });
  }
  return out;
}

// Lit slot count per building id (first k slots). Empty below the
// night threshold or without at-home residents.
export function litCounts(plan, occupancy, nightF) {
  const out = new Map();
  if (!(nightF >= LIT_NIGHT_MIN)) return out;
  for (const b of plan) {
    const occ = occupancy.get(b.id);
    const home = occ ? occ.home : 0;
    if (home <= 0) continue;
    out.set(b.id, Math.min(b.slots.length, home * LIT_PER_RESIDENT));
  }
  return out;
}
