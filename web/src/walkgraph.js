// Region walk-graph client (13, Part 8). The pipeline step
// `walkgraph` writes data/build/walkgraph/<region>.json: OSM footways,
// streets and crossings (no buildings) from the region extracts.
// find_homes uses walkMinutesToStation() for any home outside the 3D
// boxes; "도보 미확인" only when the graph can't reach a station.
// Pure; tested in walkgraph-13.test.js.

export const WALK_MPS = 1.3;

// graph: {nodes: {id: [lon, lat]}, edges: {walk: [{from, to, length_m}]},
//         stations: {name: nodeId}}
export function nearestNode(graph, lon, lat) {
  return nearestNodeIn((graph && graph.nodes) || {}, lon, lat);
}

// Grid index for nearest-node queries (26g). The US area has ~46k graph
// nodes; the linear scan on every pedestrian/station/destination call hung
// the 3D view for ~116 s. The index is built lazily once per `nodes`
// object (WeakMap key) and the ring query returns exactly what the linear
// scan would: nearest by squared degrees, first in Object.entries order
// wins ties. Graphs under GRID_MIN_NODES keep the linear code path.
const GRID_CELL = 0.002; // ~200 m
const GRID_MIN_NODES = 2000;
const gridCache = new WeakMap();

function linearNearestId(entries, lon, lat) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < entries.length; i++) {
    const c = entries[i][1];
    const d = (c[0] - lon) ** 2 + (c[1] - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = entries[i][0];
    }
  }
  return best;
}

function buildGrid(entries) {
  const cells = new Map();
  let minCx = Infinity;
  let maxCx = -Infinity;
  let minCy = Infinity;
  let maxCy = -Infinity;
  for (let i = 0; i < entries.length; i++) {
    const c = entries[i][1];
    const cx = Math.floor(c[0] / GRID_CELL);
    const cy = Math.floor(c[1] / GRID_CELL);
    // Non-finite coords never win the linear scan either; skip them.
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    if (cx < minCx) minCx = cx;
    if (cx > maxCx) maxCx = cx;
    if (cy < minCy) minCy = cy;
    if (cy > maxCy) maxCy = cy;
    const key = cx + "," + cy;
    let arr = cells.get(key);
    if (!arr) {
      arr = [];
      cells.set(key, arr);
    }
    arr.push([entries[i][0], c[0], c[1], i]);
  }
  return { cells, count: entries.length, minCx, maxCx, minCy, maxCy };
}

// Exact nearest node id by squared-degree distance (same result and
// tie-break as the linear scan). Shared by walkgraph, tour and walkers.
export function nearestNodeIn(nodes, lon, lat) {
  const cached = nodes && typeof nodes === "object" ? gridCache.get(nodes) : undefined;
  if (cached) return queryGrid(cached, lon, lat);
  const entries = Object.entries(nodes || {});
  const n = entries.length;
  if (n === 0) return null;
  if (n < GRID_MIN_NODES) return linearNearestId(entries, lon, lat);
  const g = buildGrid(entries);
  g.entries = entries;
  gridCache.set(nodes, g);
  return queryGrid(g, lon, lat);
}

