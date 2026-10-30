// Stage 18 part 3 — readable results. Pure tests for the plain-words
// compare rows, the 어떻게 계산했나요 facts, and the chat summary
// helpers (score, monthly housing, one-way commute).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

// .jsx loads dynamically (static imports resolve before the loader).
let plainMetricLine;
let howCalculatedLines;
let monthlyHousingOf;
let commuteOneWayOf;
let resultScoreOf;
before(async () => {
  ({ plainMetricLine, howCalculatedLines } = await import("../src/ui/app.jsx"));
  ({ monthlyHousingOf, commuteOneWayOf, resultScoreOf } = await import("../src/ui/chat.jsx"));
});

const cmp = (metrics, extra = {}) => ({
  days: 30, metrics, members: [],
  judgment: { a: {}, b: {} },
  ...extra,
});

describe("18-3 plain-words compare rows", () => {
  it("reads a commute delta as a daily average", () => {
    const line = plainMetricLine(
      { key: "commute_ride_minutes", unit: "minutes", a: 1200, b: 1470, delta_b_minus_a: 270 }, 30);
    assert.equal(line, "B가 하루 평균 9분 더 차·지하철을 타요");
  });

  it("reads counts as totals without a verb", () => {
    const line = plainMetricLine(
      { key: "errands_done", unit: "count", a: 8, b: 4, delta_b_minus_a: -4 }, 30);
    assert.equal(line, "A가 장보기 4번 더");
  });

  it("reads fatigue as lower-is-better with both values", () => {
    const line = plainMetricLine(
      { key: "fatigue_arrival_work_avg", unit: "index", a: 5.1, b: 4.3, delta_b_minus_a: -0.8 }, 30);
    assert.ok(line.startsWith("B가 회사 도착할 때 덜 피곤해요"), line);
    assert.ok(line.includes("5.1") && line.includes("4.3"), line);
  });

  it("reads congestion in percentage points", () => {
    const line = plainMetricLine(
      { key: "fatigue_peak_congestion_pct", unit: "percent", a: 80, b: 92, delta_b_minus_a: 12 }, 30);
    assert.equal(line, "B가 출근길 가장 붐비는 순간 12%포인트 더 붐벼요");
  });

  it("reads zero as 같아요 and null as nothing", () => {
    assert.equal(plainMetricLine(
      { key: "park_visits", unit: "count", a: 3, b: 3, delta_b_minus_a: 0 }, 30),
    "A와 B가 같아요");
    assert.equal(plainMetricLine(
      { key: "park_visits", unit: "count", a: null, b: 3, delta_b_minus_a: null }, 30), null);
  });

  it("falls back to the 30-day total for sub-minute daily gaps", () => {
    const line = plainMetricLine(
      { key: "walk_minutes", unit: "minutes", a: 100, b: 106, delta_b_minus_a: 6 }, 30);
    assert.ok(line.includes("30일 동안 모두"), line);
  });
});

describe("18-3 어떻게 계산했나요 facts", () => {
  it("states rules-only with 0 model days when nothing was chosen by the model", () => {
    const lines = howCalculatedLines(cmp([]));
    assert.ok(lines.some((l) => l.includes("정해 둔 생활 규칙으로 만들었어요")
      && l.includes("Muse 판단이 들어간 날: 0일")), lines.join(" | "));
  });

  it("counts model-chosen scenes when present", () => {
    const lines = howCalculatedLines(cmp([],
      { judgment: { a: { model: 2 }, b: { model: 0 } } }));
    assert.ok(lines.some((l) => l.includes("A 2개")), lines.join(" | "));
  });

  it("keeps no internal wording and carries the anchor fact", () => {
    const lines = howCalculatedLines(cmp([],
      { anchors: [{ label: "B", method: "coordinate" }] }));
    const all = lines.join("\n");
    assert.ok(!all.includes("고른 주체"), all);
    assert.ok(!all.includes("그래프 ="), all);
    assert.ok(all.includes("B는 3D 장면에 단지 이름이 없어 집 위치에서 시작했어요"), all);
  });
});

const moneyDoc = () => ({
  default_tenure: { A: "전세", B: "전세" },
  homes: {
    A: { qol_time: { commute_minutes_per_day: 90 },
      by_tenure: { 전세: { housing: { monthly_won: 500000, upfront_won: 200000000 },
        totals_by_category: { maintenance: -20000, transit: -3000 },
        burden_ratio: 20, remaining_won: 1000000 } } },
    B: { qol_time: { commute_minutes_per_day: 60 },
      by_tenure: { 전세: { housing: { monthly_won: 400000, upfront_won: 180000000 },
        totals_by_category: { maintenance: -20000, transit: -2000 },
        burden_ratio: 18, remaining_won: 1100000 } } },
  },
});

describe("18-3 chat summary helpers", () => {
  it("composes 월 주거비 from the money doc (housing + 관리비 + 교통비)", () => {
    const mh = monthlyHousingOf(moneyDoc(), "A", 30);
    assert.equal(mh.tenure, "전세");
    assert.equal(mh.monthly, 500000 + 600000 / 30 + 90000 / 30);
    assert.deepEqual(mh.parts, { housing: 500000, maintenance: 20000, transit: 3000 });
  });

  it("reports missing money as missing, never another home's numbers", () => {
    assert.ok(monthlyHousingOf(null, "A").missing);
    assert.ok(monthlyHousingOf(moneyDoc(), "C").missing);
  });

  it("averages door-to-door one-way per commuting member, skipping non-commuters", () => {
    const rows = commuteOneWayOf({ days: 30,
      members: [
        { member: "h1", label: "나",
          commute_walk_minutes: { a: 600, b: 300 },
          commute_ride_minutes: { a: 1200, b: 600 } },
        { member: "h2", label: "아이",
          commute_walk_minutes: { a: 0, b: 0 },
          commute_ride_minutes: { a: 0, b: 0 } },
      ] });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].a, 30);
    assert.equal(rows[0].b, 15);
    assert.equal(rows[0].plain, "나 — A가 하루 편도 평균 15분 더 걸려요");
  });

  it("scores from the customer's own weights without sorting or crowning", () => {
    const doc = moneyDoc();
    const compare = { days: 30, home_a: { label: "A" }, home_b: { label: "B" },
      metrics: [
        { key: "errands_done", a: 4, b: 8 },
        { key: "park_visits", a: 2, b: 6 },
      ] };
    const scored = resultScoreOf(doc, compare, null, false);
    assert.ok(scored.ok, "scores compute");
    assert.deepEqual(Object.keys(scored.scores), ["A", "B"]);
    assert.ok(scored.caption.length > 0, "caption travels with the score");
    assert.ok(resultScoreOf(null, compare).ok === false);
  });
});
