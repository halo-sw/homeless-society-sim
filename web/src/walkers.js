// Preview residents (pure, no three.js; stage 3 builds the real engine).
//
// assignWalkers picks ~30 apartment buildings, anchors each to the nearest
// walk-graph node, and gives it a seeded random route along walk edges.
// sampleWalker interpolates a walker's position at time t (seconds) at
// walking speed. All randomness comes from a mulberry32 stream, so the
// same seed replays the same preview. Simulated residents are labelled
// as simulated in the UI.

import { haversineM } from "./frame.js";
import { WALK_MPS } from "./tour.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nearestWalkNode(lon, lat, nodes) {
  let best = null;
  let bestD = Infinity;
  for (const [id, pt] of Object.entries(nodes)) {
    const d = haversineM(lon, lat, pt[0], pt[1]);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return { id: best, distM: bestD };
}

function buildingAnchor(building) {
  // Mean of the outer ring (departure point near the entrance side).
  const g = building.geometry;
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0][0];
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

// Random loop route: seeded random walk over directed walk edges.
function randomRoute(startId, adj, rng, hops = 24) {
  const route = [startId];
  let cur = startId;
  for (let i = 0; i < hops; i++) {
    const outs = adj.get(cur) || [];
    if (outs.length === 0) break;
    const next = outs[Math.floor(rng() * outs.length)].to;
    route.push(next);
    cur = next;
  }
  if (route[route.length - 1] !== startId) route.push(startId); // close loop when trivial
  return route.length >= 2 ? route : [startId, startId];
}

export function assignWalkers(buildings, graph, opts = {}) {
  const { count = 30, seed = 20261028, maxAnchorM = 150 } = opts;
  const nodes = graph.nodes;
  const adj = new Map();
  for (const e of graph.edges.walk) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e);
  }
  const rng = mulberry32(seed);
  const apartments = buildings
    .filter((b) => b.residential === "apartment")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  // Seeded shuffle, then take the first `count` anchorable buildings.
  const order = [...apartments];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const walkers = [];
  for (const b of order) {
    if (walkers.length >= count) break;
    const [lon, lat] = buildingAnchor(b);
    const n = nearestWalkNode(lon, lat, nodes);
    if (n.id === null || n.distM > maxAnchorM) continue;
    const route = randomRoute(n.id, adj, rng);
    // Cumulative arclengths for constant-speed sampling.
    const cum = [0];
    for (let i = 0; i < route.length - 1; i++) {
      const a = nodes[route[i]];
      const bpt = nodes[route[i + 1]];
      cum.push(cum[cum.length - 1] + (a && bpt ? haversineM(a[0], a[1], bpt[0], bpt[1]) : 0));
    }
    walkers.push({ buildingId: b.id, startNode: n.id, route, cum,
                   lengthM: cum[cum.length - 1],
                   phase: rng() * 1000, speed: WALK_MPS * (0.9 + rng() * 0.2) });
  }
  return walkers;
}

// Position (lon/lat + heading radians, 0 = east, CCW in lon/lat plane)
// of a walker at time t seconds; loops forever.
export function sampleWalker(walker, nodes, t) {
  const total = walker.lengthM;
  if (total <= 0 || walker.route.length < 2) {
    const p = nodes[walker.route[0]];
    return { lon: p[0], lat: p[1], heading: 0 };
  }
  let s = (walker.phase + t * walker.speed) % total;
  if (s < 0) s += total;
  const { route, cum } = walker;
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < s) i++;
  const segLen = cum[i + 1] - cum[i] || 1;
  const f = (s - cum[i]) / segLen;
  const a = nodes[route[i]];
  const b = nodes[route[i + 1]];
  return {
    lon: a[0] + (b[0] - a[0]) * f,
    lat: a[1] + (b[1] - a[1]) * f,
    heading: Math.atan2(b[1] - a[1], b[0] - a[0]),
  };
}
