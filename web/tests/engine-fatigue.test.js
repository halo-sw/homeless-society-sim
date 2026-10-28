// Fatigue model through the engine: series, recovery, summaries (synthetic).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyRegion, tinyScenario } from "./engine-fixture.js";
import { compare, simulate } from "../src/engine/simulate.js";

function scenWithDest(dest) {
  const s = tinyScenario({ days: 2, background: 0, seed: 7 });
  s.household.members[0].work.destination_station = dest;
  return s;
}

describe("engine fatigue", () => {
  it("draws rides with a destination and falls back without one", () => {
    const region = tinyRegion();
    const withDest = simulate(tinyArea(), scenWithDest("직장역"), "A", { region });
    const away = withDest.aways.find((a) => a.agent === "h1" && a.kind === "work");
    assert.ok(away.detail.rides, "journey rides drawn");
    assert.equal(away.detail.journey_note, null);
    assert.ok(away.cause.criterion_ids.includes("C-journey-path"));
    assert.ok(away.cause.criterion_ids.includes("C-ride-split"));
    assert.ok(away.cause.criterion_ids.includes("C-congestion"));
    assert.equal(away.detail.rides.out.minutesTotal, 20);
    const noDest = simulate(tinyArea(), scenWithDest(null), "A", { region });
    const awayB = noDest.aways.find((a) => a.agent === "h1" && a.kind === "work");
    assert.equal(awayB.detail.rides, null);
    assert.equal(awayB.detail.journey_note, "목적지 역 없음");
    assert.ok(awayB.detail.ride_fallback, "fallback ride load recorded");
    assert.equal(awayB.detail.ride_fallback.source, "가정값");
  });

  it("keeps old metrics identical with and without a journey", () => {
    const region = tinyRegion();
    const a = simulate(tinyArea(), scenWithDest("직장역"), "A", { region });
    const b = simulate(tinyArea(), scenWithDest(null), "A", { region });
    for (const k of ["walk_minutes", "commute_walk_minutes", "commute_ride_minutes",
      "errands_done", "park_visits", "trips"]) {
      assert.equal(a.totals.household[k], b.totals.household[k], k);
    }
  });

  it("carries congestion + fatigue on every trip leg", () => {
    const run = simulate(tinyArea(), scenWithDest("직장역"), "A", { region: tinyRegion() });
    assert.ok(run.trips.length > 0);
    for (const t of run.trips) {
      assert.equal(t.congestion, null);
      assert.ok(Number.isFinite(t.fatigue_delta), "walk load on every trip");
      assert.ok(t.cause.criterion_ids.includes("C-fatigue-load"));
    }
    const away = run.aways.find((a) => a.agent === "h1" && a.kind === "work");
    for (const leg of away.detail.rides.out.legs) {
      assert.ok(Number.isFinite(leg.congestion.valuePct));
      assert.ok(["서울교통공사", "가정값"].includes(leg.congestion.source));
      assert.ok(Number.isFinite(leg.fatigueDelta));
    }
  });

  it("tracks a legible day series with recovery and reset", () => {
    const run = simulate(tinyArea(), scenWithDest("직장역"), "A", { region: tinyRegion() });
    const entry = run.daily.find((d) => d.agent === "h1");
    for (const d of entry.days) {
      assert.equal(d.fatigue.start, 8);
      assert.deepEqual(d.fatigue.series[0], { m: 0, v: 8, label: "시작" });
      assert.ok(d.fatigue.end >= 0 && d.fatigue.end <= 100);
      assert.ok(d.fatigue.peak >= d.fatigue.end);
    }
    const workday = entry.days.find((d) => d.fatigue.arrival_work !== null);
    assert.ok(workday, "a commute day arrives at work");
    const markers = workday.fatigue.series.map((p) => p.label).filter(Boolean);
    assert.ok(markers.includes("출근 승차"));
    assert.ok(markers.includes("근무 시작"));
    assert.ok(markers.includes("근무 종료"));
    assert.ok(markers.includes("귀가"));
    // Morning home rest clears the overnight baseline before departure.
    const firstDepart = run.trips.find((t) => t.agent === "h1" && t.day === workday.day).depart_min;
    const atDepart = [...workday.fatigue.series].reverse().find((p) => p.m <= firstDepart);
    assert.equal(atDepart.v, 0);
    // The commute sets the day's shape: arrival loads, work recovers,
    // the return loads again (the peak may be the evening return).
    assert.ok(workday.fatigue.arrival_work > 0);
    assert.ok(workday.fatigue.after_home > 0);
    assert.ok(workday.fatigue.peak >= Math.max(workday.fatigue.arrival_work,
      workday.fatigue.after_home));
  });

  it("counts crowded minutes above 100 %", () => {
    const region = tinyRegion();
    // The 08:30 fake column is 120 %: departures reaching the station
    // after 08:30 crowd. m1 departs 07:30 + jitter (seed 7).
    const run = simulate(tinyArea(), scenWithDest("직장역"), "A", { region });
    const h1 = run.totals.per_member.h1.fatigue;
    assert.ok(Number.isFinite(h1.crowded_min));
    const entry = run.daily.find((d) => d.agent === "h1");
    const sum = entry.days.reduce((a, d) => a + d.fatigue.crowded_min, 0);
    assert.equal(h1.crowded_min, Math.round(sum * 10) / 10);
  });

  it("summarizes members and households for compare + QoL", () => {
    const region = tinyRegion();
    const runA = simulate(tinyArea(), scenWithDest("직장역"), "A", { region });
    const runB = simulate(tinyArea(), scenWithDest("직장역"), "B", { region });
    const h1 = runA.totals.per_member.h1.fatigue;
    assert.ok(Number.isFinite(h1.avg_30d));
    assert.ok(Number.isFinite(h1.arrival_work_avg));
    assert.ok(Number.isFinite(h1.after_home_avg));
    // The schoolchild has no commute arrivals but still a series.
    const h2 = runA.totals.per_member.h2.fatigue;
    assert.ok(h2 && Number.isFinite(h2.avg_30d));
    assert.equal(h2.arrival_work_avg, null);
    const cmp = compare(runA, runB);
    for (const key of ["fatigue_arrival_work_avg", "fatigue_after_home_avg",
      "fatigue_avg_30d", "fatigue_crowded_min"]) {
      const m = cmp.metrics.find((x) => x.key === key);
      assert.ok(m, key);
      assert.equal(m.source, "scenario");
    }
    assert.ok(cmp.members[0].fatigue.a);
  });

  it("leaves background neighbours without a series", () => {
    const run = simulate(tinyArea(), tinyScenario({ days: 1, background: 2, seed: 7 }), "A",
      { region: tinyRegion() });
    const bg = run.daily.find((d) => d.agent.startsWith("b"));
    assert.ok(bg);
    assert.equal(bg.days[0].fatigue, null);
  });

  it("answers criteria overrides (weights are editable)", () => {
    const region = tinyRegion();
    const base = simulate(tinyArea(), scenWithDest("직장역"), "A", { region });
    const over = scenWithDest("직장역");
    over.criteria_overrides = { "C-fatigue-load": { walk_per_min: 1.0 } };
    const changed = simulate(tinyArea(), over, "A", { region });
    const t0 = base.trips.find((t) => t.agent === "h1");
    const t1 = changed.trips.find((t) => t.agent === "h1");
    assert.equal(t1.fatigue_delta, Math.round(t1.minutes * 1.0 * 10) / 10);
    assert.notEqual(t1.fatigue_delta, t0.fatigue_delta);
  });

  it("replays deterministically", () => {
    const region = tinyRegion();
    const a = simulate(tinyArea(), scenWithDest("직장역"), "A", { region });
    const b = simulate(tinyArea(), scenWithDest("직장역"), "A", { region });
    assert.deepEqual(a.daily, b.daily);
    assert.deepEqual(a.totals, b.totals);
  });
});
