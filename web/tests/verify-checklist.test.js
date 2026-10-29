// Stage 16a part 2: checklist scorer tests (pure, node --test).
//
// Parity: clean labels of each persona score exactly the Python
// reference numbers (tools/verify_checklist.py, run 2026-10-30, all
// passed/must 1.0/weighted 1.0), hard-coded below. Fixes: every audit
// false positive (2026-10-29) no longer covers its target, the
// one-line keyword salad fails, negation fails.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGroundTruth, scoreChecklist, matchKeyword, isNegated } from "../src/verify/checklist.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GT = JSON.parse(readFileSync(
  join(HERE, "..", "..", "scenarios", "verify", "ground_truth.json"), "utf-8"));

const PERSONAS = ["young_family", "remote_worker", "newlywed_couple",
  "multigen_family", "pet_owner", "single_firstjob"];

function cleanLabels(persona) {
  return loadGroundTruth(GT, persona).items.map((it) => it.label_ko);
}

describe("matchKeyword: the whole-word rule", () => {
  const cases = [
    // [keyword, text, expected match count]
    ["향", "남향", 0], // "남향" matches via its own full keyword, not via "향"
    ["남향", "남향", 1],
    ["향", "향이 좋아요", 1],
    ["향", "향후 이사 계획", 0],
    ["향", "방향 감각", 0],
    ["짐", "짐작이에요", 0],
    ["짐", "수납·짐 배치", 1],
    ["park", "주차장(parking)", 0],
    ["park", "park 근처", 1],
    ["call", "recall", 0],
    ["call", "화상 call 품질", 1],
    ["안전", "안전한 투자", 0],
    ["안전", "차량 안전", 1],
    ["병원", "병원비", 0],
    ["병원", "병원 접근성", 1],
    // Longer keywords keep reference substring behaviour.
    ["commute", "my COMMUTE route", 1],
    ["night", "midnight snack", 1],
  ];
  for (const [kw, text, n] of cases) {
    it(`${JSON.stringify(kw)} in ${JSON.stringify(text)} -> ${n}`, () => {
      assert.equal(matchKeyword(kw, text).length, n);
    });
  }
});

describe("isNegated", () => {
  it("flags 않 near the keyword", () => {
    const t = "소음은 확인하지 않았어요";
    assert.equal(isNegated(t, 0, 2), true);
  });
  it("flags 못 and standalone 안", () => {
    assert.equal(isNegated("소음 확인을 못 했어요", 0, 2), true);
    assert.equal(isNegated("소음은 안 했어요", 0, 2), true);
  });
  it("does not trip on 안전/불안, and distant 않 is out of window", () => {
    assert.equal(isNegated("차량 안전", 3, 2), false);
    assert.equal(isNegated("소음은 확인했어요. 이사하지 않아요", 0, 2), false);
  });
  it("flags English not/skip", () => {
    assert.equal(isNegated("noise not checked", 0, 5), true);
    assert.equal(isNegated("check noise levels", 6, 5), false);
  });
});

describe("loadGroundTruth", () => {
  it("combines common + persona items", () => {
    assert.equal(loadGroundTruth(GT, "young_family").items.length, 15);
    assert.equal(loadGroundTruth(GT, "remote_worker").items.length, 14);
    assert.equal(loadGroundTruth(GT, "single_firstjob").items.length, 9);
  });
  it("throws on unknown persona", () => {
    assert.throws(() => loadGroundTruth(GT, "nope"), /unknown persona/);
  });
});

describe("parity with tools/verify_checklist.py on clean input", () => {
  // Python numbers, hard-coded (all six personas pass at 1.0/1.0).
  for (const persona of PERSONAS) {
    it(`${persona}: clean labels pass at 1.0`, async () => {
      const res = await scoreChecklist(loadGroundTruth(GT, persona), cleanLabels(persona));
      assert.equal(res.passed, true);
      assert.equal(res.must_coverage, 1.0);
      assert.equal(res.weighted_coverage, 1.0);
      assert.deepEqual(res.missing, []);
      assert.deepEqual(res.feedback_ko, []);
      assert.equal(res.covered.length, cleanLabels(persona).length);
    });
  }
  it("accepts a persona key with opts.groundTruth", async () => {
    const res = await scoreChecklist("young_family", cleanLabels("young_family"),
      { groundTruth: GT });
    assert.equal(res.passed, true);
  });
});

