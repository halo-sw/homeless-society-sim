// Stage 29j1: two-home comparison over verifyReport (pure, node --test).
//
// Hand-made runs (meta November Seoul → sunset 17:25) with household
// trips home at 18:30 (bike 13분) and 22:40; every coverage number is
// computed by hand (newlywed must C01/C02/N01, should C05/C06/N03).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGroundTruth } from "../src/verify/checklist.js";
import { lifeEventTrips, sunsetMinFor } from "../src/engine/life-events.js";
import { hhmm } from "../src/timeline.js";
import { judgeCandidates, citedEvents, judgeEvidence } from "../src/verify/evidence.js";
import { verifyReport } from "../src/verify/loop.js";
import { checkNumberClaims } from "../src/verify/numbers.js";
import { personaFor, inapplicableItems, reportDigest,
  verifyComparison, runComparisonLoop } from "../src/verify/compare.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GT = JSON.parse(readFileSync(
  join(HERE, "..", "..", "scenarios", "verify", "ground_truth.json"), "utf-8"));

function cmpRun(prefix) {
  return {
    meta: { start_date: "2026-11-01", area: "seoul-x" },
    agents: [{ key: "m1", household: true }, { key: "m2", household: true }],
    trips: [
      { id: `${prefix}-am1`, agent: "m1", day: 11, purpose: "commute",
        minutes: 30, depart_min: 480,
        from: { kind: "home", label: "집" }, to: { kind: "work", label: "일터" } },
      { id: `${prefix}-dark`, agent: "m1", day: 11, purpose: "commute",
        minutes: 13, depart_min: 1097, arrive_min: 1110, mode: "bike",
        from: { kind: "work", label: "Meta HQ (1 Hacker Way)" },
        to: { kind: "home", label: "집" } },
      { id: `${prefix}-late`, agent: "m1", day: 12, purpose: "commute",
        minutes: 13, depart_min: 1347, arrive_min: 1360,
        from: { kind: "work", label: "Meta HQ (1 Hacker Way)" },
        to: { kind: "home", label: "집" } },
      { id: `${prefix}-am2`, agent: "m2", day: 11, purpose: "commute",
        minutes: 25, depart_min: 480,
        from: { kind: "home", label: "집" }, to: { kind: "work", label: "일터" } },
      { id: `${prefix}-pm2`, agent: "m2", day: 11, purpose: "commute",
        minutes: 25, depart_min: 1000, arrive_min: 1025,
        from: { kind: "work", label: "일터" }, to: { kind: "home", label: "집" } },
      { id: `${prefix}-err`, agent: "m1", day: 13, purpose: "errand",
        minutes: 10, depart_min: 600,
        from: { kind: "home", label: "집" }, to: { kind: "shop", label: "마트" } },
    ],
    aways: [],
    decisions: [],
  };
}

const HOME = { monthly_won: 500000, maintenance_won_month: 100000,
  utilities_won_month: 50000 };
const min = (value, member) => ({ field: "minutes", value, unit: "분",
  ...(member === undefined ? {} : { member }) });
const sHome = (home, id, item_id, text_ko, claims = [], evidence = []) =>
  ({ id, home, item_id, text_ko, claims, evidence });

function homeSentences(label, prefix, withC01 = true) {
  const out = [];
  if (withC01) {
    out.push(sHome(label, `${label}-c01`, "C01", "통근은 평균 22분이에요",
      [min(22)]));
  }
  out.push(sHome(label, `${label}-c02`, "C02", "월 주거비는 650000원이에요",
    [{ field: "monthly_total", value: 650000, unit: "원" }]));
  out.push(sHome(label, `${label}-c05`, "C05", "장보기는 10분 거리예요",
    [min(10)]));
  out.push(sHome(label, `${label}-c06`, "C06", "밤늦게 도착한 날이 있어요",
    [], [`${prefix}-dark`]));
  out.push(sHome(label, `${label}-n01`, "N01", "두 사람 통근은 19분과 25분이에요",
    [min(19, "m1"), min(25, "m2")]));
  out.push(sHome(label, `${label}-n03`, "N03", "늦은 밤에도 다녀왔어요",
    [], [`${prefix}-late`]));
  return out;
}

describe("29j1 ground truth flags", () => {
  it("C06 supported, N03 partial, C03/C09 still none", () => {
    const young = loadGroundTruth(GT, "young_family");
    const byId = new Map(young.items.map((it) => [it.id, it]));
    assert.equal(byId.get("C06").engine, "supported");
    assert.deepEqual(byId.get("C06").evidence_events, ["dark_walk", "late_home"]);
    assert.equal(byId.get("C03").engine, "none");
    assert.equal(byId.get("C09").engine, "none");
    const nw = loadGroundTruth(GT, "newlywed_couple");
    const n03 = nw.items.find((it) => it.id === "N03");
    assert.equal(n03.engine, "partial");
    assert.deepEqual(n03.evidence_events, ["late_home"]);
  });
});

