// 30-day money timeline from a simulated run (pure, deterministic).
//
// Spending events tie to real simulated activity: one transit event per
// one-way commute journey, walk or ride (stage 15.3 — walking commutes
// cost 0원 with fare_note 걸어서 출근; ride journeys price from the
// distance fare table when the route is known, else the transit_fare_won
// fallback labelled 가정값), grocery from the household plan (stage
// 15.2: the same planned total for every home, spread over the planned
// errand days — simulated errand legs cost time and fatigue, never
// money), fixed costs on their due day, salary on payday(s). Household
// members only — background neighbours have no money. The balance is
// monthly cash flow starting at 0 (upfront deposit/purchase shown
// separately, not in the line).

import { dateOf } from "../engine/scenario.js";
import { planSchedule } from "../engine/agents.js";
import { criterionDefault } from "../engine/criteria.js";
import { fareForTrip, resolveLegKm, SHINBUNDANG_PENDING_NOTE } from "./fare.js";

export const MONEY_CATEGORIES = ["salary", "housing", "transit", "grocery", "maintenance", "other_fixed"];

export const MONEY_CATEGORY_KO = {
  salary: "급여",
  housing: "주거비",
  transit: "교통비",
  grocery: "장보기",
  maintenance: "관리비",
  other_fixed: "기타 고정비",
};

// Ride boundaries per member-day (stage 9c): one fare per commute trip
// that touches a ride — arriving at an out-ride boarding, or leaving
// from a back-ride alighting. Either engine form: new ride aways carry
// their direction; legacy work aways board at the start and alight at
// the end. Destination walks never touch these minutes (they sit
// between the ride and the work stay), and walking members touch none.
function rideBoundaries(run) {
  const board = new Set(); // `${agent}|${day}|${minute}` out-ride starts
  const alight = new Set(); // back-ride ends
  for (const a of run.aways || []) {
    if (!String(a.agent || "").startsWith("h")) continue;
    const key = (m) => `${a.agent}|${a.day}|${m}`;
    if (a.kind === "ride") {
      if ((a.detail && a.detail.direction) === "back") alight.add(key(a.end_min));
      else board.add(key(a.start_min));
    } else if (a.kind === "work" && a.detail && (a.detail.rides || a.detail.ride_fallback)) {
      board.add(key(a.start_min));
      alight.add(key(a.end_min));
    }
  }
  return { board, alight };
}

// Household grocery plan (pure, home-independent): Σ members'
// weekly errands × days/7 × one basket. Errand trips are still
// simulated (time + fatigue), but the money comes from this plan — the
// same number for A and B — spread over the union of the household's
// planned errand days (stage 15.1 draws, identical for both homes).
export function householdGrocery(scenario, { basket_won = 0 } = {}) {
  const basket = Math.max(0, Math.round(Number(basket_won) || 0));
  const members = (scenario.household && scenario.household.members) || [];
  const freqOf = (m) => m.errands_per_week || { supermarket: 0, convenience: 0 };
  const perWeek = members.reduce((a, m) =>
    a + (Number(freqOf(m).supermarket) || 0) + (Number(freqOf(m).convenience) || 0), 0);
  const total = Math.round(perWeek * scenario.days / 7 * basket);
  const daySet = new Set();
  members.forEach((m, i) => {
    const sched = planSchedule({
      key: `h${i + 1}`,
      errands_per_week: freqOf(m),
      park_walks_per_week: Number(m.park_walks_per_week) || 0,
      clinic_visits_per_month: Number(m.clinic_visits_per_month) || 0,
    }, scenario);
    for (const cat of ["supermarket", "convenience"]) {
      for (const d of sched.errands[cat]) daySet.add(d);
    }
  });
  return { total_won: total, errands_per_week: perWeek,
    errand_days: [...daySet].sort((a, b) => a - b) };
}

export function basketLabel(won) {
  const v = Math.max(0, Math.round(Number(won) || 0));
  if (v % 10000 === 0) return `${v / 10000}만 원`;
  return `${v}원`;
}

