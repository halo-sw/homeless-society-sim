// Residential walk-through tour planning (pure, no three.js).
//
// selectTourStops(area) picks 4-6 stops: apartment complexes (named
// first, ranked by height/size) plus the daily-life places nearest them
// by real walk-graph distance (station, school, supermarket/convenience,
// park, clinic/pharmacy). Consecutive stops are joined by walk-graph
// shortest paths (Dijkstra over directed walk edges); a candidate that
// is unreachable from the previous stop is skipped for the next one, so
// every tour leg is a real walkable path with graph-derived minutes
// (1.3 m/s). main.js only plays back the returned plan.

import { haversineM } from "./frame.js";
import { nearestNodeIn } from "./walkgraph.js";

export const WALK_MPS = 1.3;
export const MIN_STOPS = 4;
export const MAX_STOPS = 6;
export const DWELL_S = 3.0;
export const INTRO_GLIDE_S = 2.5;

// Cinematic glide duration for one leg (not walking pace).
export function legGlideDuration(stop, index) {
  if (index === 0) return INTRO_GLIDE_S;
  const len = stop.legLengthM || 50;
  return Math.min(12, Math.max(4, len / 60));
}

// Playback schedule: glide + dwell per stop, in tour-clock seconds.
export function tourSchedule(plan) {
  const segments = [];
  plan.stops.forEach((stop, i) => {
    segments.push({ type: "glide", leg: i, dur: legGlideDuration(stop, i) });
    segments.push({ type: "dwell", leg: i, dur: DWELL_S });
  });
  return { segments, total: segments.reduce((a, s) => a + s.dur, 0) };
}

// Player state at tour-clock time s: {leg, legT, dwellLeft, phase}.
// phase is "glide" | "dwell" | "outro" (past the last dwell).
export function seekState(schedule, s) {
  let t = Math.max(0, s);
  for (const seg of schedule.segments) {
    if (t < seg.dur) {
      if (seg.type === "glide") {
        return { leg: seg.leg, legT: t / seg.dur, dwellLeft: 0, phase: "glide" };
      }
      return { leg: seg.leg, legT: 1, dwellLeft: seg.dur - t, phase: "dwell" };
    }
    t -= seg.dur;
  }
  return { leg: schedule.segments.length / 2, legT: 1, dwellLeft: 0, phase: "outro" };
}

// Daily-life POI categories (data category values) -> [label, kinds].
export const DAILY_CATEGORIES = [
  { label: "지하철역", categories: new Set(["railway:station", "railway:subway_station", "public_transport:station"]) },
  { label: "학교", categories: new Set(["amenity:school"]) },
  { label: "슈퍼·편의점", categories: new Set(["shop:supermarket", "shop:convenience"]) },
  { label: "공원", categories: new Set(["leisure:park"]) },
  { label: "병원·약국", categories: new Set(["amenity:clinic", "amenity:pharmacy", "amenity:doctors", "amenity:dentist"]) },
];

export function nearestNode(lon, lat, nodes) {
  const id = nearestNodeIn(nodes, lon, lat);
  if (id === null) return { id: null, distM: Infinity };
  const pt = nodes[id];
  return { id, distM: haversineM(lon, lat, pt[0], pt[1]) };
}

export function dijkstra(nodes, walkEdges, startId) {
  const dist = new Map([[startId, 0]]);
  const prev = new Map();
  const adj = new Map();
  for (const e of walkEdges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e);
  }
  // Binary-heap-free Dijkstra is O(V^2); scene graphs are small enough
  // (<= ~25k nodes), but use a simple priority queue anyway.
  const pq = new MinHeap();
  pq.push(startId, 0);
  const settled = new Set();
  while (pq.size > 0) {
    const [u, du] = pq.pop();
    if (settled.has(u)) continue;
    settled.add(u);
    for (const e of adj.get(u) || []) {
      const nd = du + (e.length_m || 0);
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { from: u, edge: e });
        pq.push(e.to, nd);
      }
    }
  }
  return { dist, prev };
}

