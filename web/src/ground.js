// Ground-plane mesh data (pure arrays; three.js only for triangulation).
//
// buildGround(roads, landuse, complexes, buildingsById, origin) returns a
// single merged triangle soup {positions, normals, colors} in world space
// plus stats. Layers by height (y): water 0.05, complex plates 0.06,
// parks/green 0.08, roads 0.12, crosswalks 0.18. Base paper plane is added
// by main.js at y = 0.
//
// - Roads are ribbons with width by highway class (roadWidth); foot-class
//   ways are narrower and lighter.
// - Crosswalk stripes: white zebra bars where foot-class segments cross
//   drivable segments (same layer, neither a bridge/tunnel mismatch).
// - Parks/green landuse and water render from their polygons.
// - Residential-complex ground plates: lighter paving inside the convex
//   hull of each NAMED complex's footprints (plates mark 단지 identity;
//   unnamed block-clusters get none).

import * as THREE from "three";
import { lonLatToXY } from "./frame.js";
import { CROSSWALK, FOOTWAY, GRASS, GROUND_PLATE, PARK, ROAD, ROAD_MAJOR, WATER, WOOD } from "./palette.js";

export const Y_WATER = 0.05;
export const Y_PLATE = 0.06;
export const Y_GREEN = 0.08;
export const Y_ROAD = 0.12;
export const Y_CROSSWALK = 0.18;

const ROAD_WIDTHS = {
  motorway: 14, trunk: 12, primary: 10, secondary: 8, tertiary: 7,
  unclassified: 6, residential: 6, service: 4.5, living_street: 5,
  road: 5, track: 3, pedestrian: 5,
  footway: 2.2, path: 2.2, steps: 2.2, cycleway: 2.5, bridleway: 2.5,
};
const LINK_SUFFIX = "_link";

export function roadWidth(highway) {
  if (!highway) return 4;
  if (highway.endsWith(LINK_SUFFIX)) return 6;
  return ROAD_WIDTHS[highway] ?? 4;
}

export function isFootClass(highway) {
  return highway === "footway" || highway === "path" || highway === "steps" ||
    highway === "pedestrian" || highway === "cycleway";
}

export function isDrivableClass(highway) {
  return highway === "motorway" || highway === "trunk" || highway === "primary" ||
    highway === "secondary" || highway === "tertiary" || highway === "unclassified" ||
    highway === "residential" || highway === "service" || highway === "living_street" ||
    highway === "road" || highway === "track" || (highway || "").endsWith(LINK_SUFFIX);
}

export function roadColor(highway) {
  if (isFootClass(highway)) return FOOTWAY;
  if (highway === "motorway" || highway === "trunk" || highway === "primary") return ROAD_MAJOR;
  return ROAD;
}

export function landuseColor(kind) {
  if (!kind) return null;
  if (kind === "landuse:residential" || kind === "landuse:retail" ||
      kind === "landuse:commercial" || kind === "landuse:industrial") return null; // context, not painted
  if (kind.startsWith("leisure:") && (kind === "leisure:park" || kind === "leisure:garden" ||
      kind === "leisure:playground" || kind === "leisure:pitch" || kind === "leisure:common" ||
      kind === "leisure:nature_reserve" || kind === "leisure:golf_course")) return PARK;
  if (kind === "natural:water" || kind === "waterway:riverbank" || kind === "waterway:dock") return WATER;
  if (kind === "natural:wood") return WOOD;
  if (kind === "natural:grassland" || kind === "natural:scrub" || kind === "landuse:grass" ||
      kind === "landuse:meadow" || kind === "landuse:forest" || kind === "landuse:cemetery" ||
      kind === "leisure:swimming_pool") return GRASS;
  return null;
}

export function landuseHeight(kind) {
  return landuseColor(kind) === WATER ? Y_WATER : Y_GREEN;
}

function hexRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function pushTriAt(positions, normals, colors, a, b, c, y, rgb) {
  for (const [x, yy] of [a, b, c]) positions.push(x, y, -yy);
  for (let i = 0; i < 3; i++) normals.push(0, 1, 0);
  for (let i = 0; i < 3; i++) colors.push(rgb[0], rgb[1], rgb[2]);
}

