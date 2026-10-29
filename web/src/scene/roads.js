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

import { hashUnit } from "../palette.js";
import { toTypedMesh } from "./load.js";

export const RESAMPLE_M = 2;
export const ROAD_LIFT = 0.05;
export const ORDER_STEP = 0.01;
export const BRIDGE_LIFT = 1.0;
export const BRIDGE_CLEAR = 0.4;
export const WATER_DROP = 0.3;

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

function hexRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function makeSink() {
  return { positions: [], colors: [], uvs: [], indices: [] };
}

// One ribbon into a sink: stations carry (x, z, y); triangles face up.
function pushRibbon(sink, stations, halfWidth, rgb) {
  const n = stations.length;
  if (n < 2) return 0;
  const perp = [];
  for (let i = 0; i < n; i++) {
    const p0 = stations[Math.max(0, i - 1)];
    const p1 = stations[Math.min(n - 1, i + 1)];
    const dx = p1[0] - p0[0];
    const dz = p1[1] - p0[1];
    const len = Math.hypot(dx, dz) || 1;
    perp.push([-dz / len, dx / len]);
  }
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
    road: hexRgb(look.sceneRoad), foot: hexRgb(look.sceneFoot),
    cycle: hexRgb(look.sceneCycle), rail: hexRgb(look.sceneRail),
  };
  const stats = { roads: 0, skippedTunnel: 0, bridges: 0, byClass: {},
                  triangles: 0 };
  (roads || []).forEach((road, index) => {
    if (road.br === -1) {
      stats.skippedTunnel++;
      return;
    }
    const pts = resamplePoints(road.p, RESAMPLE_M);
    if (pts.length < 2) return;
    const cls = roadMaterialClass(road.k);
    const micro = hashUnit(index, 11) * 0.004;
    let stations;
    if (road.br === 1) {
      const ys = bridgeHeights(pts, heightAt);
      stations = pts.map((p, i) => [p[0], p[1], ys[i]]);
      stats.bridges++;
    } else {
      const lift = ROAD_LIFT + roadOrder(road.k) * ORDER_STEP + micro;
      stations = pts.map((p) => [p[0], p[1], heightAt(p[0], p[1]) + lift]);
    }
    stats.triangles += pushRibbon(sinks[cls], stations, road.w / 2, rgb[cls]);
    stats.roads++;
    stats.byClass[cls] = (stats.byClass[cls] || 0) + 1;
  });
  const out = {};
  for (const [cls, sink] of Object.entries(sinks)) {
    out[cls] = toTypedMesh({ ...sink, triangles: sink.indices.length / 3 });
  }
  return { meshes: out, stats };
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
