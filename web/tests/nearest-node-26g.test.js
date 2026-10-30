import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nearestNode, nearestNodeIn } from "../src/walkgraph.js";
import { nearestNode as tourNearestNode } from "../src/tour.js";

// Seeded LCG (deterministic; no Math.random).
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}

// Reference: today's walkgraph linear scan, copied verbatim.
function referenceNearest(nodes, lon, lat) {
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

function randomNodes(count, seed, lon0, lon1, lat0, lat1) {
  const rng = lcg(seed);
  const nodes = {};
  for (let i = 0; i < count; i++) {
    nodes["n" + i] = [lon0 + rng() * (lon1 - lon0), lat0 + rng() * (lat1 - lat0)];
  }
  return nodes;
}

describe("nearest-node grid index (26g)", () => {
  it("matches the linear scan on 5,000 nodes, inside and outside the box", () => {
    const nodes = randomNodes(5000, 26, 127.0, 127.07, 37.3, 37.35);
    const graph = { nodes };
    const rng = lcg(7);
    for (let q = 0; q < 300; q++) {
      // Half inside the box, half in a ±0.03° margin outside it.
      const pad = q % 2 === 0 ? 0 : 0.03;
      const lon = 127.0 - pad + rng() * (0.07 + 2 * pad);
      const lat = 37.3 - pad + rng() * (0.05 + 2 * pad);
      const want = referenceNearest(nodes, lon, lat);
      assert.equal(nearestNode(graph, lon, lat), want, `query ${q}`);
      assert.equal(nearestNodeIn(nodes, lon, lat), want, `query ${q}`);
      assert.equal(tourNearestNode(lon, lat, nodes).id, want, `query ${q}`);
    }
  });

  it("breaks ties by insertion order, like the linear scan", () => {
    // Tied pair far outside the filler box so no filler node is closer.
    // All coordinates are exact binaries: both squared distances are
    // exactly 0.125^2, so insertion order decides, as in the reference.
    const filler = randomNodes(3000, 99, 127.0, 127.07, 37.3, 37.35);
    const nodes = {
      first: [127.375, 37.5],
      ...filler,
      second: [127.625, 37.5],
    };
    const want = referenceNearest(nodes, 127.5, 37.5);
    assert.equal(want, "first");
    assert.equal(nearestNodeIn(nodes, 127.5, 37.5), "first");
    assert.equal(nearestNode({ nodes }, 127.5, 37.5), "first");
  });

  it("answers 2,000 queries over 20,000 nodes in under 1.5 s", () => {
    const nodes = randomNodes(20000, 1234, 127.0, 127.07, 37.3, 37.35);
    const rng = lcg(555);
    const queries = [];
    for (let q = 0; q < 2000; q++) {
      queries.push([127.0 - 0.01 + rng() * 0.09, 37.3 - 0.01 + rng() * 0.07]);
    }
    const t0 = performance.now();
    for (const [lon, lat] of queries) nearestNodeIn(nodes, lon, lat);
    const ms = performance.now() - t0;
    assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`);
    // Spot-check exactness on the same large graph.
    for (let q = 0; q < 20; q++) {
      const [lon, lat] = queries[q * 97];
      assert.equal(nearestNodeIn(nodes, lon, lat), referenceNearest(nodes, lon, lat));
    }
  });

  it("small graphs use the linear path with identical results", () => {
    const nodes = randomNodes(10, 42, 127.0, 127.07, 37.3, 37.35);
    const rng = lcg(11);
    for (let q = 0; q < 50; q++) {
      const lon = 126.99 + rng() * 0.09;
      const lat = 37.29 + rng() * 0.07;
      assert.equal(nearestNode({ nodes }, lon, lat), referenceNearest(nodes, lon, lat));
    }
  });

  it("returns null for empty nodes, as before", () => {
    assert.equal(nearestNode({ nodes: {} }, 127.0, 37.3), null);
    assert.equal(nearestNode({}, 127.0, 37.3), null);
    assert.equal(nearestNodeIn({}, 127.0, 37.3), null);
    assert.deepEqual(tourNearestNode(127.0, 37.3, {}), { id: null, distM: Infinity });
  });
});