describe("audit false positives no longer cover", () => {
  // [agent line, persona, must-not-cover ids]
  const cases = [
    ["향후 이사 계획", "young_family", ["C04"]],
    ["방향 감각", "young_family", ["C04"]],
    ["짐작", "young_family", ["C07"]],
    ["주차장(parking)", "young_family", ["F03"]],
    ["recall", "remote_worker", ["R02"]],
    ["안전한 투자", "young_family", ["F02"]],
    ["병원비", "young_family", ["F05"]],
    ["병원비", "multigen_family", ["M02"]],
    ["소음은 확인하지 않았어요", "young_family", ["C03"]],
    ["소음 확인을 못 했어요", "young_family", ["C03"]],
    ["noise not checked", "young_family", ["C03"]],
  ];
  for (const [line, persona, banned] of cases) {
    it(`${JSON.stringify(line)} covers none of ${banned}`, async () => {
      const res = await scoreChecklist(loadGroundTruth(GT, persona), [line]);
      for (const id of banned) assert.ok(!res.covered.includes(id), `${id} covered`);
      assert.equal(res.passed, false);
    });
  }
  it("one line covers at most one item (엘리베이터 대기)", async () => {
    const young = await scoreChecklist(loadGroundTruth(GT, "young_family"), ["엘리베이터 대기"]);
    assert.deepEqual(young.covered, ["C09"]);
    assert.equal(young.passed, false);
    const multi = await scoreChecklist(loadGroundTruth(GT, "multigen_family"), ["엘리베이터 대기"]);
    assert.deepEqual(multi.covered, ["M01"]); // must wins over should
  });
  it("one-line keyword salad fails", async () => {
    const salad = "통근 월세 소음 채광 마트 귀갓길 수납 하자 아침 어린이집 차량 놀이터 유모차 소아과 이웃";
    const res = await scoreChecklist(loadGroundTruth(GT, "young_family"), [salad]);
    assert.deepEqual(res.covered, ["F01"]); // longest keyword wins the single line
    assert.equal(res.must_coverage, 0.2);
    assert.equal(res.weighted_coverage, 0.12);
    assert.equal(res.passed, false);
  });
  it("FP lines together still fail (아침 stays ambiguous, needs the judge)", async () => {
    // "아침 식사 메뉴" still matches C09 on the standalone word 아침 —
    // no deterministic boundary rule separates it from "아침 동선".
    // The checklist still fails: must_coverage is 0.
    const lines = ["향후 이사 계획", "짐작", "주차장(parking)", "안전한 투자",
      "아침 식사 메뉴", "병원비", "소음은 확인하지 않았어요"];
    const res = await scoreChecklist(loadGroundTruth(GT, "young_family"), lines);
    assert.equal(res.passed, false);
    assert.equal(res.must_coverage, 0);
  });
  it("positive controls still cover", async () => {
    const res = await scoreChecklist(loadGroundTruth(GT, "young_family"),
      ["소음이 걱정돼요", "차량 안전 확인", "병원 접근성 좋아요"]);
    assert.ok(res.covered.includes("C03"));
    assert.ok(res.covered.includes("F02"));
  });
});

describe("partial coverage and judge fallback", () => {
  it("empty checklist: 0 coverage, must-first feedback", async () => {
    const res = await scoreChecklist(loadGroundTruth(GT, "young_family"), []);
    assert.equal(res.passed, false);
    assert.equal(res.must_coverage, 0);
    assert.equal(res.weighted_coverage, 0);
    assert.equal(res.missing.length, 15);
    assert.equal(res.feedback_ko.length, 15);
    assert.ok(res.feedback_ko[0].startsWith("[MUST]"));
    assert.ok(res.feedback_ko[0].includes("항목이 빠졌어요."));
  });
  it("three must labels: must 0.6, weighted 0.36", async () => {
    const labels = cleanLabels("young_family").slice(0, 3);
    const res = await scoreChecklist(loadGroundTruth(GT, "young_family"), labels);
    assert.deepEqual(res.covered, ["C01", "C02", "C03"]);
    assert.equal(res.must_coverage, 0.6);
    assert.equal(res.weighted_coverage, 0.36);
    assert.equal(res.passed, false);
  });
  it("injected async judge covers unmatched items only", async () => {
    let calls = 0;
    const judge = async (item) => { calls++; return item.id === "C03"; };
    const res = await scoreChecklist(loadGroundTruth(GT, "single_firstjob"),
      ["주 통근·통학 시간"], { judge });
    assert.ok(res.covered.includes("C01"));
    assert.ok(res.covered.includes("C03"));
    assert.equal(calls, 8); // every unmatched item, not the matched C01
    assert.equal(res.passed, false);
  });
  it("judge true everywhere passes an empty checklist", async () => {
    const res = await scoreChecklist(loadGroundTruth(GT, "single_firstjob"), [],
      { judge: async () => true });
    assert.equal(res.passed, true);
    assert.equal(res.weighted_coverage, 1.0);
  });
});