// Split a total across days so the parts sum exactly (the first days
// take the +1 remainder — deterministic).
export function spreadTotal(totalWon, days) {
  const total = Math.max(0, Math.round(Number(totalWon) || 0));
  const ds = days.length > 0 ? days : [0];
  if (!(total > 0)) return [];
  const base = Math.floor(total / ds.length);
  const rem = total % ds.length;
  return ds.map((day, i) => ({ day, amount_won: -(base + (i < rem ? 1 : 0)) }));
}

// One-way commute journeys per member-day (stage 15.3): every commute
// counts, walk or ride. A journey exists per direction (out = from home,
// back = to home) when a walk leg or a ride touches it; it is a ride
// journey when a ride (new-form ride away or legacy station-ride work
// stay) covers that direction, else a walk journey.
export function commuteJourneys(run) {
  const byDay = new Map();
  const entryFor = (agent, day) => {
    const k = `${agent}|${day}`;
    if (!byDay.has(k)) {
      byDay.set(k, { agent, day, outWalk: [], backWalk: [],
        outRide: null, backRide: null, legacy: null });
    }
    return byDay.get(k);
  };
  for (const t of run.trips || []) {
    if (!String(t.agent || "").startsWith("h") || t.purpose !== "commute") continue;
    const e = entryFor(t.agent, t.day);
    if (t.from && t.from.kind === "home") e.outWalk.push(t);
    if (t.to && t.to.kind === "home") e.backWalk.push(t);
  }
  for (const a of run.aways || []) {
    if (!String(a.agent || "").startsWith("h")) continue;
    if (a.kind === "ride") {
      const e = entryFor(a.agent, a.day);
      if (a.detail && a.detail.direction === "back") e.backRide = a;
      else e.outRide = a;
    } else if (a.kind === "work" && a.detail && a.detail.ride_minutes !== undefined) {
      entryFor(a.agent, a.day).legacy = a;
    }
  }
  const journeys = [];
  for (const e of byDay.values()) {
    const sides = [
      { direction: "out", walk: e.outWalk[0] || null, ride: e.outRide },
      { direction: "back", walk: e.backWalk[0] || null, ride: e.backRide },
    ];
    for (const s of sides) {
      const ride = rideStateOf(s.ride, e.legacy, s.direction);
      if (!s.walk && ride.state === "none") continue;
      journeys.push({ agent: e.agent, day: e.day, direction: s.direction,
        walk: s.walk, ride });
    }
  }
  journeys.sort((a, b) => a.day - b.day || (a.agent < b.agent ? -1 : 1)
    || (a.direction === b.direction ? 0 : a.direction === "out" ? -1 : 1));
  return journeys;
}

// Ride coverage for one direction: new-form ride away first, else the
// legacy station-ride work stay's side. → {state: legs|fallback|none}.
function rideStateOf(rideAway, legacyAway, direction) {
  if (rideAway && rideAway.detail) {
    const d = rideAway.detail;
    if (d.ride && Array.isArray(d.ride.legs)) return { state: "legs", legs: d.ride.legs };
    if (d.ride_fallback) return { state: "fallback" };
    return { state: "none" };
  }
  if (legacyAway && legacyAway.detail) {
    const d = legacyAway.detail;
    const side = d.rides && d.rides[direction];
    if (side && Array.isArray(side.legs)) return { state: "legs", legs: side.legs };
    if (d.ride_fallback) return { state: "fallback" };
  }
  return { state: "none" };
}