class MinHeap {
  constructor() {
    this.keys = [];
    this.vals = [];
  }
  get size() {
    return this.keys.length;
  }
  push(key, val) {
    const { keys, vals } = this;
    keys.push(key);
    vals.push(val);
    let i = keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (vals[p] <= vals[i]) break;
      [keys[p], keys[i]] = [keys[i], keys[p]];
      [vals[p], vals[i]] = [vals[i], vals[p]];
      i = p;
    }
  }
  pop() {
    const { keys, vals } = this;
    const top = [keys[0], vals[0]];
    const lk = keys.pop();
    const lv = vals.pop();
    if (keys.length > 0) {
      keys[0] = lk;
      vals[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let m = i;
        if (l < keys.length && vals[l] < vals[m]) m = l;
        if (r < keys.length && vals[r] < vals[m]) m = r;
        if (m === i) break;
        [keys[m], keys[i]] = [keys[i], keys[m]];
        [vals[m], vals[i]] = [vals[i], vals[m]];
        i = m;
      }
    }
    return top;
  }
}

export function shortestPath(nodes, walkEdges, fromId, toId) {
  if (fromId === toId) return { nodeIds: [fromId], lengthM: 0 };
  const { dist, prev } = dijkstra(nodes, walkEdges, fromId);
  if (!dist.has(toId)) return null;
  const nodeIds = [toId];
  let cur = toId;
  while (cur !== fromId) {
    cur = prev.get(cur).from;
    nodeIds.push(cur);
  }
  nodeIds.reverse();
  return { nodeIds, lengthM: dist.get(toId) };
}

export function minutesFor(meters) {
  return meters / WALK_MPS / 60;
}

// Rank complexes: named first, then by max floors, size, name.
export function rankComplexes(complexes) {
  return [...complexes].sort((a, b) => {
    const an = a.name ? 0 : 1;
    const bn = b.name ? 0 : 1;
    if (an !== bn) return an - bn;
    const af = a.max_floors || 0;
    const bf = b.max_floors || 0;
    if (af !== bf) return bf - af;
    if (a.building_ids.length !== b.building_ids.length) {
      return b.building_ids.length - a.building_ids.length;
    }
    return (a.name || a.id).localeCompare(b.name || b.id, "ko");
  });
}

function poiPoint(poi) {
  return poi.geometry.coordinates; // Point [lon, lat]
}

// Daily-life POIs grouped by label, each entry {label, name, lon, lat, category}.
export function dailyPlaces(area) {
  const out = [];
  for (const poi of area.pois || []) {
    for (const group of DAILY_CATEGORIES) {
      if (group.categories.has(poi.category)) {
        const [lon, lat] = poiPoint(poi);
        out.push({ label: group.label, name: poi.name, lon, lat,
                   category: poi.category });
        break;
      }
    }
  }
  // Parks also exist as landuse polygons (named green areas without a POI
  // node); add their centroids as fallback park candidates.
  const parkNames = new Set(out.filter((p) => p.label === "공원").map((p) => p.name));
  for (const feat of area.landuse || []) {
    if (feat.kind !== "leisure:park" || !feat.name || parkNames.has(feat.name)) continue;
    const c = polygonCentroid(feat.geometry);
    if (c) out.push({ label: "공원", name: feat.name, lon: c[0], lat: c[1],
                      category: "leisure:park" });
  }
  return out;
}

