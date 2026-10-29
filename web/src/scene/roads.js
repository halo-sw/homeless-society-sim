// Road + waterway ribbons (pure; main.js wraps them in meshes).
//
// buildRoadMeshes(roads, heightAt, look) resamples every centreline to 2 m
// (spec §5.2), drapes it on the terrain (height + 0.05 m + class order ×
// 0.01 m + a deterministic micro lift), and merges by material class:
// road / foot / cycle / rail — at most 4 draw calls. Bridges lerp their
// end heights and lift clear; tunnels are not drawn. polygonOffset is set
// on the materials in main.js; the order offsets do the real separation.
//
// buildWaterRibbons(waters, heightAt) drapes the same way at −0.3 m.

import { CROSSWALK, LANE_WHITE, LANE_YELLOW, hashUnit } from "../palette.js";
import { toTypedMesh } from "./load.js";

export const RESAMPLE_M = 2;
export const ROAD_LIFT = 0.05;
export const ORDER_STEP = 0.01;
export const BRIDGE_LIFT = 1.0;
export const BRIDGE_CLEAR = 0.4;
export const WATER_DROP = 0.3;
// Painted road paint (stage 14e): dashes 2 m on / 4 m off, yellow double
// centre on arterials, zebra bars at footway crossings. One merged mesh,
// hidden past a 2 km framed width.
export const MARKING_LIFT = 0.02;
export const LANE_DASH_M = 2;
export const LANE_PERIOD_M = 6;
export const LANE_PAINT_W = 0.15;
export const CENTRE_DOUBLE_OFF = 0.3;
export const ZEBRA_BAR_W = 0.5;
export const ZEBRA_PITCH = 1.0;
export const ZEBRA_BARS = 3;
export const LANE_WIDTH_M = 3.25;
export const MARKINGS_HIDE_M = 2000;
export const MAX_MARK_CROSSINGS = 400;

const ORDERS = {
  motorway: 1, trunk: 1, railway: 1, primary: 2, secondary: 3,
  tertiary: 4, residential: 5, unclassified: 5, living_street: 5,
  road: 5, track: 6, service: 6, pedestrian: 6,
  footway: 7, path: 7, cycleway: 7, steps: 7, bridleway: 7,
};

const WIDTH_DEFAULTS = {
  motorway: 20, trunk: 20, primary: 16, secondary: 12, tertiary: 9,
  residential: 6, unclassified: 6, service: 4, footway: 2, path: 2,
  cycleway: 2, steps: 2, living_street: 5, pedestrian: 5, track: 3,
  road: 5, bridleway: 2.5, railway: 4,
};

export function baseClass(k) {
  return (k || "").replace(/_link$/, "");
}

export function roadOrder(k) {
  return ORDERS[baseClass(k)] ?? 5;
}

// Spec §4.2 width from class + lanes (the width tag lives in scene.json
// already; ground.js paint uses this when the scene is on).
export function specWidth(k, lanes = null) {
  if (Number.isFinite(lanes) && lanes > 0) {
    return Math.round(lanes * 3.25 * 10) / 10;
  }
  return WIDTH_DEFAULTS[baseClass(k)] ?? 4;
}

export function roadMaterialClass(k) {
  const b = baseClass(k);
  if (b === "cycleway") return "cycle";
  if (b === "railway") return "rail";
  if (b === "footway" || b === "path" || b === "steps" ||
      b === "pedestrian" || b === "bridleway") return "foot";
  return "road";
}

// Painted ribbon tone: arterials keep the dark asphalt, minor streets go
// one step lighter (same merged mesh, per-ribbon vertex colours).
const MAJOR_ROAD_CLASSES = new Set(["motorway", "trunk", "primary", "secondary"]);

export function roadTone(k) {
  return MAJOR_ROAD_CLASSES.has(baseClass(k)) ? "major" : "minor";
}

