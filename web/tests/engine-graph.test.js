import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Router } from "../src/engine/graph.js";
import { NODES, WALK } from "./engine-fixture.js";

const graph = () => ({ nodes: NODES, edges: { walk: WALK, bike: [], drive: [] } });

// Brute force: Floyd-Warshall over the directed fixture graph.
function floyd(nodes, edges) {
  const ids = Object.keys(nodes);
  const d = new Map();
  for (const i of ids) for (const j of ids) d.set(`${i}>${j}`, i === j ? 0 : Infinity);
  for (const e of edges) {
    const k = `${e.from}>${e.to}`;
    d.set(k, Math.min(d.get(k), e.length_m));
  }
  for (const k of ids) for (const i of ids) for (const j of ids) {
    const nd = d.get(`${i}>${k}`) + d.get(`${k}>${j}`);
    if (nd < d.get(`${i}>${j}`)) d.set(`${i}>${j}`, nd);
  }
  return d;
}

describe("engine router", () => {
  it("matches brute-force shortest paths on every pair", () => {
    const router = new Router(graph());
    const want = floyd(NODES, WALK);
    const edgeSet = new Set(WALK.map((e) => `${e.from}>${e.to}`));
    const edgeLen = new Map(WALK.map((e) => [`${e.from}>${e.to}`, e.length_m]));
    for (const from of Object.keys(NODES)) {
      for (const to of Object.keys(NODES)) {
        const got = router.route(from, to);
        const w = want.get(`${from}>${to}`);
        if (w === Infinity) {
          assert.equal(got, null, `${from}>${to} must be unreachable`);
        } else {
          assert.ok(got, `${from}>${to} must route`);
          assert.ok(Math.abs(got.lengthM - w) < 1e-9, `${from}>${to}: ${got.lengthM} vs ${w}`);
          assert.equal(got.nodeIds[0], from);
          assert.equal(got.nodeIds[got.nodeIds.length - 1], to);
          let sum = 0;
          for (let i = 0; i < got.nodeIds.length - 1; i++) {
            const k = `${got.nodeIds[i]}>${got.nodeIds[i + 1]}`;
            assert.ok(edgeSet.has(k), `path step ${k} must be a walk edge`);
            sum += edgeLen.get(k);
          }
          assert.ok(Math.abs(sum - got.lengthM) < 1e-9, "length is the edge sum");
        }
      }
    }
  });

  it("routes to self with zero length", () => {
    const router = new Router(graph());
    assert.deepEqual(router.route("a", "a"), { nodeIds: ["a"], lengthM: 0 });
  });

  it("caches per source: all pairs cost one Dijkstra each", () => {
    const router = new Router(graph());
    for (const from of Object.keys(NODES)) {
      for (const to of Object.keys(NODES)) router.route(from, to);
    }
    assert.equal(router.dijkstraCalls, Object.keys(NODES).length);
    for (const from of Object.keys(NODES)) {
      for (const to of Object.keys(NODES)) router.route(from, to);
    }
    assert.equal(router.dijkstraCalls, Object.keys(NODES).length);
  });

  it("anchors the nearest node", () => {
    const router = new Router(graph());
    assert.equal(router.nearestNode(127.0, 37.5).id, "a");
    assert.equal(router.nearestNode(127.003, 37.5).id, "d");
  });
});
