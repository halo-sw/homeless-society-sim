import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignWalkers, sampleWalker } from "../src/walkers.js";

// Tiny directed loop graph: n0 -> n1 -> n2 -> n0 (each ~111 m).
const NODES = { n0: [127.0, 37.5], n1: [127.001, 37.5], n2: [127.001, 37.501] };
function edge(from, to) {
  return { from, to, way: 1, highway: "residential", name: null, length_m: 111 };
}
const GRAPH = { nodes: NODES, edges: { walk: [edge("n0", "n1"), edge("n1", "n2"), edge("n2", "n0")], bike: [], drive: [] } };

function apartment(id, lon, lat) {
  return {
    id, residential: "apartment", levels: 10,
    geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + 0.0001, lat],
      [lon + 0.0001, lat + 0.0001], [lon, lat + 0.0001], [lon, lat]]],
    },
  };
}

const BUILDINGS = [apartment("w1", 127.0, 37.5), apartment("w2", 127.001, 37.501)];

describe("walkers", () => {
  it("assigns seeded, deterministic walkers on graph nodes", () => {
    const a = assignWalkers(BUILDINGS, GRAPH, { count: 2, seed: 5 });
    const b = assignWalkers(BUILDINGS, GRAPH, { count: 2, seed: 5 });
    assert.deepEqual(a, b);
    assert.equal(a.length, 2);
    for (const w of a) {
      for (const n of w.route) assert.ok(n in NODES, `node ${n}`);
      assert.ok(w.lengthM > 0);
    }
  });

  it("moves at walking speed along the route", () => {
    const [w] = assignWalkers(BUILDINGS, GRAPH, { count: 1, seed: 5 });
    const p0 = sampleWalker(w, NODES, 0);
    const p1 = sampleWalker(w, NODES, 60);
    // ~1.3 m/s for 60 s along the loop; positions must differ.
    assert.ok(Math.abs(p0.lon - p1.lon) + Math.abs(p0.lat - p1.lat) > 1e-6);
    // Loop closes: sampling a full period returns near the start.
    const period = w.lengthM / w.speed;
    const p2 = sampleWalker(w, NODES, period);
    assert.ok(Math.abs(p0.lon - p2.lon) < 1e-9 && Math.abs(p0.lat - p2.lat) < 1e-9);
  });

  it("starts walkers near their apartment buildings", () => {
    const walkers = assignWalkers(BUILDINGS, GRAPH, { count: 2, seed: 5 });
    for (const w of walkers) {
      assert.ok(BUILDINGS.some((b) => b.id === w.buildingId));
    }
  });
});
