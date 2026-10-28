// Footprint -> extruded miniature-mesh data (pure arrays, three.js only
// for polygon triangulation; no scene, no DOM).
//
// buildBuildings(buildings, complexes, origin) returns two merged triangle
// soups (residential vs non-residential, for the "주거만 강조" fade) as
// {positions, normals, colors, ranges} plain arrays in three.js world space
// (x = east, y = up, z = -north), plus stats. main.js wraps them in
// BufferGeometry (one mesh per bucket => two draw calls for all buildings).
// ranges lists per-building vertex spans for the night window glow.
//
// Massing rules:
// - apartments with >= 6 floors ("slab"): stacked one-quad-per-floor walls
//   alternating wall/band shades (subtle floor banding), short-end faces in
//   a slightly darker side tone, flat roof, rooftop box.
// - houses with <= 3 floors and a roughly rectangular footprint: pitched
//   roof — gable when the footprint aspect >= 1.25, else hip.
// - everything else: flat roof, muted colors.
// Wall normals point away from the footprint centroid; roofs face up.
// Faces use DoubleSide downstream, so ring winding never hides a face.

import * as THREE from "three";
import { lonLatToXY } from "./frame.js";
import { residentialColors } from "./palette.js";

export const SLAB_MIN_FLOORS = 6;
export const HOUSE_MAX_PITCHED_FLOORS = 3;
export const RECT_MIN_FILL = 0.8;
export const GABLE_MIN_ASPECT = 1.25;
export const FLOOR_M = 3.0;

export function floorsOf(building) {
  if (Number.isInteger(building.levels) && building.levels > 0) {
    return building.levels;
  }
  return Math.max(1, Math.round((building.height_m || FLOOR_M) / FLOOR_M));
}

// Rings of a Polygon/MultiPolygon geometry as arrays of [lon, lat]
// ([exterior, ...holes] per polygon).
export function polygonsOf(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) {
    a += (r[i + 1][0] - r[i][0]) * (r[i + 1][1] + r[i][1]);
  }
  return Math.abs(a / 2);
}

