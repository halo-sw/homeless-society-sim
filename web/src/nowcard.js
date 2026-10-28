// "지금 무엇을, 왜" builders (pure, no three.js, no DOM).
//
// The Now card in sim mode renders what these return: the followed
// member's current activity (one line), its cause verbatim from the
// engine (never invented), the criterion ids it used, the next planned
// activity, and a progress fraction. householdNow summarises every
// member for the free camera; tickerFor lists the followed member's
// latest events (depart / arrive / decision / spending). Old runs
// without causes read "이유 기록 없음 (이전 실행)".

import { chosenLabel, DECISION_KIND_KO, purposeLabel } from "./sim.js";
import { fmtWon } from "./money/format.js";

export const OLD_RUN_WHY = "이유 기록 없음 (이전 실행)";
export const TICKER_LIMIT = 5;

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const PURPOSE_VERB = { commute: "출근", school: "등교", errand: "장보기", clinic: "병원", park: "산책" };
const purposeVerb = (p) => PURPOSE_VERB[p] || purposeLabel(p);

function homeNote(minute) {
  const h = Math.floor(minute / 60);
  if (h < 5) return "새벽 시간";
  if (h < 11) return "아침 시간";
  if (h < 17) return "낮 시간";
  if (h < 21) return "저녁 시간";
  return "밤 시간";
}

function decisionSummary(run, decisionId) {
  if (!decisionId) return null;
  const d = (run.decisions || []).find((x) => x.id === decisionId);
  if (!d) return null;
  return {
    id: d.id,
    kind: d.kind,
    kindKo: DECISION_KIND_KO[d.kind] || d.kind,
    choice: chosenLabel(d),
    chosen_by: d.chosen_by,
    provider: d.provider || null,
    model: d.model || null,
    reason_ko: d.reason_ko || "",
  };
}

function currentItem(indexed, agentKey, day, minute) {
  const trips = indexed.tripsByAgent.get(agentKey) || [];
  for (const t of trips) {
    if (t.day === day && minute >= t.depart_min && minute < t.arrive_min) {
      return { kind: "trip", trip: t, away: null };
    }
  }
  const aways = indexed.awaysByAgent.get(agentKey) || [];
  for (const a of aways) {
    if (a.day === day && minute >= a.start_min && minute < a.end_min) {
      return { kind: "away", trip: null, away: a };
    }
  }
  return { kind: "home", trip: null, away: null };
}

// Next planned trip or stay strictly after `minute` (same day, else the
// next day's first, labelled 내일). Returns {day, minute, label} or null.
export function nextAfter(indexed, agentKey, day, days, minute) {
  const starts = [];
  for (const t of indexed.tripsByAgent.get(agentKey) || []) {
    if (t.day === day && t.depart_min > minute) {
      starts.push({ day, minute: t.depart_min,
        label: `${purposeVerb(t.purpose)} · ${(t.to && (t.to.label || t.to.id)) || ""}` });
    }
  }
  for (const a of indexed.awaysByAgent.get(agentKey) || []) {
    if (a.day === day && a.start_min > minute) {
      starts.push({ day, minute: a.start_min, label: a.label || "" });
    }
  }
  starts.sort((x, y) => x.minute - y.minute);
  if (starts.length > 0) return { ...starts[0], tomorrow: false };
  if (day + 1 >= days) return null;
  const later = [];
  for (const t of indexed.tripsByAgent.get(agentKey) || []) {
    if (t.day === day + 1) {
      later.push({ minute: t.depart_min,
        label: `${purposeVerb(t.purpose)} · ${(t.to && (t.to.label || t.to.id)) || ""}` });
    }
  }
  for (const a of indexed.awaysByAgent.get(agentKey) || []) {
    if (a.day === day + 1) later.push({ minute: a.start_min, label: a.label || "" });
  }
  later.sort((x, y) => x.minute - y.minute);
  if (later.length === 0) return null;
  return { day: day + 1, minute: later[0].minute, label: later[0].label, tomorrow: true };
}

export function nextLabel(next) {
  if (!next) return "오늘 남은 일정 없음";
  return `${next.tomorrow ? "내일 " : ""}${hhmm(next.minute)} ${next.label}`;
}

