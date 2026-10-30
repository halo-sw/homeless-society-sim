import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRIORITY_GROUPS, PRIORITY_METRICS, NUMERIC_GROUPS,
  defaultWeights, validateWeights, weightedView,
} from "../src/priorities.js";

const UNITS = new Set(["minutes", "count", "index", "won_month", "ratio"]);
const SOURCES = new Set(["graph", "scenario", "graph+scenario", "rtms", "police"]);
const DIRS = new Set(["lower", "higher", "none"]);

describe("priorities", () => {
  it("has five groups, each with named metrics carrying unit + source", () => {
    assert.deepEqual(PRIORITY_GROUPS.map((g) => g.id),
      ["edu", "life", "safety", "money", "convenience"]);
    assert.ok(PRIORITY_METRICS.length >= 10);
    const ids = new Set();
    for (const m of PRIORITY_METRICS) {
      assert.ok(m.id && !ids.has(m.id), `dup ${m.id}`);
      ids.add(m.id);
      assert.ok(PRIORITY_GROUPS.some((g) => g.id === m.group), m.id);
      assert.ok(m.label, m.id);
      assert.ok(UNITS.has(m.unit), `${m.id} unit ${m.unit}`);
      assert.ok(SOURCES.has(m.source), `${m.id} source ${m.source}`);
      assert.ok(DIRS.has(m.direction), `${m.id} direction ${m.direction}`);
    }
    // Every group has at least two metrics; safety metrics never rank.
    for (const g of PRIORITY_GROUPS) {
      const ms = PRIORITY_METRICS.filter((m) => m.group === g.id);
      assert.ok(ms.length >= 2, g.id);
      if (g.id === "safety") {
        for (const m of ms) assert.equal(m.direction, "none", m.id);
      }
    }
    assert.deepEqual([...NUMERIC_GROUPS].sort(), ["convenience", "edu", "life", "money"]);
  });

  it("defaults to 모두 보통 (3) and validates 0–5 integers", () => {
    assert.deepEqual(defaultWeights(), { edu: 3, life: 3, safety: 3, money: 3, convenience: 3 });
    assert.equal(validateWeights(defaultWeights()).ok, true);
    assert.equal(validateWeights({ edu: 5, life: 0, safety: 3, money: 2, convenience: 1 }).ok, true);
    for (const bad of [
      { edu: 6, life: 3, safety: 3, money: 3, convenience: 3 },
      { edu: -1, life: 3, safety: 3, money: 3, convenience: 3 },
      { edu: 2.5, life: 3, safety: 3, money: 3, convenience: 3 },
      { edu: 3, life: 3, safety: 3, money: 3 },
      { edu: 3, life: 3, safety: 3, money: 3, convenience: 3, extra: 1 },
      null, "edu",
    ]) {
      assert.equal(validateWeights(bad).ok, false, JSON.stringify(bad));
    }
  });

  it("computes with 모두 보통 when weights are not explicit (basis default)", () => {
    const values = {
      A: { money_housing: 100 },
      B: { money_housing: 200 },
    };
    const r = weightedView(values, defaultWeights());
    assert.equal(r.ok, true);
    assert.equal(r.basis, "default");
    assert.deepEqual(r.weights, defaultWeights());
    const explicit = weightedView(values, defaultWeights(), { explicit: true });
    assert.equal(explicit.basis, "customer");
    assert.deepEqual(r.homes, explicit.homes);
    assert.match(r.formula, /모두 보통/);
  });

  it("computes the worked weighted example (min-max, directions, group means)", () => {
    // A: nearer school (10 vs 20 min, lower better), fewer schools (1 vs 3,
    // higher better), cheaper (100 vs 200, lower better). Weights: edu 4, money 2.
    const values = {
      A: { edu_nearest_school_min: 10, edu_schools_10min: 1, money_housing: 100 },
      B: { edu_nearest_school_min: 20, edu_schools_10min: 3, money_housing: 200 },
    };
    const r = weightedView(values,
      { edu: 4, life: 0, safety: 5, money: 2, convenience: 0 }, { explicit: true });
    assert.equal(r.ok, true);
    // edu: A (1 + 0)/2 = 0.5, B (0 + 1)/2 = 0.5; money: A 1, B 0.
    assert.deepEqual(r.homes.A.groups.edu, 0.5);
    assert.deepEqual(r.homes.B.groups.edu, 0.5);
    assert.deepEqual(r.homes.A.groups.money, 1);
    assert.deepEqual(r.homes.B.groups.money, 0);
    // A: (4*0.5 + 2*1)/6 = 4/6; B: (4*0.5 + 2*0)/6 = 2/6.
    assert.ok(Math.abs(r.homes.A.score - 4 / 6) < 1e-12);
    assert.ok(Math.abs(r.homes.B.score - 2 / 6) < 1e-12);
    // Safety weight (5) never enters the sum; the formula says so.
    assert.match(r.formula, /고객님이 정한 비중/);
    assert.match(r.formula, /치안은 합산하지 않음/);
    assert.match(r.note, /추천 집이 아닙니다/);
    // Homes keep input order — no ranking, no winner field.
    assert.deepEqual(Object.keys(r.homes), ["A", "B"]);
    assert.ok(!("winner" in r) && !("ranking" in r) && !("best" in r));
  });

  it("treats ties and single-home views as 0.5 and skips missing values", () => {
    const tied = weightedView(
      { A: { money_housing: 100 }, B: { money_housing: 100 } },
      { edu: 0, life: 0, safety: 0, money: 5, convenience: 0 }, { explicit: true });
    assert.equal(tied.ok, true);
    assert.deepEqual(tied.homes.A.groups.money, 0.5);
    assert.deepEqual(tied.homes.B.groups.money, 0.5);
    const single = weightedView({ A: { money_housing: 100 } },
      { edu: 0, life: 0, safety: 0, money: 5, convenience: 0 }, { explicit: true });
    assert.deepEqual(single.homes.A.groups.money, 0.5);
    // Missing metric everywhere: group is null, home score null, still ok.
    const missing = weightedView({ A: {}, B: {} },
      { edu: 0, life: 0, safety: 0, money: 5, convenience: 0 }, { explicit: true });
    assert.equal(missing.ok, true);
    assert.equal(missing.homes.A.score, null);
  });

  it("ignores zero-weight groups in the denominator", () => {
    const r = weightedView(
      { A: { money_housing: 100 }, B: { money_housing: 200 } },
      { edu: 0, life: 0, safety: 0, money: 0, convenience: 0 }, { explicit: true });
    assert.equal(r.ok, true);
    assert.equal(r.homes.A.score, null);
    assert.equal(r.homes.B.score, null);
  });
});