// Dominant edge angle of a ring (for the pitched-roof frame).
function dominantAngle(ring) {
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

// Extents of a ring in its dominant-edge frame (rotation-proof: a
// 45°-rotated rectangle still fills ~1.0, unlike axis-aligned fill).
export function orientedExtents(ringXY) {
  const theta = dominantAngle(ringXY);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const vx = -uy;
  const vy = ux;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [x, y] of ringXY) {
    const u = x * ux + y * uy;
    const v = x * vx + y * vy;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  return { w: maxU - minU, d: maxV - minV };
}

export function isRoughlyRectangular(ringXY) {
  if (ringXY.length < 4 || ringXY.length > 40) return false;
  const { w, d } = orientedExtents(ringXY);
  const box = w * d;
  if (box <= 0) return false;
  return ringArea(ringXY) / box >= RECT_MIN_FILL;
}

export function roofKind(building, ringXY) {
  const floors = floorsOf(building);
  const res = building.residential || "none";
  if (res === "house" && floors <= HOUSE_MAX_PITCHED_FLOORS && ringXY && isRoughlyRectangular(ringXY)) {
    const { w, d } = orientedExtents(ringXY);
    const aspect = Math.max(w, d) / Math.max(Math.min(w, d), 0.01);
    return aspect >= GABLE_MIN_ASPECT ? "gable" : "hip";
  }
  return "flat";
}

export function isSlab(building) {
  return (building.residential || "none") === "apartment" && floorsOf(building) >= SLAB_MIN_FLOORS;
}

function hexRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

export const PARAPET_H_M = 1.1;
export const PODIUM_H_M = 4.2; // ground-floor band on mixed/non-residential
export const TALL_PLANT_MIN_M = 30; // rooftop plant boxes above this height

function makeBucket() {
  return { positions: [], normals: [], colors: [], uvs: [], ranges: [] };
}

// bucket may be one bucket or an array (stage 5b dual-emits into the
// legacy residential/non-residential buckets plus the detail buckets).
// uv is per-corner [[u,v] x3] in metres (walls) or planar metres (roofs);
// the renderer scales metres -> texture tiles via texture.repeat.
function pushTri(bucket, a, b, c, normal, rgb, uv) {
  const sinks = Array.isArray(bucket) ? bucket : [bucket];
  // World space: [x, y] local metres -> (x, h, -y).
  for (const sink of sinks) {
    for (const [x, h, y] of [a, b, c]) {
      sink.positions.push(x, h, -y);
    }
    for (let i = 0; i < 3; i++) sink.normals.push(normal[0], normal[1], normal[2]);
    for (let i = 0; i < 3; i++) sink.colors.push(rgb[0], rgb[1], rgb[2]);
    if (uv) for (const [u, v] of uv) sink.uvs.push(u, v);
    else for (let i = 0; i < 3; i++) sink.uvs.push(0, 0);
  }
}

function pushQuad(bucket, a, b, c, d, normal, rgb, uv) {
  const q = uv || [[0, 0], [0, 0], [0, 0], [0, 0]];
  pushTri(bucket, a, b, c, normal, rgb, [q[0], q[1], q[2]]);
  pushTri(bucket, a, c, d, normal, rgb, [q[0], q[2], q[3]]);
}

// Face normal from [x, h, y] corners (DoubleSide tolerates either sign).
function faceNormal(a, b, c) {
  const e1 = [b[0] - a[0], b[1] - a[1], -(b[2] - a[2])];
  const e2 = [c[0] - a[0], c[1] - a[1], -(c[2] - a[2])];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2],
             e1[0] * e2[1] - e1[1] * e2[0]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

function buildWalls(bucket, ring, y0, y1, frontRgb, sideRgb = frontRgb) {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) {
    cx += x;
    cy += y;
  }
  cx /= ring.length;
  cy /= ring.length;
  // Short-end side faces (edges across the dominant axis) take the
  // slightly darker side tone; long faces take the front tone.
  const theta = dominantAngle(ring);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  // Cumulative wall distance in metres for the U coordinate.
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1m] = ring[i];
    const [x2, y2m] = ring[i + 1];
    const ex = x2 - x1;
    const ey = y2m - y1m;
    const len = Math.hypot(ex, ey);
    if (len < 1e-6) continue;
    const parallel = Math.abs((ex * ux + ey * uy) / len) > 0.7;
    // Outward normal: perpendicular of the edge, pointing away from centroid.
    let nx = ey / len;
    let ny = -ex / len;
    const mx = (x1 + x2) / 2 - cx;
    const my = (y1m + y2m) / 2 - cy;
    if (nx * mx + ny * my < 0) {
      nx = -nx;
      ny = -ny;
    }
    const s2 = s + len;
    pushQuad(bucket, [x1, y0, y1m], [x2, y0, y2m], [x2, y1, y2m], [x1, y1, y1m],
             [nx, 0, -ny], parallel ? frontRgb : sideRgb,
             [[s, y0], [s2, y0], [s2, y1], [s, y1]]);
    s = s2;
  }
}

function buildBandedWalls(bucket, ring, y0, height, floors, wallRgb, bandRgb, sideRgb) {
  const fh = height / floors;
  for (let f = 0; f < floors; f++) {
    buildWalls(bucket, ring, y0 + f * fh, y0 + (f + 1) * fh,
               f % 2 === 0 ? wallRgb : bandRgb, sideRgb);
  }
}

function buildFlatRoof(bucket, polysXY, y, rgb) {
  const up = [0, 1, 0];
  for (const poly of polysXY) {
    const contour = poly[0].map(([x, yy]) => new THREE.Vector2(x, yy));
    const holes = poly.slice(1).map((h) => h.map(([x, yy]) => new THREE.Vector2(x, yy)));
    let faces = [];
    try {
      faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    } catch {
      faces = [];
    }
    const pts = [poly[0], ...poly.slice(1)].flat();
    for (const [a, b, c] of faces) {
      const pa = pts[a];
      const pb = pts[b];
      const pc = pts[c];
      if (!pa || !pb || !pc) continue;
      pushTri(bucket, [pa[0], y, pa[1]], [pb[0], y, pb[1]], [pc[0], y, pc[1]], up, rgb,
              [[pa[0], pa[1]], [pb[0], pb[1]], [pc[0], pc[1]]]);
    }
  }
}

