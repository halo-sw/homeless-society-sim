// Stage 16a part 4: verify-loop tests (pure, node --test).
//
// Hand-made run (commute 25/35, errand 10, school 12, park 8,
// clinic 15) and scripted drafts; every coverage number below is
// computed by hand from the young_family support map
// (supported must C01/C02/F01, should C05/C06/F03/F05 — total weight 13).
//
// Stage 16b: a real-build check pins the household door-to-door C01 —
// 43.6분 passes, the old neighbour-averaged 10.3분 fails (skipped when
// data/build/sim is missing).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGroundTruth } from "../src/verify/checklist.js";
import { verifyReport, runVerifyLoop } from "../src/verify/loop.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GT = JSON.parse(readFileSync(
  join(HERE, "..", "..", "scenarios", "verify", "ground_truth.json"), "utf-8"));

function loopRun() {
  return {
    agents: [{ key: "m1", household: true }, { key: "m2", household: true }],
    trips: [
      { id: "t000001", agent: "m1", day: 0, purpose: "commute", minutes: 25 },
      { id: "t000002", agent: "m2", day: 0, purpose: "commute", minutes: 35 },
      { id: "t000003", agent: "m1", day: 1, purpose: "errand", minutes: 10 },
      { id: "t000004", agent: "m1", day: 1, purpose: "school", minutes: 12 },
      { id: "t000005", agent: "m1", day: 2, purpose: "park", minutes: 8 },
      { id: "t000006", agent: "m2", day: 2, purpose: "clinic", minutes: 15 },
    ],
    aways: [],
    decisions: [{ id: "d1", agent: "m1", day: 0, kind: "park_or_home",
      chosen_key: "park", chosen_by: "rule" }],
  };
}

const HOME = { monthly_won: 500000, maintenance_won_month: 100000,
  utilities_won_month: 50000 };

function sentence(id, item_id, text_ko, claims = [], evidence = []) {
  return { id, text_ko, item_id, claims, evidence };
}
const min = (value, member) => ({ field: "minutes", value, unit: "분",
  ...(member === undefined ? {} : { member }) });

const S_C01 = sentence("s1", "C01", "통근은 평균 30분이에요", [min(30)]);
const S_C02_OK = sentence("s2", "C02", "월 주거비는 650000원이에요",
  [{ field: "monthly_total", value: 650000, unit: "원" }]);
const S_C02_BAD = sentence("s2", "C02", "월 주거비는 600000원이에요",
  [{ field: "monthly_total", value: 600000, unit: "원" }]);
const S_C05_OK = sentence("s3", "C05", "장보기는 10분 거리예요", [min(10)]);
const S_C05_BARE = sentence("s3", "C05", "장보기는 10분 거리예요");
const S_F01 = sentence("s4", "F01", "등원은 12분이에요", [min(12)]);
const S_F03 = sentence("s5", "F03", "공원은 8분 거리예요", [min(8)]);
const S_F05 = sentence("s6", "F05", "소아과는 15분 거리예요", [min(15)]);
const S_C06 = sentence("s7", "C06", "밤늦게 도착한 날이 있어요", [], ["t000001"]);

const V1 = { persona: "young_family", home: HOME,
  sentences: [S_C01, S_C02_BAD, S_C05_BARE] };
const V2 = { persona: "young_family", home: HOME,
  sentences: [S_C01, S_C02_OK, S_C05_BARE] };
const V3 = { persona: "young_family", home: HOME,
  sentences: [S_C01, S_C02_OK, S_C05_OK] };
const V4 = { persona: "young_family", home: HOME,
  sentences: [S_C01, S_C02_OK, S_C05_OK, S_F01, S_C06] };
const VPASS = { persona: "young_family", home: HOME,
  sentences: [S_C01, S_C02_OK, S_C05_OK, S_F01, S_F03, S_F05, S_C06] };

