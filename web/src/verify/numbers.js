// Stage 16b part 2: deterministic claim checks (pure, no DOM / network).
//
// For verify:"deterministic" items with engine supported|partial, a
// report claim's value is recomputed from the run and compared within
// the item's rule tolerance. A sentence whose text carries numbers but
// has no claim fails as "근거 없는 숫자". Number extraction is imported
// from the judge guards (not copied): ordinals, list markers and Korean
// counters are skipped there.
//
// Engine values are the household's door-to-door numbers — simulated
// neighbours (b01…b60) are never averaged in:
//   C01       mean over commuting household members of one-way
//             door-to-door minutes: (commute_walk + commute_ride) /
//             one-way commutes, where one-way commutes are distinct
//             (day, am|pm) halves among the member's purpose=commute
//             trips and kind=ride aways (am = before 12:00). Walk and
//             ride totals come from totals.per_member; runs without
//             totals fall back to summing the member's own trips/aways.
//   N01       the same one-way value for claim.member
//   C05/F01/F03/P02/F05/M02  mean minutes of purpose=errand/school/
//             park/park/clinic/clinic trips by household members only
//   C02       home.monthly_won + maintenance_won_month + utilities_won_month
// Items with engine:"none" are never checked here (미지원, handled by
// loop.js) — never failed, never passed.

import { findInventedNumbers } from "../judge/guards.js";

export const MINUTE_TOLERANCE = {
  C01: 5, N01: 5, C05: 2, F01: 2, F03: 2, P02: 2, F05: 3, M02: 3,
};

const ITEM_PURPOSE = {
  C01: "commute", N01: "commute", C05: "errand", F01: "school",
  F03: "park", P02: "park", F05: "clinic", M02: "clinic",
};

const round1 = (n) => Math.round(n * 10) / 10;
const fmtWon = (n) => Number(n).toLocaleString("ko-KR");

// Household members: keys of run.totals.per_member that are not
// simulated neighbours. The run's own agent flag (household, or
// background) wins when an agent entry matches the key; otherwise the
// b-prefix convention (b01…b60) applies. Runs without totals fall back
// to flagged agent entries.
export function householdMembers(run) {
  const flagByKey = new Map();
  for (const a of (run && run.agents) || []) {
    if (!a || typeof a !== "object") continue;
    let background = null;
    if (a.background !== undefined && a.background !== null) {
      background = !!a.background;
    } else if (a.household !== undefined && a.household !== null) {
      background = !a.household;
    }
    if (background === null) continue;
    for (const k of [a.key, a.id, a.agent]) {
      if (k !== undefined && k !== null && !flagByKey.has(String(k))) {
        flagByKey.set(String(k), background);
      }
    }
  }
  const isHousehold = (k) => (flagByKey.has(k) ? !flagByKey.get(k)
    : !k.startsWith("b"));
  const pm = run && run.totals && run.totals.per_member;
  if (pm && typeof pm === "object" && Object.keys(pm).length > 0) {
    return Object.keys(pm).filter((k) => isHousehold(String(k)));
  }
  const out = [];
  for (const a of (run && run.agents) || []) {
    if (!a || typeof a !== "object") continue;
    const k = a.key ?? a.id ?? a.agent;
    if (k === undefined || k === null) continue;
    if (isHousehold(String(k)) && !out.includes(String(k))) out.push(String(k));
  }
  return out;
}

export function meanMinutes(trips, purpose, member = null, onlyAgents = null) {
  const set = (onlyAgents === null || onlyAgents === undefined)
    ? null : new Set(onlyAgents);
  const mins = (trips || [])
    .filter((t) => t && t.purpose === purpose
      && (member === null || member === undefined || t.agent === member)
      && (set === null || set.has(t.agent))
      && Number.isFinite(t.minutes))
    .map((t) => t.minutes);
  if (mins.length === 0) return null;
  return round1(mins.reduce((a, b) => a + b, 0) / mins.length);
}

export function monthlyTotal(home) {
  if (!home || typeof home !== "object") return null;
  const parts = ["monthly_won", "maintenance_won_month", "utilities_won_month"]
    .map((f) => Number(home[f]))
    .filter((n) => Number.isFinite(n));
  if (parts.length === 0) return null;
  return Math.round(parts.reduce((a, b) => a + b, 0));
}

// Minutes of one ride away: new runs carry detail.ride.minutesTotal,
// older runs detail.rides.out/back.minutesTotal.
function rideAwayMinutes(a) {
  const d = (a && a.detail) || {};
  if (d.ride && Number.isFinite(d.ride.minutesTotal)) return d.ride.minutesTotal;
  const rides = d.rides;
  if (rides && typeof rides === "object") {
    let n = 0;
    let any = false;
    for (const half of [rides.out, rides.back]) {
      if (half && Number.isFinite(half.minutesTotal)) {
        n += half.minutesTotal;
        any = true;
      }
    }
    if (any) return n;
  }
  if (Number.isFinite(d.ride_minutes)) return d.ride_minutes;
  return 0;
}

const AM_END_MINUTES = 720; // 12:00

