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
import { CRITERIA_DOC_NAME, CRITERIA_VERSION, resolveCriteria } from "./criteria.js";
import { makeDecider } from "./decisions.js";
import { homeOf, parseScenario, resolveHome } from "./scenario.js";
import { planAgent, round1, round2 } from "./routines.js";

export const ENGINE_VERSION = "sim-engine/8";

export function simulate(area, scenarioJson, homeLabel, opts = {}) {
  const scenario = parseScenario(scenarioJson);
  const home = homeOf(scenario, homeLabel);
  const router = new Router(area.graph);
  const places = buildPlaces(area, router);
  const resolved = resolveHome(area, home, router);
  const crit = resolveCriteria(scenario);
  const agents = buildAgents(area, scenario, resolved, resolved.nodeId, router, crit.flat);
  const decider = makeDecider(opts);
  const region = opts.region && typeof opts.region === "object" ? opts.region : null;
  // Destination-area graph for place commutes (stage 9c): only built when
  // a household member names a workplace and the caller passed the area.
  // Same-area destinations reuse the home router/places.
  const destArea = opts.destArea && typeof opts.destArea === "object" ? opts.destArea : null;
  const wantDest = destArea && scenario.household.members.some((m) => m.work && m.work.place);
  let dest = null;
  if (wantDest) {
    if (destArea.area === area.area) {
      dest = { area: destArea, router, places };
    } else {
      const destRouter = new Router(destArea.graph);
      dest = { area: destArea, router: destRouter, places: buildPlaces(destArea, destRouter) };
    }
  }
  const collect = { trips: [], aways: [], decisions: [], unavailable: [], tripSeq: 1 };
  const daily = [];
  const totals = {};
  for (const a of agents) {
    totals[a.key] = { walk_minutes: 0, walk_distance_m: 0, commute_walk_minutes: 0,
      commute_ride_minutes: 0, errands_done: 0, park_visits: 0, home_evening_minutes: 0, trips: 0,
      fatigue: null };
  }
  for (const agent of agents) {
    const schedule = planSchedule(agent, scenario, crit.flat);
    const ctx = { scenario, homeLabel, home: resolved, router, places, decider, schedule, collect,
      crit: crit.flat, region, dest, destAreaId: dest ? dest.area.area : null,
      homeAreaId: area.area || null, homeBbox: area.bbox || null };
    const perDay = [];
    for (let day = 0; day < scenario.days; day++) {
      const summary = planAgent(agent, day, ctx);
      perDay.push(summary);
      const t = totals[agent.key];
      t.walk_minutes += summary.walk_minutes;
      t.commute_walk_minutes += summary.commute_walk_minutes;
      t.commute_ride_minutes += summary.commute_ride_minutes;
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
    t.commute_walk_minutes = round1(t.commute_walk_minutes);
  }
  for (const entry of daily) {
    totals[entry.agent].fatigue = summarizeFatigue(entry.days);
  }
  const householdKeys = new Set(agents.filter((a) => a.household).map((a) => a.key));
  const household = { walk_minutes: 0, walk_distance_m: 0, commute_walk_minutes: 0,
    commute_ride_minutes: 0, errands_done: 0, park_visits: 0, home_evening_minutes: 0, trips: 0 };
  for (const [key, t] of Object.entries(totals)) {
    if (!householdKeys.has(key)) continue;
    household.walk_minutes += t.walk_minutes;
    household.walk_distance_m += t.walk_distance_m;
    household.commute_walk_minutes += t.commute_walk_minutes;
    household.commute_ride_minutes += t.commute_ride_minutes;
    household.errands_done += t.errands_done;
    household.park_visits += t.park_visits;
    household.home_evening_minutes += t.home_evening_minutes;
    household.trips += t.trips;
  }
  household.walk_minutes = round1(household.walk_minutes);
  household.walk_distance_m = round2(household.walk_distance_m);
  household.commute_walk_minutes = round1(household.commute_walk_minutes);
  household.fatigue_avg_30d = meanOrNull(
    [...householdKeys].map((k) => totals[k].fatigue && totals[k].fatigue.avg_30d));
  household.fatigue_arrival_work_avg = meanOrNull(
    [...householdKeys].map((k) => totals[k].fatigue && totals[k].fatigue.arrival_work_avg));
  household.fatigue_after_home_avg = meanOrNull(
    [...householdKeys].map((k) => totals[k].fatigue && totals[k].fatigue.after_home_avg));
  household.fatigue_crowded_min = round1(
    [...householdKeys].reduce((a, k) => a + ((totals[k].fatigue && totals[k].fatigue.crowded_min) || 0), 0));
  // Household peak boarding: the highest member peak, with its context.
  let peakPct = null;
  let peakCtx = null;
  for (const k of [...householdKeys].sort()) {
    const p = totals[k].fatigue && totals[k].fatigue.peak_congestion;
    if (p && Number.isFinite(p.pct) && (peakPct === null || p.pct > peakPct)) {
      peakPct = p.pct;
      peakCtx = { pct: p.pct, line: p.line ?? null, station: p.station ?? null,
        source: p.source ?? null, member: k };
    }
  }
  household.fatigue_peak_congestion_pct = peakPct;
  household.fatigue_peak_congestion_ctx = peakCtx;
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
      home_anchor: resolved.anchor || { method: "complex" },
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
      criteria: { doc: CRITERIA_DOC_NAME, version: CRITERIA_VERSION, overrides: crit.overridden },
      region: {
        network: !!(region && region.network),
        congestion: !!(region && region.congestion),
      },
      dest_area: dest ? dest.area.area : null,
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

// One member's 30-day fatigue roll-up (null for background neighbours,
// who carry no series). Averages skip null days (no commute that day).
// avg_30d is the mean of time-weighted daily means (midnight recovery
// zeroes every daily end, so ends would average to nothing).
export function summarizeFatigue(days) {
  const rows = (days || []).map((d) => d && d.fatigue).filter(Boolean);
  if (rows.length === 0) return null;
  return {
    avg_30d: meanOrNull(rows.map((r) => (r.mean ?? r.end))),
    arrival_work_avg: meanOrNull(rows.map((r) => r.arrival_work)),
    after_home_avg: meanOrNull(rows.map((r) => r.after_home)),
    peak_max: rows.reduce((a, r) => Math.max(a, r.peak), 0),
    crowded_min: round1(rows.reduce((a, r) => a + r.crowded_min, 0)),
    peak_congestion: peakCongestionOf(rows),
  };
}

// Highest boarding congestion of the member's commute rides (stage 9c):
// {pct, line, station, source} or null without rides. First wins ties.
export function peakCongestionOf(rows) {
  let best = null;
  for (const r of rows || []) {
    const p = r && r.peak_congestion;
    if (p && Number.isFinite(p.pct) && (best === null || p.pct > best.pct)) {
      best = { pct: p.pct, line: p.line ?? null, station: p.station ?? null, source: p.source ?? null };
    }
  }
  return best;
}

export function meanOrNull(values) {
  const nums = (values || []).filter((v) => Number.isFinite(v));
  if (nums.length === 0) return null;
  return round1(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// Household 30-day numbers with units and sources. Sources: "graph"
// (walk-graph distances/times only) or "scenario" (involves an assumed
// duration, dwell or frequency from the scenario). Forbidden by design:
// prices, scores, safety claims, rankings — keys and labels carry none.
export function compare(runA, runB) {
  const ha = runA.totals.household;
  const hb = runB.totals.household;
  const span = `${runA.meta.days || 30}일 동안`;
  const metrics = [
    { key: "walk_minutes", label: `${span} 걸은 시간`, unit: "minutes", source: "graph" },
    { key: "walk_distance_m", label: `${span} 걸은 거리`, unit: "metres", source: "graph" },
    { key: "commute_walk_minutes", label: `${span} 출퇴근·등교로 걸은 시간`, unit: "minutes", source: "graph" },
    { key: "commute_ride_minutes", label: `${span} 차·지하철을 탄 시간`, unit: "minutes", source: "scenario" },
    { key: "errands_done", label: `${span} 장본 횟수`, unit: "count", source: "scenario" },
    { key: "park_visits", label: `${span} 공원 산책 횟수`, unit: "count", source: "scenario" },
    { key: "home_evening_minutes", label: `${span} 저녁에 집에 머문 시간`, unit: "minutes", source: "scenario" },
    { key: "trips", label: `${span} 걸어서 이동한 횟수`, unit: "count", source: "graph" },
    { key: "fatigue_arrival_work_avg", label: "회사 도착할 때 피곤한 정도", unit: "index", source: "scenario" },
    { key: "fatigue_after_home_avg", label: "퇴근해서 집에 왔을 때 피곤한 정도", unit: "index", source: "scenario" },
    { key: "fatigue_avg_30d", label: `${runA.meta.days || 30}일 평균 피곤한 정도`, unit: "index", source: "scenario" },
    { key: "fatigue_crowded_min", label: "만원 지하철에 탄 시간", unit: "minutes", source: "scenario" },
    { key: "fatigue_peak_congestion_pct", label: "출근길 가장 붐비는 순간", unit: "percent", source: "scenario" },
  ].map((m) => ({ ...m, a: ha[m.key] ?? null, b: hb[m.key] ?? null,
    delta_b_minus_a: deltaOrNull(hb[m.key], ha[m.key]) }));
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
        commute_walk_minutes: { a: pa.commute_walk_minutes, b: pb.commute_walk_minutes },
        commute_ride_minutes: { a: pa.commute_ride_minutes, b: pb.commute_ride_minutes },
        home_evening_minutes: { a: pa.home_evening_minutes, b: pb.home_evening_minutes },
        fatigue: { a: pa.fatigue || null, b: pb.fatigue || null },
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
    judgment: {
      a: judgmentCounts(runA),
      b: judgmentCounts(runB),
    },
  };
}

// Household decisions by chosen_by (model vs rule_fallback vs rule):
// who made each call the judge layer could have taken.
function judgmentCounts(run) {
  const household = new Set(run.agents.filter((a) => a.household).map((a) => a.key));
  const out = {};
  for (const d of run.decisions) {
    if (!household.has(d.agent)) continue;
    out[d.chosen_by] = (out[d.chosen_by] || 0) + 1;
  }
  return out;
}

function deltaOrNull(b, a) {
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
  return round1(b - a);
}

function countBy(list, field) {
  const out = {};
  for (const item of list) out[item[field]] = (out[item[field]] || 0) + 1;
  return out;
}