// Gable roof over the ring's oriented bbox: ridge along the long axis.
function buildGableRoof(bucket, ring, y, rgb) {
  const theta = dominantAngle(ring);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const vx = -uy;
  const vy = ux;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [x, yy] of ring) {
    const u = x * ux + yy * uy;
    const v = x * vx + yy * vy;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  const ccx = cu * ux + cv * vx; // centre back in x/y
  const ccy = cu * uy + cv * vy;
  const hw = (maxU - minU) / 2 + 0.4; // eaves overhang (centre mapped back to x/y below)
  const hd = (maxV - minV) / 2 + 0.4;
  const rH = Math.min(hw, hd) * 0.55 + 0.8;
  const P = (u, v, h) => [ccx + u * ux + v * vx, h, ccy + u * uy + v * vy];
  const UV = (p) => [p[0], p[2]]; // planar metres
  // Slopes (normals tilted in ±v).
  const s1 = P(-hw, -hd, y);
  const s2 = P(hw, -hd, y);
  const s3 = P(hw, 0, y + rH);
  const s4 = P(-hw, 0, y + rH);
  pushQuad(bucket, s1, s2, s3, s4, faceNormal(s1, s2, s3), rgb,
           [UV(s1), UV(s2), UV(s3), UV(s4)]);
  const t1 = P(hw, hd, y);
  const t2 = P(-hw, hd, y);
  const t3 = P(-hw, 0, y + rH);
  const t4 = P(hw, 0, y + rH);
  pushQuad(bucket, t1, t2, t3, t4, faceNormal(t1, t2, t3), rgb,
           [UV(t1), UV(t2), UV(t3), UV(t4)]);
  // Gable triangles (vertical, ±u).
  const g1 = P(-hw, -hd, y);
  const g2 = P(-hw, hd, y);
  const g3 = P(-hw, 0, y + rH);
  pushTri(bucket, g1, g2, g3, faceNormal(g1, g2, g3), rgb, [UV(g1), UV(g2), UV(g3)]);
  const h1 = P(hw, hd, y);
  const h2 = P(hw, -hd, y);
  const h3 = P(hw, 0, y + rH);
  pushTri(bucket, h1, h2, h3, faceNormal(h1, h2, h3), rgb, [UV(h1), UV(h2), UV(h3)]);
}

// Hip roof: 4 slopes rising to a short ridge along the long axis.
function buildHipRoof(bucket, ring, y, rgb) {
  const theta = dominantAngle(ring);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const vx = -uy;
  const vy = ux;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [x, yy] of ring) {
    const u = x * ux + yy * uy;
    const v = x * vx + yy * vy;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  const ccx = cu * ux + cv * vx;
  const ccy = cu * uy + cv * vy;
  const hw = (maxU - minU) / 2 + 0.4;
  const hd = (maxV - minV) / 2 + 0.4;
  const rH = Math.min(hw, hd) * 0.55 + 0.8;
  const inset = Math.min(hw, hd) * 0.45;
  const alongU = hw >= hd;
  const P = (u, v, h) => [ccx + u * ux + v * vx, h, ccy + u * uy + v * vy];
  // Ridge endpoints + eave corners in (u, v).
  const r1 = alongU ? [-hw + inset, 0] : [0, -hd + inset];
  const r2 = alongU ? [hw - inset, 0] : [0, hd - inset];
  const c1 = [-hw, -hd];
  const c2 = [hw, -hd];
  const c3 = [hw, hd];
  const c4 = [-hw, hd];
  const quads = alongU
    ? [[c1, c2, r2, r1], [c3, c4, r1, r2]]
    : [[c2, c3, r2, r1], [c4, c1, r1, r2]];
  const tris = alongU ? [[c2, c3, r2], [c4, c1, r1]] : [[c3, c4, r2], [c1, c2, r1]];
  const UV = (p) => [p[0], p[2]]; // planar metres
  for (const [p, q, r, s] of quads) {
    const a = P(...p, y);
    const b = P(...q, y);
    const c = P(...r, y + rH);
    const d = P(...s, y + rH);
    pushQuad(bucket, a, b, c, d, faceNormal(a, b, c), rgb,
             [UV(a), UV(b), UV(c), UV(d)]);
  }
  for (const [p, q, r] of tris) {
    const a = P(...p, y);
    const b = P(...q, y);
    const c = P(...r, y + rH);
    pushTri(bucket, a, b, c, faceNormal(a, b, c), rgb, [UV(a), UV(b), UV(c)]);
  }
}