// One member's one-way door-to-door commute, or null when the member
// has no commute halves (no purpose=commute trip or kind=ride away).
export function commuteOneWayMinutes(run, member) {
  const halves = new Set();
  for (const t of (run && run.trips) || []) {
    if (!t || t.purpose !== "commute" || t.agent !== member) continue;
    const tm = t.depart_min ?? t.arrive_min ?? 0;
    halves.add(`${t.day}|${tm < AM_END_MINUTES ? "am" : "pm"}`);
  }
  for (const a of (run && run.aways) || []) {
    if (!a || a.kind !== "ride" || a.agent !== member) continue;
    const tm = a.start_min ?? a.end_min ?? 0;
    halves.add(`${a.day}|${tm < AM_END_MINUTES ? "am" : "pm"}`);
  }
  if (halves.size === 0) return null;
  const pm = run && run.totals && run.totals.per_member
    && run.totals.per_member[member];
  let walk = pm ? pm.commute_walk_minutes : undefined;
  let ride = pm ? pm.commute_ride_minutes : undefined;
  if (!Number.isFinite(walk)) {
    walk = ((run && run.trips) || [])
      .filter((t) => t && t.purpose === "commute" && t.agent === member
        && Number.isFinite(t.minutes))
      .reduce((n, t) => n + t.minutes, 0);
  }
  if (!Number.isFinite(ride)) {
    ride = ((run && run.aways) || [])
      .filter((a) => a && a.kind === "ride" && a.agent === member)
      .reduce((n, a) => n + rideAwayMinutes(a), 0);
  }
  return round1((walk + ride) / halves.size);
}

// Engine value for one deterministic item, or null when the run/home
// has nothing to check against. Returns { value, unit }.
export function engineValue(itemId, run, opts = {}) {
  const { member = null, home = null } = opts;
  if (itemId === "C02") {
    const total = monthlyTotal(home);
    return total === null ? null : { value: total, unit: "원" };
  }
  if (itemId === "C01") {
    const vals = [];
    for (const m of householdMembers(run)) {
      const v = commuteOneWayMinutes(run, m);
      if (v !== null) vals.push(v);
    }
    if (vals.length === 0) return null;
    return { value: round1(vals.reduce((a, b) => a + b, 0) / vals.length),
      unit: "분" };
  }
  if (itemId === "N01") {
    if (member === null || member === undefined) return null;
    const v = commuteOneWayMinutes(run, member);
    return v === null ? null : { value: v, unit: "분" };
  }
  const purpose = ITEM_PURPOSE[itemId];
  if (!purpose) return null;
  const mean = meanMinutes(run && run.trips, purpose, null,
    householdMembers(run));
  return mean === null ? null : { value: mean, unit: "분" };
}

// 18d: the ONE customer-facing 출퇴근 편도 — door-to-door minutes
// per one-way commute for one home's run, i.e. engineValue("C01").
// The chat result card, the share card, the drawer compare table and
// the moments all read this helper, so one home shows one number.
// (The candidate card's pre-run estimate is a different, labelled
// number: 추정 (살아 보기 전).)
export function oneWayCommuteOfRun(run) {
  const v = engineValue("C01", run);
  return v && Number.isFinite(v.value) ? v.value : null;
}

// Per-home one-way values for a label→run map ({A: runA, B: runB}).
// Missing runs read null (never another home's number, never zero).
export function oneWayByLabel(runsByLabel) {
  const out = {};
  for (const [label, run] of Object.entries(runsByLabel || {})) {
    out[label] = oneWayCommuteOfRun(run);
  }
  return out;
}

// The A/B pair behind compare.one_way for display, or null when
// either side is missing. d is B−A in minutes (1-decimal).
export function oneWayDelta(oneWay) {
  const a = oneWay ? Number(oneWay.A) : NaN;
  const b = oneWay ? Number(oneWay.B) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b, d: Math.round((b - a) * 10) / 10 };
}

// Every number cited in the text (via the judge guards' extraction).
export function textNumbers(textKo) {
  return findInventedNumbers(textKo, "", new Set());
}

// Check every deterministic, engine-backed sentence of the report.
// `loaded` is loadGroundTruth's return ({ items }). Returns { failures }
// with failures of { sentence_id, item_id, kind: "number", reason_ko }.
export function checkNumberClaims(report, run, loaded) {
  const failures = [];
  const byId = new Map((loaded.items || []).map((it) => [it.id, it]));
  for (const s of (report && report.sentences) || []) {
    const item = byId.get(s.item_id);
    if (!item) {
      failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
        reason_ko: `알 수 없는 항목 ${s.item_id}예요` });
      continue;
    }
    if (item.engine === "none" || item.verify !== "deterministic") continue;
    const claims = s.claims || [];
    if (claims.length === 0 && textNumbers(s.text_ko).length > 0) {
      failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
        reason_ko: "근거 없는 숫자" });
      continue;
    }
    for (const claim of claims) {
      if (item.id === "N01" && (claim.member === undefined || claim.member === null)) {
        failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
          reason_ko: "두 사람의 통근 시간은 구성원별(member)로 보고해야 해요" });
        continue;
      }
      const engine = engineValue(item.id, run,
        { member: claim.member ?? null, home: report.home });
      if (!engine) {
        failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
          reason_ko: "엔진 기록으로 확인할 수 없어요" });
        continue;
      }
      if (item.id === "C02") {
        if (Number(claim.value) !== engine.value) {
          failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
            reason_ko: `보고한 ${fmtWon(claim.value)}원이 계산 ${fmtWon(engine.value)}원과 달라요` });
        }
        continue;
      }
      const tol = MINUTE_TOLERANCE[item.id] ?? 0;
      if (Math.abs(Number(claim.value) - engine.value) > tol + 1e-9) {
        failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "number",
          reason_ko: `보고한 ${claim.value}분이 엔진 계산 ${engine.value}분과 달라요 (허용 ±${tol}분)` });
      }
    }
  }
  return { failures };
}
