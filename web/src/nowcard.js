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
import { journeyBanner, legAt, rideStateFor } from "./journey.js";
import { hhmm } from "./timeline.js";
import { standShare } from "./engine/journey.js";
import { fmtWon } from "./money/format.js";

export const OLD_RUN_WHY = "이유 기록 없음 (이전 실행)";
export const TICKER_LIMIT = 5;
export const FATIGUE_MODEL_NOTE = "피곤한 정도는 가정으로 계산한 값이에요. 건강·의학적 판단이 아니에요";
// Calm-card budgets (stage 9c): at most 3 criterion chips and 3 ticker
// rows show; the rest hide behind an expander.
export const CHIPS_VISIBLE = 3;
export const TICKER_VISIBLE = 3;

// Visible slice of criterion ids (engine order = relevance order).
// Returns {visible, hiddenCount}.
export function chipDisplay(ids, open, limit = CHIPS_VISIBLE) {
  const list = [...(ids || [])];
  if (open || list.length <= limit) return { visible: list, hiddenCount: 0 };
  return { visible: list.slice(0, limit), hiddenCount: list.length - limit };
}

// Visible slice of ticker events (latest first in, oldest of the shown
// first out). Returns {visible, hiddenCount}.
export function tickerDisplay(events, open, limit = TICKER_VISIBLE) {
  const list = [...(events || [])];
  if (open || list.length <= limit) return { visible: list, hiddenCount: 0 };
  return { visible: list.slice(-limit), hiddenCount: list.length - limit };
}

