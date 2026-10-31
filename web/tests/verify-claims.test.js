// Stage 16a part 3: claim-check tests (pure, node --test).
//
// A tiny hand-made run (3 trips, 1 decision) backs every number; the
// expected values below are computed by hand from that fixture.
//
// Stage 16b: engine values are the household's door-to-door numbers —
// C01/N01 average one-way (walk + ride) / one-way commutes over
// commuting household members, other purposes average household trips
// only. A tiny door-to-door run and real-build values (skipped when
// data/build/sim is missing) pin the formula.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGroundTruth } from "../src/verify/checklist.js";
import { engineValue, meanMinutes, monthlyTotal, textNumbers,
  checkNumberClaims, householdMembers, commuteOneWayMinutes } from "../src/verify/numbers.js";
import { awayId, evidenceIndex, checkEvidence } from "../src/verify/evidence.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GT = JSON.parse(readFileSync(
  join(HERE, "..", "..", "scenarios", "verify", "ground_truth.json"), "utf-8"));

// 3 trips (commute 25 + 35, errand 10), 1 decision, no aways.
function tinyRun() {
  return {
    agents: [
      { key: "m1", household: true },
      { key: "m2", household: true },
    ],
    trips: [
      { id: "t000001", agent: "m1", day: 0, purpose: "commute", minutes: 25,
        distance_m: 1200 },
      { id: "t000002", agent: "m2", day: 0, purpose: "commute", minutes: 35,
        distance_m: 1800 },
      { id: "t000003", agent: "m1", day: 1, purpose: "errand", minutes: 10,
        distance_m: 400 },
    ],
    aways: [],
    decisions: [
      { id: "d-m1-0-480-park_or_home-0", agent: "m1", day: 0,
        kind: "park_or_home", chosen_key: "park", chosen_by: "rule" },
    ],
  };
}

const HOME = { monthly_won: 500000, maintenance_won_month: 100000,
  utilities_won_month: 50000 };

function sentence(o) {
  return { id: o.id, text_ko: o.text_ko, item_id: o.item_id,
    claims: o.claims || [], evidence: o.evidence || [] };
}

describe("engineValue", () => {
  const run = tinyRun();
  it("C01 is the household door-to-door one-way mean (30)", () => {
    assert.deepEqual(engineValue("C01", run), { value: 30, unit: "분" });
  });
  it("N01 is the per-member commute mean", () => {
    assert.deepEqual(engineValue("N01", run, { member: "m1" }),
      { value: 25, unit: "분" });
    assert.deepEqual(engineValue("N01", run, { member: "m2" }),
      { value: 35, unit: "분" });
  });
  it("N01 without a member gives null (flagged as missing member)", () => {
    assert.equal(engineValue("N01", run), null);
  });
  it("C05 reads errand trips; missing purposes give null", () => {
    assert.deepEqual(engineValue("C05", run), { value: 10, unit: "분" });
    assert.equal(engineValue("F01", run), null); // no school trips
    assert.equal(engineValue("F05", run), null); // no clinic trips
  });
  it("C02 sums the home listing fields exactly", () => {
    assert.deepEqual(engineValue("C02", run, { home: HOME }),
      { value: 650000, unit: "원" });
    assert.equal(engineValue("C02", run, { home: null }), null);
    assert.equal(engineValue("C02", run, { home: {} }), null);
  });
  it("meanMinutes/monthlyTotal edge cases", () => {
    assert.equal(meanMinutes([], "commute"), null);
    assert.equal(monthlyTotal({ monthly_won: 100 }), 100);
    assert.equal(monthlyTotal(null), null);
  });
});

describe("textNumbers (via judge guards)", () => {
  it("finds cited numbers, skips counters", () => {
    assert.deepEqual(textNumbers("통근은 25분이에요"), ["25"]);
    assert.deepEqual(textNumbers("그냥 편해요"), []);
    assert.deepEqual(textNumbers("2번째로 가까워요"), []);
  });
});