export function resamplePoints(points, step) {
  if (points.length < 2 || !(step > 0)) return points.map((p) => [...p]);
  const cum = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    cum.push(cum[cum.length - 1] + Math.hypot(bx - ax, bz - az));
  }
  const total = cum[cum.length - 1];
  if (total <= 0) return [[...points[0]]];
  const n = Math.max(1, Math.round(total / step));
  const out = [];
  let seg = 0;
  for (let i = 0; i <= n; i++) {
    const s = Math.min(total, (i * total) / n);
    while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
    const span = cum[seg + 1] - cum[seg] || 1;
    const t = (s - cum[seg]) / span;
    const [ax, az] = points[seg];
    const [bx, bz] = points[seg + 1];
    out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
  }
  return out;
}

// 17b: vertex colours are consumed raw (linear working space), so palette
// sRGB hexes must be linearized here — pushing sRGB 0..1 straight lifted
// the painted asphalt (#5b5d60 → ~#a2a4a7 on screen) into the beige ground.
export function srgbToLinear(u8) {
  const c = Math.min(1, Math.max(0, u8 / 255));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToLinearRgb(hex) {
  return [srgbToLinear((hex >> 16) & 255),
    srgbToLinear((hex >> 8) & 255), srgbToLinear(hex & 255)];
}

function hexRgb(hex) {
  return hexToLinearRgb(hex);
}

function makeSink() {
  return { positions: [], colors: [], uvs: [], indices: [] };
}

// Plan-view perpendiculars per station (shared by ribbons and paint).
function stationPerps(stations) {
  const n = stations.length;
  const perp = [];
  for (let i = 0; i < n; i++) {
    const p0 = stations[Math.max(0, i - 1)];
    const p1 = stations[Math.min(n - 1, i + 1)];
    const dx = p1[0] - p0[0];
    const dz = p1[1] - p0[1];
    const len = Math.hypot(dx, dz) || 1;
    perp.push([-dz / len, dx / len]);
  }
  return perp;
}

// Draped ribbon stations for one road (x, z-plan, y-up world): bridges
// lerp their ends and lift clear, the rest ride the terrain. Shared by
// buildRoadMeshes and the painted paint layer so paint hugs the ribbon.
export function ribbonStations(road, index, heightAt) {
  const pts = resamplePoints(road.p, RESAMPLE_M);
  if (pts.length < 2) return null;
  if (road.br === 1) {
    const ys = bridgeHeights(pts, heightAt);
    return pts.map((p, i) => [p[0], p[1], ys[i]]);
  }
  const lift = ROAD_LIFT + roadOrder(road.k) * ORDER_STEP
    + hashUnit(index, 11) * 0.004;
  return pts.map((p) => [p[0], p[1], heightAt(p[0], p[1]) + lift]);
}

// One ribbon into a sink: stations carry (x, z, y); triangles face up.
function pushRibbon(sink, stations, halfWidth, rgb) {
  const n = stations.length;
  if (n < 2) return 0;
  const perp = stationPerps(stations);
  const base = sink.positions.length / 3;
  let arc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      arc += Math.hypot(stations[i][0] - stations[i - 1][0],
                        stations[i][1] - stations[i - 1][1]);
    }
    const [x, z, y] = stations[i];
    const [px, pz] = perp[i];
    sink.positions.push(x + px * halfWidth, y, z + pz * halfWidth,
                        x - px * halfWidth, y, z - pz * halfWidth);
    sink.colors.push(rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]);
    sink.uvs.push(0, arc, 1, arc);
  }
  for (let i = 0; i < n - 1; i++) {
    const l0 = base + i * 2;
    const r0 = l0 + 1;
    const l1 = l0 + 2;
    const r1 = l0 + 3;
    sink.indices.push(l0, l1, r0, r0, l1, r1);
  }
  return (n - 1) * 2;
}

export function bridgeHeights(points, heightAt) {
  const h0 = heightAt(points[0][0], points[0][1]);
  const h1 = heightAt(points[points.length - 1][0],
                      points[points.length - 1][1]);
  return points.map((p, i) => {
    const t = points.length === 1 ? 0 : i / (points.length - 1);
    const lerp = h0 + (h1 - h0) * t + BRIDGE_LIFT;
    return Math.max(lerp, heightAt(p[0], p[1]) + BRIDGE_CLEAR);
  });
}

