// Engine entry points: simulate() and compare() (pure).
//
// simulate(area, scenario, homeLabel, {decide?, decisions?}) runs every
// agent through every day and returns the run: agents, trips, aways,
// decisions, unavailable records, per-day per-member summaries and the
// 30-day summary. compare(runA, runB) returns household 30-day numbers
// with units and sources only — no scores, no rankings, no prices, no
// safety claims of any kind.

import { Router } from "./graph.js";
import { buildPlaces } from "./places.js";
import { buildAgents, planSchedule } from "./agents.js";
import { makeDecider } from "./decisions.js";
import { homeOf, parseScenario, resolveHome } from "./scenario.js";
import { planAgent, round1, round2 } from "./routines.js";

export const ENGINE_VERSION = "sim-engine/3";

export function simulate(area, scenarioJson, homeLabel, opts = {}) {
  const scenario = parseScenario(scenarioJson);
  const home = homeOf(scenario, homeLabel);
  const router = new Router(area.graph);
  const places = buildPlaces(area, router);
  const resolved = resolveHome(area, home, router);
  const agents = buildAgents(area, scenario, resolved, resolved.nodeId, router);
  const decider = makeDecider(opts);
  const collect = { trips: [], aways: [], decisions: [], unavailable: [], tripSeq: 1 };
  const daily = [];
  const totals = {};
  for (const a of agents) {
    totals[a.key] = { walk_minutes: 0, walk_distance_m: 0, commute_away_minutes: 0,
      errands_done: 0, park_visits: 0, home_evening_minutes: 0, trips: 0 };
  }
  for (const agent of agents) {
    const schedule = planSchedule(agent, scenario);
    const ctx = { scenario, homeLabel, home: resolved, router, places, decider, schedule, collect };
    const perDay = [];
    for (let day = 0; day < scenario.days; day++) {
      const summary = planAgent(agent, day, ctx);
      perDay.push(summary);
      const t = totals[agent.key];
      t.walk_minutes += summary.walk_minutes;
      t.commute_away_minutes += summary.commute_away_minutes;
      t.errands_done += summary.errands_done;
      t.park_visits += summary.park_visits;
      t.home_evening_minutes += summary.home_evening_minutes;
      t.trips += summary.trips;
    }
    daily.push({ agent: agent.key, days: perDay });
  }
  for (const trip of collect.trips) {
    totals[trip.agent].walk_distance_m += trip.distance_m;
  }
  // Round once at the end (no per-day rounding drift).
  for (const t of Object.values(totals)) {
    t.walk_minutes = round1(t.walk_minutes);
    t.walk_distance_m = round2(t.walk_distance_m);
  }
  const householdKeys = new Set(agents.filter((a) => a.household).map((a) => a.key));
  const household = { walk_minutes: 0, walk_distance_m: 0, commute_away_minutes: 0,
    errands_done: 0, park_visits: 0, home_evening_minutes: 0, trips: 0 };
  for (const [key, t] of Object.entries(totals)) {
    if (!householdKeys.has(key)) continue;
    household.walk_minutes += t.walk_minutes;
    household.walk_distance_m += t.walk_distance_m;
    household.commute_away_minutes += t.commute_away_minutes;
    household.errands_done += t.errands_done;
    household.park_visits += t.park_visits;
    household.home_evening_minutes += t.home_evening_minutes;
    household.trips += t.trips;
  }
  household.walk_minutes = round1(household.walk_minutes);
  household.walk_distance_m = round2(household.walk_distance_m);
  const byKind = {};
  for (const d of collect.decisions) byKind[d.kind] = (byKind[d.kind] || 0) + 1;
  const choiceModes = new Set(collect.decisions.map((d) => d.chosen_by));
  return {
    meta: {
      engine: ENGINE_VERSION,
      scenario: scenario.name,
      home: homeLabel,
      area: area.area,
      complex: resolved.complex.name,
      home_building: resolved.buildingId,
      home_node: resolved.nodeId,
      start_date: scenario.start_date,
      days: scenario.days,
      seed: scenario.seed,
      agents: agents.length,
      household: householdKeys.size,
      background: agents.length - householdKeys.size,
      choices: choiceModes.size === 1 ? [...choiceModes][0]
        : choiceModes.size === 0 ? "rule" : "mixed",
      dijkstra_sources: router.sourceCache.size,
      dijkstra_calls: router.dijkstraCalls,
    },
    agents: agents.map((a) => ({
      key: a.key, id: a.id, label: a.label, role: a.role,
      household: a.household, home_building: a.home_building, home_node: a.home_node,
    })),
    trips: collect.trips,
    aways: collect.aways,
    decisions: collect.decisions,
    decisions_by_kind: byKind,
    unavailable: collect.unavailable,
    daily,
    totals: { per_member: totals, household },
  };
}

// Household 30-day numbers with units and sources. Sources: "graph"
// (walk-graph distances/times only) or "scenario" (involves an assumed
// duration, dwell or frequency from the scenario). Forbidden by design:
// prices, scores, safety claims, rankings — keys and labels carry none.
export function compare(runA, runB) {
  const ha = runA.totals.household;
  const hb = runB.totals.household;
  const metrics = [
    { key: "walk_minutes", label: "도보 이동 시간 합계", unit: "minutes", source: "graph" },
    { key: "walk_distance_m", label: "도보 이동 거리 합계", unit: "metres", source: "graph" },
    { key: "commute_away_minutes", label: "통근·통학 외출 시간 합계(이동 가정값 포함)", unit: "minutes", source: "scenario" },
    { key: "errands_done", label: "장보기 완료 횟수", unit: "count", source: "scenario" },
    { key: "park_visits", label: "공원 산책 횟수", unit: "count", source: "scenario" },
    { key: "home_evening_minutes", label: "18–24시 재택 시간 합계", unit: "minutes", source: "scenario" },
    { key: "trips", label: "도보 이동 횟수", unit: "count", source: "graph" },
  ].map((m) => ({ ...m, a: ha[m.key], b: hb[m.key], delta_b_minus_a: round1(hb[m.key] - ha[m.key]) }));
  const members = Object.keys(runA.totals.per_member)
    .filter((k) => runA.agents.find((a) => a.key === k && a.household))
    .map((key) => {
      const pa = runA.totals.per_member[key];
      const pb = runB.totals.per_member[key] || {};
      const label = (runA.agents.find((a) => a.key === key) || {}).label || key;
      return {
        member: key, label,
        walk_minutes: { a: pa.walk_minutes, b: pb.walk_minutes },
        walk_distance_m: { a: pa.walk_distance_m, b: pb.walk_distance_m },
        commute_away_minutes: { a: pa.commute_away_minutes, b: pb.commute_away_minutes },
        home_evening_minutes: { a: pa.home_evening_minutes, b: pb.home_evening_minutes },
      };
    });
  return {
    scenario: runA.meta.scenario,
    home_a: { label: runA.meta.home, area: runA.meta.area, complex: runA.meta.complex },
    home_b: { label: runB.meta.home, area: runB.meta.area, complex: runB.meta.complex },
    days: runA.meta.days,
    seed: runA.meta.seed,
    metrics,
    members,
    unavailable: {
      a: runA.unavailable.length,
      b: runB.unavailable.length,
      a_by_category: countBy(runA.unavailable, "category"),
      b_by_category: countBy(runB.unavailable, "category"),
    },
  };
}

function countBy(list, field) {
  const out = {};
  for (const item of list) out[item[field]] = (out[item[field]] || 0) + 1;
  return out;
}