describe("checkNumberClaims", () => {
  const run = tinyRun();
  const young = loadGroundTruth(GT, "young_family");
  const newlywed = loadGroundTruth(GT, "newlywed_couple");

  it("passes exact and in-tolerance claims", () => {
    const report = { persona: "young_family", home: HOME, sentences: [
      sentence({ id: "s1", item_id: "C01", text_ko: "통근은 평균 30분이에요",
        claims: [{ field: "commute_minutes", value: 30, unit: "분" }] }),
      sentence({ id: "s2", item_id: "C05", text_ko: "장보기는 11분 거리예요",
        claims: [{ field: "grocery_minutes", value: 11, unit: "분" }] }),
      sentence({ id: "s3", item_id: "C02", text_ko: "월 주거비는 650000원이에요",
        claims: [{ field: "monthly_total", value: 650000, unit: "원" }] }),
    ] };
    assert.deepEqual(checkNumberClaims(report, run, young), { failures: [] });
  });
  it("passes per-member N01 claims", () => {
    const report = { persona: "newlywed_couple", home: HOME, sentences: [
      sentence({ id: "s1", item_id: "N01", text_ko: "두 사람 통근은 25분과 35분이에요",
        claims: [
          { field: "commute_minutes", value: 25, unit: "분", member: "m1" },
          { field: "commute_minutes", value: 35, unit: "분", member: "m2" },
        ] }),
    ] };
    assert.deepEqual(checkNumberClaims(report, run, newlywed), { failures: [] });
  });
  it("flags out-of-tolerance and inexact money", () => {
    const report = { persona: "young_family", home: HOME, sentences: [
      sentence({ id: "s1", item_id: "C01", text_ko: "통근은 40분이에요",
        claims: [{ field: "commute_minutes", value: 40, unit: "분" }] }),
      sentence({ id: "s2", item_id: "C02", text_ko: "월 주거비는 600000원이에요",
        claims: [{ field: "monthly_total", value: 600000, unit: "원" }] }),
    ] };
    const { failures } = checkNumberClaims(report, run, young);
    assert.equal(failures.length, 2);
    assert.equal(failures[0].sentence_id, "s1");
    assert.match(failures[0].reason_ko, /달라요/);
    assert.match(failures[0].reason_ko, /허용 ±5분/);
    assert.match(failures[1].reason_ko, /달라요/);
  });
  it("flags numbers with no claim", () => {
    const report = { persona: "young_family", home: HOME, sentences: [
      sentence({ id: "s1", item_id: "C01", text_ko: "통근은 25분이에요" }),
    ] };
    const { failures } = checkNumberClaims(report, run, young);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].reason_ko, "근거 없는 숫자");
  });
  it("flags missing engine data and missing N01 member", () => {
    const report = { persona: "young_family", home: HOME, sentences: [
      sentence({ id: "s1", item_id: "F01", text_ko: "등원은 10분이에요",
        claims: [{ field: "daycare_minutes", value: 10, unit: "분" }] }),
    ] };
    const f1 = checkNumberClaims(report, run, young).failures;
    assert.equal(f1.length, 1);
    assert.equal(f1[0].reason_ko, "엔진 기록으로 확인할 수 없어요");
    const norep = { persona: "newlywed_couple", home: HOME, sentences: [
      sentence({ id: "s1", item_id: "N01", text_ko: "통근은 30분이에요",
        claims: [{ field: "commute_minutes", value: 30, unit: "분" }] }),
    ] };
    const f2 = checkNumberClaims(norep, run, newlywed).failures;
    assert.equal(f2.length, 1);
    assert.match(f2[0].reason_ko, /member/);
  });
  it("never fails engine:none items (even numeric sentences)", () => {
    const report = { persona: "young_family", home: HOME, sentences: [
      sentence({ id: "s1", item_id: "C04", text_ko: "채광은 5점이에요" }),
      sentence({ id: "s2", item_id: "C03", text_ko: "소음은 3점이에요",
        claims: [{ field: "noise", value: 3, unit: "점" }] }),
    ] };
    assert.deepEqual(checkNumberClaims(report, run, young), { failures: [] });
  });
  it("flags unknown item ids", () => {
    const report = { persona: "young_family", home: HOME, sentences: [
      sentence({ id: "s1", item_id: "ZZ9", text_ko: "좋아요" }),
    ] };
    const { failures } = checkNumberClaims(report, run, young);
    assert.equal(failures.length, 1);
    assert.match(failures[0].reason_ko, /알 수 없는 항목/);
  });
});