// Ribbon along a polyline: per-vertex averaged perpendicular (bevel joins).
export function ribbonTriangles(pointsXY, width) {
  const hw = width / 2;
  const tris = [];
  const perp = [];
  for (let i = 0; i < pointsXY.length; i++) {
    const p0 = pointsXY[Math.max(0, i - 1)];
    const p1 = pointsXY[Math.min(pointsXY.length - 1, i + 1)];
    let dx = p1[0] - p0[0];
    let dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy) || 1;
    perp.push([-dy / len, dx / len]);
  }
  for (let i = 0; i < pointsXY.length - 1; i++) {
    const [x1, y1] = pointsXY[i];
    const [x2, y2] = pointsXY[i + 1];
    const [ax, ay] = perp[i];
    const [bx, by] = perp[i + 1];
    const l1 = [x1 + ax * hw, y1 + ay * hw];
    const r1 = [x1 - ax * hw, y1 - ay * hw];
    const l2 = [x2 + bx * hw, y2 + by * hw];
    const r2 = [x2 - bx * hw, y2 - by * hw];
    tris.push([l1, r1, l2], [r1, r2, l2]);
  }
  return tris;
}

function segmentsCross(p1, p2, p3, p4) {
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const o1 = orient(p1, p2, p3);
  const o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1);
  const o4 = orient(p3, p4, p2);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function segmentIntersection(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

// Crossings between foot-class and drivable ways (projected roads).
// Returns [{x, y, angle, width}]: angle = footway direction (radians).
// Two patterns: shared OSM nodes (a footway vertex coinciding with a
// drivable vertex — the common mapped junction) and geometric segment
// X-crossings for ways that cross without a shared node.
export function findCrossings(projectedRoads, maxCrossings = 400) {
  const foot = projectedRoads.filter((r) => isFootClass(r.highway) && !r.area);
  const drive = projectedRoads.filter((r) => isDrivableClass(r.highway) && !r.area);
  const out = [];
  const seen = new Set();
  const near = (x, y) => {
    // Dedupe: one crossing per ~6 m cell.
    const k = `${Math.round(x / 6)},${Math.round(y / 6)}`;
    if (seen.has(k)) return true;
    seen.add(k);
    return false;
  };
  const gradeOk = (f, d) =>
    (f.layer || 0) === (d.layer || 0) &&
    !(f.bridge || f.tunnel || d.bridge || d.tunnel) &&
    f.bridge === d.bridge && f.tunnel === d.tunnel;

  // Shared-node junctions via a 0.5 m vertex hash over drivable ways.
  const vkey = (x, y) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  const dverts = new Map();
  for (const d of drive) {
    for (const [x, y] of d.points) {
      const k = vkey(x, y);
      if (!dverts.has(k)) dverts.set(k, []);
      dverts.get(k).push(d);
    }
  }
  for (const f of foot) {
    for (let i = 0; i < f.points.length && out.length < maxCrossings; i++) {
      const [x, y] = f.points[i];
      const matches = (dverts.get(vkey(x, y)) || []).filter((d) => gradeOk(f, d));
      if (matches.length === 0) continue;
      if (near(x, y)) continue;
      const q = f.points[Math.min(f.points.length - 1, i + 1)];
      const p = f.points[Math.max(0, i - 1)];
      out.push({ x, y, angle: Math.atan2(q[1] - p[1], q[0] - p[0]),
                 width: Math.max(...matches.map((d) => roadWidth(d.highway))) });
    }
  }
  // Geometric X-crossings (no shared node).
  for (const f of foot) {
    for (let i = 0; i < f.points.length - 1 && out.length < maxCrossings; i++) {
      const p1 = f.points[i];
      const p2 = f.points[i + 1];
      for (const d of drive) {
        if (!gradeOk(f, d)) continue;
        for (let j = 0; j < d.points.length - 1; j++) {
          const p3 = d.points[j];
          const p4 = d.points[j + 1];
          if (!segmentsCross(p1, p2, p3, p4)) continue;
          const hit = segmentIntersection(p1, p2, p3, p4);
          if (!hit || near(hit[0], hit[1])) continue;
          out.push({ x: hit[0], y: hit[1],
                     angle: Math.atan2(p2[1] - p1[1], p2[0] - p1[0]),
                     width: roadWidth(d.highway) });
          if (out.length >= maxCrossings) break;
        }
        if (out.length >= maxCrossings) break;
      }
    }
  }
  return out;
}

// Zebra bars across the road: bars run along the road (perpendicular to
// the footway), spaced along the footway direction.
export function crosswalkTriangles(crossing) {
  const bars = 4;
  const roadDir = crossing.angle + Math.PI / 2;
  const rx = Math.cos(roadDir);
  const ry = Math.sin(roadDir);
  const fx = Math.cos(crossing.angle);
  const fy = Math.sin(crossing.angle);
  const half = Math.min(crossing.width, 12) / 2;
  const tris = [];
  for (let i = 0; i < bars; i++) {
    const off = (i - (bars - 1) / 2) * 1.1;
    const cx = crossing.x + fx * off;
    const cy = crossing.y + fy * off;
    const w = 0.45; // bar half-length along footway dir
    const p1 = [cx - rx * half - fx * w, cy - ry * half - fy * w];
    const p2 = [cx + rx * half - fx * w, cy + ry * half - fy * w];
    const p3 = [cx + rx * half + fx * w, cy + ry * half + fy * w];
    const p4 = [cx - rx * half + fx * w, cy - ry * half + fy * w];
    tris.push([p1, p2, p3], [p1, p3, p4]);
  }
  return tris;
}

// Monotone-chain convex hull over [x, y] points.
export function convexHull(points) {
  const pts = [...points].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (pts.length <= 1) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function triangulatePolyXY(polyXY) {
  const contour = polyXY[0].map(([x, y]) => new THREE.Vector2(x, y));
  const holes = polyXY.slice(1).map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
  try {
    return THREE.ShapeUtils.triangulateShape(contour, holes);
  } catch {
    return [];
  }
}

export function buildGround(roads, landuse, complexes, buildingsById, origin) {
  const positions = [];
  const normals = [];
  const colors = [];
  const stats = { roads: 0, roadTris: 0, crossings: 0, green: 0, water: 0, plates: 0 };

  // Complex plates first (lowest painted layer above water).
  const plateRgb = hexRgb(GROUND_PLATE);
  for (const c of complexes || []) {
    if (!c.name) continue;
    const pts = [];
    for (const id of c.building_ids) {
      const b = buildingsById.get(id);
      if (!b) continue;
      const polys = b.geometry.type === "Polygon" ? [b.geometry.coordinates] : b.geometry.coordinates || [];
      for (const poly of polys) {
        for (const [lon, lat] of poly[0]) pts.push(lonLatToXY(lon, lat, origin));
      }
    }
    if (pts.length < 3) continue;
    const hull = convexHull(pts);
    if (hull.length < 3) continue;
    // Slight outward pad (~3 m) around the centroid.
    let hx = 0;
    let hy = 0;
    for (const [x, y] of hull) {
      hx += x;
      hy += y;
    }
    hx /= hull.length;
    hy /= hull.length;
    const padded = hull.map(([x, y]) => {
      const dx = x - hx;
      const dy = y - hy;
      const len = Math.hypot(dx, dy) || 1;
      return [x + (dx / len) * 3, y + (dy / len) * 3];
    });
    for (let i = 1; i < padded.length - 1; i++) {
      pushTriAt(positions, normals, colors, padded[0], padded[i], padded[i + 1], Y_PLATE, plateRgb);
      stats.plates++;
    }
  }

  // Green + water polygons.
  for (const feat of landuse || []) {
    const color = landuseColor(feat.kind);
    if (color === null) continue;
    if (feat.geometry.type !== "Polygon" && feat.geometry.type !== "MultiPolygon") continue;
    const polys = feat.geometry.type === "Polygon" ? [feat.geometry.coordinates] : feat.geometry.coordinates;
    const rgb = hexRgb(color);
    const y = landuseHeight(feat.kind);
    for (const poly of polys) {
      const polyXY = poly.map((ring) => ring.map(([lon, lat]) => lonLatToXY(lon, lat, origin)));
      if (polyXY[0].length < 4) continue;
      const faces = triangulatePolyXY(polyXY);
      const pts = polyXY.flat();
      for (const [a, b, c] of faces) {
        if (!pts[a] || !pts[b] || !pts[c]) continue;
        pushTriAt(positions, normals, colors, pts[a], pts[b], pts[c], y, rgb);
        if (color === WATER) stats.water++;
        else stats.green++;
      }
    }
  }

  // Roads as ribbons.
  const projected = [];
  for (const road of roads || []) {
    if (road.geometry.type !== "LineString") continue;
    const points = road.geometry.coordinates.map(([lon, lat]) => lonLatToXY(lon, lat, origin));
    if (points.length < 2) continue;
    projected.push({ highway: road.highway, layer: road.layer || 0,
                     bridge: road.bridge || null, tunnel: road.tunnel || null,
                     area: !!road.area, points });
    if (road.area) continue; // plaza surfaces: not ribbons (kept for future use)
    const rgb = hexRgb(roadColor(road.highway));
    for (const [a, b, c] of ribbonTriangles(points, roadWidth(road.highway))) {
      pushTriAt(positions, normals, colors, a, b, c, Y_ROAD, rgb);
      stats.roadTris++;
    }
    stats.roads++;
  }

  // Crosswalks.
  const walkRgb = hexRgb(CROSSWALK);
  for (const crossing of findCrossings(projected)) {
    for (const [a, b, c] of crosswalkTriangles(crossing)) {
      pushTriAt(positions, normals, colors, a, b, c, Y_CROSSWALK, walkRgb);
    }
    stats.crossings++;
  }

  return { positions, normals, colors, triangles: positions.length / 9, stats };
}
