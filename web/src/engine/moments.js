// 살아 보니 moments (stage 17, pure): three one-line moments from the
// 30-day runs that show why the homes differ. Reads run.trips,
// run.aways and run.decisions only (plus run.agents for the household
// keys and run.meta.home for the label) — never totals, never guesses.
//
// Candidate kinds (at most one each), all household members only:
// - crowded: the most crowded measured ride leg in either home
//   (congestion.hasData only; 가정값 legs are skipped).
// - commute: the longest door-to-door 출근 (home-depart trip to work
//   start) in either home.
// - gap: the biggest relative A/B gap in park visits, errands or
//   evening-at-home minutes (counted off aways/trips; the evening
//   window comes from the criteria, matching the engine byte for byte).
// - decision: a model/hook decision that differs from the rule default,
//   with its reason_ko.
// Candidates rank by relative A/B difference
// (gapRel = |a-b|/max(|a|,|b|), ties in the kind order above); the top
// `max` win. Every moment carries evidence: a trip_id or decision_id
// that exists in its run (a candidate without one is dropped).

import { defaultFlat } from "./criteria.js";

export const MOMENT_KINDS = ["crowded", "commute", "gap", "decision"];

const ASSUMED_SOURCE = "가정값";

const dayLabel = (day) => `${day + 1}일차`;
const hhmm = (m) => {
  const c = Math.max(0, Math.min(1439, Math.round(m)));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};
// 17b: the one-line text carries no leading day/time or home letter (the
// drawer shows those in their own columns); when_ko keeps them instead.
const whenKo = (day, minute) => `${dayLabel(day)} ${hhmm(minute)}`;
const fmtDur = (min) => {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
};
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const relDiff = (a, b) => {
  const m = Math.max(Math.abs(a), Math.abs(b));
  return m > 0 ? Math.abs(a - b) / m : -1;
};

function householdKeys(run) {
  if (Array.isArray(run.agents)) {
    const hh = run.agents.filter((a) => a.household).map((a) => a.key);
    if (hh.length > 0) return new Set(hh);
  }
  // Runs without an agent table: h1, h2… are the household by engine
  // convention (background keys are b01…).
  const keys = new Set();
  for (const t of run.trips || []) if (/^h\d+$/.test(t.agent)) keys.add(t.agent);
  for (const a of run.aways || []) if (/^h\d+$/.test(a.agent)) keys.add(a.agent);
  return keys;
}

const homeOf = (run, fallback) => (run.meta && run.meta.home) || fallback;

function decisionIds(run) {
  return new Set((run.decisions || []).map((d) => d.id));
}

// A trip id backing an away-derived moment: the away's own decision
// when it exists, else a same-agent-day trip (preferred purpose first),
// else null (the caller drops the candidate).
function tripEvidence(run, ids, agent, day, purposes = []) {
  const trips = (run.trips || []).filter((t) => t.agent === agent && t.day === day);
  for (const p of purposes) {
    const hit = trips.filter((t) => t.purpose === p)
      .sort((x, y) => x.depart_min - y.depart_min)[0];
    if (hit) return { type: "trip", id: hit.id };
  }
  const any = trips.sort((x, y) => x.depart_min - y.depart_min)[0];
  return any ? { type: "trip", id: any.id } : null;
}

function awayEvidence(run, ids, away, purposes = []) {
  const did = away.cause && away.cause.decision_id;
  if (did && ids.has(did)) return { type: "decision", id: did };
  return tripEvidence(run, ids, away.agent, away.day, purposes);
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
      out.push({ leg, boardMin: Math.round(t), direction: det.direction || "" });
      t += (leg.minutes || 0) + (((ride.transfers || [])[i] || {}).minutes || 0);
    });
  }
  return out;
}

