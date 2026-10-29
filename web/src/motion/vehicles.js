// Procedural vehicles (pure, no three.js).
//
// A fleet is built once per box from the road ribbons: each vehicle
// owns a deterministic phase slot on one road, and its position is
// `lane offset + arc length = (phase + speed·t) mod length` with a
// class speed and seeded phase. Bridges follow the ribbon heights;
// tunnel roads carry no vehicles (hidden in tunnels). No collisions;
// same-direction spacing comes from the even phase slots.
//
// stateAt purity: vehiclesAt(fleet, t) depends only on (seed, t) —
// scrubbing to 08:50 shows exactly the playing-to-08:50 scene, with
// no accumulated drift. Counts by hour come from the 가정값 density
// curve; these are 규칙으로 만든 모의 움직임, not observed traffic.

import { lonLatToXY } from "../frame.js";
import { hashUnit } from "../palette.js";
import { ORDER_STEP, ROAD_LIFT, baseClass, bridgeHeights, resamplePoints,
  roadOrder, specWidth } from "../scene/roads.js";
import { VEHICLE_CURVE, factorAt } from "./density.js";
import { streamFrom } from "./rng.js";

export const VEHICLE_SOURCE = "가정값";
export const MIN_SLOT_GAP_M = 25; // even phase slots keep ≥ this apart
export const MAX_VEHICLES_HIGH = 600;
export const MAX_VEHICLES_LOW = 300;
export const VEHICLE_CLEAR_M = 0.12; // ride height above the ribbon
export const VEHICLE_RESAMPLE_M = 2;

// Quality caps: full on high, half on low (medium between).
export function vehicleCapFor(quality) {
  if (quality === "low") return MAX_VEHICLES_LOW;
  if (quality === "medium") return 450;
  return MAX_VEHICLES_HIGH;
}

// Class table (가정값): cruise speed, full-density vehicles per km,
// lane offset from the centreline.
export const VEHICLE_CLASSES = {
  primary: { speedMps: 11.1, perKm: 14, laneM: 2.6 },
  secondary: { speedMps: 8.3, perKm: 10, laneM: 2.2 },
  tertiary: { speedMps: 8.3, perKm: 8, laneM: 1.8 },
  residential: { speedMps: 5.6, perKm: 6, laneM: 1.4 },
  service: { speedMps: 4.2, perKm: 4, laneM: 1.1 },
};

// Muted street mix (matches the parked-car palette idea).
const VEHICLE_COLORS = [0xf2f2f0, 0xd8d8d8, 0x2a2c30, 0x5a6e8c, 0x8c3a3a, 0x3d5a5a];
const VEHICLE_WEIGHTS = [0.34, 0.28, 0.2, 0.08, 0.05, 0.05];

function vehicleColor(rngValue) {
  let acc = 0;
  for (let i = 0; i < VEHICLE_WEIGHTS.length; i++) {
    acc += VEHICLE_WEIGHTS[i];
    if (rngValue < acc) return VEHICLE_COLORS[i];
  }
  return VEHICLE_COLORS[0];
}

// A segment is world-frame: { pts: [[x, z], ...], width, cls,
// bridge, tunnel }. Scene roads (p is [x, z] metres) convert
// directly; area roads convert from lon/lat.
export function sceneSegments(sceneRoads) {
  const out = [];
  for (const r of sceneRoads || []) {
    const cls = baseClass(r.k);
    if (!VEHICLE_CLASSES[cls]) continue;
    if (!Array.isArray(r.p) || r.p.length < 2) continue;
    out.push({ pts: r.p, width: r.w, cls,
      bridge: r.br === 1, tunnel: r.br === -1 });
  }
  return out;
}

export function areaSegments(areaRoads, origin) {
  const out = [];
  for (const r of areaRoads || []) {
    if (!r.geometry || r.geometry.type !== "LineString" || r.area) continue;
    const cls = baseClass(r.highway);
    if (!VEHICLE_CLASSES[cls]) continue;
    const pts = r.geometry.coordinates.map(([lon, lat]) => {
      const [x, y] = lonLatToXY(lon, lat, origin);
      return [x, -y];
    });
    if (pts.length < 2) continue;
    out.push({ pts, width: specWidth(r.highway, r.lanes), cls,
      bridge: r.bridge === "yes" || r.bridge === true || Number(r.layer) > 0,
      tunnel: r.tunnel === "yes" || r.tunnel === true });
  }
  return out;
}