describe("evidenceIndex", () => {
  it("holds trip and decision ids", () => {
    const index = evidenceIndex(tinyRun());
    assert.ok(index.has("t000001"));
    assert.ok(index.has("t000003"));
    assert.ok(index.has("d-m1-0-480-park_or_home-0"));
    assert.ok(!index.has("t999999"));
  });
  it("synthesises stable away ids and reads ref_ids", () => {
    const run = { trips: [], aways: [{ agent: "m1", day: 2, kind: "work", start_min: 540 }],
      decisions: [{ id: "d1", ref_ids: ["t000001"] }] };
    assert.equal(awayId(run.aways[0]), "away:m1:2:540:work");
    const index = evidenceIndex(run);
    assert.ok(index.has("away:m1:2:540:work"));
    assert.ok(index.has("t000001"));
  });
});

describe("checkEvidence", () => {
  const run = tinyRun();
  // Synthetic supported-judge item: all real judge items except C06/N03
  // are engine:none (those two are backed by life-events trips).
  const loaded = { items: [
    { id: "J1", priority: "should", verify: "judge", engine: "supported",
      label_ko: "가상 판단 항목" },
  ] };
  it("passes a sentence citing an indexed id", () => {
    const report = { persona: "young_family", home: HOME, sentences: [
      sentence({ id: "s1", item_id: "J1", text_ko: "공원에 다녀왔어요",
        evidence: ["t000001"] }),
    ] };
    assert.deepEqual(checkEvidence(report, run, loaded), { failures: [] });
  });
  it("flags missing or invented evidence", () => {
    for (const evidence of [[], ["made-up-id"]]) {
      const report = { persona: "young_family", home: HOME, sentences: [
        sentence({ id: "s1", item_id: "J1", text_ko: "공원에 다녀왔어요", evidence }),
      ] };
      const { failures } = checkEvidence(report, run, loaded);
      assert.equal(failures.length, 1);
      assert.equal(failures[0].reason_ko, "근거 없는 문장");
    }
  });
  it("never fails engine:none judge items or deterministic items", () => {
    const young = loadGroundTruth(GT, "young_family");
    const report = { persona: "young_family", home: HOME, sentences: [
      sentence({ id: "s1", item_id: "C03", text_ko: "조용해요" }),
      sentence({ id: "s2", item_id: "C01", text_ko: "통근은 평균 30분이에요",
        claims: [{ field: "commute_minutes", value: 30, unit: "분" }] }),
    ] };
    assert.deepEqual(checkEvidence(report, run, young), { failures: [] });
  });
});