describe("verifyReport", () => {
  const run = loopRun();
  it("unsupported personas stay 미지원 and never pass", () => {
    for (const persona of ["remote_worker", "multigen_family", "pet_owner"]) {
      const res = verifyReport({ persona, home: HOME, sentences: [] }, run,
        persona, { groundTruth: GT });
      assert.deepEqual(res, { status: "미지원",
        reason_ko: "이 가족 유형은 아직 시뮬레이션 시나리오가 없어요",
        pass: false });
    }
  });
  it("full young_family report passes at 1.0", () => {
    const res = verifyReport(VPASS, run, "young_family", { groundTruth: GT });
    assert.equal(res.pass, true);
    assert.equal(res.must_coverage, 1.0);
    assert.equal(res.weighted_coverage, 1.0);
    assert.deepEqual(res.failures, []);
  });
  it("lists engine:none items as unsupported, never failed", () => {
    const res = verifyReport(VPASS, run, "young_family", { groundTruth: GT });
    assert.equal(res.unsupported.length, 8);
    assert.ok(res.unsupported.every((u) => u.reason_ko.includes("미지원")));
    const mustNotes = res.feedback_ko.filter((f) => f.includes("엔진이 아직 확인할 수 없는 필수 항목"));
    assert.equal(mustNotes.length, 2); // C03, F02
  });
  it("failed sentences are not covered (draft v1: 23 %)", () => {
    const res = verifyReport(V1, run, "young_family", { groundTruth: GT });
    assert.equal(res.pass, false);
    assert.equal(res.failures.length, 2);
    assert.equal(res.must_coverage, 0.33);
    assert.equal(res.weighted_coverage, 0.23);
    assert.ok(res.feedback_ko[0].includes("문장 s2"));
  });
  it("passes a newlywed report with per-member N01", () => {
    const report = { persona: "newlywed_couple", home: HOME, sentences: [
      S_C01, S_C02_OK, S_C05_OK,
      sentence("s7", "N01", "두 사람 통근은 25분과 35분이에요",
        [min(25, "m1"), min(35, "m2")]),
    ] };
    const res = verifyReport(report, run, "newlywed_couple", { groundTruth: GT });
    assert.equal(res.pass, true);
    assert.equal(res.weighted_coverage, 0.83);
  });
  it("accepts a loaded ground-truth object and requires groundTruth", () => {
    const loaded = loadGroundTruth(GT, "young_family");
    const res = verifyReport(VPASS, run, loaded, { groundTruth: GT });
    assert.equal(res.pass, true);
    assert.throws(() => verifyReport(VPASS, run, "young_family"), /groundTruth/);
  });
});

describe("runVerifyLoop", () => {
  const run = loopRun();
  const NEXT = { 1: V2, 2: V3, 3: V4 };

  it("fixes one problem per attempt: 23 % → 46 % → 54 % → 85 % 통과", async () => {
    const { result, attempts, handoff } = await runVerifyLoop({
      draft: V1, run, persona: "young_family", groundTruth: GT,
      maxRetries: GT.acceptance.max_retries,
      revise: async (_report, _res, attempt) => NEXT[attempt],
    });
    assert.equal(GT.acceptance.max_retries, 3);
    assert.equal(attempts.length, 4);
    assert.deepEqual(attempts.map((a) => a.summary_ko), [
      "검증 실패: 보고한 600,000원이 계산 650,000원과 달라요 1개, 근거 없는 숫자 1개, 커버리지 23%",
      "검증 실패: 근거 없는 숫자 1개, 커버리지 46%",
      "검증 실패: 누락 항목 있음, 커버리지 54%",
      "검증 통과: 커버리지 85%",
    ]);
    assert.equal(result.pass, true);
    assert.equal(result.weighted_coverage, 0.85);
    assert.equal(handoff, null);
  });
  it("hands off to the user after 3 failed retries", async () => {
    const { result, attempts, handoff } = await runVerifyLoop({
      draft: V1, run, persona: "young_family", groundTruth: GT,
      maxRetries: GT.acceptance.max_retries,
      revise: async (report) => report, // never fixes
    });
    assert.equal(attempts.length, 4);
    assert.equal(result.pass, false);
    assert.equal(handoff.ask_user, true);
    assert.match(handoff.question_ko, /4번 시도/);
    assert.equal(GT.acceptance.on_fail_after_retries, "escalate_to_user");
  });
  it("passing draft needs one attempt; 미지원 returns at once", async () => {
    const ok = await runVerifyLoop({ draft: VPASS, run,
      persona: "young_family", groundTruth: GT,
      maxRetries: 3, revise: async (r) => r });
    assert.equal(ok.attempts.length, 1);
    assert.equal(ok.handoff, null);
    let reviseCalls = 0;
    const un = await runVerifyLoop({ draft: V1, run,
      persona: "remote_worker", groundTruth: GT,
      maxRetries: 3, revise: async (r) => { reviseCalls++; return r; } });
    assert.equal(un.attempts.length, 1);
    assert.equal(un.result.status, "미지원");
    assert.equal(un.handoff, null);
    assert.equal(reviseCalls, 0);
  });
});

describe("real-build report check (16b)", () => {
  it("dual-income-child-A: 43.6분 passes, 10.3분 fails on C01", () => {
    const p = join(HERE, "..", "..", "data", "build", "sim",
      "persona-dual-income-child-A.json");
    if (!existsSync(p)) return; // built data is not committed
    const run = JSON.parse(readFileSync(p, "utf-8"));
    const report = (value) => ({ persona: "young_family", home: HOME,
      sentences: [
        sentence("s1", "C01", `통근은 평균 ${value}분이에요`, [min(value)]),
      ] });
    const ok = verifyReport(report(43.6), run, "young_family",
      { groundTruth: GT });
    assert.deepEqual(ok.failures.filter((f) => f.kind === "number"), []);
    const bad = verifyReport(report(10.3), run, "young_family",
      { groundTruth: GT });
    const numberFailures = bad.failures.filter((f) => f.kind === "number");
    assert.equal(numberFailures.length, 1);
    assert.equal(numberFailures[0].item_id, "C01");
  });
});