// Build the fleet once per (box, seed). heightAt(x, z) is the box
// height function (pure). Global cap truncates trailing roads first
// (deterministic input order).
export function buildFleet({ segments, seed, heightAt = null, maxVehicles = MAX_VEHICLES_HIGH }) {
  const rng = streamFrom("vehicles", seed);
  const h = heightAt || (() => 0);
  const roads = [];
  const vehicles = [];
  (segments || []).forEach((seg, si) => {
    if (seg.tunnel) return; // hidden in tunnels: no spawn
    const cfg = VEHICLE_CLASSES[seg.cls];
    if (!cfg) return;
    const pts = resamplePoints(seg.pts, VEHICLE_RESAMPLE_M);
    if (pts.length < 2) return;
    const n = pts.length;
    let ys;
    if (seg.bridge) {
      ys = bridgeHeights(pts, h);
    } else {
      const lift = ROAD_LIFT + roadOrder(seg.cls) * ORDER_STEP
        + hashUnit(si, 11) * 0.004;
      ys = pts.map((p) => h(p[0], p[1]) + lift);
    }
    const sx = new Float64Array(n);
    const sy = new Float64Array(n);
    const sz = new Float64Array(n);
    const cum = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      sx[i] = pts[i][0];
      sy[i] = ys[i] + VEHICLE_CLEAR_M;
      sz[i] = pts[i][1];
      cum[i] = i === 0 ? 0 : cum[i - 1]
        + Math.hypot(sx[i] - sx[i - 1], sy[i] - sy[i - 1], sz[i] - sz[i - 1]);
    }
    const length = cum[n - 1];
    if (!(length >= 10)) return;
    const slots = Math.min(Math.round(cfg.perKm * length / 1000),
      Math.floor(length / MIN_SLOT_GAP_M));
    if (slots <= 0) return;
    const lane = Math.min(cfg.laneM, Math.max(0.5, seg.width / 2 - 1.0));
    // One speed per direction per road: same-direction slot spacing is
    // then exact at every t (no bunching); variation lives across
    // roads and directions.
    const vPlus = cfg.speedMps * (0.85 + rng() * 0.3);
    const vMinus = cfg.speedMps * (0.85 + rng() * 0.3);
    const road = { cls: seg.cls, slots, width: seg.width,
      start: vehicles.length, sx, sy, sz, cum, length, bridge: seg.bridge };
    roads.push(road);
    for (let j = 0; j < slots; j++) {
      const dir = j % 2 === 0 ? 1 : -1;
      vehicles.push({
        road: roads.length - 1, slot: j, dir,
        phase: (j * length) / slots,
        speed: dir > 0 ? vPlus : vMinus,
        lane,
        color: vehicleColor(rng()),
      });
    }
  });
  if (vehicles.length > maxVehicles) vehicles.length = maxVehicles;
  // Trailing-road truncation may cut a road's tail slots.
  for (const road of roads) {
    road.slots = 0;
  }
  for (const v of vehicles) roads[v.road].slots++;
  return { seed, roads, vehicles, maxActive: vehicles.length };
}

export function allocVehicleState(max) {
  return { data: new Float32Array(Math.max(max, 1) * 4),
    ids: new Uint16Array(Math.max(max, 1)) };
}

// Pure state at sim minute tMin (float, multi-day OK): per-road
// actives are the first `round(slots × factor)` slots, so vehicle
// identity is stable across hours. Writes [x, y, z, angle] rows and
// vehicle ids; returns the active count.
export function vehiclesAt(fleet, tMin, out, cap = Infinity) {
  const tSec = tMin * 60;
  const factor = factorAt(VEHICLE_CURVE, tMin);
  const { data, ids } = out;
  let w = 0;
  for (const road of fleet.roads) {
    const active = Math.min(road.slots, Math.round(road.slots * factor));
    const { sx, sy, sz, cum, length } = road;
    const last = cum.length - 1;
    for (let j = 0; j < active && w < cap; j++) {
      const v = fleet.vehicles[road.start + j];
      let s = v.dir > 0 ? v.phase + v.speed * tSec : v.phase - v.speed * tSec;
      s = ((s % length) + length) % length;
      let lo = 0;
      let hi = last;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= s) lo = mid;
        else hi = mid;
      }
      const span = cum[lo + 1] - cum[lo] || 1;
      const f = (s - cum[lo]) / span;
      const dx = sx[lo + 1] - sx[lo];
      const dy = sy[lo + 1] - sy[lo];
      const dz = sz[lo + 1] - sz[lo];
      let tx = dx;
      let tz = dz;
      if (v.dir < 0) {
        tx = -tx;
        tz = -tz;
      }
      const tl = Math.hypot(tx, tz) || 1;
      const rx = -tz / tl; // right of travel
      const rz = tx / tl;
      data[w * 4] = sx[lo] + dx * f + rx * v.lane;
      data[w * 4 + 1] = sy[lo] + dy * f;
      data[w * 4 + 2] = sz[lo] + dz * f + rz * v.lane;
      data[w * 4 + 3] = Math.atan2(-tz, tx);
      ids[w] = road.start + j;
      w++;
    }
    if (w >= cap) break;
  }
  return w;
}

// Headline counts (no positions): total + per class at tMin.
export function fleetCounts(fleet, minute, cap = Infinity) {
  const factor = factorAt(VEHICLE_CURVE, minute);
  const byClass = {};
  let active = 0;
  for (const road of fleet.roads) {
    const n = Math.min(road.slots, Math.round(road.slots * factor));
    if (n > 0) {
      active += n;
      byClass[road.cls] = (byClass[road.cls] || 0) + n;
    }
  }
  return { active: Math.min(active, cap), byClass, factor };
}
