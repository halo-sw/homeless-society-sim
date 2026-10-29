// 30-day money timeline from a simulated run (pure, deterministic).
//
// Spending events tie to real simulated activity: one transit fare per
// commute trip that touches a ride (stage 9c: arriving at an out-ride
// boarding, or leaving from a back-ride alighting — either engine form;
// members who walk to their workplace touch no ride and pay none),
// grocery from the household plan (stage 15.2: the same planned total
// for every home, spread over the planned errand days — simulated
// errand legs cost time and fatigue, never money), fixed costs on their
// due day, salary on payday(s). Household members only — background
// neighbours have no money. The balance is monthly cash flow starting
// at 0 (upfront deposit/purchase shown separately, not in the line).

import { dateOf } from "../engine/scenario.js";
import { planSchedule } from "../engine/agents.js";
import { criterionDefault } from "../engine/criteria.js";

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
      events.push({ day: t.day, category: "transit", amount_won: -fare,
        memo: `${t.agent} 통근 승차`, trip_id: t.id, source: "scenario" });
    } else if (t.purpose === "errand" && t.from && t.from.kind === "home") {
      // Simulated legs: they cost time and fatigue, never money.
      errandTrips++;
    }
  }
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
    counts: { commute_legs: commuteLegs, errand_visits: groceryEvents.length,
      errand_trips: errandTrips, paydays: paydays.length },
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
