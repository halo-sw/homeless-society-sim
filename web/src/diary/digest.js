// Stage 27d: record digest (pure) — code-written one-liners off one home's run.
// Muse writes the diary from these facts; checkDiary cites them by id.

import { awayId, evidenceIndex } from "../verify/evidence.js";
import { oneWayCommuteOfRun } from "../verify/numbers.js";
import { hhmm } from "../timeline.js";

const ASSUMED_SOURCE = "가정값";
const LATE_MIN = 22 * 60;

function householdKeys(run) {
  if (Array.isArray(run.agents)) {
    const hh = run.agents.filter((a) => a.household).map((a) => a.key);
    if (hh.length > 0) return new Set(hh);
  }
  const keys = new Set();
  for (const t of run.trips || []) if (/^h\d+$/.test(t.agent)) keys.add(t.agent);
  for (const a of run.aways || []) if (/^h\d+$/.test(a.agent)) keys.add(a.agent);
  return keys;
}

function rideLegs(away) {
  const det = away.detail || {};
  const rides = det.rides ? [det.rides.out, det.rides.back]
    : det.ride ? [det.ride] : [];
  const out = [];
  for (const ride of rides) {
    if (!ride || !Array.isArray(ride.legs)) continue;
    let t = ride.departMin || 0;
    ride.legs.forEach((leg, i) => {
      out.push({ leg, boardMin: Math.round(t) });
      t += (leg.minutes || 0) + (((ride.transfers || [])[i] || {}).minutes || 0);
    });
  }
  return out;
}

const NUM_RE = /\d+(?:\.\d+)?/g;

