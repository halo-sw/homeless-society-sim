// Now-card builder tests (stage 7, Part A): commute / errand-decision /
// home / old-run / household-summary / ticker / next cases on the tiny
// fixture. All strings come from the run and its causes — the tests pin
// the shape, not invented copy.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyRegion, tinyScenario } from "./engine-fixture.js";
import { parseScenario } from "../src/engine/scenario.js";
import { indexRun } from "../src/sim.js";
import { simulate } from "../src/engine/simulate.js";
import { moneyTimeline } from "../src/money/timeline.js";
import {
  FATIGUE_MODEL_NOTE, OLD_RUN_WHY, fatigueFor, householdNow, nextLabel, nowCardFor, tickerFor,
} from "../src/nowcard.js";

function run0() {
  return simulate(tinyArea(), tinyScenario(), "A");
}

describe("nowCardFor", () => {
  it("narrates a commute with the routine cause", () => {
    const run = run0();
    const indexed = indexRun(run);
    const t = run.trips.find((x) => x.agent === "h1" && x.purpose === "commute");
    const mid = Math.floor((t.depart_min + t.arrive_min) / 2);
    const card = nowCardFor({ run, indexed, agentKey: "h1", day: t.day, minute: mid });
    assert.equal(card.state, "trip");
    assert.match(card.now, /출근 중 · .+ → .+ \(걸어서 \d+분 남음\)/);
    assert.equal(card.why, t.cause.text);
    assert.equal(card.whyKind, "routine");
    assert.ok(card.criterionIds.includes("C-commute-depart"));
    assert.ok(card.progress >= 0 && card.progress <= 1);
    // Progress runs 0 → 1 across a multi-minute trip.
    const long = run.trips.find((x) => x.arrive_min - x.depart_min >= 3);
    const half = Math.floor((long.depart_min + long.arrive_min) / 2);
    const pc = nowCardFor({ run, indexed, agentKey: long.agent, day: long.day, minute: half });
    assert.ok(pc.progress > 0 && pc.progress < 1);
    assert.ok(card.next.length > 0);
    assert.equal(card.oldRun, false);
  });

  it("narrates an errand with its decision and joins the record", () => {
    const run = run0();
    const indexed = indexRun(run);
    const t = run.trips.find((x) => x.agent === "h1" && x.purpose === "errand"
      && x.cause.type === "decision");
    assert.ok(t, "tiny h1 needs a judged errand");
    const card = nowCardFor({ run, indexed, agentKey: "h1", day: t.day, minute: t.depart_min });
    assert.equal(card.whyKind, "decision");
    assert.ok(card.criterionIds.includes("C-decide-kinds"));
    assert.ok(card.decision);
    assert.equal(card.decision.id, t.cause.decision_id);
    assert.equal(card.decision.kind, "shop_choice");
  });

  it("narrates home without inventing a reason", () => {
    const run = run0();
    const indexed = indexRun(run);
    const card = nowCardFor({ run, indexed, agentKey: "h1", day: 0, minute: 0 });
    assert.equal(card.state, "home");
    assert.match(card.now, /^집 · /);
    assert.equal(card.whyKind, "none");
    assert.equal(card.progress, null);
  });

  it("marks old runs without causes", () => {
    const run = run0();
    const indexed = indexRun(run);
    const t = run.trips.find((x) => x.agent === "h1" && x.purpose === "commute");
    const stripped = structuredClone(run);
    for (const x of stripped.trips) delete x.cause;
    for (const x of stripped.aways) delete x.cause;
    const strippedIdx = indexRun(stripped);
    const mid = Math.floor((t.depart_min + t.arrive_min) / 2);
    const card = nowCardFor({ run: stripped, indexed: strippedIdx, agentKey: "h1", day: t.day, minute: mid });
    assert.equal(card.why, OLD_RUN_WHY);
    assert.equal(card.whyKind, "none");
    assert.deepEqual(card.criterionIds, []);
    assert.equal(card.oldRun, true);
    assert.match(card.now, /출근 중/); // what is still known
  });

  it("labels the next activity, same-day or tomorrow", () => {
    const run = run0();
    const indexed = indexRun(run);
    const early = nowCardFor({ run, indexed, agentKey: "h1", day: 0, minute: 0 });
    assert.match(early.next, /^\d{2}:\d{2} /);
    assert.ok(!early.next.startsWith("내일"));
    const late = nowCardFor({ run, indexed, agentKey: "h1", day: 0, minute: 1380 });
    assert.ok(late.next.startsWith("내일 ") || late.next === "오늘 남은 일정 없음");
    assert.equal(nextLabel(null), "오늘 남은 일정 없음");
  });
});

describe("householdNow", () => {
  it("summarises every member in one row each", () => {
    const run = run0();
    const rows = householdNow({ run, indexed: indexRun(run), day: 0, minute: 0 });
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.memberIndex), [1, 2]);
    assert.ok(rows.every((r) => r.line.startsWith("집 · ")));
  });
});

