// Procedural ambient pedestrians (pure, no three.js).
//
// Each walker owns a seeded home→destination route over the walk
// graph (routed once at build, held for the session) and walks it
// out-and-back: position at t is arc length (phase + speed·t) mod
// round length. Counts follow the 가정값 density curve; station-bound
// walkers additionally scale with the observed station congestion
// (서울교통공사, labelled 실측 혼잡도 기반) where the table covers
// the box station — otherwise 1.0 (가정값).
//
// These are ambient extras. Household members keep their
// scenario-driven journeys (sim.js sampleAgent) and are never
// replaced by this crowd.

import { CONGESTION_SOURCE, normalizeStation,
  slotIndexFor } from "../engine/journey.js";
import { nearestNode } from "../walkgraph.js";
import { PED_CURVE, factorAt } from "./density.js";
import { streamFrom } from "./rng.js";

export const PED_SOURCE = "가정값";
export const CROWD_CONGESTION_LABEL = "실측 혼잡도 기반";
export const MAX_PEDS_HIGH = 1500;
export const MAX_PEDS_LOW = 750;
export const PED_MPS = 1.3;
export const STATION_SHARE = 0.5; // half the crowd heads for the station

// Quality caps: full on high, half on low (medium between).
export function pedCapFor(quality) {
  if (quality === "low") return MAX_PEDS_LOW;
  if (quality === "medium") return 1100;
  return MAX_PEDS_HIGH;
}

const COATS = [0x5a6e8c, 0x8c5a5a, 0x5a8c6e, 0x777788, 0xb25a33, 0x3d5a5a];

function isShopPoi(p) {
  return /^(shop|amenity):/.test(p.category || "");
}

function isParkPoi(p) {
  return /park|garden|playground/i.test(p.category || "");
}

function anchorOf(building) {
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

function nodeLonLat(nodes, id) {
  const p = nodes[id];
  return p ? [p[0], p[1]] : null;
}

// Mean observed congestion (%) at `station` for the 30-minute slot
// containing `minute`, across serving lines and directions; scale
// clamps to [0.4, 1.5]. No table entry → scale 1 (가정값).
export function stationCongestionScale(congestion, { dayKind, station, minute }) {
  const none = { scale: 1, hasData: false, source: PED_SOURCE, valuePct: null };
  const slots = (congestion && congestion.slots) || [];
  const day = ((congestion && congestion.days) || {})[dayKind] || {};
  const want = normalizeStation(station);
  if (!want || slots.length === 0) return none;
  const idx = slotIndexFor(minute, slots);
  const vals = [];
  for (const lines of Object.values(day)) {
    for (const [name, dirs] of Object.entries(lines || {})) {
      if (normalizeStation(name) !== want) continue;
      for (const arr of Object.values(dirs || {})) {
        if (Array.isArray(arr) && idx >= 0 && idx < arr.length
            && arr[idx] !== null && Number.isFinite(arr[idx])) {
          vals.push(arr[idx]);
        }
      }
    }
  }
  if (vals.length === 0) return none;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    scale: Math.min(1.5, Math.max(0.4, mean / 100)),
    hasData: true,
    source: CONGESTION_SOURCE,
    valuePct: Math.round(mean * 10) / 10,
  };
}

// Binary-heap Dijkstra on the walk edges (undirected), rooted at the
// destination, stopping once every wanted origin settles. One run
// routes the whole crowd for that destination (walkgraph.js keeps its
// own simpler version for one-off lookups).
function dijkstraFromDest(walkAdj, destNode, want) {
  const dist = new Map([[destNode, 0]]);
  const prev = new Map();
  const settled = new Set();
  const heapD = [0];
  const heapN = [destNode];
  const swap = (i, j) => {
    const td = heapD[i];
    heapD[i] = heapD[j];
    heapD[j] = td;
    const tn = heapN[i];
    heapN[i] = heapN[j];
    heapN[j] = tn;
  };
  const push = (d, n) => {
    heapD.push(d);
    heapN.push(n);
    let i = heapD.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapD[p] <= heapD[i]) break;
      swap(p, i);
      i = p;
    }
  };
  const pop = () => {
    const top = heapN[0];
    const lastD = heapD.pop();
    const lastN = heapN.pop();
    if (heapD.length > 0) {
      heapD[0] = lastD;
      heapN[0] = lastN;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heapD.length && heapD[l] < heapD[m]) m = l;
        if (r < heapD.length && heapD[r] < heapD[m]) m = r;
        if (m === i) break;
        swap(m, i);
        i = m;
      }
    }
    return top;
  };
  let remaining = want ? want.size : 0;
  if (want && want.has(destNode)) remaining--;
  while (heapD.length > 0) {
    const node = pop();
    if (settled.has(node)) continue;
    settled.add(node);
    if (want && want.has(node) && --remaining <= 0) {
      // All origins settled — but keep prev/dist as built so far.
      // (Only exact when every wanted node settled: true here.)
      break;
    }
    const d = dist.get(node);
    for (const [nxt, w] of walkAdj.get(node) || []) {
      const nd = d + w;
      if (nd < (dist.get(nxt) ?? Infinity)) {
        dist.set(nxt, nd);
        prev.set(nxt, node);
        push(nd, nxt);
      }
    }
  }
  return { dist, prev };
}

