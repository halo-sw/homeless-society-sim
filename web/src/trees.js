// Decorative street + complex trees (pure placement; three.js only for
// the InstancedMesh assembly in buildTreeMeshes).
//
// placeTrees(area, origin, opts) deterministically picks tree spots:
// - along residential streets (residential/service/living_street/footway
//   ribbons, offset past the kerb, every ~14 m with jitter),
// - inside named apartment complexes (jittered grid over the hull),
// rejecting any spot inside a building footprint, on a road ribbon, or
// in water. Trees are CLEARLY DECORATIVE (ginkgo/zelkova styling) — the
// UI says so and no analysis may use them. Same seed => same trees.

import { lonLatToXY } from "./frame.js";
import { roadWidth } from "./ground.js";
import { GINKGO, TRUNK, hashString, hashUnit } from "./palette.js";
import { mulberry32 } from "./walkers.js";

export const TREE_SPACING_M = 14;
export const TREE_ROAD_CLEAR_M = 1.2;
export const MAX_TREES = 2200;

// Ginkgo-heavy autumn mix: yellow/orange mostly, some green.
const COLOR_WEIGHTS = [0.34, 0.3, 0.16, 0.12, 0.08];

export function treeColor(rngValue) {
  let acc = 0;
  for (let i = 0; i < COLOR_WEIGHTS.length; i++) {
    acc += COLOR_WEIGHTS[i];
    if (rngValue < acc) return GINKGO[i];
  }
  return GINKGO[0];
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Spatial hash over footprint bboxes for fast rejection.
function buildFootprintIndex(buildings, origin, cellM = 25) {
  const cells = new Map();
  const key = (cx, cy) => `${cx},${cy}`;
  for (const b of buildings) {
    const polys = b.geometry.type === "Polygon" ? [b.geometry.coordinates]
      : b.geometry.type === "MultiPolygon" ? b.geometry.coordinates : [];
    for (const poly of polys) {
      const ring = poly[0].map(([lon, lat]) => lonLatToXY(lon, lat, origin));
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
      const entry = { ring, minX, minY, maxX, maxY };
      for (let cx = Math.floor(minX / cellM); cx <= Math.floor(maxX / cellM); cx++) {
        for (let cy = Math.floor(minY / cellM); cy <= Math.floor(maxY / cellM); cy++) {
          const k = key(cx, cy);
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(entry);
        }
      }
    }
  }
  return {
    inside(x, y) {
      const list = cells.get(key(Math.floor(x / cellM), Math.floor(y / cellM))) || [];
      for (const e of list) {
        if (x < e.minX || x > e.maxX || y < e.minY || y > e.maxY) continue;
        if (pointInRing(x, y, e.ring)) return true;
      }
      return false;
    },
  };
}

function distToSegmentM(x, y, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / len2));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

// Road segments with half-widths (for the on-road rejection + kerb offset).
function roadSegments(roads, origin) {
  const segs = [];
  for (const road of roads || []) {
    if (road.geometry.type !== "LineString" || road.area) continue;
    const hw = roadWidth(road.highway) / 2;
    const pts = road.geometry.coordinates.map(([lon, lat]) => lonLatToXY(lon, lat, origin));
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push({ a: pts[i], b: pts[i + 1], hw, highway: road.highway });
    }
  }
  return segs;
}

// Grid index over road segments so the on-road check stays fast on
// gu-sized areas (songpa: ~50k segments x ~10k candidates).
function buildSegmentIndex(segs, cellM = 25) {
  const cells = new Map();
  const key = (cx, cy) => `${cx},${cy}`;
  segs.forEach((s, i) => {
    const pad = s.hw + TREE_ROAD_CLEAR_M;
    const minX = Math.min(s.a[0], s.b[0]) - pad;
    const maxX = Math.max(s.a[0], s.b[0]) + pad;
    const minY = Math.min(s.a[1], s.b[1]) - pad;
    const maxY = Math.max(s.a[1], s.b[1]) + pad;
    for (let cx = Math.floor(minX / cellM); cx <= Math.floor(maxX / cellM); cx++) {
      for (let cy = Math.floor(minY / cellM); cy <= Math.floor(maxY / cellM); cy++) {
        const k = key(cx, cy);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(i);
      }
    }
  });
  return (x, y) => {
    const list = cells.get(key(Math.floor(x / cellM), Math.floor(y / cellM))) || [];
    for (const i of list) {
      const s = segs[i];
      if (distToSegmentM(x, y, s.a, s.b) < s.hw + TREE_ROAD_CLEAR_M) return true;
    }
    return false;
  };
}

const STREET_PLANTING = new Set(["residential", "living_street", "service", "footway", "path", "pedestrian", "tertiary"]);

function streetSpots(segs, rng) {
  const spots = [];
  for (const s of segs) {
    if (!STREET_PLANTING.has(s.highway)) continue;
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    if (len < 6) continue;
    const n = Math.max(1, Math.floor(len / TREE_SPACING_M));
    let dx = s.b[0] - s.a[0];
    let dy = s.b[1] - s.a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const nx = -dy;
    const ny = dx;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + (rng() - 0.5) * 0.5) / n;
      const side = rng() < 0.5 ? 1 : -1;
      const off = s.hw + TREE_ROAD_CLEAR_M + 0.8 + rng() * 1.5;
      spots.push([s.a[0] + dx * len * t + nx * off * side,
                  s.a[1] + dy * len * t + ny * off * side]);
    }
  }
  return spots;
}

function complexSpots(complexes, buildingsById, origin, rng) {
  const spots = [];
  for (const c of complexes || []) {
    if (!c.name) continue;
    const pts = [];
    for (const id of c.building_ids) {
      const b = buildingsById.get(id);
      if (!b) continue;
      const polys = b.geometry.type === "Polygon" ? [b.geometry.coordinates]
        : b.geometry.type === "MultiPolygon" ? b.geometry.coordinates : [];
      for (const poly of polys) {
        for (const [lon, lat] of poly[0]) pts.push(lonLatToXY(lon, lat, origin));
      }
    }
    if (pts.length === 0) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    // Jittered ~18 m grid over the bbox; footprint rejection carves rooms.
    const step = 18;
    for (let gx = minX + step / 2; gx < maxX; gx += step) {
      for (let gy = minY + step / 2; gy < maxY; gy += step) {
        if (rng() < 0.45) continue;
        spots.push([gx + (rng() - 0.5) * 10, gy + (rng() - 0.5) * 10]);
      }
    }
  }
  return spots;
}

export function placeTrees(area, origin, opts = {}) {
  const { seed = 77, maxTrees = MAX_TREES } = opts;
  const rng = mulberry32(hashString(`${area.area}:${seed}`));
  const buildingsById = new Map((area.buildings || []).map((b) => [b.id, b]));
  const index = buildFootprintIndex(area.buildings || [], origin);
  const segs = roadSegments(area.roads || [], origin);
  const nearRoad = buildSegmentIndex(segs);
  const raw = [...streetSpots(segs, rng), ...complexSpots(area.complexes || [], buildingsById, origin, rng)];
  const trees = [];
  for (const [x, y] of raw) {
    if (trees.length >= maxTrees) break;
    if (index.inside(x, y)) continue;
    if (nearRoad(x, y)) continue;
    trees.push({
      x, y,
      scale: 0.8 + rng() * 0.7,
      color: treeColor(rng()),
      phase: rng() * Math.PI * 2,
    });
  }
  return { trees, trunkColor: TRUNK };
}
