// Stage 18g — two wrong share-card rows on a custom run.
//
// (a) a compare built the way paintCompare builds it for a custom
// record carries one_way equal to oneWayByLabel, and the share row
// is then labelled "출퇴근 편도 (문 앞→회사)";
// (b) qualityCard on a run with meta.home_node set (complex absent
// from area.complexes) counts from that node;
// (c) an unresolvable home gives convenience: null, and the share
// row reads "아직 계산하지 못했어요".

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compare as compareRuns } from "../src/engine/simulate.js";
import { oneWayByLabel } from "../src/verify/numbers.js";
import { buildCompareRows } from "../src/ui/share.js";
import { qualityCard, convenienceCounts } from "../src/money/quality.js";
import { Router } from "../src/engine/graph.js";

// A custom run per home: 10 days × (morning trip + evening ride) =
// 20 one-way commutes. A walks+rides 320분 (편도 16분), B 420분
// (편도 21분) — the walkthrough pair (same shape as results-18).
function synthRun(walkTotal, rideTotal, label) {
  const trips = [];
  const aways = [];
  for (let day = 0; day < 10; day++) {
    trips.push({ id: `t${day}`, agent: "h1", purpose: "commute",
      day, depart_min: 480, arrive_min: 500, minutes: 1 });
    aways.push({ id: `w${day}`, agent: "h1", kind: "ride",
      day, start_min: 1080, end_min: 1100,
      detail: { ride: { minutesTotal: 1 } } });
  }
  return {
    meta: { home: label, area: "test-area", complex: `단지${label}`, days: 30 },
    agents: [{ key: "h1", household: true }],
    trips,
    aways,
    totals: { household: {}, per_member: { h1: {
      commute_walk_minutes: walkTotal, commute_ride_minutes: rideTotal } } },
    unavailable: [],
    decisions: [],
  };
}

// Tiny walk graph: home node n1 links to n2 (grocery + clinic near),
// station sits on the isolated node n3 (unreachable from n1).
const N1 = [127.0, 37.0];
const N2 = [127.001, 37.0];
const N3 = [128.0, 38.0];
function testArea() {
  return {
    complexes: [],
    buildings: [],
    pois: [
      { id: "p-groc", name: "장보기", category: "shop:supermarket",
        geometry: { coordinates: [...N2] } },
      { id: "p-clin", name: "병원", category: "amenity:clinic",
        geometry: { coordinates: [...N1] } },
      { id: "p-stn", name: "미금역", category: "railway:subway_station",
        geometry: { coordinates: [...N3] } },
    ],
  };
}
function testRouter() {
  return new Router({
    nodes: { n1: [...N1], n2: [...N2], n3: [...N3] },
    edges: { walk: [
      { from: "n1", to: "n2", length_m: 100 },
      { from: "n2", to: "n1", length_m: 100 },
    ] },
  });
}

describe("18g custom-run share rows", () => {
  it("carries one_way on the sim compare, so the share row is 편도", () => {
    // The same build paintCompare uses for a custom record.
    const runs = { A: synthRun(140, 180, "A"), B: synthRun(160, 260, "B") };
    const labs = ["A", "B"];
    const cmp = compareRuns(runs[labs[0]], runs[labs[1]]);
    cmp.one_way = oneWayByLabel(Object.fromEntries(labs.map((l) => [l, runs[l]])));
    assert.deepEqual(cmp.one_way, oneWayByLabel(runs));
    assert.deepEqual(cmp.one_way, { A: 16, B: 21 });
    const rows = buildCompareRows({
      money: { homes: { A: {}, B: {} } }, compare: cmp, tenures: {}, days: 30 });
    const day = rows.find((r) => r.id === "commute_day");
    assert.equal(day.label, "출퇴근 편도 (문 앞→회사)");
    assert.equal(day.a, "16분");
    assert.equal(day.b, "21분");
  });

  it("counts convenience from the run's home node", () => {
    const area = testArea();
    const router = testRouter();
    const run = {
      meta: { home: "A", area: "test-area", complex: "없는단지",
        home_node: "n1", days: 30 },
      totals: { household: {} },
    };
    const card = qualityCard(run, area, router);
    assert.ok(card.convenience !== null, "resolves via home_node");
    assert.deepEqual(card.convenience, convenienceCounts(area, router, "n1"));
    assert.equal(card.convenience.grocery, 1);
    assert.equal(card.convenience.clinic, 1);
    assert.equal(card.convenience.station, 0);
  });

  it("reports unknown convenience instead of zeros", () => {
    const area = testArea();
    const router = testRouter();
    const run = {
      meta: { home: "A", area: "test-area", complex: "없는단지", days: 30 },
      totals: { household: {} },
    };
    const card = qualityCard(run, area, router);
    assert.equal(card.convenience, null);
    const rows = buildCompareRows({
      money: { homes: { A: { qol_convenience: card.convenience }, B: {} } },
      compare: null, tenures: {}, days: 30 });
    const conv = rows.find((r) => r.id === "convenience");
    assert.equal(conv.a, "아직 계산하지 못했어요");
    assert.ok(!conv.note.includes("장보기 0"), `no zero note: ${conv.note}`);
  });
});