function buildRooftopBox(bucket, ring, y, rgb) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, yy] of ring) {
    if (x < minX) minX = x;
    if (yy < minY) minY = yy;
    if (x > maxX) maxX = x;
    if (yy > maxY) maxY = yy;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const hw = Math.max(1.2, (maxX - minX) * 0.14);
  const hd = Math.max(1.2, (maxY - minY) * 0.14);
  const h = 2.2;
  const box = [[cx - hw, cy - hd], [cx + hw, cy - hd], [cx + hw, cy + hd], [cx - hw, cy + hd], [cx - hw, cy - hd]];
  buildWalls(bucket, box, y, y + h, rgb);
  buildFlatRoof(bucket, [[box]], y + h, rgb);
}

// Parapet: a low outer wall ring + cap strip around a flat roof edge.
// DoubleSide downstream renders the inner face; UVs are wall metres.
function buildParapet(bucket, ring, y, rgb) {
  let cx = 0;
  let cy = 0;
  for (const [x, yy] of ring) {
    cx += x;
    cy += yy;
  }
  cx /= ring.length;
  cy /= ring.length;
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1m] = ring[i];
    const [x2, y2m] = ring[i + 1];
    const ex = x2 - x1;
    const ey = y2m - y1m;
    const len = Math.hypot(ex, ey);
    if (len < 1e-6) continue;
    let nx = ey / len;
    let ny = -ex / len;
    if (nx * ((x1 + x2) / 2 - cx) + ny * ((y1m + y2m) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const s2 = s + len;
    const yT = y + PARAPET_H_M;
    pushQuad(bucket, [x1, y, y1m], [x2, y, y2m], [x2, yT, y2m], [x1, yT, y1m],
             [nx, 0, -ny], rgb, [[s, y], [s2, y], [s2, yT], [s, yT]]);
    // Cap strip (0.3 m wide, inward).
    const c1 = [x1 - nx * 0.3, yT, y1m - ny * 0.3];
    const c2 = [x2 - nx * 0.3, yT, y2m - ny * 0.3];
    const o1 = [x1, yT, y1m];
    const o2 = [x2, yT, y2m];
    pushQuad(bucket, o1, o2, c2, c1, [0, 1, 0], rgb,
             [[x1, y1m], [x2, y2m], [c2[0], c2[2]], [c1[0], c1[2]]]);
    s = s2;
  }
}

// Rooftop plant for tall non-slab buildings: two small AC/plant boxes
// flanking the stairwell box (deterministic, no RNG).
function buildPlantBoxes(bucket, ring, y, rgb) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, yy] of ring) {
    if (x < minX) minX = x;
    if (yy < minY) minY = yy;
    if (x > maxX) maxX = x;
    if (yy > maxY) maxY = yy;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dx = Math.max(2.5, (maxX - minX) * 0.22);
  for (const sx of [-1, 1]) {
    const bx = cx + sx * dx;
    const hw = 1.4;
    const hd = 1.0;
    const h = 1.5;
    const box = [[bx - hw, cy - hd], [bx + hw, cy - hd], [bx + hw, cy + hd], [bx - hw, cy + hd], [bx - hw, cy - hd]];
    buildWalls(bucket, box, y, y + h, rgb);
    buildFlatRoof(bucket, [[box]], y + h, rgb);
  }
}

function projectRing(ringLonLat, origin) {
  return ringLonLat.map(([lon, lat]) => lonLatToXY(lon, lat, origin));
}

