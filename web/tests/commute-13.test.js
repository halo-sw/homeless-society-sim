import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { find_homes, commuteLine, SAME_STATION_KO } from "../src/homes.js";

const HOME = {
  id: "h1", name: "역앞집", kind: "아파트", region: "bundang",
  lon: 127.1, lat: 37.4, build_year: 2000, match: "register",
  station: { station: "판교", walk_minutes: 4 },
  scene: "st-판교",
  buckets: [{ center_m2: 60, range_m2: "55-65",
    jeonse: { median_won: 100000000, min_won: 90000000, max_won: 110000000, count: 2 } }],
};
const PROFILE = {
  tenure: { value: "jeonse" },
  depositMax: { value: 200000000 },
  workplaces: { value: [{ resolved: { station: "판교" } }] },
};

describe("same-station commute copy", () => {
  it("says the home shares the work station, never 0분 (0km)", () => {
    const res = find_homes(PROFILE, { homes: [HOME] }, {});
    assert.equal(res.candidates.length, 1);
    const ko = res.candidates[0].commute_ko;
    assert.match(ko, /직장역과 같은 역/);
    assert.match(ko, /지하철 안 타요/);
    assert.ok(!ko.includes("0분") && !ko.includes("0km"), ko);
    assert.equal(SAME_STATION_KO, "직장역과 같은 역 · 지하철 안 타요");
  });
  it("commuteLine honours the sameStation flag directly", () => {
    const line = commuteLine({ walk: { known: true, minutes: 3, station: "강남" },
      ride: { lines: [], transfers: [], sameStation: true }, sameStation: true });
    assert.match(line, /같은 역/);
    assert.ok(!line.includes("0분"));
  });
  it("keeps the normal line for different stations", () => {
    const other = { ...PROFILE,
      workplaces: { value: [{ resolved: { station: "강남" } }] } };
    const res = find_homes(other, { homes: [HOME] }, {});
    assert.ok(!res.candidates[0].commute_ko.includes("같은 역"));
  });
});

describe("walkgraph walk minutes in find_homes", () => {
  it("fills walk minutes for box-less homes from the region graph", () => {
    const boxless = { ...HOME, id: "h2", station: null, scene: null };
    const graph = {
      nodes: { a: [127.1, 37.4], b: [127.101, 37.4] },
      edges: { walk: [{ from: "a", to: "b", length_m: 120 }] },
      stations: { 서현: "b" },
    };
    const noGraph = find_homes(PROFILE, { homes: [boxless] }, {});
    assert.match(noGraph.candidates[0].commute_ko, /도보 미확인/);
    const withGraph = find_homes(PROFILE, { homes: [boxless] },
      { walkgraphs: new Map([["bundang", graph]]) });
    assert.ok(!withGraph.candidates[0].commute_ko.includes("도보 미확인"));
    assert.match(withGraph.candidates[0].commute_ko, /서현/);
  });
});