function polygonCentroid(geometry) {
  // Mean of outer-ring vertices (good enough for a tour anchor).
  let ring = null;
  if (geometry.type === "Polygon") ring = geometry.coordinates[0];
  else if (geometry.type === "MultiPolygon") {
    ring = geometry.coordinates.reduce((a, b) => (a[0].length >= b[0].length ? a : b))[0];
  }
  if (!ring || ring.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

// Greedy tour: start at the top complex, then repeatedly go to the
// nearest unvisited candidate (complex or daily place) with a real walk
// path, preferring unused daily-life labels for variety.
export function selectTourStops(area) {
  const nodes = area.graph.nodes;
  const walkEdges = area.graph.edges.walk;
  const complexes = rankComplexes(area.complexes || []);
  if (complexes.length === 0) return { stops: [], totalM: 0, totalMin: 0 };

  const candidates = [];
  for (const c of complexes.slice(0, 12)) {
    candidates.push({ kind: "complex", key: c.id, name: c.name || "이름 없는 단지",
                      label: "아파트 단지", lon: c.centroid[0], lat: c.centroid[1],
                      category: "complex", ref: c });
  }
  for (const p of dailyPlaces(area)) {
    candidates.push({ kind: "poi", key: `poi:${p.category}:${p.name}:${p.lon},${p.lat}`,
                      name: p.name, label: p.label, lon: p.lon, lat: p.lat,
                      category: p.category, ref: p });
  }
  // Anchor every candidate to the walk graph (skip graph-less outliers).
  const anchored = [];
  for (const c of candidates) {
    const n = nearestNode(c.lon, c.lat, nodes);
    if (n.id === null || n.distM > 500) continue;
    anchored.push({ ...c, nodeId: n.id });
  }
  const complexCands = anchored.filter((c) => c.kind === "complex");
  if (complexCands.length === 0) return { stops: [], totalM: 0, totalMin: 0 };

  // Start at the complex reaching the most candidates (rank breaks ties),
  // so an isolated fragment never strands the tour on a 2-stop island.
  let start = complexCands[0];
  let startReach = -1;
  for (const c of complexCands) {
    const { dist } = dijkstra(nodes, walkEdges, c.nodeId);
    const reach = anchored.filter((o) => dist.get(o.nodeId) !== undefined).length;
    if (reach > startReach) {
      startReach = reach;
      start = c;
    }
  }

  const stops = [{ ...start, legLengthM: 0, legMinutes: 0, pathNodeIds: [start.nodeId] }];
  const used = new Set([start.key]);
  const usedLabels = new Set();
  let totalM = 0;

  while (stops.length < MAX_STOPS) {
    const from = stops[stops.length - 1];
    const { dist } = dijkstra(nodes, walkEdges, from.nodeId);
    let best = null;
    let bestD = Infinity;
    // Pass 1: unused daily-life labels (variety); pass 2: anything.
    for (const pass of [0, 1]) {
      for (const c of anchored) {
        if (used.has(c.key)) continue;
        if (pass === 0 && (c.kind !== "poi" || usedLabels.has(c.label))) continue;
        const d = dist.get(c.nodeId);
        if (d === undefined) continue;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best) break;
    }
    if (!best) break;
    const path = shortestPath(nodes, walkEdges, from.nodeId, best.nodeId);
    if (!path) break; // unreachable (should not happen after dijkstra)
    used.add(best.key);
    if (best.kind === "poi") usedLabels.add(best.label);
    totalM += path.lengthM;
    stops.push({ ...best, legLengthM: path.lengthM,
                 legMinutes: minutesFor(path.lengthM),
                 pathNodeIds: path.nodeIds });
  }
  if (stops.length < MIN_STOPS) {
    // Too few connected stops: still return what exists (honest tour).
  }
  return { stops, totalM, totalMin: minutesFor(totalM) };
}

// Resample a stop-to-stop node path to world waypoints every ~stepM.
export function pathWaypoints(pathNodeIds, nodes, origin, lonLatToWorld, stepM = 8) {
  const pts = pathNodeIds.map((id) => nodes[id]);
  const waypoints = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [lon1, lat1] = pts[i];
    const [lon2, lat2] = pts[i + 1];
    const segLen = haversineM(lon1, lat1, lon2, lat2);
    const n = Math.max(1, Math.round(segLen / stepM));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      waypoints.push(lonLatToWorld(lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t, origin));
    }
  }
  return waypoints;
}
