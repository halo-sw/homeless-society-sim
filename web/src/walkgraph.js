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
  const nodes = (graph && graph.nodes) || {};
  let best = null;
  let bestD = Infinity;
  for (const [id, c] of Object.entries(nodes)) {
    const d = (c[0] - lon) ** 2 + (c[1] - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
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