describe("29j1 lifeEventTrips", () => {
  const run = cmpRun("e");
  it("November Seoul sunset is 17:25", () => {
    assert.equal(hhmm(sunsetMinFor(run.meta)), "17:25");
  });
  it("late_home returns the 22:40 trip only", () => {
    const late = lifeEventTrips(run, "late_home");
    assert.deepEqual(late.map((t) => t.id), ["e-late"]);
  });
  it("dark_walk returns the commute trips home after sunset", () => {
    const dark = lifeEventTrips(run, "dark_walk");
    assert.deepEqual(dark.map((t) => t.id), ["e-dark", "e-late"]);
    assert.ok(dark.every((t) => t.arrive_min >= 1045));
  });
});

describe("29j1 judgeCandidates and citedEvents", () => {
  const run = cmpRun("e");
  it("C06 is the deduped union with text_ko", () => {
    const cands = judgeCandidates(run, "C06");
    assert.deepEqual(cands.map((t) => t.id), ["e-dark", "e-late"]);
    assert.equal(cands[0].text_ko,
      "12일 18:30 집 도착 · 자전거 13분 (Meta HQ (1 Hacker Way)에서) · 해 진 뒤(일몰 17:25)");
    assert.deepEqual(cands[0].scene, ["dark_walk"]);
    assert.ok(cands[1].scene.includes("dark_walk")
      && cands[1].scene.includes("late_home"));
    assert.match(cands[1].text_ko, /밤 10시 넘어/);
    assert.deepEqual(judgeCandidates(run, "N03").map((t) => t.id), ["e-late"]);
    assert.deepEqual(judgeCandidates(run, "C03"), []);
  });
  it("citedEvents skips unknown ids and formats arrive", () => {
    const recs = citedEvents(run, ["e-late", "nope"]);
    assert.equal(recs.length, 1);
    assert.equal(recs[0].arrive, "22:40");
    assert.equal(recs[0].type, "trip");
  });
});

describe("29j1 judgeEvidence", () => {
  const run = cmpRun("j");
  const loaded = loadGroundTruth(GT, "newlywed_couple");
  const cited = { id: "s1", item_id: "C06", text_ko: "밤길이 걱정이에요",
    evidence: ["j-late"] };
  const uncited = { id: "s2", item_id: "C06", text_ko: "밤길이 걱정이에요",
    evidence: [] };
  it("a rejecting judge becomes one kind:judge failure with its reason", async () => {
    const calls = [];
    const judge = async (sentence, events) => {
      calls.push([sentence, events]);
      return { supported: false, reason: "시간이 안 맞아요" };
    };
    const { failures } = await judgeEvidence(
      { sentences: [cited] }, run, loaded, judge);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].kind, "judge");
    assert.ok(failures[0].reason_ko.includes("시간이 안 맞아요"));
    assert.ok(failures[0].reason_ko.includes("근거가 문장을 뒷받침하지 않아요"));
  });
  it("a sentence citing no indexed id is not sent to the judge", async () => {
    const calls = [];
    const judge = async (sentence, events) => {
      calls.push(sentence.id);
      return { supported: true };
    };
    const { failures } = await judgeEvidence(
      { sentences: [cited, uncited] }, run, loaded, judge);
    assert.deepEqual(calls, ["s1"]);
    assert.deepEqual(failures, []);
  });
  it("null judge passes; a throwing judge sets judge_error", async () => {
    assert.deepEqual(
      (await judgeEvidence({ sentences: [cited] }, run, loaded, null)),
      { failures: [] });
    const res = await judgeEvidence({ sentences: [cited] }, run, loaded,
      async () => { throw new Error("down"); });
    assert.deepEqual(res, { failures: [], judge_error: true });
  });
});

describe("29j1 verifyReport inapplicable", () => {
  it("removes N03 from coverage and lists it", () => {
    const run = cmpRun("i");
    const sentences = homeSentences("A", "i").map((s) => {
      const { home, ...rest } = s;
      return rest;
    });
    const res = verifyReport({ persona: "newlywed_couple", home: HOME, sentences },
      run, "newlywed_couple", { groundTruth: GT, inapplicable: ["N03"] });
    assert.equal(res.pass, true);
    assert.deepEqual(res.inapplicable,
      [{ item_id: "N03", reason_ko: "이 집 기록에 해당 장면이 없어요" }]);
    assert.ok(!res.feedback_ko.some((line) => line.includes("N03")));
  });
  it("inapplicableItems flags empty engine-backed judge items", () => {
    const loaded = loadGroundTruth(GT, "newlywed_couple");
    assert.deepEqual(inapplicableItems(loaded, cmpRun("q")), []);
    const empty = { meta: run_meta(), agents: [], trips: [], aways: [],
      decisions: [] };
    function run_meta() {
      return { start_date: "2026-11-01", area: "seoul-x" };
    }
    assert.deepEqual(inapplicableItems(loaded, empty), ["C06", "N03"]);
  });
});