// 18d: HH:MM comes from the one timeline formatter (float-safe).

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
    decision: null, criterionIds: [], decisionId: null,
    fatigue: fatigueFor({ run, agentKey, day, minute }) };

  if (kind === "trip") {
    const remain = Math.ceil(Math.max(0, trip.arrive_min - Math.floor(minute)));
    const dur = Math.max(1, trip.arrive_min - trip.depart_min);
    const now = remain <= 0
      ? `${purposeVerb(trip.purpose)} 중 · ${trip.from.label} → ${trip.to.label} (곧 도착)`
      : `${purposeVerb(trip.purpose)} 중 · ${trip.from.label} → ${trip.to.label} (걸어서 ${remain}분 남음)`;
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
    if (away.kind === "ride") return rideCardFor(base, run, away, minute);
    const remain = Math.ceil(Math.max(0, away.end_min - Math.floor(minute)));
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

// Now card during a subway ride (stage 9c): the full itinerary in one
// line ("지하철 이동 중 · 2호선 잠실→강남 (약 8.6분) · 환승 · 신분당선
// 강남→판교 · 21분 남음") plus a per-leg payload the UI renders with
// congestion % and source badges. Without a drawn path the card says so
// and falls back to the minutes number.
function rideCardFor(base, run, away, minute) {
  const detail = away.detail || {};
  const dir = detail.direction === "back" ? "back" : "out";
  const m = Math.floor(minute);
  const dur = Math.max(1, away.end_min - away.start_min);
  const progress = Math.min(1, Math.max(0, (m - away.start_min) / dur));
  const ride = detail.ride || null;
  const banner = ride
    ? journeyBanner({ ride, dir, elapsed: m - away.start_min,
      rideMinutes: detail.ride_minutes || dur })
    : null;
  let now;
  if (banner) {
    const legBits = ride.legs.map((l) => `${l.lineName} ${l.from}→${l.to} (약 ${l.minutes}분)`).join(" · 환승 · ");
    now = `지하철 이동 중 · ${legBits} · ${Math.ceil(banner.minutesLeft)}분 남음`;
  } else {
    const left = Math.ceil(Math.max(0, away.end_min - m));
    const note = detail.journey_note || "경로 없음";
    now = `지하철 이동 중 · ${note} · ${left}분 남음`;
  }
  const payload = {
    direction: dir,
    where: banner ? banner.where : (detail.journey_note || "경로 없음"),
    minutesLeft: banner ? Math.ceil(banner.minutesLeft) : Math.ceil(Math.max(0, away.end_min - m)),
    inTransfer: banner ? banner.inTransfer : false,
    legs: banner ? banner.legs : [],
    transfers: ride ? ride.transfers.map((t) => ({ station: t.station, minutes: t.minutes })) : [],
    fallback: !ride && detail.ride_fallback ? { ...detail.ride_fallback } : null,
  };
  if (!away.cause) {
    return { ...base, state: "ride", now, why: OLD_RUN_WHY, whyKind: "none",
      progress, oldRun: true, tripId: null, awayId: awayKey(away), ride: payload };
  }
  return { ...base, state: "ride", now,
    why: away.cause.text, whyKind: away.cause.type,
    criterionIds: [...(away.cause.criterion_ids || [])],
    decisionId: away.cause.decision_id || null,
    decision: decisionSummary(run, away.cause.decision_id),
    progress, tripId: null, awayId: awayKey(away), ride: payload };
}

// Fatigue readout at (day, minute): the series value plus the current
// leg's delta and its congestion context. Null without a series.
export function fatigueFor({ run, agentKey, day, minute }) {
  const entry = (run.daily || []).find((d) => d.agent === agentKey);
  const dayFat = entry && entry.days[day] && entry.days[day].fatigue;
  if (!dayFat || !Array.isArray(dayFat.series)) return null;
  const m = Math.floor(minute);
  let value = dayFat.series.length > 0 ? dayFat.series[0].v : dayFat.start;
  for (const p of dayFat.series) {
    if (p.m <= m) value = p.v;
    else break;
  }
  const out = { value, delta: null, note: "", source: null,
    criterionIds: [], series: dayFat.series,
    arrivalWork: dayFat.arrival_work, afterHome: dayFat.after_home,
    peak: dayFat.peak, end: dayFat.end,
    peakCongestion: dayFat.peak_congestion || null };
  const trip = (run.trips || []).find((t) => t.agent === agentKey && t.day === day
    && m >= t.depart_min && m < t.arrive_min);
  if (trip) {
    out.delta = trip.fatigue_delta ?? null;
    out.note = `걸어서 ${trip.minutes}분 이동`;
    out.criterionIds = ["C-fatigue-load"];
    return out;
  }
  const away = (run.aways || []).find((a) => a.agent === agentKey && a.day === day
    && m >= a.start_min && m < a.end_min);
  if (!away) {
    out.note = "집에서 회복 중";
    out.criterionIds = ["C-fatigue-recovery"];
    return out;
  }
  if ((away.kind === "work" || away.kind === "ride") && away.detail
      && (away.detail.rides || away.detail.ride || away.detail.ride_fallback)) {
    const ride = rideStateFor(away, m);
    // The normalised ride state (both engine forms): the drawn direction
    // or the per-direction fallback.
    if (ride && (ride.dir === "out" || ride.dir === "back") && ride.rides) {
      const dir = ride.rides[ride.dir];
      const at = legAt(dir, ride.elapsed);
      const leg = dir.legs[at.legIndex];
      const c = leg.congestion;
      const posture = standShare(c.valuePct) >= 0.5 ? "서서 감" : "앉아서 감";
      if (at.inTransfer) {
        const legsSum = dir.legs.reduce((a, l) => a + l.fatigueDelta, 0);
        const n = dir.transfers.length || 1;
        out.delta = Math.round(((dir.fatigueDelta - legsSum) / n) * 10) / 10;
        out.note = `${dir.transfers[at.transferIndex].station} 환승 중`;
      } else {
        out.delta = leg.fatigueDelta;
        out.note = `${leg.lineName} ${leg.from}→${leg.to} 붐비는 정도 ${c.valuePct}%, ${posture}`;
      }
      out.source = c.source;
      out.criterionIds = ["C-congestion", "C-fatigue-load"];
      return out;
    }
    if (ride && (ride.dir === "out" || ride.dir === "back") && ride.fallback) {
      const fb = ride.fallback;
      out.delta = ride.dir === "out" ? fb.out_delta : fb.back_delta;
      out.note = `붐비는 정도 자료가 없어요 · 정해 둔 값 ${fb.congestion_pct}%`;
      out.source = "가정값";
      out.criterionIds = ["C-congestion", "C-fatigue-load"];
      return out;
    }
    out.note = "근무 중 · 앉아서 회복";
    out.criterionIds = ["C-fatigue-recovery"];
    return out;
  }
  if (away.kind === "work" || away.kind === "school") {
    out.note = away.kind === "work" ? "근무 중 · 앉아서 회복" : "수업 중 · 앉아서 회복";
    out.criterionIds = ["C-fatigue-recovery"];
    return out;
  }
  out.note = "머무는 중";
  out.criterionIds = [];
  return out;
}

// Every household member in one row (free camera).
export function householdNow({ run, indexed, day, minute }) {
  return (run.agents || [])
    .filter((a) => a.household)
    .map((a, i) => {
      const card = nowCardFor({ run, indexed, agentKey: a.key, day, minute });
      return { memberIndex: i + 1, agentKey: a.key, label: a.label, line: card.now,
        fatigue: card.fatigue ? card.fatigue.value : null };
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
      text: `${hhmm(d.minute)} 고른 것 · ${DECISION_KIND_KO[d.kind] || d.kind} → ${chosenLabel(d)}` });
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

// Intro-card facts: who is simulated, for how long, and the stated
// assumptions behind the run. Pure (no DOM); the scene publishes the
// result as `simMeta` at sim load.
const ROLE_KO = { adult: "성인", child: "어린이", senior: "노인" };

export function simMetaFor({ household, scenario, run, homes }) {
  const members = household.map((a, i) => {
    const raw = scenario && scenario.household && scenario.household.members[i];
    const role = ROLE_KO[(raw && raw.role) || a.role] || a.role;
    return `${a.label} (${role})`;
  });
  const assumptions = [];
  if (scenario) {
    if (scenario.workday_minutes) {
      assumptions.push({ label: `회사에 머무는 시간 ${scenario.workday_minutes}분`, source: "가정값" });
    }
    for (const m of scenario.household.members || []) {
      if (!m.work || m.work.type !== "station_ride") continue;
      const rm = m.work.ride_minutes;
      const rideSource = m.work.ride_minutes_source === "user_input" ? "고객 입력" : "가정값";
      if (Number.isFinite(rm)) {
        assumptions.push({ label: `${m.label} 차·지하철 탄 시간 ${rm}분`, source: rideSource });
      } else if (rm && typeof rm === "object") {
        for (const [home, v] of Object.entries(rm)) {
          if (Number.isFinite(v)) {
            assumptions.push({ label: `${m.label} ${home} 경로 차·지하철 탄 시간 ${v}분`,
              source: rideSource });
          }
        }
      }
      if (m.work.place && m.work.place.name) {
        assumptions.push({ label: `${m.label} 직장 ${m.work.place.name}`, source: "가정값" });
      }
    }
    const A = scenario.money && scenario.money.assumptions;
    if (A) {
      if (A.transit_fare_won) {
        assumptions.push({ label: `통근 1회 ${A.transit_fare_won.toLocaleString()}원`, source: "가정값" });
      }
      if (A.basket_won) {
        assumptions.push({ label: `장보기 1회 ${A.basket_won.toLocaleString()}원`, source: "가정값" });
      }
    }
  }
  return {
    members, neighbours: run.meta.background, days: run.meta.days,
    startDate: run.meta.start_date, homes: homes.map((h) => h.label),
    assumptions: assumptions.slice(0, 8),
  };
}

function kindOrder(kind) {
  return { money: 0, depart: 1, decision: 2, arrive: 3 }[kind] ?? 4;
}
