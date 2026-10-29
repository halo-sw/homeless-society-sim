import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  simKindFor, simBadgeFor, simCoverage, mapRoutePolylines,
  fitRouteViewport, SIM_BADGE_3D, SIM_BADGE_MAP, SIM_BADGE_NONE,
} from "../src/mapsim.js";
import {
  walkMinutesToStation, nearestStationByWalk, nearestNode,
} from "../src/walkgraph.js";

function tinyGraph() {
  return {
    nodes: { a: [127.0, 37.4], b: [127.001, 37.4], c: [127.002, 37.4] },
    edges: { walk: [
      { from: "a", to: "b", length_m: 90 },
      { from: "b", to: "c", length_m: 90 },
    ] },
    stations: { 서현: "c" },
  };
}

describe("sim kind and badges", () => {
  it("labels box homes 3D, walkgraph homes map, the rest none", () => {
    assert.equal(simKindFor({ scene: "st-x" }), "3d");
    assert.equal(simKindFor({ walkgraph: true }), "map");
    assert.equal(simKindFor({}), "none");
    assert.equal(simBadgeFor({ scene: "st-x" }), SIM_BADGE_3D);
    assert.equal(simBadgeFor({ walkgraph: true }), SIM_BADGE_MAP);
    assert.equal(simBadgeFor({}), SIM_BADGE_NONE);
  });
  it("reports coverage counts with reasons", () => {
    const cov = simCoverage([{ scene: "a" }, { walkgraph: true },
      {}, { walkgraph_error: "no-station-node" }]);
    assert.deepEqual([cov.d3, cov.map, cov.none], [1, 1, 2]);
    assert.equal(cov.noneReasons["walkgraph-unreachable"], 1);
    assert.equal(cov.noneReasons["no-station-node"], 1);
  });
  it("projects routes and fits the viewport", () => {
    const lines = mapRoutePolylines({ walkNodes: ["a", "b"],
      nodeCoords: { a: [127, 37.4], b: [127.01, 37.41] },
      subwayLegs: [{ stops: ["서현", "판교"] }],
      stationCoords: { 서현: [127.1, 37.38], 판교: [127.11, 37.39] } });
    assert.equal(lines.walk.length, 2);
    assert.equal(lines.subway.length, 2);
    const vp = fitRouteViewport(lines.walk, { lon: 127, lat: 37.4 });
    assert.ok(vp.minLon < vp.maxLon && vp.minLat < vp.maxLat);
    assert.equal(fitRouteViewport([], {}), null);
  });
});

describe("region walk graph client", () => {
  it("finds the nearest node and walks to the station", () => {
    const g = tinyGraph();
    assert.equal(nearestNode(g, 127.0, 37.4), "a");
    const r = walkMinutesToStation(g, 127.0, 37.4, "서현");
    assert.equal(r.reachable, true);
    assert.ok(r.minutes > 0 && r.minutes < 10);
    assert.deepEqual(r.path, ["a", "b", "c"]);
  });
  it("reports unreachable and unknown stations honestly", () => {
    const g = tinyGraph();
    assert.equal(walkMinutesToStation(g, 127, 37.4, "없는역").reachable, false);
    const cut = { ...g, edges: { walk: [] } };
    assert.equal(walkMinutesToStation(cut, 127, 37.4, "서현").reason, "unreachable");
  });
  it("finds the nearest station by graph walk", () => {
    const best = nearestStationByWalk(tinyGraph(), 127.0, 37.4);
    assert.equal(best.station, "서현");
    assert.ok(best.minutes > 0);
    assert.equal(nearestStationByWalk({ nodes: {}, edges: {}, stations: {} }, 127, 37.4), null);
  });
});
