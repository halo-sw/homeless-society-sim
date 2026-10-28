// Corridor tile -> merged mesh data (pure arrays, three.js only for
// polygon triangulation; no scene, no DOM).
//
// One tile becomes three draw calls: flat-colour building prisms, a
// vertex-coloured line soup (major roads, district boundaries, open
// waterways), and closed-water flats. Coordinates are three.js world
// space (x = east, y = up, z = -north) in the given lon/lat origin
// frame — the whole corridor shares the home area's frame, so tiles,
// the journey line and both detailed areas coincide.

import * as THREE from "three";
import { lonLatToXY } from "./frame.js";

export const CORRIDOR_BUILDING = [0.79, 0.76, 0.7]; // flat Bone
export const CORRIDOR_ROAD = [0.42, 0.44, 0.46];
export const CORRIDOR_BOUNDARY = [0.55, 0.4, 0.3];
export const CORRIDOR_WATER_LINE = [0.45, 0.65, 0.78];
export const CORRIDOR_WATER = [0.62, 0.77, 0.85];

const LIFT = 0.6; // corridor prisms sit just above the regional base

function pushTri(out, a, b, c, color, normal) {
  out.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let k = 0; k < 3; k++) {
    out.normals.push(normal[0], normal[1], normal[2]);
    out.colors.push(color[0], color[1], color[2]);
  }
  out.triangles += 1;
}

function emptySoup() {
  return { positions: [], normals: [], colors: [], triangles: 0 };
}

// Flat prism per building footprint (walls + triangulated roof cap).
export function tileBuildings(tile, origin) {
  const out = emptySoup();
  const up = [0, 1, 0];
  for (const b of tile.buildings || []) {
    const ring = (b.pts || []).map(([lon, lat]) => lonLatToXY(lon, lat, origin));
    if (ring.length < 4) continue;
    const h = Math.max(2, Math.min(600, Number(b.h) || 6));
    const n = ring.length - 1; // closed ring
    for (let i = 0; i < n; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const normal = [dy / len, 0, dx / len];
      const p00 = [x0, LIFT, -y0];
      const p10 = [x1, LIFT, -y1];
      const p01 = [x0, LIFT + h, -y0];
      const p11 = [x1, LIFT + h, -y1];
      pushTri(out, p00, p10, p11, CORRIDOR_BUILDING, normal);
      pushTri(out, p00, p11, p01, CORRIDOR_BUILDING, normal);
    }
    try {
      const contour = ring.slice(0, n).map(([x, y]) => new THREE.Vector2(x, y));
      const faces = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [a, i, c] of faces) {
        const p = (k) => [ring[k][0], LIFT + h, -ring[k][1]];
        pushTri(out, p(a), p(i), p(c), CORRIDOR_BUILDING, up);
      }
    } catch {
      // Degenerate footprint: walls already drawn, skip the cap.
    }
  }
  return out;
}

// Major roads + boundaries + open waterways as coloured line segments.
export function tileLines(tile, origin) {
  const positions = [];
  const colors = [];
  const push = (pts, color, lift) => {
    const xy = pts.map(([lon, lat]) => lonLatToXY(lon, lat, origin));
    for (let i = 0; i + 1 < xy.length; i++) {
      positions.push(xy[i][0], lift, -xy[i][1], xy[i + 1][0], lift, -xy[i + 1][1]);
      colors.push(...color, ...color);
    }
  };
  for (const r of tile.roads || []) push(r.pts || [], CORRIDOR_ROAD, 1.2);
  for (const b of tile.boundaries || []) push(b.pts || [], CORRIDOR_BOUNDARY, 1.4);
  for (const w of tile.water || []) {
    if (!w.closed) push(w.pts || [], CORRIDOR_WATER_LINE, 1.0);
  }
  return { positions, colors, segments: positions.length / 6 };
}

// Closed water bodies as flat triangulated caps.
export function tileWater(tile, origin) {
  const out = emptySoup();
  const up = [0, 1, 0];
  for (const w of tile.water || []) {
    if (!w.closed) continue;
    const ring = (w.pts || []).map(([lon, lat]) => lonLatToXY(lon, lat, origin));
    if (ring.length < 4) continue;
    try {
      const contour = ring.slice(0, ring.length - 1).map(([x, y]) => new THREE.Vector2(x, y));
      const faces = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [a, i, c] of faces) {
        const p = (k) => [ring[k][0], 0.8, -ring[k][1]];
        pushTri(out, p(a), p(i), p(c), CORRIDOR_WATER, up);
      }
    } catch {
      // Degenerate water ring: skip it.
    }
  }
  return out;
}

// Sub-polyline between the vertices nearest to two lon/lat points
// (the travelled slice of a pattern's full geometry). Either order.
export function sliceGeometry(geom, a, b) {
  if (!geom || geom.length < 2) return [];
  let ia = 0;
  let ib = 0;
  let da = Infinity;
  let db = Infinity;
  geom.forEach(([lon, lat], i) => {
    const qa = (lon - a[0]) ** 2 + (lat - a[1]) ** 2;
    const qb = (lon - b[0]) ** 2 + (lat - b[1]) ** 2;
    if (qa < da) {
      da = qa;
      ia = i;
    }
    if (qb < db) {
      db = qb;
      ib = i;
    }
  });
  const [lo, hi] = ia <= ib ? [ia, ib] : [ib, ia];
  return geom.slice(lo, hi + 1).map(([lon, lat]) => [lon, lat]);
}

// Journey line data: per-segment world polylines with band colours.
// segments: rideSegments() entries; patterns: pattern-id -> geometry.
export function journeyLineData(ride, network) {
  const byId = new Map();
  for (const line of (network && network.lines) || []) {
    for (const p of line.patterns || []) byId.set(p.id, p);
  }
  const lines = [];
  for (const leg of ride.legs) {
    const p = byId.get(leg.patternId);
    if (!p || !p.geometry || p.geometry.length < 2) continue;
    lines.push({ legIndex: ride.legs.indexOf(leg),
      lineName: leg.lineName, from: leg.from, to: leg.to,
      valuePct: leg.congestion.valuePct, source: leg.congestion.source,
      geometry: p.geometry.map(([lon, lat]) => [lon, lat]),
      stopIds: [...leg.stopIds] });
  }
  return lines;
}
