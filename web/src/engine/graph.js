// Walk-graph routing for the life engine (pure, no three.js).
//
// Router builds the directed adjacency once from one mode's edges
// (walk by default, e.g. { mode: "bike" } for the bike graph), then
// answers route(fromId, toId) with Dijkstra over length_m. Results are
// cached per source node (one Dijkstra per source) and per node pair,
// so a 30-day run pays at most one shortest-path computation per
// distinct trip endpoint. nearestNode anchors a lon/lat to the graph
// with haversine proximity; that heuristic is a lookup only — no
// reported number (trip minutes, distances, option values) ever uses a
// straight-line distance.

import { haversineM } from "../frame.js";

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

export class Router {
  constructor(graph, { mode = "walk" } = {}) {
    this.nodes = graph.nodes || {};
    this.adj = new Map();
    for (const e of (graph.edges || {})[mode] || []) {
      if (!this.adj.has(e.from)) this.adj.set(e.from, []);
      this.adj.get(e.from).push(e);
    }
    // Deterministic relaxation order: parallel edges settle identically
    // on every run (insertion order is already stable, this pins it).
    for (const outs of this.adj.values()) {
      outs.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : (a.length_m || 0) - (b.length_m || 0)));
    }
    this.sourceCache = new Map(); // sourceId -> {dist, prev}
    this.pairCache = new Map(); // "from>to" -> {nodeIds, lengthM} | null
    this.dijkstraCalls = 0; // instrumentation (tests + CLI counts)
  }

  distFrom(sourceId) {
    let hit = this.sourceCache.get(sourceId);
    if (hit) return hit;
    const dist = new Map([[sourceId, 0]]);
    const prev = new Map();
    const pq = new MinHeap();
    pq.push(sourceId, 0);
    const settled = new Set();
    while (pq.size > 0) {
      const [u, du] = pq.pop();
      if (settled.has(u)) continue;
      settled.add(u);
      for (const e of this.adj.get(u) || []) {
        const nd = du + (e.length_m || 0);
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd);
          prev.set(e.to, u);
          pq.push(e.to, nd);
        }
      }
    }
    hit = { dist, prev };
    this.sourceCache.set(sourceId, hit);
    this.dijkstraCalls++;
    return hit;
  }

  // Shortest walk path, or null when unreachable. lengthM is the exact
  // length_m sum (callers round for output).
  route(fromId, toId) {
    if (fromId === toId) return { nodeIds: [fromId], lengthM: 0 };
    const key = `${fromId}>${toId}`;
    if (this.pairCache.has(key)) return this.pairCache.get(key);
    const { dist, prev } = this.distFrom(fromId);
    if (!dist.has(toId)) {
      this.pairCache.set(key, null);
      return null;
    }
    const nodeIds = [toId];
    let cur = toId;
    while (cur !== fromId) {
      cur = prev.get(cur);
      nodeIds.push(cur);
    }
    nodeIds.reverse();
    const out = { nodeIds, lengthM: dist.get(toId) };
    this.pairCache.set(key, out);
    return out;
  }

  // Graph anchor for a lon/lat (proximity lookup only, see header).
  nearestNode(lon, lat) {
    let best = null;
    let bestD = Infinity;
    for (const [id, pt] of Object.entries(this.nodes)) {
      const d = haversineM(lon, lat, pt[0], pt[1]);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return { id: best, distM: bestD };
  }
}
