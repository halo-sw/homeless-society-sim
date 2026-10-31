// 19d: the 30-day result as an A|B table. fmtWonShort unit checks plus
// an SSR render of the done-state SimulationCard: one grid, one label
// per row, moments with inline 3D links, no winner wording.
//
// Fixture notes: the compare carries no one_way, so the commute row
// exercises the member fallback ("나 출퇴근 편도"); the score and money
// rows come from the money doc. The A moment text has a matching
// moment (button), the B one does not (no button).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

// .jsx loads dynamically (static imports resolve before the loader).
let React;
let renderToString;
let SimulationCard;
let resultScoreOf;
let fmtWonShort;

function moneyDoc() {
  return {
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
  };
}

function compareDoc() {
  return { days: 30, home_a: { label: "A" }, home_b: { label: "B" },
    metrics: [
      { key: "errands_done", label: "장보기", unit: "count",
        a: 4, b: 8, delta_b_minus_a: 4, source: "규칙 기반" },
      { key: "park_visits", label: "공원 산책", unit: "count",
        a: 2, b: 6, delta_b_minus_a: 4, source: "규칙 기반" },
    ],
    members: [
      { member: "h1", label: "나",
        commute_walk_minutes: { a: 600, b: 300 },
        commute_ride_minutes: { a: 1200, b: 600 } },
    ],
    judgment: { a: {}, b: {} } };
}

function doneData() {
  return { labels: ["A", "B"],
    names: { A: "천사의도시II오피스텔", B: "시그마 3" },
    compare: compareDoc(), moneyDoc: moneyDoc(),
    momentTexts: [
      { when_ko: "3일차 17:48", home: "A", text_ko: "장보기 7번 — B는 3번" },
      { when_ko: "1일차 07:49", home: "B", text_ko: "가장 오래 걸린 날 출근 13분" },
    ],
    moments: [{ label: "A", day: 3, t: "17:48", follow: 1 }],
    extraLine: "가정 −2/0/+2% 시나리오는 결과 화면에서 고르세요." };
}

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ SimulationCard, resultScoreOf } = await import("../src/ui/chat.jsx"));
  ({ fmtWonShort } = await import("../src/money/format.js"));
});

function count(html, s) {
  return html.split(s).length - 1;
}

describe("19d result card as an A|B table", () => {
  it("fmtWonShort rounds to thousands in 만/천 units", () => {
    assert.equal(fmtWonShort(668200), "월 66만 8천 원");
    assert.equal(fmtWonShort(641534), "월 64만 2천 원");
    assert.equal(fmtWonShort(1200000), "월 120만 원");
    assert.equal(fmtWonShort(0), "월 0 원");
  });

  it("renders one grid with one row label per fact", () => {
    const html = renderToString(
      React.createElement(SimulationCard,
        { data: doneData(), example: "single-firstjob" }));
    assert.equal(count(html, "ui-result-grid"), 1, "single grid");
    // The bare grid labels; the 자세히 보기 tab uses longer forms
    // ("출퇴근 편도 (문 앞→회사)") which must not match these counts.
    assert.equal(count(html, ">내 기준 점수<"), 1, "score row once");
    assert.equal(count(html, ">월 주거비<"), 1, "money row once");
    // No one_way here, so the member fallback labels one row per member.
    assert.equal(count(html, ">나 출퇴근 편도<"), 1, "commute row once");
    assert.equal(count(html, "출퇴근 편도"), 1, "no duplicate commute wording");
    assert.ok(html.includes("같은 식구가 두 집에서 30일씩 살아 봤어요"), "subtitle");
  });

  it("links 3D once per moment with a matching label", () => {
    const html = renderToString(
      React.createElement(SimulationCard,
        { data: doneData(), example: "single-firstjob" }));
    assert.equal(count(html, 'aria-label="장면 보기:'), 1, "A text links, B text does not");
    assert.ok(!html.includes("3D로 보기"), "ghost buttons gone");
    assert.ok(!html.includes("3D에서 보기"), "old buttons gone");
  });

  it("never crowns a winner", () => {
    const html = renderToString(
      React.createElement(SimulationCard,
        { data: doneData(), example: "single-firstjob" }));
    for (const w of ["더 나아요", "추천", "승"]) {
      assert.ok(!html.includes(w), `no ${w}`);
    }
  });

  it("shows both home scores in A, B order", () => {
    const html = renderToString(
      React.createElement(SimulationCard,
        { data: doneData(), example: "single-firstjob" }));
    const scored = resultScoreOf(moneyDoc(), compareDoc(), null, false);
    assert.ok(scored.ok, "scores compute");
    const pts = [...html.matchAll(/([\d.]+)점/g)].map((m) => m[1]);
    assert.deepEqual(pts, [String(scored.scores.A), String(scored.scores.B)]);
  });
});