export function buildRoadMeshes(roads, heightAt, look) {
  const sinks = { road: makeSink(), foot: makeSink(), cycle: makeSink(),
                  rail: makeSink() };
  const rgb = {
    road: hexRgb(look.sceneRoad), roadMinor: hexRgb(look.sceneRoadMinor ?? look.sceneRoad),
    foot: hexRgb(look.sceneFoot),
    cycle: hexRgb(look.sceneCycle), rail: hexRgb(look.sceneRail),
  };
  const stats = { roads: 0, skippedTunnel: 0, bridges: 0, byClass: {},
                  triangles: 0 };
  (roads || []).forEach((road, index) => {
    if (road.br === -1) {
      stats.skippedTunnel++;
      return;
    }
    const stations = ribbonStations(road, index, heightAt);
    if (!stations) return;
    if (road.br === 1) stats.bridges++;
    const cls = roadMaterialClass(road.k);
    const tone = cls === "road" && roadTone(road.k) === "minor" ? rgb.roadMinor : rgb[cls];
    stats.triangles += pushRibbon(sinks[cls], stations, road.w / 2, tone);
    stats.roads++;
    stats.byClass[cls] = (stats.byClass[cls] || 0) + 1;
  });
  const out = {};
  for (const [cls, sink] of Object.entries(sinks)) {
    out[cls] = toTypedMesh({ ...sink, triangles: sink.indices.length / 3 });
  }
  return { meshes: out, stats };
}

// Lane count from the ribbon width (3.25 m lanes, the specWidth
// convention); an explicit lanes tag wins when present.
export function lanesOf(road) {
  if (Number.isFinite(road.lanes) && road.lanes > 0) {
    return Math.max(1, Math.round(road.lanes));
  }
  return Math.max(1, Math.round((Number(road.w) || 0) / LANE_WIDTH_M));
}

const YELLOW_CENTRE = new Set(["primary", "secondary"]);

export function hasYellowCentre(k) {
  return YELLOW_CENTRE.has(baseClass(k));
}

// Arc-length frames over draped stations: cumulative metres + perps.
function arcFrames(stations) {
  const perps = stationPerps(stations);
  const cum = [0];
  for (let i = 1; i < stations.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(stations[i][0] - stations[i - 1][0],
      stations[i][1] - stations[i - 1][1]));
  }
  return { cum, perps, total: cum[cum.length - 1] };
}

// Interpolated {x, z, y, px, pz} at arc metres along the stations.
function frameAt(stations, frames, arc) {
  const { cum, perps } = frames;
  const s = Math.min(Math.max(arc, 0), frames.total);
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < s) i++;
  const span = cum[i + 1] - cum[i] || 1;
  const t = (s - cum[i]) / span;
  const a = stations[i];
  const b = stations[i + 1];
  const pa = perps[i];
  const pb = perps[i + 1];
  return {
    x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t,
    y: a[2] + (b[2] - a[2]) * t,
    px: pa[0] + (pb[0] - pa[0]) * t, pz: pa[1] + (pb[1] - pa[1]) * t,
  };
}

// One paint quad between two frames at a lateral offset: corners
// (-w,s0) (+w,s0) (+w,s1) (-w,s1), wound to face up like ribbons.
function pushMarkQuad(sink, f0, f1, off, halfW, lift, rgb, arc0, arc1) {
  const c = (f, o) => [f.x + f.px * o, f.y + lift, f.z + f.pz * o];
  const corners = [c(f0, off - halfW), c(f0, off + halfW),
                   c(f1, off + halfW), c(f1, off - halfW)];
  const base = sink.positions.length / 3;
  for (const p of corners) sink.positions.push(p[0], p[1], p[2]);
  for (let k = 0; k < 4; k++) sink.colors.push(rgb[0], rgb[1], rgb[2]);
  sink.uvs.push(0, arc0, 1, arc0, 1, arc1, 0, arc1);
  sink.indices.push(base + 1, base + 2, base, base, base + 2, base + 3);
  return 2;
}

