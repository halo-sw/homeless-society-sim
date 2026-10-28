import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WALK_MPS, dijkstra, minutesFor, rankComplexes, selectTourStops, shortestPath } from "../src/tour.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// Linear directed graph a -> b -> c -> d plus an isolated island x -> y.
const NODES = {
  a: [127.0, 37.5], b: [127.001, 37.5], c: [127.002, 37.5], d: [127.003, 37.5],
  x: [127.1, 37.6], y: [127.101, 37.6],
};
const E = (from, to, len = 100) => ({ from, to, way: 1, highway: "residential", name: null, length_m: len });
const WALK = [E("a", "b"), E("b", "a"), E("b", "c"), E("c", "b"), E("c", "d"), E("d", "c"), E("x", "y"), E("y", "x")];

function complex(id, name, lon, lat, floors = 15, size = 5) {
  return { id, name, name_source: name ? "register" : null,
    building_ids: Array.from({ length: size }, (_, i) => `${id}-b${i}`),
    centroid: [lon, lat], households_hint: null, max_floors: floors };
}

function poi(name, category, lon, lat) {
  return { id: `p-${name}`, name, category, osm_kind: "node", osm_id: 1,
    geometry: { type: "Point", coordinates: [lon, lat] } };
}

function tinyArea() {
  return {
    area: "tiny",
    graph: { nodes: NODES, edges: { walk: WALK, bike: [], drive: [] } },
    complexes: [
      complex("cx1", "푸르지오", 127.0, 37.5, 20, 8),
      complex("cx2", null, 127.002, 37.5, 10, 3),
      complex("cx3", "자이", 127.1, 37.6, 25, 12), // isolated island
    ],
    pois: [
      poi("잠실역", "railway:station", 127.001, 37.5),
      poi("석촌호수공원", "leisure:park", 127.002, 37.5),
      poi("먼약국", "amenity:pharmacy", 127.101, 37.6), // unreachable
    ],
    landuse: [],
  };
}

describe("tour (synthetic)", () => {
  it("finds directed shortest paths with graph lengths", () => {
    const p = shortestPath(NODES, WALK, "a", "d");
    assert.deepEqual(p.nodeIds, ["a", "b", "c", "d"]);
    assert.equal(p.lengthM, 300);
    assert.equal(shortestPath(NODES, WALK, "a", "x"), null);
  });

  it("converts metres to minutes at 1.3 m/s", () => {
    assert.equal(WALK_MPS, 1.3);
    assert.ok(Math.abs(minutesFor(780) - 10) < 1e-9);
  });

  it("ranks named complexes first by height", () => {
    const ranked = rankComplexes(tinyArea().complexes);
    assert.deepEqual(ranked.map((c) => c.id), ["cx3", "cx1", "cx2"]);
  });

  it("selects connected stops only, skipping the unreachable island", () => {
    const plan = selectTourStops(tinyArea());
    assert.ok(plan.stops.length >= 4, `got ${plan.stops.length}`);
    assert.ok(plan.stops.length <= 6);
    const names = plan.stops.map((s) => s.name);
    assert.ok(!names.includes("자이"), "isolated complex must be skipped");
    assert.ok(!names.includes("먼약국"), "unreachable POI must be skipped");
    // Every leg is a real graph path with consistent minutes
    // (a 0 m leg means two stops share one graph anchor, e.g. a park
    // gate next to a complex entrance).
    for (const s of plan.stops.slice(1)) {
      assert.ok(s.pathNodeIds.length >= 1);
      assert.ok(s.legLengthM >= 0);
      assert.ok(Math.abs(s.legMinutes - minutesFor(s.legLengthM)) < 1e-9);
    }
    assert.ok(names.includes("푸르지오"));
  });
});

describe("tour (real data: songpa-jamsil)", () => {
  it("builds 4-6 stops from real complexes/POIs with graph walking times", async () => {
    const dir = join(HERE, "..", "..", "data", "build", "songpa-jamsil");
    const area = JSON.parse(await readFile(join(dir, "area.json"), "utf-8"));
    for (const [key, value] of Object.entries(area)) {
      if (value && typeof value === "object" && !Array.isArray(value) && value.$ref) {
        area[key] = JSON.parse(await readFile(join(dir, value.$ref), "utf-8"));
      }
    }
    const plan = selectTourStops(area);
    assert.ok(plan.stops.length >= 4 && plan.stops.length <= 6,
      `stops: ${plan.stops.length}`);
    const complexNames = new Set(area.complexes.map((c) => c.name || "이름 없는 단지"));
    const poiNames = new Set(area.pois.map((p) => p.name));
    const parkNames = new Set((area.landuse || []).filter((l) => l.name).map((l) => l.name));
    const nodes = area.graph.nodes;
    // Anchor lookup for path validation.
    const edgeSet = new Set(area.graph.edges.walk.map((e) => `${e.from}>${e.to}`));
    for (const s of plan.stops) {
      if (s.kind === "complex") assert.ok(complexNames.has(s.name), `complex ${s.name}`);
      else assert.ok(poiNames.has(s.name) || parkNames.has(s.name), `poi ${s.name}`);
      for (const n of s.pathNodeIds) assert.ok(n in nodes, `node ${n}`);
      for (let i = 0; i < s.pathNodeIds.length - 1; i++) {
        assert.ok(edgeSet.has(`${s.pathNodeIds[i]}>${s.pathNodeIds[i + 1]}`), "leg must follow walk edges");
      }
    }
    assert.ok(plan.totalM > 0 && plan.totalMin > 0);
  });
});
