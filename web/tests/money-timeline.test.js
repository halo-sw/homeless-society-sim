import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { simulate } from "../src/engine/simulate.js";
import { parseScenario } from "../src/engine/scenario.js";
import { moneyTimeline } from "../src/money/timeline.js";

function tinyRun(days = 7) {
  const scenario = tinyScenario({ days, background: 0, seed: 7 });
  const run = simulate(tinyArea(), structuredClone(scenario), "A");
  return { run, scenario: parseScenario(scenario) };
}

const OPTS = {
  transit_fare_won: 1500, basket_won: 30000,
  maintenance_won_month: 150000, other_fixed_won_month: 50000,
  household_monthly_net_won: 5500000, housing_monthly_won: 1200000,
  tenure: "전세", housing_source: "rtms",
  pay_day_of_month: 25, fixed_due_day_1based: 1,
};

describe("money timeline", () => {
  it("ties event counts to trips (fares per commute leg, baskets per errand visit)", () => {
    const { run, scenario } = tinyRun(30);
    const tl = moneyTimeline(run, scenario, OPTS);
    const commuteLegs = run.trips.filter((t) => t.agent === "h1" && t.purpose === "commute").length;
    const errandVisits = run.trips.filter((t) => t.agent.startsWith("h")
      && t.purpose === "errand" && t.from && t.from.kind === "home").length;
    assert.ok(commuteLegs > 0);
    assert.equal(tl.counts.commute_legs, commuteLegs);
    assert.equal(tl.counts.errand_visits, errandVisits);
    assert.equal(tl.totals_by_category.transit, -commuteLegs * 1500);
    assert.equal(tl.totals_by_category.grocery, -errandVisits * 30000);
    assert.equal(tl.totals_by_category.maintenance, -150000);
    assert.equal(tl.totals_by_category.other_fixed, -50000);
    assert.equal(tl.totals_by_category.housing, -1200000);
    assert.equal(tl.daily_balance_won.length, 30);
    // Deterministic: same inputs, same series.
    const again = moneyTimeline(run, scenario, OPTS);
    assert.deepEqual(again.daily_balance_won, tl.daily_balance_won);
    assert.deepEqual(again.events, tl.events);
  });

  it("computes burden ratio and remaining money", () => {
    const { run, scenario } = tinyRun(30);
    const tl = moneyTimeline(run, scenario, OPTS);
    assert.equal(tl.burden_ratio, 1200000 / 5500000);
    const spent = -(tl.totals_by_category.housing + tl.totals_by_category.transit
      + tl.totals_by_category.grocery + tl.totals_by_category.maintenance
      + tl.totals_by_category.other_fixed);
    assert.equal(tl.monthly_spent_won, spent);
    assert.equal(tl.remaining_won, 5500000 - spent);
  });

  it("credits salary on payday(s), or day 0 with a note", () => {
    const { run, scenario } = tinyRun(30); // 2026-11-02..12-01: contains 11-25
    const tl = moneyTimeline(run, scenario, OPTS);
    assert.equal(tl.counts.paydays, 1);
    assert.equal(tl.totals_by_category.salary, 5500000);
    const short = tinyRun(7); // 11-02..11-08: no 25th
    const tl2 = moneyTimeline(short.run, short.scenario, OPTS);
    assert.equal(tl2.counts.paydays, 1);
    assert.match(tl2.payday_note, /1일차/);
  });

  it("charges no fare for local-poi commutes", () => {
    const scenario = tinyScenario({ days: 7, background: 0, seed: 7,
      household: { members: [
        { id: "m1", label: "구성원 1", role: "adult", workdays: ["Mon"],
          work: { type: "local_poi", name: "슈퍼1" } },
      ] } });
    const run = simulate(tinyArea(), structuredClone(scenario), "A");
    assert.ok(run.trips.some((t) => t.purpose === "commute"));
    const tl = moneyTimeline(run, parseScenario(scenario), OPTS);
    assert.equal(tl.counts.commute_legs, 0);
    assert.equal(tl.totals_by_category.transit, 0);
  });
});