describe("29j1 personaFor", () => {
  const adult = { role: "adult" };
  it("maps profiles to personas", () => {
    assert.equal(personaFor({ members: [adult, { role: "child" }] }),
      "young_family");
    assert.equal(personaFor({ members: [adult, adult] }, { noCommute: true }),
      "remote_worker");
    assert.equal(personaFor({ members: [adult, adult], pets: true }),
      "pet_owner");
    assert.equal(personaFor({ members: [adult] }), "single_firstjob");
    assert.equal(personaFor({ members: [adult, adult] }), "newlywed_couple");
  });
  it("reads field objects and seniors", () => {
    assert.equal(personaFor({ members: { value: [adult] } }), "single_firstjob");
    assert.equal(personaFor({ members: [adult, { role: "senior" }] }),
      "multigen_family");
  });
});

describe("29j1 verifyComparison and runComparisonLoop", () => {
  const runs = { A: cmpRun("a"), B: cmpRun("b") };
  const homes = { A: HOME, B: HOME };
  const labels = ["A", "B"];
  const draft = { persona: "newlywed_couple",
    sentences: [...homeSentences("A", "a", true), ...homeSentences("B", "b", false)] };
  const fixed = { persona: "newlywed_couple",
    sentences: [...homeSentences("A", "a", true), ...homeSentences("B", "b", true)] };

  it("fails the draft on home B and passes the fix", async () => {
    const bad = await verifyComparison(draft,
      { runs, labels, homes, persona: "newlywed_couple", groundTruth: GT });
    assert.equal(bad.pass, false);
    assert.ok(bad.by_home.B.failures.length > 0 || bad.by_home.B.must_coverage < 1);
    assert.ok(bad.feedback_ko.every((line) => /^[AB]: /.test(line)));
    const good = await verifyComparison(fixed,
      { runs, labels, homes, persona: "newlywed_couple", groundTruth: GT });
    assert.equal(good.pass, true);
    assert.ok(good.failures.length === 0);
  });
  it("flags sentences for an unknown home", async () => {
    const report = { persona: "newlywed_couple",
      sentences: [...fixed.sentences,
        sHome("C", "x1", "C01", "통근은 평균 22분이에요", [min(22)])] };
    const res = await verifyComparison(report,
      { runs, labels, homes, persona: "newlywed_couple", groundTruth: GT });
    assert.equal(res.pass, false);
    assert.ok(res.failures.some((f) => f.reason_ko === "알 수 없는 집이에요"));
  });
  it("digest carries values for deterministic and events for judge items", () => {
    const digest = reportDigest({ runs, labels, homes,
      persona: "newlywed_couple", groundTruth: GT, names: { A: "역삼", B: "서초" } });
    assert.equal(digest.unsupported, false);
    assert.equal(digest.homes.A.name, "역삼");
    const c01 = digest.items.find((it) => it.id === "C01");
    assert.ok(c01.values.A.value > 0);
    const n01 = digest.items.find((it) => it.id === "N01");
    assert.ok(n01.values.A.m1.value > 0 && n01.values.A.m2.value > 0);
    const c06 = digest.items.find((it) => it.id === "C06");
    assert.deepEqual(Object.keys(c06.events.A[0]), ["id", "text_ko"]);
  });
  it("repairs across two attempts with onAttempt summaries", async () => {
    const seen = [];
    const { result, attempts, handoff } = await runComparisonLoop({
      draft, revise: async () => fixed, runs, labels, homes,
      persona: "newlywed_couple", groundTruth: GT,
      onAttempt: (info) => seen.push(info),
    });
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].result.pass, false);
    assert.equal(attempts[1].result.pass, true);
    assert.equal(result.pass, true);
    assert.equal(handoff, null);
    assert.equal(seen.length, 2);
    assert.ok(seen[0].summary_ko.startsWith("검증 실패"));
    assert.ok(seen[1].summary_ko.startsWith("검증 통과"));
  });
  it("hands off after retries that never fix", async () => {
    const { attempts, handoff } = await runComparisonLoop({
      draft, revise: async (report) => report, runs, labels, homes,
      persona: "newlywed_couple", groundTruth: GT,
    });
    assert.equal(attempts.length, 4);
    assert.equal(handoff.ask_user, true);
  });
  it("unsupported persona: one attempt, 미지원, revise never called", async () => {
    let reviseCalls = 0;
    const { result, attempts, handoff } = await runComparisonLoop({
      draft, revise: async (report) => { reviseCalls += 1; return report; },
      runs, labels, homes, persona: "remote_worker", groundTruth: GT,
    });
    assert.equal(result.status, "미지원");
    assert.equal(attempts.length, 1);
    assert.equal(reviseCalls, 0);
    assert.equal(handoff, null);
  });
});

describe("29j1 C02 USD currency", () => {
  it("reports $4,300 vs $4,261", () => {
    const loaded = loadGroundTruth(GT, "young_family");
    const { failures } = checkNumberClaims(
      { home: { monthly_won: 4261, currency: "USD" }, sentences: [
        { id: "s1", item_id: "C02", text_ko: "rent",
          claims: [{ field: "monthly_total", value: 4300, unit: "$" }] },
      ] }, {}, loaded);
    assert.equal(failures.length, 1);
    assert.ok(failures[0].reason_ko.includes("$4,300"));
    assert.ok(failures[0].reason_ko.includes("$4,261"));
  });
});