function queryGrid(g, lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return linearNearestId(g.entries, lon, lat);
  }
  if (g.cells.size === 0) return null;
  const qcx = Math.floor(lon / GRID_CELL);
  const qcy = Math.floor(lat / GRID_CELL);
  const ax = Math.min(lon - qcx * GRID_CELL, (qcx + 1) * GRID_CELL - lon);
  const ay = Math.min(lat - qcy * GRID_CELL, (qcy + 1) * GRID_CELL - lat);
  let best = null;
  let bestD = Infinity;
  let bestOrder = Infinity;
  const visit = (cx, cy) => {
    const arr = g.cells.get(cx + "," + cy);
    if (!arr) return;
    for (let k = 0; k < arr.length; k++) {
      const e = arr[k];
      const d = (e[1] - lon) ** 2 + (e[2] - lat) ** 2;
      if (d < bestD || (d === bestD && e[3] < bestOrder)) {
        bestD = d;
        best = e[0];
        bestOrder = e[3];
      }
    }
  };
  // Rings inside the Chebyshev distance to the grid bbox are empty.
  let r = 0;
  if (qcx < g.minCx || qcx > g.maxCx || qcy < g.minCy || qcy > g.maxCy) {
    const dx = qcx < g.minCx ? g.minCx - qcx : qcx > g.maxCx ? qcx - g.maxCx : 0;
    const dy = qcy < g.minCy ? g.minCy - qcy : qcy > g.maxCy ? qcy - g.maxCy : 0;
    r = Math.max(dx, dy);
  }
  for (;; r++) {
    const xLo = Math.max(qcx - r, g.minCx);
    const xHi = Math.min(qcx + r, g.maxCx);
    const yLo = Math.max(qcy - r, g.minCy);
    const yHi = Math.min(qcy + r, g.maxCy);
    if (xLo <= xHi && yLo <= yHi) {
      if (qcy - r >= yLo && qcy - r <= yHi) {
        for (let cx = xLo; cx <= xHi; cx++) visit(cx, qcy - r);
      }
      if (r > 0 && qcy + r >= yLo && qcy + r <= yHi) {
        for (let cx = xLo; cx <= xHi; cx++) visit(cx, qcy + r);
      }
      const cyFrom = Math.max(yLo, qcy - r + 1);
      const cyTo = Math.min(yHi, qcy + r - 1);
      if (qcx - r >= xLo && qcx - r <= xHi) {
        for (let cy = cyFrom; cy <= cyTo; cy++) visit(qcx - r, cy);
      }
      if (r > 0 && qcx + r >= xLo && qcx + r <= xHi) {
        for (let cy = cyFrom; cy <= cyTo; cy++) visit(qcx + r, cy);
      }
    }
    // Nearest unsearched point is min() (not hypot) of the edge gaps;
    // stop only when no unsearched cell can tie or beat bestD.
    const gap = Math.min(r * GRID_CELL + ax, r * GRID_CELL + ay);
    if (gap * gap > bestD) break;
    if (qcx - r <= g.minCx && qcx + r >= g.maxCx
        && qcy - r <= g.minCy && qcy + r >= g.maxCy) break;
  }
  return best;
}

function adjacency(graph) {
  const adj = new Map();
  const walks = (graph && graph.edges && graph.edges.walk) || [];
  for (const e of walks) {
    if (!e.from || !e.to || !Number.isFinite(e.length_m)) continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push([e.to, e.length_m]);
    adj.get(e.to).push([e.from, e.length_m]);
  }
  return adj;
}

export function dijkstra(graph, startId) {
  const adj = adjacency(graph);
  const dist = new Map([[startId, 0]]);
  const prev = new Map();
  const heap = [[0, startId]];
  while (heap.length > 0) {
    heap.sort((a, b) => a[0] - b[0]);
    const [d, node] = heap.shift();
    if (d > dist.get(node)) continue;
    for (const [nxt, w] of adj.get(node) || []) {
      const nd = d + w;
      if (nd < (dist.get(nxt) ?? Infinity)) {
        dist.set(nxt, nd);
        prev.set(nxt, node);
        heap.push([nd, nxt]);
      }
    }
  }
  return { dist, prev };
}

export function walkMinutesToStation(graph, lon, lat, stationName, walkMps = WALK_MPS) {
  const stations = (graph && graph.stations) || {};
  const target = stations[stationName];
  if (!target) return { minutes: null, reachable: false, reason: "no-station-node" };
  const start = nearestNode(graph, lon, lat);
  if (!start) return { minutes: null, reachable: false, reason: "no-nodes" };
  const { dist, prev } = dijkstra(graph, start);
  if (!dist.has(target)) {
    return { minutes: null, reachable: false, reason: "unreachable" };
  }
  const path = [target];
  let cur = target;
  while (cur !== start) {
    cur = prev.get(cur);
    if (!cur) break;
    path.push(cur);
  }
  path.reverse();
  return {
    minutes: Math.round((dist.get(target) / walkMps / 60) * 10) / 10,
    reachable: true,
    reason: null,
    path,
    distanceM: Math.round(dist.get(target)),
  };
}

// Nearest station by graph walk (used when the home record has no
// station yet). Returns {station, minutes, path} or null.
export function nearestStationByWalk(graph, lon, lat, walkMps = WALK_MPS) {
  const stations = (graph && graph.stations) || {};
  const names = Object.keys(stations);
  if (names.length === 0) return null;
  const start = nearestNode(graph, lon, lat);
  if (!start) return null;
  const { dist, prev } = dijkstra(graph, start);
  let best = null;
  for (const name of names) {
    const node = stations[name];
    if (!dist.has(node)) continue;
    const mins = dist.get(node) / walkMps / 60;
    if (!best || mins < best.minutes) {
      const path = [node];
      let cur = node;
      while (cur !== start) {
        cur = prev.get(cur);
        if (!cur) break;
        path.push(cur);
      }
      path.reverse();
      best = { station: name, minutes: Math.round(mins * 10) / 10, path };
    }
  }
  return best;
}