// One member's Now card at (day, minute).
export function nowCardFor({ run, indexed, agentKey, day, minute }) {
  const agent = (run.agents || []).find((a) => a.key === agentKey) || {};
  const label = agent.label || agentKey;
  const { kind, trip, away } = currentItem(indexed, agentKey, day, minute);
  const days = (run.meta && run.meta.days) || 30;
  const next = nextAfter(indexed, agentKey, day, days, minute);
  const base = { agentKey, label, next: nextLabel(next), oldRun: false,
    decision: null, criterionIds: [], decisionId: null };

  if (kind === "trip") {
    const remain = Math.max(0, trip.arrive_min - Math.floor(minute));
    const dur = Math.max(1, trip.arrive_min - trip.depart_min);
    const now = remain <= 0
      ? `${purposeVerb(trip.purpose)} 중 · ${trip.from.label} → ${trip.to.label} (곧 도착)`
      : `${purposeVerb(trip.purpose)} 중 · ${trip.from.label} → ${trip.to.label} (도보 ${remain}분 남음)`;
    const progress = Math.min(1, Math.max(0, (minute - trip.depart_min) / dur));
    if (!trip.cause) {
      return { ...base, state: "trip", now, why: OLD_RUN_WHY, whyKind: "none",
        progress, oldRun: true, tripId: trip.id };
    }
    return { ...base, state: "trip", now, why: trip.cause.text, whyKind: trip.cause.type,
      criterionIds: [...(trip.cause.criterion_ids || [])],
      decisionId: trip.cause.decision_id || null,
      decision: decisionSummary(run, trip.cause.decision_id),
      progress, tripId: trip.id, awayId: null };
  }
  if (kind === "away") {
    const remain = Math.max(0, away.end_min - Math.floor(minute));
    const dur = Math.max(1, away.end_min - away.start_min);
    const now = away.kind === "work"
      ? `${away.label} 중 · ${hhmm(away.end_min)}까지`
      : `${away.label} (${remain}분 머묾)`;
    const progress = Math.min(1, Math.max(0, (minute - away.start_min) / dur));
    if (!away.cause) {
      return { ...base, state: away.kind === "work" ? "away" : "place", now,
        why: OLD_RUN_WHY, whyKind: "none", progress, oldRun: true, awayId: awayKey(away) };
    }
    return { ...base, state: away.kind === "work" ? "away" : "place", now,
      why: away.cause.text, whyKind: away.cause.type,
      criterionIds: [...(away.cause.criterion_ids || [])],
      decisionId: away.cause.decision_id || null,
      decision: decisionSummary(run, away.cause.decision_id),
      progress, tripId: null, awayId: awayKey(away) };
  }
  return { ...base, state: "home", now: `집 · ${homeNote(minute)}`,
    why: "이 시간은 집 (잡힌 일정 없음)", whyKind: "none", progress: null,
    tripId: null, awayId: null };
}

function awayKey(a) {
  return `${a.agent}:a${a.day}:${String(a.start_min).padStart(4, "0")}:${a.kind}`;
}

// Every household member in one row (free camera).
export function householdNow({ run, indexed, day, minute }) {
  return (run.agents || [])
    .filter((a) => a.household)
    .map((a, i) => {
      const card = nowCardFor({ run, indexed, agentKey: a.key, day, minute });
      return { memberIndex: i + 1, agentKey: a.key, label: a.label, line: card.now };
    });
}

const MONEY_KO = { transit: "교통비", grocery: "장보기", maintenance: "관리비",
  other_fixed: "기타 고정비", housing: "주거비", salary: "급여" };

// Latest events of one member on one day at-or-before `minute`, oldest
// first (at most `limit`): departs (with tied spending), arrives,
// decisions, and day-level money events (salary, fixed costs).
// moneyEvents: moneyTimeline events [{day, category, amount_won, memo, trip_id?}].
export function tickerFor({ run, indexed, agentKey, day, minute, moneyEvents = [], limit = TICKER_LIMIT }) {
  const m = Math.floor(minute);
  const trips = (indexed.tripsByAgent.get(agentKey) || []).filter((t) => t.day === day);
  const byId = new Map(trips.map((t) => [t.id, t]));
  const spendByTrip = new Map();
  const dayMoney = [];
  for (const e of moneyEvents) {
    if (e.day !== day) continue;
    if (e.trip_id && byId.has(e.trip_id)) {
      const list = spendByTrip.get(e.trip_id) || [];
      list.push(e);
      spendByTrip.set(e.trip_id, list);
    } else if (!e.trip_id) {
      dayMoney.push(e);
    }
  }
  const events = [];
  for (const t of trips) {
    if (t.depart_min <= m) {
      let text = `${hhmm(t.depart_min)} 출발 · ${t.from.label} → ${t.to.label}`;
      for (const e of spendByTrip.get(t.id) || []) {
        text += ` · ${MONEY_KO[e.category] || e.category} ${fmtWon(Math.abs(e.amount_won))}`;
      }
      events.push({ day, minute: t.depart_min, kind: "depart", text });
    }
    if (t.arrive_min <= m) {
      events.push({ day, minute: t.arrive_min, kind: "arrive",
        text: `${hhmm(t.arrive_min)} 도착 · ${t.to.label}` });
    }
  }
  for (const d of run.decisions || []) {
    if (d.agent !== agentKey || d.day !== day || d.minute > m) continue;
    events.push({ day, minute: d.minute, kind: "decision",
      text: `${hhmm(d.minute)} 판단 · ${DECISION_KIND_KO[d.kind] || d.kind} → ${chosenLabel(d)}` });
  }
  for (const e of dayMoney) {
    const what = MONEY_KO[e.category] || e.category;
    const verb = e.amount_won >= 0 ? "입금" : "납부";
    events.push({ day, minute: 0, kind: "money",
      text: `${what} ${fmtWon(Math.abs(e.amount_won))} ${verb} · ${e.memo || ""}`.trim() });
  }
  events.sort((a, b) => a.minute - b.minute || kindOrder(a.kind) - kindOrder(b.kind));
  return events.slice(-limit);
}

function kindOrder(kind) {
  return { money: 0, depart: 1, decision: 2, arrive: 3 }[kind] ?? 4;
}