function numbersOf(text) {
  const found = String(text || "").match(NUM_RE) || [];
  const seen = new Set();
  const out = [];
  for (const tok of found) {
    const n = Number(tok);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function makeFact({ id, day, minute, kind, text_ko }) {
  return { id, day, minute, kind, text_ko, numbers: numbersOf(text_ko) };
}

function commuteFacts(run, hh) {
  const facts = [];
  for (const agent of hh) {
    const trips = (run.trips || []).filter((t) => t.agent === agent);
    const aways = (run.aways || []).filter((a) => a.agent === agent);
    const days = new Set([...trips.map((t) => t.day), ...aways.map((a) => a.day)]);
    for (const day of days) {
      const works = aways.filter((a) => a.day === day && (a.kind === "work" || a.kind === "school"));
      if (works.length === 0) continue;
      const workStart = Math.min(...works.map((w) => w.start_min));
      const deps = trips.filter((t) => t.day === day && t.purpose === "commute"
        && t.from && t.from.kind === "home" && t.depart_min <= workStart);
      if (deps.length === 0) continue;
      const dep = deps.sort((x, y) => x.depart_min - y.depart_min)[0];
      if (!dep.id) continue;
      const span = workStart - dep.depart_min;
      if (!(span > 0)) continue;
      const text = `${day + 1}일째 출근 ${Math.round(span)}분 (집 ${hhmm(dep.depart_min)} 출발)`;
      facts.push(makeFact({ id: dep.id, day, minute: dep.depart_min, kind: "commute", text_ko: text }));
    }
  }
  return facts;
}

function crowdedFacts(run, hh) {
  const facts = [];
  for (const away of run.aways || []) {
    if (!hh.has(away.agent)) continue;
    for (const { leg, boardMin } of rideLegs(away)) {
      const c = leg.congestion;
      if (!c || !c.hasData || c.source === ASSUMED_SOURCE) continue;
      if (!Number.isFinite(c.valuePct)) continue;
      if (c.valuePct < 80) continue;
      const line = leg.lineName || "전철";
      const from = leg.from || "";
      const to = leg.to || "";
      const route = from && to ? ` ${from}→${to}` : "";
      const text = `${away.day + 1}일째 ${line}${route} 혼잡 ${Math.round(c.valuePct)}% (실측)`;
      facts.push(makeFact({ id: awayId(away), day: away.day, minute: boardMin, kind: "crowded", text_ko: text }));
    }
  }
  return facts;
}

const EVENING_KO = { park: "공원", errand: "장보기" };

function eveningFacts(run, hh) {
  const facts = [];
  for (const away of run.aways || []) {
    if (!hh.has(away.agent)) continue;
    if (away.kind !== "park" && away.kind !== "errand") continue;
    const mins = Math.round((away.end_min || 0) - (away.start_min || 0));
    if (!(mins > 0)) continue;
    const kindKo = EVENING_KO[away.kind] || away.kind;
    const text = `${away.day + 1}일째 저녁 ${kindKo} ${mins}분 (${hhmm(away.start_min)} 출발)`;
    facts.push(makeFact({ id: awayId(away), day: away.day, minute: away.start_min, kind: "evening", text_ko: text }));
  }
  return facts;
}

function lateEvents(run, hh) {
  const events = [];
  for (const t of run.trips || []) {
    if (!hh.has(t.agent)) continue;
    if (!t.to || t.to.kind !== "home") continue;
    if (!Number.isFinite(t.arrive_min) || t.arrive_min < LATE_MIN) continue;
    if (!t.id) continue;
    events.push({ id: t.id, day: t.day, minute: t.arrive_min,
      text_ko: `${t.day + 1}일째 귀가 ${hhmm(t.arrive_min)} (늦은 귀가)` });
  }
  if (events.length === 0) {
    for (const a of run.aways || []) {
      if (!hh.has(a.agent)) continue;
      if (!Number.isFinite(a.end_min) || a.end_min < LATE_MIN) continue;
      events.push({ id: awayId(a), day: a.day, minute: a.end_min,
        text_ko: `${a.day + 1}일째 귀가 ${hhmm(a.end_min)} (늦은 귀가)` });
    }
  }
  return events;
}

function decisionFacts(run) {
  const facts = [];
  for (const d of run.decisions || []) {
    if (!d) continue;
    if (!(d.chosen_by === "model" || d.chosen_by === "hook")) continue;
    if (d.chosen_key === d.default_key) continue;
    if (typeof d.reason_ko !== "string" || d.reason_ko.trim().length === 0) continue;
    if (!d.id) continue;
    const text = `${d.day + 1}일째 결정: ${d.reason_ko.trim()}`;
    facts.push(makeFact({ id: d.id, day: d.day, minute: d.minute, kind: "decision", text_ko: text }));
  }
  return facts;
}

const KIND_ORDER = ["commute", "crowded", "evening", "late", "decision"];

export function runDigest(run, label, { name = "", maxFacts = 40 } = {}) {
  const r = run || {};
  const hh = householdKeys(r);
  const byKind = {
    commute: commuteFacts(r, hh),
    crowded: crowdedFacts(r, hh),
    evening: eveningFacts(r, hh),
    late: lateEvents(r, hh).map((e) => makeFact({ ...e, kind: "late" })),
    decision: decisionFacts(r),
  };
  for (const k of KIND_ORDER) {
    byKind[k].sort((a, b) => (a.day - b.day) || (a.minute - b.minute));
  }
  let facts;
  const all = KIND_ORDER.flatMap((k) => byKind[k]);
  if (all.length <= maxFacts) {
    facts = all.sort((a, b) => (a.day - b.day) || (a.minute - b.minute));
  } else {
    const picked = [];
    const queues = KIND_ORDER.map((k) => [...byKind[k]]);
    while (picked.length < maxFacts && queues.some((q) => q.length > 0)) {
      for (const q of queues) {
        if (picked.length >= maxFacts) break;
        if (q.length > 0) picked.push(q.shift());
      }
    }
    facts = picked.sort((a, b) => (a.day - b.day) || (a.minute - b.minute));
  }
  const index = evidenceIndex(r);
  facts = facts.filter((f) => index.has(f.id));
  const oneWay = oneWayCommuteOfRun(r);
  const park_visits = (r.aways || []).filter((a) => a && hh.has(a.agent) && a.kind === "park").length;
  const late_returns = lateEvents(r, hh).length;
  return {
    label,
    name,
    facts,
    totals: {
      one_way_min: Number.isFinite(oneWay) ? Math.round(oneWay) : null,
      park_visits,
      late_returns,
    },
  };
}
