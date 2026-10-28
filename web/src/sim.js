// Sim playback helpers (pure, no three.js, no DOM).
//
// Everything the ?mode=sim scene needs from a run: agent sampling along
// recorded paths, at-home occupancy per building (window glow), the sim
// clock label, and Korean captions. main.js only renders what these
// return. All numbers shown come from the run (graph) or the scenario
// (labelled 가정값).

import { dateOf, weekdayOf } from "./engine/scenario.js";

export const KOR_WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
export const SPEEDS = [1, 10, 60]; // sim-min per 0.1 s at 1×
export const SIM_TICK_S = 0.1; // seconds per sim-minute at 1×

// 11월 2일(월) 07:42 · 1일차/30
export function formatClock(startDate, day, minute, days) {
  const iso = dateOf(startDate, day); // YYYY-MM-DD
  const mo = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const wd = KOR_WEEKDAYS[weekdayOf(startDate, day)];
  const hh = String(Math.floor(minute / 60)).padStart(2, "0");
  const mm = String(minute % 60).padStart(2, "0");
  return `${mo}월 ${d}일(${wd}) ${hh}:${mm} · ${day + 1}일차/${days}`;
}

export function parseTParam(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

// ?t= pauses the clock at that time (deterministic captures); ?play=1
// opts back into playing. Without ?t= the scene plays as before.
export function shouldAutoplay(params) {
  if (params.get("play") === "1") return true;
  return params.get("t") === null;
}

// Absolute instant of a sim minute (KST wall time -> UTC Date,
// deterministic, no local timezone). lighting.js takes this.
export function simInstant(startDate, day, minute) {
  const iso = dateOf(startDate, day);
  const y = Number(iso.slice(0, 4));
  const mo = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0) + (minute - 540) * 60000);
}