function crowdedCandidate(runA, runB, labelA, labelB) {
  const best = [runA, runB].map((run) => {
    const hh = householdKeys(run);
    const ids = decisionIds(run);
    let top = null;
    for (const away of run.aways || []) {
      if (!hh.has(away.agent)) continue;
      for (const { leg, boardMin } of rideLegs(away)) {
        const c = leg.congestion;
        if (!c || !c.hasData || c.source === ASSUMED_SOURCE) continue;
        if (!Number.isFinite(c.valuePct)) continue;
        if (!top || c.valuePct > top.pct) {
          top = { pct: c.valuePct, leg, away, boardMin,
            evidence: awayEvidence(run, ids, away, ["commute"]) };
        }
      }
    }
    return top;
  });
  if (!best[0] && !best[1]) return null;
  const gapRel = best[0] && best[1] ? relDiff(best[0].pct, best[1].pct) : 1;
  const side = !best[1] || (best[0] && best[0].pct >= best[1].pct) ? 0 : 1;
  const win = best[side];
  if (!win.evidence) return null;
  const home = side === 0 ? labelA : labelB;
  const text = `${win.leg.lineName} ${win.leg.from}→${win.leg.to} ` +
    `혼잡 ${Math.round(win.pct)}% (실측)`;
  return {
    kind: "crowded", gapRel,
    moment: {
      kind: "crowded", home, agent: win.away.agent,
      day: win.away.day, minute: win.boardMin,
      dayLabel: dayLabel(win.away.day), timeLabel: hhmm(win.boardMin),
      when_ko: whenKo(win.away.day, win.boardMin),
      text_ko: text, sentence: text,
      evidence: win.evidence,
      detail: { pct: win.pct, line: win.leg.lineName,
        from: win.leg.from, to: win.leg.to, source: win.leg.congestion.source },
    },
  };
}

function longestOut(run) {
  const hh = householdKeys(run);
  let top = null;
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
      const span = workStart - dep.depart_min;
      if (!(span > 0)) continue;
      if (!top || span > top.span) top = { span, agent, day, trip: dep };
    }
  }
  return top;
}

function commuteCandidate(runA, runB, labelA, labelB) {
  const best = [longestOut(runA), longestOut(runB)];
  if (!best[0] && !best[1]) return null;
  const gapRel = best[0] && best[1] ? relDiff(best[0].span, best[1].span) : 1;
  const side = !best[1] || (best[0] && best[0].span >= best[1].span) ? 0 : 1;
  const win = best[side];
  const home = side === 0 ? labelA : labelB;
  // 18d: this is the longest SINGLE commute day (trip-evidenced), never
  // the 편도 평균 — labelled so it cannot be read as the one shared
  // 출퇴근 편도 (oneWayCommuteOfRun) shown in the result/share/compare.
  const text = `가장 오래 걸린 날 출근 ${fmtDur(win.span)}`;
  return {
    kind: "commute", gapRel,
    moment: {
      kind: "commute", home, agent: win.agent,
      day: win.day, minute: win.trip.depart_min,
      dayLabel: dayLabel(win.day), timeLabel: hhmm(win.trip.depart_min),
      when_ko: whenKo(win.day, win.trip.depart_min),
      text_ko: text, sentence: text,
      evidence: { type: "trip", id: win.trip.id },
      detail: { minutes: win.span },
    },
  };
}

