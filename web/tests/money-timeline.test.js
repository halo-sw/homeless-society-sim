import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { simulate } from "../src/engine/simulate.js";
import { parseScenario } from "../src/engine/scenario.js";
import { runPaired } from "../src/engine/paired.js";
import { householdGrocery, moneyTimeline, spreadTotal } from "../src/money/timeline.js";

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
  it("charges fares per commute leg and grocery from the household plan", () => {
    const { run, scenario } = tinyRun(30);
    const tl = moneyTimeline(run, scenario, OPTS);
    const commuteLegs = run.trips.filter((t) => t.agent === "h1" && t.purpose === "commute").length;
    const errandLegs = run.trips.filter((t) => t.agent.startsWith("h")
      && t.purpose === "errand" && t.from && t.from.kind === "home").length;
    assert.ok(commuteLegs > 0);
    assert.equal(tl.counts.commute_legs, commuteLegs);
    assert.equal(tl.totals_by_category.transit, -commuteLegs * 1500);
    // Simulated errand legs are evidence only; the money is the plan.
    assert.equal(tl.counts.errand_trips, errandLegs);
    const plan = householdGrocery(scenario, { basket_won: 30000 });
    assert.equal(tl.totals_by_category.grocery, -plan.total_won);
    const grocery = tl.events.filter((e) => e.category === "grocery");
    assert.equal(tl.counts.errand_visits, grocery.length);
    assert.ok(grocery.length > 0);
    assert.equal(grocery.reduce((a, e) => a + e.amount_won, 0), -plan.total_won);
    assert.deepEqual(grocery.map((e) => e.day), plan.errand_days);
    assert.ok(grocery.every((e) => e.source
      === `가구 공통 (주 ${plan.errands_per_week}회 × 3만 원, 가정값)`));
    assert.equal(tl.totals_by_category.maintenance, -150000);
    assert.equal(tl.totals_by_category.other_fixed, -50000);
    assert.equal(tl.totals_by_category.housing, -1200000);
    assert.equal(tl.daily_balance_won.length, 30);
    // Deterministic: same inputs, same series.
    const again = moneyTimeline(run, scenario, OPTS);
    assert.deepEqual(again.daily_balance_won, tl.daily_balance_won);
    assert.deepEqual(again.events, tl.events);
  });

  it("plans grocery from weekly frequencies (householdGrocery)", () => {
    const sc = parseScenario(tinyScenario({ days: 14, background: 0, seed: 7 }));
    const plan = householdGrocery(sc, { basket_won: 30000 });
    assert.equal(plan.errands_per_week, 2); // m1 1+1, m2 0+0
    assert.equal(plan.total_won, 120000); // 2 × 14/7 × 30000
    assert.ok(plan.errand_days.length > 0);
    assert.ok(plan.errand_days.every((d) => d >= 0 && d < 14));
    const parts = spreadTotal(plan.total_won, plan.errand_days);
    assert.equal(parts.reduce((a, p) => a + p.amount_won, 0), -plan.total_won);
    assert.deepEqual(spreadTotal(0, plan.errand_days), []);
    assert.deepEqual(spreadTotal(100, []), [{ day: 0, amount_won: -100 }]);
  });

  it("charges both homes the same non-housing living cost (stage 15.2)", () => {
    const raw = tinyScenario({ days: 30, background: 0, seed: 7 });
    const paired = runPaired({ A: tinyArea(), B: tinyArea() }, raw);
    const sc = parseScenario(raw);
    const livingOf = (run) => {
      const tl = moneyTimeline(run, sc, OPTS);
      return tl.totals_by_category.grocery + tl.totals_by_category.maintenance
        + tl.totals_by_category.other_fixed;
    };
    for (const pair of paired.runs) {
      assert.equal(livingOf(pair.A), livingOf(pair.B));
    }
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

  it("charges fares only where rides happen (stage 9c)", () => {
    const scenario = tinyScenario({ days: 7, background: 0, seed: 7,
      household: { members: [
        // Rides: the island workplace is unreachable on foot.
        { id: "m1", label: "구성원 1", role: "adult", workdays: ["Mon"],
          work: { type: "station_ride", station_name: "중앙역", ride_minutes: 20,
            ride_minutes_source: "user_assumption", destination_station: "직장역",
            place: { name: "먼직장", lon: 127.1, lat: 37.6 } } },
        // Walks: the workplace is one stop down the road.
        { id: "m2", label: "구성원 2", role: "adult", workdays: ["Mon"],
          work: { type: "station_ride", station_name: "중앙역", ride_minutes: 20,
            ride_minutes_source: "user_assumption", destination_station: "직장역",
            place: { name: "가까운직장", lon: 127.001, lat: 37.5 } } },
      ] } });
    const run = simulate(tinyArea(), structuredClone(scenario), "A");
    assert.ok(run.aways.some((a) => a.agent === "h1" && a.kind === "ride"));
    assert.ok(!run.aways.some((a) => a.agent === "h2" && a.kind === "ride"));
    const tl = moneyTimeline(run, parseScenario(scenario), OPTS);
    // One Monday: the rider pays 2 fares, the walker none.
    assert.equal(tl.counts.commute_legs, 2);
    assert.equal(tl.totals_by_category.transit, -3000);
    const fares = tl.events.filter((e) => e.category === "transit");
    assert.ok(fares.every((e) => e.memo.startsWith("h1")));
    assert.ok(fares.every((e) => e.trip_id), "fares tie to walk trips for the ticker");
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