export function buildBuildings(buildings, complexes, origin) {
  const complexOf = new Map();
  for (const c of complexes || []) {
    for (const id of c.building_ids) complexOf.set(id, c.id);
  }
  const res = makeBucket();
  const nonres = makeBucket();
  // Stage 5b detail buckets: one wall mesh per facade class (each with
  // its own procedural texture), one podium mesh for ground-floor bands,
  // one roof mesh. Legacy buckets keep their exact shape (+uvs).
  const detail = {
    walls: { apartment: makeBucket(), house: makeBucket(), mixed: makeBucket(), none: makeBucket() },
    podium: makeBucket(),
    roofs: makeBucket(),
  };
  const stats = { buildings: 0, skipped: 0, slab: 0, gable: 0, hip: 0, flat: 0,
                  podium: 0, parapet: 0, plant: 0 };
  for (const b of buildings) {
    const polys = polygonsOf(b.geometry);
    if (polys.length === 0) {
      stats.skipped++;
      continue;
    }
    const polysXY = polys.map((poly) => poly.map((ring) => projectRing(ring, origin)));
    if (!polysXY.some((poly) => poly[0].length >= 4)) {
      stats.skipped++;
      continue;
    }
    const residential = b.residential || "none";
    const bucket = residential === "none" ? nonres : res;
    const vertStart = bucket.positions.length / 3;
    const wallBucket = detail.walls[residential] || detail.walls.none;
    const wallStart = wallBucket.positions.length / 3;
    const roofStart = detail.roofs.positions.length / 3;
    const podiumStart = detail.podium.positions.length / 3;
    const colors = residentialColors(b, complexOf.get(b.id) || null);
    const wallRgb = hexRgb(colors.wall);
    const bandRgb = hexRgb(colors.band);
    const sideRgb = hexRgb(colors.side);
    const roofRgb = hexRgb(colors.roof);
    const height = Math.max(2.5, b.height_m || 6);
    const floors = floorsOf(b);
    const slab = isSlab(b);
    // Ground-floor band (lobby/shops texture) on mixed + non-residential.
    const hasPodium = !slab && (residential === "mixed" || residential === "none")
      && height > PODIUM_H_M + 1;
    const walls = [bucket, wallBucket];
    const roofs = [bucket, detail.roofs];
    const podium = [bucket, detail.podium];
    for (const polyXY of polysXY) {
      const ring = polyXY[0];
      if (ring.length < 4) continue;
      if (slab) {
        buildBandedWalls(walls, ring, 0, height, floors, wallRgb, bandRgb, sideRgb);
        buildFlatRoof(roofs, [polyXY], height, roofRgb);
        buildRooftopBox(roofs, ring, height, bandRgb);
        buildParapet(roofs, ring, height, bandRgb);
      } else {
        if (hasPodium) {
          buildWalls(podium, ring, 0, PODIUM_H_M, wallRgb, sideRgb);
          buildWalls(walls, ring, PODIUM_H_M, height, wallRgb, sideRgb);
        } else {
          buildWalls(walls, ring, 0, height, wallRgb, sideRgb);
        }
        const kind = roofKind(b, ring);
        if (kind === "gable") buildGableRoof(roofs, ring, height, roofRgb);
        else if (kind === "hip") buildHipRoof(roofs, ring, height, roofRgb);
        else {
          buildFlatRoof(roofs, [polyXY], height, roofRgb);
          buildParapet(roofs, ring, height, roofRgb);
        }
        if (!slab && height >= TALL_PLANT_MIN_M && kind === "flat") {
          buildRooftopBox(roofs, ring, height, bandRgb);
          buildPlantBoxes(roofs, ring, height, bandRgb);
        }
      }
    }
    const vertCount = bucket.positions.length / 3 - vertStart;
    if (vertCount > 0) bucket.ranges.push({ id: b.id, start: vertStart, count: vertCount });
    const pushRange = (bk, start) => {
      const n = bk.positions.length / 3 - start;
      if (n > 0) bk.ranges.push({ id: b.id, start, count: n });
    };
    pushRange(wallBucket, wallStart);
    pushRange(detail.roofs, roofStart);
    if (hasPodium) {
      pushRange(detail.podium, podiumStart);
      stats.podium++;
    }
    stats.buildings++;
    if (slab) {
      stats.slab++;
      stats.parapet++;
    } else {
      const kind = roofKind(b, polysXY[0][0]);
      stats[kind]++;
      if (kind === "flat") {
        stats.parapet++;
        if (height >= TALL_PLANT_MIN_M) stats.plant++;
      }
    }
  }
  const finish = (bucket) => ({
    positions: bucket.positions,
    normals: bucket.normals,
    colors: bucket.colors,
    uvs: bucket.uvs,
    triangles: bucket.positions.length / 9,
    ranges: bucket.ranges, // per-building vertex ranges (stage 3: night glow)
  });
  const finishWalls = {};
  for (const [key, bk] of Object.entries(detail.walls)) finishWalls[key] = finish(bk);
  return {
    residential: finish(res), nonResidential: finish(nonres), stats,
    detail: { walls: finishWalls, podium: finish(detail.podium), roofs: finish(detail.roofs) },
  };
}