// Household evening-at-home minutes recomputed off trips/aways with the
// criteria window (matches the engine's own home_evening_minutes).
export function householdEveningMinutes(run, window = null) {
  const flat = defaultFlat();
  const start = (window && window.start) ?? flat.evening_start_min;
  const end = (window && window.end) ?? flat.day_end_min;
  const hh = householdKeys(run);
  const span = (run.meta && run.meta.days) || 30;
  const tripsBy = new Map();
  const awaysBy = new Map();
  const push = (map, agent, day, rec) => {
    const k = `${agent}:${day}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(rec);
  };
  for (const t of run.trips || []) {
    if (hh.has(t.agent)) push(tripsBy, t.agent, t.day, t);
  }
  for (const a of run.aways || []) {
    if (hh.has(a.agent)) push(awaysBy, a.agent, a.day, a);
  }
  let total = 0;
  let bestDay = null;
  for (const agent of hh) {
    for (let day = 0; day < span; day++) {
      const k = `${agent}:${day}`;
      let away = 0;
      for (const t of tripsBy.get(k) || []) {
        away += overlap(t.depart_min, t.arrive_min, start, end);
      }
      for (const a of awaysBy.get(k) || []) {
        away += overlap(a.start_min, a.end_min, start, end);
      }
      const evening = Math.max(0, (end - start) - away);
      total += evening;
      if (!bestDay || evening > bestDay.evening) bestDay = { agent, day, evening };
    }
  }
  return { total: Math.round(total), bestDay, window: { start, end } };
}

function gapCandidate(runA, runB, labelA, labelB) {
  const count = (run, kind) => {
    const hh = householdKeys(run);
    return (run.aways || []).filter((a) => hh.has(a.agent) && a.kind === kind).length;
  };
  const eveA = householdEveningMinutes(runA);
  const eveB = householdEveningMinutes(runB);
  const metrics = [
    { key: "park", noun: "공원", unit: (n) => `${n}번`,
      a: count(runA, "park"), b: count(runB, "park") },
    { key: "errand", noun: "장보기", unit: (n) => `${n}번`,
      a: count(runA, "errand"), b: count(runB, "errand") },
    { key: "evening", noun: "저녁에 집", unit: (n) => `${Math.round(n / 60)}시간`,
      a: eveA.total, b: eveB.total },
  ];
  let pick = null;
  for (const m of metrics) {
    const rel = relDiff(m.a, m.b);
    if (rel < 0) continue;
    if (!pick || rel > pick.rel) pick = { ...m, rel };
  }
  if (!pick) return null;
  // Focus on a representative instance in the higher home (ties: A).
  const side = pick.b > pick.a ? 1 : 0;
  const run = side === 0 ? runA : runB;
  const home = side === 0 ? labelA : labelB;
  const ids = decisionIds(run);
  let agent;
  let day;
  let minute;
  let evidence;
  if (pick.key === "evening") {
    const eve = side === 0 ? eveA : eveB;
    if (!eve.bestDay) return null;
    ({ agent, day } = eve.bestDay);
    minute = Math.max(0, Math.min(1439, eve.window.start));
    evidence = tripEvidence(run, ids, agent, day);
  } else {
    const hh = householdKeys(run);
    const away = (run.aways || [])
      .filter((a) => hh.has(a.agent) && a.kind === pick.key)
      .sort((x, y) => (x.day - y.day) || (x.start_min - y.start_min))[0];
    if (!away) return null;
    ({ agent, day } = away);
    minute = away.start_min;
    evidence = awayEvidence(run, ids, away, [pick.key]);
  }
  if (!evidence) return null;
  const text = `${pick.noun} ${labelA} ${pick.unit(pick.a)} vs ${labelB} ${pick.unit(pick.b)}`;
  return {
    kind: "gap", gapRel: pick.rel,
    moment: {
      kind: "gap", home, agent, day, minute,
      dayLabel: dayLabel(day), timeLabel: hhmm(minute),
      when_ko: whenKo(day, minute),
      text_ko: text, sentence: text,
      evidence,
      detail: { metric: pick.key, a: pick.a, b: pick.b },
    },
  };
}

function agentDiffers(run) {
  return (run.decisions || [])
    .filter((d) => (d.chosen_by === "model" || d.chosen_by === "hook")
      && d.chosen_key !== d.default_key
      && typeof d.reason_ko === "string" && d.reason_ko.trim().length > 0)
    .sort((x, y) => (x.day - y.day) || (x.minute - y.minute));
}

function decisionCandidate(runA, runB, labelA, labelB) {
  const listA = agentDiffers(runA);
  const listB = agentDiffers(runB);
  if (listA.length === 0 && listB.length === 0) return null;
  const gapRel = relDiff(listA.length, listB.length);
  const side = listB.length > listA.length ? 1 : 0;
  const d = (side === 0 ? listA : listB)[0];
  const home = side === 0 ? labelA : labelB;
  const labelOf = (key) => ((d.options || []).find((o) => o.key === key) || {}).label || key;
  const text = `${labelOf(d.default_key)} 대신 ${labelOf(d.chosen_key)}: “${d.reason_ko.trim()}”`;
  return {
    kind: "decision", gapRel,
    moment: {
      kind: "decision", home, agent: d.agent,
      day: d.day, minute: d.minute,
      dayLabel: dayLabel(d.day), timeLabel: hhmm(d.minute),
      when_ko: whenKo(d.day, d.minute),
      text_ko: text, sentence: text,
      evidence: { type: "decision", id: d.id },
      detail: { decisionKind: d.kind, chosenBy: d.chosen_by, reason_ko: d.reason_ko.trim() },
    },
  };
}

export function pickMoments(runA, runB, { max = 3 } = {}) {
  const labelA = homeOf(runA, "A");
  const labelB = homeOf(runB, "B");
  const cands = [
    crowdedCandidate(runA, runB, labelA, labelB),
    commuteCandidate(runA, runB, labelA, labelB),
    gapCandidate(runA, runB, labelA, labelB),
    decisionCandidate(runA, runB, labelA, labelB),
  ].filter(Boolean);
  cands.sort((x, y) => (y.gapRel - x.gapRel)
    || (MOMENT_KINDS.indexOf(x.kind) - MOMENT_KINDS.indexOf(y.kind)));
  return cands.slice(0, Math.max(0, max)).map((c) => ({ ...c.moment, gapRel: c.gapRel }));
}