function walkAdjacency(graph) {
  const adj = new Map();
  for (const e of (graph && graph.edges && graph.edges.walk) || []) {
    if (!e.from || !e.to || !Number.isFinite(e.length_m)) continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push([e.to, e.length_m]);
    adj.get(e.to).push([e.from, e.length_m]);
  }
  return adj;
}

// One Dijkstra per unique destination (the graph is undirected, so a
// dest-rooted tree routes every origin). Returns node-id paths.
function routeFromDest(adj, destNode, originNode, want, cache) {
  let tree = cache.get(destNode);
  if (!tree) {
    tree = dijkstraFromDest(adj, destNode, want);
    cache.set(destNode, tree);
  }
  if (!tree.dist.has(originNode)) return null;
  const path = [originNode];
  let cur = originNode;
  while (cur !== destNode) {
    cur = tree.prev.get(cur);
    if (!cur) return null;
    path.push(cur);
  }
  return path;
}

function pickDestinations({ graph, pois, station, rng }) {
  const shops = (pois || []).filter(isShopPoi);
  const parks = (pois || []).filter(isParkPoi);
  const take = (list, n) => {
    const idx = list.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, Math.min(n, idx.length)).map((i) => list[i]);
  };
  const dests = [];
  if (station && Number.isFinite(station.lon)) {
    const node = nearestNode(graph, station.lon, station.lat);
    if (node) dests.push({ node, group: 0 });
  }
  for (const p of take(shops, 8)) {
    const c = p.geometry && p.geometry.coordinates;
    if (!c) continue;
    const node = nearestNode(graph, c[0], c[1]);
    if (node) dests.push({ node, group: 1 });
  }
  for (const p of take(parks, 8)) {
    const c = p.geometry && p.geometry.coordinates;
    if (!c) continue;
    const node = nearestNode(graph, c[0], c[1]);
    if (node) dests.push({ node, group: 1 });
  }
  return dests;
}