describe("tickerFor", () => {
  function money(run) {
    const sc = parseScenario(tinyScenario());
    return moneyTimeline(run, sc, {
      transit_fare_won: 1500, basket_won: 30000,
      maintenance_won_month: 0, other_fixed_won_month: 0,
      household_monthly_net_won: 5000000, housing_monthly_won: 0,
    }).events;
  }

  it("keeps the last 5 events up to the clock", () => {
    const run = run0();
    const indexed = indexRun(run);
    const t = run.trips.find((x) => x.agent === "h1" && x.day === 0);
    const tick = tickerFor({ run, indexed, agentKey: "h1", day: 0,
      minute: 1439, moneyEvents: [] });
    assert.ok(tick.length > 0 && tick.length <= 5);
    assert.ok(tick.some((e) => e.kind === "depart" && e.text.includes("출발")));
    assert.ok(tick.every((e, i, a) => i === 0 || a[i - 1].minute <= e.minute));
    assert.ok(t !== undefined);
  });

  it("joins spending onto departures from the money timeline", () => {
    const run = run0();
    const indexed = indexRun(run);
    const tick = tickerFor({ run, indexed, agentKey: "h1", day: 0,
      minute: 1439, moneyEvents: money(run) });
    const ride = tick.find((e) => e.kind === "depart" && e.text.includes("교통비"));
    assert.ok(ride, JSON.stringify(tick));
    assert.match(ride.text, /교통비 1,500 원/);
  });

  it("shows nothing from the future", () => {
    const run = run0();
    const tick = tickerFor({ run, indexed: indexRun(run), agentKey: "h1", day: 0,
      minute: 0, moneyEvents: [] });
    assert.deepEqual(tick, []);
  });
});

describe("nowCard fatigue", () => {
  function journeyRun() {
    const scen = tinyScenario({ days: 1, background: 0, seed: 7 });
    scen.household.members[0].work.destination_station = "직장역";
    return simulate(tinyArea(), scen, "A", { region: tinyRegion() });
  }

  it("shows the value, the leg delta and congestion on a ride", () => {
    const run = journeyRun();
    const away = run.aways.find((a) => a.agent === "h1" && a.kind === "work");
    const mid = away.start_min + 2; // inside the out-ride
    const f = fatigueFor({ run, agentKey: "h1", day: 0, minute: mid });
    assert.ok(Number.isFinite(f.value));
    assert.equal(f.delta, away.detail.rides.out.legs[0].fatigueDelta);
    assert.match(f.note, /A호선 중앙역→환승역 붐비는 정도 90%, 서서 감/);
    assert.equal(f.source, "서울교통공사");
    assert.deepEqual(f.criterionIds, ["C-congestion", "C-fatigue-load"]);
    assert.ok(f.series.length > 0);
    const card = nowCardFor({ run, indexed: indexRun(run), agentKey: "h1", day: 0, minute: mid });
    assert.equal(card.fatigue.note, f.note);
  });

  it("shows walk legs, recovery and home rest honestly", () => {
    const run = journeyRun();
    const t = run.trips.find((x) => x.agent === "h1" && x.purpose === "commute");
    const walk = fatigueFor({ run, agentKey: "h1", day: 0,
      minute: Math.floor((t.depart_min + t.arrive_min) / 2) });
    assert.equal(walk.delta, t.fatigue_delta);
    assert.match(walk.note, /걸어서/);
    const away = run.aways.find((a) => a.agent === "h1" && a.kind === "work");
    const work = fatigueFor({ run, agentKey: "h1", day: 0,
      minute: away.start_min + away.detail.ride_minutes + 10 });
    assert.equal(work.note, "근무 중 · 앉아서 회복");
    assert.equal(work.delta, null);
    const home = fatigueFor({ run, agentKey: "h1", day: 0, minute: 60 });
    assert.equal(home.note, "집에서 회복 중");
    assert.equal(home.value, 0); // the overnight 8 clears within 10 minutes
  });

  it("falls back visibly without a journey", () => {
    const run = simulate(tinyArea(), tinyScenario({ days: 1, background: 0, seed: 7 }), "A",
      { region: tinyRegion() });
    const away = run.aways.find((a) => a.agent === "h1" && a.kind === "work");
    const f = fatigueFor({ run, agentKey: "h1", day: 0, minute: away.start_min + 2 });
    assert.match(f.note, /붐비는 정도 자료가 없어요 · 정해 둔 값 70%/);
    assert.equal(f.source, "가정값");
  });

  it("returns null without a series and labels the model", () => {
    const run = simulate(tinyArea(), tinyScenario({ days: 1, background: 0, seed: 7 }), "A");
    const nbg = fatigueFor({ run, agentKey: "zzz", day: 0, minute: 500 });
    assert.equal(nbg, null);
    assert.match(FATIGUE_MODEL_NOTE, /가정으로 계산한 값이에요.*건강·의학적 판단이 아니에요/);
    const rows = householdNow({ run, indexed: indexRun(run), day: 0, minute: 500 });
    assert.ok(rows.every((r) => Number.isFinite(r.fatigue)));
  });
});
