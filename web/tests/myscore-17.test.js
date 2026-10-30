// 17-2: 내 기준 점수 up front. Pure score helper (basis, order,
// safety exclusion, relative-fit formula), the guard allow/deny pair,
// the drawer row, and the share card's first row.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { weightedView, defaultWeights, myScore, priorityValues,
  MYSCORE_CAPTIONS } from "../src/priorities.js";
import { scoreVerdict } from "../src/consult/guards.js";
import { resultCardData, renderShareCard } from "../src/ui/share.js";

const VALUES = {
  A: { money_housing: 100, money_burden: 0.2, money_remaining: 300 },
  B: { money_housing: 200, money_burden: 0.4, money_remaining: 100 },
};
const FULL_WEIGHTS = { edu: 4, life: 3, safety: 5, money: 2, convenience: 1 };

function moneyFixture() {
  const home = (o) => ({
    complex_name: o.complex, area_m2: o.area,
    by_tenure: {
      "전세": {
        housing: { monthly_won: o.monthly, source: "rtms" },
        remaining_won: o.remaining, burden_ratio: o.burden,
      },
    },
    qol_time: { commute_minutes_per_day: o.day,
      evening_at_home_minutes_per_day: o.eve },
    qol_fatigue: { avg_30d: o.fatigue },
    qol_convenience: { grocery: o.grocery, clinic: o.clinic, station: o.station },
    qol_education: { counts: { within_10min: { school_elementary: o.schools } },
      nearest: { school: [{ minutes: o.schoolMin }] } },
    qol_safety: { total: o.safety,
      groups: [{ cat1: "강력범죄", count: 1 }, { cat1: "폭력범죄", count: 2 }] },
  });
  return {
    days: 30,
    homes: {
      A: home({ complex: "A단지", area: 60, monthly: 2000000,
        remaining: 3000000, burden: 0.4, day: 120, eve: 600,
        fatigue: 40, grocery: 1, clinic: 0, station: 0,
        schools: 1, schoolMin: 12, safety: 500 }),
      B: home({ complex: "B단지", area: 84, monthly: 1000000,
        remaining: 4000000, burden: 0.2, day: 50, eve: 660,
        fatigue: 10, grocery: 3, clinic: 2, station: 1,
        schools: 3, schoolMin: 5, safety: 50 }),
    },
  };
}

function fakeCanvas() {
  const texts = [];
  const canvas = {
    getContext: () => ({
      set font(v) { this._font = v; },
      set textBaseline(v) { this._base = v; },
      measureText: (s) => ({ width: String(s).length * 20 }),
      fillRect: () => {},
      fillText: (text) => { texts.push(String(text)); },
    }),
  };
  return { canvas, texts };
}

describe("17-2 myScore helper", () => {
  it("computes default basis without explicit weights", () => {
    const r = myScore(VALUES, null, {});
    assert.equal(r.ok, true);
    assert.equal(r.basis, "default");
    assert.deepEqual(r.scores, { A: 100, B: 0 });
    assert.equal(r.caption, MYSCORE_CAPTIONS.default);
    assert.match(r.caption, /모두 보통/);
  });

  it("computes customer basis with explicit weights", () => {
    const r = myScore(VALUES, FULL_WEIGHTS, { explicit: true });
    assert.equal(r.ok, true);
    assert.equal(r.basis, "customer");
    assert.deepEqual(r.scores, { A: 100, B: 0 });
    assert.equal(r.caption, MYSCORE_CAPTIONS.customer);
    assert.match(r.caption, /내가 정한 비중/);
    assert.match(r.caption, /주관적인 점수/);
  });

  it("still refuses explicit-but-invalid weights", () => {
    const r = myScore(VALUES, { money: 5 }, { explicit: true });
    assert.equal(r.ok, false);
  });

  it("never sums safety in, however weighted or counted", () => {
    const withSafety = {
      A: { ...VALUES.A, safety_total: 10000, safety_violent: 999 },
      B: { ...VALUES.B, safety_total: 0, safety_violent: 0 },
    };
    const plain = myScore(VALUES, FULL_WEIGHTS, { explicit: true });
    const loaded = myScore(withSafety, FULL_WEIGHTS, { explicit: true });
    assert.deepEqual(loaded.scores, plain.scores);
    const noSafetyWeight = myScore(withSafety,
      { ...FULL_WEIGHTS, safety: 0 }, { explicit: true });
    assert.deepEqual(noSafetyWeight.scores, plain.scores);
  });

  it("keeps A/B order and rounds 100 × weighted mean", () => {
    const r = myScore(VALUES, FULL_WEIGHTS, { explicit: true });
    assert.deepEqual(Object.keys(r.scores), ["A", "B"]);
    const v = weightedView(VALUES, FULL_WEIGHTS, { explicit: true });
    for (const l of ["A", "B"]) {
      assert.equal(r.scores[l], Math.round(100 * v.homes[l].score));
    }
    assert.ok(!("winner" in r) && !("ranking" in r));
  });

  it("formula_ko says relative fit, not an absolute grade", () => {
    const r = myScore(VALUES, null, {});
    assert.match(r.formula_ko, /상대/);
    assert.match(r.formula_ko, /절대.*아니/);
    assert.match(r.formula_ko, /치안/);
  });
});

