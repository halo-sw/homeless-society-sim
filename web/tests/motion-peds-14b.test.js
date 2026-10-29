import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allocPedState, buildCrowd, crowdCounts, pedsAt,
  stationCongestionScale, CROWD_CONGESTION_LABEL } from "../src/motion/pedestrians.js";

// a—b—c—d corridor with e/f spurs; all edges walkable both ways.
const NODES = {
  a: [127.0, 37.5], b: [127.001, 37.5], c: [127.002, 37.5], d: [127.003, 37.5],
  e: [127.001, 37.501], f: [127.003, 37.501],
};
const E = (from, to, length_m) => ({ from, to, length_m, highway: "footway" });
const GRAPH = {
  nodes: NODES,
  edges: { walk: [E("a", "b", 90), E("b", "c", 90), E("c", "d", 90),
    E("b", "e", 110), E("d", "f", 110)] },
};
const box = (lon, lat) => ({ type: "Polygon",
  coordinates: [[[lon, lat], [lon + 0.0001, lat], [lon + 0.0001, lat + 0.0001],
    [lon, lat + 0.0001], [lon, lat]]] });
const BUILDINGS = [
  { id: "h1", residential: "apartment", geometry: box(127.0, 37.4999) },
  { id: "h2", residential: "house", geometry: box(127.0029, 37.4999) },
  { id: "h3", residential: "apartment", geometry: box(127.0009, 37.5009) },
];
const POIS = [
  { category: "shop:mall", geometry: { type: "Point", coordinates: [127.003, 37.501] } },
  { category: "leisure:park", geometry: { type: "Point", coordinates: [127.001, 37.501] } },
];
const STATION = { name: "중앙", lon: 127.002, lat: 37.5 };

const CONGESTION = {
  slots: [330, 360],
  slot_labels: ["05:30~06:00", "06:00~06:30"],
  days: { weekday: { "1호선": { "중앙": { "상행": [50, 120], "하행": [40, 100] } } } },
};

function bytes(arr, count, stride = 3) {
  return Buffer.from(arr.buffer, 0, count * stride * arr.BYTES_PER_ELEMENT);
}

describe("14b procedural pedestrians", () => {
  it("routes every walker along walk edges out-and-back", () => {
    const crowd = buildCrowd({ graph: GRAPH, buildings: BUILDINGS,
      pois: POIS, station: STATION, seed: "box", maxPeds: 40 });
    assert.ok(crowd.walkers.length > 10);
    assert.ok(crowd.routedDests >= 1 && crowd.routedDests <= 3);
    const adj = new Map();
    for (const e of GRAPH.edges.walk) {
      if (!adj.has(e.from)) adj.set(e.from, new Set());
      if (!adj.has(e.to)) adj.set(e.to, new Set());
      adj.get(e.from).add(e.to);
      adj.get(e.to).add(e.from);
    }
    for (const w of crowd.walkers) {
      for (let i = 0; i + 1 < w.nodes.length; i++) {
        assert.ok(adj.get(w.nodes[i]).has(w.nodes[i + 1]),
          `${w.nodes[i]}→${w.nodes[i + 1]} is a walk edge`);
      }
      // Out-and-back: ends where it started.
      assert.equal(w.nodes[0], w.nodes[w.nodes.length - 1]);
    }
    // Both groups exist (station + shops/parks).
    assert.ok(crowd.stationCount > 0);
    assert.ok(crowd.stationCount < crowd.walkers.length);
  });
  it("gives byte-equal state for the same seed and t", () => {
    const a = buildCrowd({ graph: GRAPH, buildings: BUILDINGS,
      pois: POIS, station: STATION, seed: "box", maxPeds: 40 });
    const b = buildCrowd({ graph: GRAPH, buildings: BUILDINGS,
      pois: POIS, station: STATION, seed: "box", maxPeds: 40 });
    const sa = allocPedState(a.maxActive);
    const sb = allocPedState(b.maxActive);
    const na = pedsAt(a, 530, sa);
    const nb = pedsAt(b, 530, sb);
    assert.equal(na, nb);
    assert.ok(na > 0);
    assert.ok(bytes(sa.data, na).equals(bytes(sb.data, nb)));
    assert.ok(bytes(sa.ids, na, 1).equals(bytes(sb.ids, nb, 1)));
  });
  it("scrubs: playing to t equals jumping to t, ids stable", () => {
    const play = buildCrowd({ graph: GRAPH, buildings: BUILDINGS,
      pois: POIS, station: STATION, seed: "box", maxPeds: 40 });
    const sp = allocPedState(play.maxActive);
    for (let t = 0; t < 530; t += 10) pedsAt(play, t, sp);
    const np = pedsAt(play, 530, sp);
    const jump = buildCrowd({ graph: GRAPH, buildings: BUILDINGS,
      pois: POIS, station: STATION, seed: "box", maxPeds: 40 });
    const sj = allocPedState(jump.maxActive);
    const nj = pedsAt(jump, 530, sj);
    assert.equal(np, nj);
    assert.ok(bytes(sp.data, np).equals(bytes(sj.data, nj)));
    // Night actives are a stable prefix of rush actives.
    const sn = allocPedState(play.maxActive);
    const nn = pedsAt(play, 180, sn);
    for (let w = 0; w < nn; w++) assert.equal(sn.ids[w], sp.ids[w]);
  });
  it("scales station walkers by congestion, others by hour only", () => {
    const crowd = buildCrowd({ graph: GRAPH, buildings: BUILDINGS,
      pois: POIS, station: STATION, seed: "box", maxPeds: 40 });
    const rush = crowdCounts(crowd, { minute: 530 });
    const night = crowdCounts(crowd, { minute: 180 });
    assert.ok(rush.active > night.active);
    const busy = crowdCounts(crowd, { minute: 530, congScale: 1.5 });
    const calm = crowdCounts(crowd, { minute: 530, congScale: 0.4 });
    assert.ok(busy.station >= rush.station);
    assert.ok(calm.station <= rush.station);
    assert.equal(busy.ambient, rush.ambient);
    assert.equal(crowdCounts(crowd, { minute: 530, cap: 3 }).active, 3);
  });
  it("reads the observed congestion table or falls back to 가정값", () => {
    const hit = stationCongestionScale(CONGESTION,
      { dayKind: "weekday", station: "중앙", minute: 530 });
    assert.equal(hit.hasData, true);
    assert.equal(hit.source, "서울교통공사");
    // 530 lands in the last slot: mean(120, 100)/100 = 1.1.
    assert.equal(hit.valuePct, 110);
    assert.equal(hit.scale, 1.1);
    const miss = stationCongestionScale(CONGESTION,
      { dayKind: "weekday", station: "없는역", minute: 530 });
    assert.equal(miss.hasData, false);
    assert.equal(miss.scale, 1);
    assert.equal(miss.source, "가정값");
    const nodata = stationCongestionScale(null,
      { dayKind: "weekday", station: "중앙", minute: 530 });
    assert.equal(nodata.scale, 1);
    assert.equal(CROWD_CONGESTION_LABEL, "실측 혼잡도 기반");
  });
});