// One ride journey's transit event: fareForTrip when the route is known,
// else the transit_fare_won fallback (가정값).
function priceRideJourney(j, fare, fareCtx) {
  const base = { day: j.day, category: "transit", memo: `${j.agent} 통근 승차`,
    ...(j.walk ? { trip_id: j.walk.id } : {}) };
  const fallback = () => ({ ...base, amount_won: -fare, source: "가정값",
    fare_note: "가정값", distance_km: null });
  if (j.ride.state !== "legs") return fallback();
  const resolved = [];
  for (const leg of j.ride.legs) {
    const r = resolveLegKm(leg, fareCtx);
    if (!r) return fallback();
    resolved.push({ ...leg, km: r.km, official: r.official });
  }
  const priced = fareForTrip({ legs: resolved, card: "transit_card", age: "adult" });
  if (!priced) return fallback();
  let note = `거리비례 ${priced.distance_km}km`;
  if (priced.distance === "추정") note += " (추정)";
  if (priced.shinbundang) note = `${SHINBUNDANG_PENDING_NOTE} · ${note}`;
  return { ...base, amount_won: -priced.fare_won, source: priced.source,
    fare_note: note, distance_km: priced.distance_km, distance: priced.distance,
    ...(priced.shinbundang ? { shinbundang: priced.shinbundang } : {}) };
}

function payDaysInWindow(scenario, payDayOfMonth) {
  const days = [];
  for (let d = 0; d < scenario.days; d++) {
    const iso = dateOf(scenario.start_date, d);
    if (Number(iso.slice(8, 10)) === payDayOfMonth) days.push(d);
  }
  return days;
}