describe("17-2 scoreVerdict allow/deny", () => {
  it("allows 내 기준 점수 phrases with a number", () => {
    for (const text of [
      "내 기준 점수 A 62 · B 38",
      "내 기준 점수는 62예요",
      "내가 정한 비중으로 계산한 주관적인 점수예요. A 62, B 38",
      "주관적인 점수 38점입니다",
    ]) {
      assert.equal(scoreVerdict(text), null, text);
    }
  });

  it("still trips safety/school scores, rankings and 추천 집", () => {
    for (const text of [
      "치안 점수 80점입니다",
      "안전 점수는 90점",
      "학교 순위가 높습니다",
      "범죄 순위 1위입니다",
      "A가 1위예요",
      "이 집을 추천합니다",
      "가장 좋은 집은 A입니다",
      "내 기준 점수 62점, 이 집을 추천합니다",
    ]) {
      assert.notEqual(scoreVerdict(text), null, text);
    }
  });
});

describe("17-2 drawer score row (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let SimDrawer;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ SimDrawer } = await import("../src/ui/app.jsx"));
  });

  function stateWith(weights) {
    return {
      clock: { minute: 530 },
      now: { free: true, rows: [] },
      ticker: [],
      judgeLog: [],
      compareOpen: false,
      money: moneyFixture(),
      compare: null,
      priorityWeights: weights,
    };
  }

  it("shows the score above the hero with the default caption", () => {
    const html = renderToString(
      React.createElement(SimDrawer, { state: stateWith(null) }));
    assert.ok(html.includes("내 기준 점수"), "title");
    assert.ok(html.includes(MYSCORE_CAPTIONS.default), "default caption");
    assert.ok(html.includes("비중 정하기"), "link to the tab");
    const rowAt = html.indexOf("myscore-row");
    const heroAt = html.indexOf("sim-hero");
    assert.ok(rowAt !== -1 && heroAt !== -1 && rowAt < heroAt, "score above hero");
    const aAt = html.indexOf("A 내 기준 점수");
    const bAt = html.indexOf("B 내 기준 점수");
    assert.ok(aAt !== -1 && bAt !== -1 && aAt < bAt, "A/B order kept");
    assert.ok(!html.includes("ui-fill-"), "both bars neutral, no winner colour");
    assert.ok(!html.includes("추천"), "no recommendation wording");
  });

  it("shows the customer caption without the link when explicit", () => {
    const html = renderToString(React.createElement(SimDrawer,
      { state: stateWith({ explicit: true, weights: FULL_WEIGHTS }) }));
    assert.ok(html.includes(MYSCORE_CAPTIONS.customer), "customer caption");
    assert.ok(!html.includes("비중 정하기"), "no link needed");
  });

  it("hides quietly without the money doc", () => {
    const st = stateWith(null);
    st.money = null;
    const html = renderToString(React.createElement(SimDrawer, { state: st }));
    assert.ok(!html.includes("내 기준 점수"), "no score row");
    assert.ok(html.includes("sim-hero"), "hero still renders");
  });
});

describe("17-2 share card first row", () => {
  const TENURES = { A: "전세", B: "전세" };

  it("carries the score with the same caption (customer basis)", () => {
    const data = resultCardData({ money: moneyFixture(), compare: null,
      tenures: TENURES,
      priorities: { groups: [] },
      weights: { explicit: true, weights: FULL_WEIGHTS } });
    assert.ok(data.score, "score present");
    assert.equal(data.score.basis, "customer");
    assert.deepEqual(Object.keys(data.score.scores), ["A", "B"]);
    assert.equal(data.score.caption, MYSCORE_CAPTIONS.customer);
    const direct = myScore(
      priorityValues(moneyFixture(), null, TENURES), FULL_WEIGHTS, { explicit: true });
    assert.deepEqual(data.score.scores, direct.scores);
  });

  it("falls back to the default basis without weights", () => {
    const data = resultCardData({ money: moneyFixture(), compare: null,
      tenures: TENURES, priorities: { groups: [] }, weights: null });
    assert.ok(data.score, "score present");
    assert.equal(data.score.basis, "default");
    assert.equal(data.score.caption, MYSCORE_CAPTIONS.default);
  });

  it("renders the score before the compare rows on canvas", () => {
    const data = resultCardData({ money: moneyFixture(), compare: null,
      tenures: TENURES, priorities: { groups: [] }, weights: null });
    const { canvas, texts } = fakeCanvas();
    renderShareCard(canvas, data);
    const scoreAt = texts.indexOf("내 기준 점수");
    assert.ok(scoreAt !== -1, "score row drawn");
    const firstRowAt = texts.indexOf(data.rows[0].label);
    assert.ok(firstRowAt !== -1 && scoreAt < firstRowAt, "score first");
    assert.ok(texts.includes(data.score.caption), "caption drawn");
  });
});