describe("household door-to-door values (16b)", () => {
  // One member, walk 10 + ride 30 + walk 5 out, the same back:
  // (30 + 60) / 2 one-way commutes = 45.
  function doorToDoorRun() {
    return {
      agents: [{ key: "h1", household: true }],
      totals: { per_member: { h1: { commute_walk_minutes: 30,
        commute_ride_minutes: 60 } } },
      trips: [
        { id: "t1", agent: "h1", day: 0, purpose: "commute", minutes: 10,
          depart_min: 480 },
        { id: "t2", agent: "h1", day: 0, purpose: "commute", minutes: 5,
          depart_min: 505 },
        { id: "t3", agent: "h1", day: 0, purpose: "commute", minutes: 5,
          depart_min: 1080 },
        { id: "t4", agent: "h1", day: 0, purpose: "commute", minutes: 10,
          depart_min: 1105 },
      ],
      aways: [
        { agent: "h1", day: 0, kind: "ride", start_min: 515,
          detail: { ride: { minutesTotal: 30 } } },
        { agent: "h1", day: 0, kind: "ride", start_min: 1090,
          detail: { ride: { minutesTotal: 30 } } },
      ],
      decisions: [],
    };
  }
  it("walk 10 + ride 30 + walk 5 out and back gives C01 45", () => {
    const run = doorToDoorRun();
    assert.equal(commuteOneWayMinutes(run, "h1"), 45);
    assert.deepEqual(engineValue("C01", run), { value: 45, unit: "분" });
    assert.deepEqual(engineValue("N01", run, { member: "h1" }),
      { value: 45, unit: "분" });
  });
  it("members without a commute are skipped, not averaged as zero", () => {
    const run = doorToDoorRun();
    run.agents.push({ key: "h2", household: true });
    run.totals.per_member.h2 = { commute_walk_minutes: 0,
      commute_ride_minutes: 0 };
    assert.equal(commuteOneWayMinutes(run, "h2"), null);
    assert.deepEqual(engineValue("C01", run), { value: 45, unit: "분" });
  });
  it("householdMembers excludes simulated neighbours", () => {
    assert.deepEqual(householdMembers(tinyRun()), ["m1", "m2"]);
    const flagged = { agents: [{ key: "h1", household: true },
      { key: "b01", household: false }], trips: [], aways: [] };
    assert.deepEqual(householdMembers(flagged), ["h1"]);
    const prefixed = { agents: [{ key: "h1" }, { key: "b02" }],
      totals: { per_member: { h1: {}, b02: {} } }, trips: [], aways: [] };
    assert.deepEqual(householdMembers(prefixed), ["h1"]);
  });
  it("neighbour trips never leak into purpose means or C01", () => {
    const run = {
      agents: [{ key: "h1", household: true },
        { key: "b01", household: false }],
      trips: [
        { id: "t1", agent: "h1", day: 0, purpose: "errand", minutes: 10,
          depart_min: 600 },
        { id: "t2", agent: "b01", day: 0, purpose: "errand", minutes: 100,
          depart_min: 600 },
        { id: "t3", agent: "b01", day: 0, purpose: "commute", minutes: 5,
          depart_min: 500 },
      ],
      aways: [],
      decisions: [],
    };
    assert.deepEqual(engineValue("C05", run), { value: 10, unit: "분" });
    assert.equal(engineValue("C01", run), null); // h1 does not commute
  });
});

describe("real-build engine values (16b)", () => {
  const SIM = join(HERE, "..", "..", "data", "build", "sim");
  const loadRun = (name) => {
    const p = join(SIM, name);
    if (!existsSync(p)) return null; // built data is not committed
    return JSON.parse(readFileSync(p, "utf-8"));
  };
  it("demo-two-homes-A C01 is 42.7", () => {
    const run = loadRun("demo-two-homes-A.json");
    if (!run) return;
    assert.deepEqual(engineValue("C01", run), { value: 42.7, unit: "분" });
  });
  it("demo-two-homes-B C01 is 16.5", () => {
    const run = loadRun("demo-two-homes-B.json");
    if (!run) return;
    assert.deepEqual(engineValue("C01", run), { value: 16.5, unit: "분" });
  });
  it("persona-newlywed-couple-B N01 h1 is 46.5", () => {
    const run = loadRun("persona-newlywed-couple-B.json");
    if (!run) return;
    assert.deepEqual(engineValue("N01", run, { member: "h1" }),
      { value: 46.5, unit: "분" });
  });
  it("persona-dual-income-child-A C01 is 42.7 (neighbours excluded)", () => {
    const run = loadRun("persona-dual-income-child-A.json");
    if (!run) return;
    assert.deepEqual(engineValue("C01", run), { value: 42.7, unit: "분" });
  });
});