export function moneyTimeline(run, scenario, opts = {}) {
  const days = scenario.days;
  const { board, alight } = rideBoundaries(run);
  const fare = Math.max(0, Math.round(Number(opts.transit_fare_won) || 0));
  const basket = Math.max(0, Math.round(Number(opts.basket_won) || 0));
  const maintenance = Math.max(0, Math.round(Number(opts.maintenance_won_month) || 0));
  const otherFixed = Math.max(0, Math.round(Number(opts.other_fixed_won_month) || 0));
  const monthlyNet = Math.max(0, Math.round(Number(opts.household_monthly_net_won) || 0));
  const housingMonthly = Math.max(0, Math.round(Number(opts.housing_monthly_won) || 0));
  const dueDay = Math.min(days - 1, Math.max(0,
    (Number(opts.fixed_due_day_1based) || criterionDefault("C-money-fixed", "due_day_1based")) - 1));
  const payDay = Number(opts.pay_day_of_month) || criterionDefault("C-money-fixed", "pay_day");

  const events = [];
  let commuteLegs = 0;
  let errandTrips = 0;
  for (const t of run.trips || []) {
    if (!String(t.agent || "").startsWith("h")) continue;
    if (t.purpose === "commute" && fare > 0
        && (board.has(`${t.agent}|${t.day}|${t.arrive_min}`)
          || alight.has(`${t.agent}|${t.day}|${t.depart_min}`))) {
      commuteLegs++;
    } else if (t.purpose === "errand" && t.from && t.from.kind === "home") {
      // Simulated legs: they cost time and fatigue, never money.
      errandTrips++;
    }
  }
  // Every commute journey counts, walk or ride (stage 15.3).
  const fareCtx = { schedule: opts.fare_schedule || null,
    stopCoords: opts.fare_stop_coords || null };
  const journeys = commuteJourneys(run);
  let commuteRideTrips = 0;
  let commuteWalkTrips = 0;
  for (const j of journeys) {
    if (j.ride.state === "none") {
      commuteWalkTrips++;
      const walkKm = j.walk ? Math.round(j.walk.distance_m / 10) / 100 : null;
      events.push({ day: j.day, category: "transit", amount_won: 0,
        memo: `${j.agent} 걸어서 ${j.direction === "out" ? "출근" : "퇴근"}`,
        ...(j.walk ? { trip_id: j.walk.id } : {}),
        source: "graph", fare_note: "걸어서 출근",
        ...(walkKm === null ? {} : { distance_km: walkKm }) });
    } else {
      commuteRideTrips++;
      events.push(priceRideJourney(j, fare, fareCtx));
    }
  }
  // A member with workdays but no commute at all is a broken run, not a
  // cheap one: log it and flag the result.
  const flags = { commute_missing: false };
  const journeysByAgent = new Map();
  for (const j of journeys) {
    journeysByAgent.set(j.agent, (journeysByAgent.get(j.agent) || 0) + 1);
  }
  const members = (scenario.household && scenario.household.members) || [];
  members.forEach((m, i) => {
    const key = `h${i + 1}`;
    const hasWork = Array.isArray(m.workdays) && m.workdays.length > 0
      && m.work && m.work.type !== "none";
    if (!hasWork) return;
    if ((journeysByAgent.get(key) || 0) === 0) {
      flags.commute_missing = true;
      console.error(`[engine] commute-missing ${m.id || key} ${run.meta && run.meta.home}`);
    }
  });
  // Grocery from the household plan (same total for every home).
  const plan = householdGrocery(scenario, { basket_won: basket });
  const grocerySource = `가구 공통 (주 ${plan.errands_per_week}회 × ${basketLabel(basket)}, 가정값)`;
  const groceryEvents = spreadTotal(plan.total_won, plan.errand_days);
  for (const g of groceryEvents) {
    events.push({ day: g.day, category: "grocery", amount_won: g.amount_won,
      memo: "장보기", source: grocerySource });
  }
  // Fixed costs on their due day.
  if (maintenance > 0) {
    events.push({ day: dueDay, category: "maintenance", amount_won: -maintenance,
      memo: "관리비(가정값)", source: "scenario" });
  }
  if (otherFixed > 0) {
    events.push({ day: dueDay, category: "other_fixed", amount_won: -otherFixed,
      memo: "기타 고정비(가정값)", source: "scenario" });
  }
  // Housing monthly on the due day too (rent/interest/amortisation).
  if (housingMonthly > 0) {
    events.push({ day: dueDay, category: "housing", amount_won: -housingMonthly,
      memo: `주거비 월 납입 (${opts.tenure || ""})`.trim(), source: opts.housing_source || "rtms" });
  }
  // Salary on payday(s) inside the window; none inside → day 0 with note.
  let paydays = payDaysInWindow(scenario, payDay);
  let paydayNote = `매월 ${payDay}일 지급 가정`;
  if (paydays.length === 0) {
    paydays = [0];
    paydayNote = `시뮬레이션 기간에 ${payDay}일이 없어 1일차에 1개월분 계상`;
  }
  const perPay = paydays.length > 1 ? Math.round(monthlyNet / paydays.length) : monthlyNet;
  for (const d of paydays) {
    events.push({ day: d, category: "salary", amount_won: perPay,
      memo: "월 실수령액", source: opts.salary_source || "user_input" });
  }

  events.sort((a, b) => a.day - b.day || categoryOrder(a.category) - categoryOrder(b.category));

  const totals = {};
  for (const c of MONEY_CATEGORIES) totals[c] = 0;
  for (const e of events) totals[e.category] += e.amount_won;

  const dailyBalance = [];
  let bal = 0;
  for (let d = 0; d < days; d++) {
    for (const e of events) if (e.day === d) bal += e.amount_won;
    dailyBalance.push(bal);
  }

  const spent = -(totals.housing + totals.transit + totals.grocery + totals.maintenance + totals.other_fixed);
  const burden = monthlyNet > 0 ? -totals.housing / monthlyNet : null;
  return {
    home: run.meta && run.meta.home,
    days,
    events,
    counts: { commute_legs: commuteLegs,
      commute_trips: commuteRideTrips + commuteWalkTrips,
      commute_ride_trips: commuteRideTrips, commute_walk_trips: commuteWalkTrips,
      errand_visits: groceryEvents.length,
      errand_trips: errandTrips, paydays: paydays.length },
    flags,
    totals_by_category: totals,
    monthly_spent_won: spent,
    monthly_net_won: monthlyNet,
    remaining_won: monthlyNet - spent,
    burden_ratio: burden,
    daily_balance_won: dailyBalance,
    payday_note: paydayNote,
    balance_note: "월 현금흐름 잔액 (보증금·매매 대금 등 목돈 제외)",
  };
}

function categoryOrder(c) {
  return MONEY_CATEGORIES.indexOf(c);
}