// Build the crowd once per (box, seed): seeded OD pairs routed on
// the walk graph. Station-group walkers come first (stable ids).
export function buildCrowd({ graph, buildings, pois, station, seed,
    maxPeds = MAX_PEDS_HIGH }) {
  const rng = streamFrom("peds", seed);
  const nodes = (graph && graph.nodes) || {};
  const homes = (buildings || [])
    .filter((b) => b.geometry && (b.geometry.type === "Polygon"
      || b.geometry.type === "MultiPolygon"))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const homeNodes = [];
  for (const b of homes) {
    const [lon, lat] = anchorOf(b);
    const node = nearestNode(graph, lon, lat);
    if (node) homeNodes.push(node);
  }
  const dests = pickDestinations({ graph, pois, station, rng });
  const stationDests = dests.filter((d) => d.group === 0);
  const ambientDests = dests.filter((d) => d.group === 1);
  const adj = walkAdjacency(graph);
  const want = new Set(homeNodes);
  const cache = new Map();
  const stationWalkers = [];
  const ambientWalkers = [];
  const wantStation = Math.round(maxPeds * STATION_SHARE);
  let guard = maxPeds * 6 + 50;
  while ((stationWalkers.length < wantStation
      || stationWalkers.length + ambientWalkers.length < maxPeds)
      && guard-- > 0 && homeNodes.length > 0 && dests.length > 0) {
    const wantGroup0 = stationWalkers.length < wantStation
      && (ambientWalkers.length >= maxPeds - wantStation || rng() < STATION_SHARE);
    const pool = wantGroup0 && stationDests.length > 0 ? stationDests
      : ambientDests.length > 0 ? ambientDests : stationDests;
    if (pool.length === 0) break;
    const dest = pool[Math.floor(rng() * pool.length)];
    const origin = homeNodes[Math.floor(rng() * homeNodes.length)];
    if (origin === dest.node) continue;
    const path = routeFromDest(adj, dest.node, origin, want, cache);
    if (!path || path.length < 2) continue;
    // Out-and-back: forward nodes + reversed (joint deduped).
    const round = path.concat(path.slice(0, -1).reverse());
    const n = round.length;
    const lons = new Float64Array(n);
    const lats = new Float64Array(n);
    const cum = new Float64Array(n);
    let ok = true;
    for (let i = 0; i < n; i++) {
      const p = nodeLonLat(nodes, round[i]);
      if (!p) {
        ok = false;
        break;
      }
      lons[i] = p[0];
      lats[i] = p[1];
      // Degrees→metres near 37°N for arclength (engine frame scale).
      const mx = 111320 * Math.cos(37.5 * Math.PI / 180);
      const my = 111320;
      cum[i] = i === 0 ? 0 : cum[i - 1]
        + Math.hypot((lons[i] - lons[i - 1]) * mx, (lats[i] - lats[i - 1]) * my);
    }
    if (!ok || !(cum[n - 1] > 1)) continue;
    const w = {
      group: dest.group, nodes: round, lons, lats, cum, length: cum[n - 1],
      phase: rng() * cum[n - 1],
      speed: PED_MPS * (0.85 + rng() * 0.3),
      color: COATS[Math.floor(rng() * COATS.length)],
    };
    (dest.group === 0 ? stationWalkers : ambientWalkers).push(w);
  }
  const walkers = stationWalkers.concat(ambientWalkers).slice(0, maxPeds);
  return {
    seed, walkers, maxActive: walkers.length,
    stationCount: walkers.filter((w) => w.group === 0).length,
    routedDests: cache.size,
  };
}

export function allocPedState(max) {
  return { data: new Float64Array(Math.max(max, 1) * 3),
    ids: new Uint16Array(Math.max(max, 1)) };
}

// Pure state at sim minute tMin: [lon, lat, heading] rows + ids.
// Station-group actives scale with congScale (실측 where backed).
export function pedsAt(crowd, tMin, out, { congScale = 1, cap = Infinity } = {}) {
  const tSec = tMin * 60;
  const factor = factorAt(PED_CURVE, tMin);
  const S = crowd.stationCount;
  const A = crowd.walkers.length - S;
  const wantS = Math.min(S, Math.round(S * factor * congScale));
  const wantA = Math.min(A, Math.round(A * factor));
  const { data, ids } = out;
  let w = 0;
  const emit = (v, id) => {
    let s = (v.phase + v.speed * tSec) % v.length;
    if (s < 0) s += v.length;
    const { lons, lats, cum } = v;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const span = cum[lo + 1] - cum[lo] || 1;
    const f = (s - cum[lo]) / span;
    const dLon = lons[lo + 1] - lons[lo];
    const dLat = lats[lo + 1] - lats[lo];
    data[w * 3] = lons[lo] + dLon * f;
    data[w * 3 + 1] = lats[lo] + dLat * f;
    data[w * 3 + 2] = Math.atan2(dLat, dLon);
    ids[w] = id;
    w++;
  };
  for (let j = 0; j < wantS && w < cap; j++) emit(crowd.walkers[j], j);
  for (let j = 0; j < wantA && w < cap; j++) emit(crowd.walkers[S + j], S + j);
  return w;
}

export function crowdCounts(crowd, { minute, congScale = 1, cap = Infinity } = {}) {
  const factor = factorAt(PED_CURVE, minute);
  const S = crowd.stationCount;
  const A = crowd.walkers.length - S;
  const station = Math.min(S, Math.round(S * factor * congScale));
  const ambient = Math.min(A, Math.round(A * factor));
  return { active: Math.min(station + ambient, cap), station, ambient, factor };
}