// Daylight factor from solar altitude: 1 above +12°, 0 below −6°.
export function daylightFactor(altitudeDeg) {
  const t = (altitudeDeg + 6) / 18;
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

// Warm-dusk bump over the evening hours: 0 outside 17:00–20:00,
// peaking 1 at 18:30. Time-based (the brief's 18–20 h dusk), layered
// over the solar day/night mix.
export function duskFactor(minute) {
  const lo = 17 * 60;
  const hi = 20 * 60;
  if (minute < lo || minute > hi) return 0;
  const t = (minute - lo) / (hi - lo);
  const s = Math.sin(t * Math.PI);
  return s * s;
}

// Per-agent indexes over a run (trips/aways arrive in day order).
export function indexRun(run) {
  const tripsByAgent = new Map();
  const awaysByAgent = new Map();
  for (const t of run.trips) {
    if (!tripsByAgent.has(t.agent)) tripsByAgent.set(t.agent, []);
    tripsByAgent.get(t.agent).push(t);
  }
  for (const a of run.aways) {
    if (!awaysByAgent.has(a.agent)) awaysByAgent.set(a.agent, []);
    awaysByAgent.get(a.agent).push(a);
  }
  const agentsByKey = new Map(run.agents.map((a) => [a.key, a]));
  return { tripsByAgent, awaysByAgent, agentsByKey };
}

// Cumulative length fractions per path node (constant-speed sampling).
// edgeLen maps "from>to" -> metres; without it, segments split time
// evenly. Returns fractions[0..n-1] from 0 to 1.
export function tripFractions(trip, edgeLen = null) {
  const n = trip.path.length;
  if (n <= 1) return [0];
  const lens = [];
  for (let i = 0; i < n - 1; i++) {
    lens.push(edgeLen ? edgeLen.get(`${trip.path[i]}>${trip.path[i + 1]}`) || 0 : 1);
  }
  const total = lens.reduce((a, b) => a + b, 0);
  if (total <= 0) return trip.path.map((_, i) => i / (n - 1));
  const out = [0];
  let acc = 0;
  for (const len of lens) {
    acc += len;
    out.push(acc / total);
  }
  return out;
}

// Agent state at (day, minute). nodeLonLat maps node id -> [lon, lat].
// Returns {lon, lat, visible, state, trip, away}: on a trip the agent
// walks its recorded path; at a school/errand/clinic/park stay it
// waits at the destination; at home or out-of-area work it is hidden.
// Remote trips (stage 9c: destination-graph walks) are always hidden —
// their node ids belong to another area's graph (which reuses the same
// id space), so sampling them on the home map would misplace the agent.
export function sampleAgent(agentKey, indexed, day, minute, nodeLonLat, homeLonLat, edgeLen = null) {
  const trips = indexed.tripsByAgent.get(agentKey) || [];
  const aways = indexed.awaysByAgent.get(agentKey) || [];
  for (const t of trips) {
    if (t.day !== day || minute < t.depart_min || minute >= t.arrive_min) continue;
    if (t.remote) {
      return { lon: homeLonLat[0], lat: homeLonLat[1], visible: false,
        state: "trip", trip: t, away: null };
    }
    const dur = Math.max(1, t.arrive_min - t.depart_min);
    const f = Math.min(1, Math.max(0, (minute - t.depart_min) / dur));
    const fracs = tripFractions(t, edgeLen);
    let i = 0;
    while (i < fracs.length - 2 && fracs[i + 1] < f) i++;
    const span = fracs[i + 1] - fracs[i] || 1;
    const k = Math.min(1, Math.max(0, (f - fracs[i]) / span));
    const a = nodeLonLat.get(t.path[i]);
    const b = nodeLonLat.get(t.path[i + 1]);
    if (!a || !b) return { lon: homeLonLat[0], lat: homeLonLat[1], visible: false, state: "trip", trip: t, away: null };
    return {
      lon: a[0] + (b[0] - a[0]) * k, lat: a[1] + (b[1] - a[1]) * k,
      visible: true, state: "trip", trip: t, away: null,
    };
  }
  for (const a of aways) {
    if (a.day !== day || minute < a.start_min || minute >= a.end_min) continue;
    if (a.kind === "work" || a.kind === "ride") {
      // Out of area (at the workplace, or on the train the journey view
      // carries): hidden on the home map.
      return { lon: homeLonLat[0], lat: homeLonLat[1], visible: false, state: "away", trip: null, away: a };
    }
    // At the destination of the latest arrived home-graph trip
    // (remote trips carry foreign node ids — never sample them here).
    let node = null;
    for (const t of trips) {
      if (t.day === day && t.arrive_min <= minute && !t.remote) node = t.path[t.path.length - 1];
    }
    const p = (node && nodeLonLat.get(node)) || homeLonLat;
    return { lon: p[0], lat: p[1], visible: true, state: "place", trip: null, away: a };
  }
  return { lon: homeLonLat[0], lat: homeLonLat[1], visible: false, state: "home", trip: null, away: null };
}

export function isAtHome(agentKey, indexed, day, minute) {
  const trips = indexed.tripsByAgent.get(agentKey) || [];
  for (const t of trips) {
    if (t.day === day && minute >= t.depart_min && minute < t.arrive_min) return false;
  }
  const aways = indexed.awaysByAgent.get(agentKey) || [];
  for (const a of aways) {
    if (a.day === day && minute >= a.start_min && minute < a.end_min) return false;
  }
  return true;
}

// Per-building occupancy: Map buildingId -> {home, total} over the
// run's agents (numbers from the run, for the window glow).
export function homeOccupancy(run, indexed, day, minute) {
  const out = new Map();
  for (const a of run.agents) {
    let slot = out.get(a.home_building);
    if (!slot) {
      slot = { home: 0, total: 0 };
      out.set(a.home_building, slot);
    }
    slot.total++;
    if (isAtHome(a.key, indexed, day, minute)) slot.home++;
  }
  return out;
}

const PURPOSE_KO = {
  commute: "통근", school: "등교", errand: "장보기", clinic: "병원", park: "산책",
};

export function purposeLabel(purpose) {
  return PURPOSE_KO[purpose] || purpose;
}

export const DECISION_KIND_KO = {
  shop_choice: "장보기", park_or_home: "공원/귀가", station_route: "역 출구", weekend_plan: "주말 계획",
};

// Who made this call: model rows carry their provider, everything else
// (rule, rule_fallback, hook, replay-of-rule) reads as 규칙.
export function decisionBadge(d) {
  if (d.chosen_by === "model" && d.provider === "baseten") {
    return { text: "Muse Spark Open", cls: "open" };
  }
  if (d.chosen_by === "model") return { text: "Muse Spark 1.3", cls: "spark" };
  return { text: "규칙", cls: "rule" };
}

// Display label of the chosen option(s): the option label, or the
// weekend plan's places in order ("집에서 휴식" for an empty plan).
export function chosenLabel(d) {
  const byKey = new Map((d.options || []).map((o) => [o.key, o.label || o.key]));
  if (d.kind === "weekend_plan") {
    const plan = Array.isArray(d.plan) ? d.plan
      : (d.chosen_key === "home" ? [] : String(d.chosen_key || "").split("+"));
    if (plan.length === 0) return "집에서 휴식";
    return plan.map((k) => byKey.get(k) || k).join(" → ");
  }
  return byKey.get(d.chosen_key) || d.chosen_key;
}

// One-line option list with graph minutes ("슈퍼1 3.2분 · 슈퍼2 5.1분").
export function optionsLine(d) {
  return (d.options || []).map((o) => `${o.label || o.key} ${o.minutes}분`).join(" · ");
}

// Latest decision of one agent at-or-before (day, minute), or null.
export function latestDecision(run, agentKey, day, minute) {
  let best = null;
  for (const d of run.decisions) {
    if (d.agent !== agentKey || d.day !== day || d.minute > minute) continue;
    if (!best || d.minute > best.minute) best = d;
  }
  return best;
}

// One day's household decisions, latest first (the 판단 기록 panel).
export function dayDecisions(run, day) {
  const household = new Set(run.agents.filter((a) => a.household).map((a) => a.key));
  return run.decisions
    .filter((d) => d.day === day && household.has(d.agent))
    .sort((a, b) => (b.minute - a.minute) || (a.agent < b.agent ? -1 : 1));
}

export function agentLabelOf(run, agentKey) {
  return (run.agents.find((a) => a.key === agentKey) || {}).label || agentKey;
}

// Caption line for a followed agent: trip purpose + run numbers, or
// the current stay. 가정값 marks assumed durations.
export function followCaption(sample, agentLabel) {
  if (sample.state === "trip" && sample.trip) {
    const t = sample.trip;
    const dest = t.to.label || t.to.id;
    return `${agentLabel} · ${purposeLabel(t.purpose)} → ${dest} · 걸어서 ${t.minutes}분 (${Math.round(t.distance_m)} m)`;
  }
  if (sample.state === "place" && sample.away) {
    return `${agentLabel} · ${sample.away.label}`;
  }
  if (sample.state === "away" && sample.away) {
    const detail = sample.away.detail || {};
    const ride = detail.ride_minutes ? ` (이동 ${detail.ride_minutes}분 가정값)` : "";
    return `${agentLabel} · ${sample.away.label} 중${ride}`;
  }
  return `${agentLabel} · 집`;
}