// Proper (non-collinear) segment crossing in plan view, or null.
function segCrossing(p1, p2, p3, p4) {
  const dx1 = p2[0] - p1[0];
  const dz1 = p2[1] - p1[1];
  const dx2 = p4[0] - p3[0];
  const dz2 = p4[1] - p3[1];
  const denom = dx1 * dz2 - dz1 * dx2;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((p3[0] - p1[0]) * dz2 - (p3[1] - p1[1]) * dx2) / denom;
  const u = ((p3[0] - p1[0]) * dz1 - (p3[1] - p1[1]) * dx1) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1[0] + dx1 * t, z: p1[1] + dz1 * t };
}

// At-grade footway × multi-lane-road crossings (plan view): {x, z, fx,
// fz, rx, rz, width, road} with foot/road unit directions, road width
// and the road's index. Deduped to one per ~6 m cell, capped.
export function findRoadCrossings(roads, maxCrossings = MAX_MARK_CROSSINGS) {
  const list = roads || [];
  const feet = [];
  const drives = [];
  list.forEach((road, index) => {
    if (!road.p || road.p.length < 2 || road.br !== 0) return;
    const cls = roadMaterialClass(road.k);
    if (cls === "foot") feet.push({ road, index });
    else if (cls === "road" && lanesOf(road) >= 2) drives.push({ road, index });
  });
  const out = [];
  const seen = new Set();
  for (const f of feet) {
    for (let i = 0; i < f.road.p.length - 1 && out.length < maxCrossings; i++) {
      const p1 = f.road.p[i];
      const p2 = f.road.p[i + 1];
      const fl = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
      for (const d of drives) {
        for (let j = 0; j < d.road.p.length - 1; j++) {
          const hit = segCrossing(p1, p2, d.road.p[j], d.road.p[j + 1]);
          if (!hit) continue;
          const key = `${Math.round(hit.x / 6)},${Math.round(hit.z / 6)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const q1 = d.road.p[j];
          const q2 = d.road.p[j + 1];
          const rl = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]) || 1;
          out.push({ x: hit.x, z: hit.z,
            fx: (p2[0] - p1[0]) / fl, fz: (p2[1] - p1[1]) / fl,
            rx: (q2[0] - q1[0]) / rl, rz: (q2[1] - q1[1]) / rl,
            width: d.road.w, road: d.index });
          if (out.length >= maxCrossings) return out;
        }
      }
    }
  }
  return out;
}

// Painted road paint (14e, painted style only): dashed white lane
// dividers on roads with lanes ≥ 2, a solid yellow double centre line on
// primary/secondary, and zebra bars where a footway crosses a multi-lane
// road. Procedural from the ribbon stations — no new data. Returns
// {mesh, stats} with mesh a toTypedMesh ({triangles} > 0 when painted).
export function buildRoadMarkings(roads, heightAt) {
  const sink = makeSink();
  const white = hexRgb(LANE_WHITE);
  const yellow = hexRgb(LANE_YELLOW);
  const zebra = hexRgb(CROSSWALK);
  const stats = { roads: 0, dashes: 0, yellowRoads: 0, crossings: 0,
    triangles: 0 };
  const list = roads || [];
  const draped = new Map(); // road index -> {stations, frames, lanes}
  list.forEach((road, index) => {
    if (road.br === -1 || roadMaterialClass(road.k) !== "road") return;
    const stations = ribbonStations(road, index, heightAt);
    if (!stations) return;
    const frames = arcFrames(stations);
    const lanes = lanesOf(road);
    draped.set(index, { stations, frames, lanes, w: road.w });
    stats.roads++;
    if (lanes < 2) return;
    // White dashed dividers (2 m dash, 4 m gap, 0.15 m wide).
    const yellowCentre = hasYellowCentre(road.k);
    for (let i = 1; i < lanes; i++) {
      const off = -road.w / 2 + (i * road.w) / lanes;
      if (yellowCentre && Math.abs(off) < CENTRE_DOUBLE_OFF + LANE_PAINT_W) continue;
      for (let s = 0; s + 0.5 < frames.total; s += LANE_PERIOD_M) {
        const e = Math.min(s + LANE_DASH_M, frames.total);
        if (e - s < 0.3) continue;
        stats.triangles += pushMarkQuad(sink, frameAt(stations, frames, s),
          frameAt(stations, frames, e), off, LANE_PAINT_W / 2,
          MARKING_LIFT, white, s, e);
        stats.dashes++;
      }
    }
    // Solid yellow double centre line on primary/secondary.
    if (yellowCentre) {
      stats.yellowRoads++;
      for (const side of [-CENTRE_DOUBLE_OFF, CENTRE_DOUBLE_OFF]) {
        for (let k = 0; k < stations.length - 1; k++) {
          const a = stations[k];
          const b = stations[k + 1];
          const pa = frames.perps[k];
          const pb = frames.perps[k + 1];
          const f0 = { x: a[0], z: a[1], y: a[2], px: pa[0], pz: pa[1] };
          const f1 = { x: b[0], z: b[1], y: b[2], px: pb[0], pz: pb[1] };
          stats.triangles += pushMarkQuad(sink, f0, f1, side,
            LANE_PAINT_W / 2, MARKING_LIFT, yellow,
            frames.cum[k], frames.cum[k + 1]);
        }
      }
    }
  });
  // Zebra bars across the road at footway crossings (0.5 m bars, 0.5 m
  // apart, spanning the road width), draped on the road ribbon.
  for (const c of findRoadCrossings(list)) {
    const d = draped.get(c.road);
    if (!d) continue;
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < d.stations.length; k++) {
      const dd = Math.hypot(d.stations[k][0] - c.x, d.stations[k][1] - c.z);
      if (dd < bestD) {
        bestD = dd;
        best = k;
      }
    }
    const y = d.stations[best][2] + MARKING_LIFT;
    // Bars span the road width (lateral); consecutive bars step along
    // the road direction (the foot direction coincides with lateral at
    // right-angle crossings, so it cannot space the bars).
    const lx = -c.rz;
    const lz = c.rx;
    const half = c.width / 2;
    for (let b = 0; b < ZEBRA_BARS; b++) {
      const along = (b - (ZEBRA_BARS - 1) / 2) * ZEBRA_PITCH;
      const cx = c.x + c.rx * along;
      const cz = c.z + c.rz * along;
      const hw = ZEBRA_BAR_W / 2;
      const base = sink.positions.length / 3;
      const corners = [
        [cx - lx * half - c.rx * hw, y, cz - lz * half - c.rz * hw],
        [cx + lx * half - c.rx * hw, y, cz + lz * half - c.rz * hw],
        [cx + lx * half + c.rx * hw, y, cz + lz * half + c.rz * hw],
        [cx - lx * half + c.rx * hw, y, cz - lz * half + c.rz * hw],
      ];
      for (const p of corners) sink.positions.push(p[0], p[1], p[2]);
      for (let k = 0; k < 4; k++) sink.colors.push(zebra[0], zebra[1], zebra[2]);
      sink.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      sink.indices.push(base + 1, base + 2, base, base, base + 2, base + 3);
      stats.triangles += 2;
    }
    stats.crossings++;
  }
  const mesh = toTypedMesh({ positions: sink.positions, colors: sink.colors,
    uvs: sink.uvs, indices: sink.indices,
    triangles: sink.indices.length / 3 });
  return { mesh, stats };
}

export function buildWaterRibbons(waters, heightAt, look) {
  const sink = makeSink();
  const rgb = hexRgb(look.terrainWater);
  const stats = { waters: 0, triangles: 0 };
  (waters || []).forEach((w) => {
    const pts = resamplePoints(w.p, RESAMPLE_M);
    if (pts.length < 2) return;
    const stations = pts.map((p) => [p[0], p[1], heightAt(p[0], p[1]) - WATER_DROP]);
    stats.triangles += pushRibbon(sink, stations, w.w / 2, rgb);
    stats.waters++;
  });
  return toTypedMesh({ positions: sink.positions, colors: sink.colors, uvs: sink.uvs,
           indices: sink.indices, triangles: sink.indices.length / 3, stats });
}
