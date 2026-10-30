// Custom-run money doc (18, Part 1). A customer's own 살아 보기 never
// reads another scenario's money file: the simulation card builds this
// doc in the browser from the same functions web/scripts/money.mjs
// uses (tenureCost, householdMonthlyNet, moneyTimeline, reference
// prices from the picked candidates' 실거래) and stores it with the
// custom run in IndexedDB. paintMoney / paintCompare / ensureShareData
// then read it on load.
//
// Anything uncomputable stays null with a reason in home.missing — the
// UI shows "아직 계산하지 못했어요" + reason, never demo numbers.

import { tenureCost, TENURES } from "../money/tenure.js";
import { householdMonthlyNet } from "../money/payroll.js";
import { moneyTimeline } from "../money/timeline.js";
import { qualityCard } from "../money/quality.js";
import { registerSignals, JEONSE_MIN_TRADES, JEONSE_SPARSE_NOTE,
  JEONSE_REF_NOTE, JEONSE_CAUTION_ID, JEONSE_WARNING_ID } from "../money/jeonse.js";
import { CRITERIA_DOC_NAME, CRITERIA_VERSION, moneyOptsFromCriteria,
  resolveCriteria } from "../engine/criteria.js";
import { Router } from "../engine/graph.js";
import { resolveHome } from "../engine/scenario.js";
import { buildPlaces } from "../engine/places.js";
import { educationCounts, schoolRoute } from "../education.js";

export const CUSTOM_MONEY_MISSING = "아직 계산하지 못했어요";

// Candidate tenure entry (find_homes row) → price inputs for one home.
// Medians come from the candidate's own 실거래 buckets.
export function priceInputsFromCandidate(candidate, tenure) {
  const entries = (candidate && candidate.tenures) || [];
  const byKey = { 매매: "trade", 전세: "jeonse", 월세: "wolse" };
  const entry = entries.find((e) => e.tenure === byKey[tenure]) || null;
  if (!entry || entry.median_won === null || entry.median_won === undefined) {
    return { entry: null, inputs: { source: "rtms" } };
  }
  if (tenure === "매매") {
    return { entry, inputs: { price_won: entry.median_won, source: "rtms" } };
  }
  if (tenure === "전세") {
    return { entry, inputs: { price_won: entry.median_won, source: "rtms" } };
  }
  if (tenure === "월세") {
    if (entry.deposit_median_won === null || entry.deposit_median_won === undefined
        || entry.median_won === null || entry.median_won === undefined) {
      return { entry: null, inputs: { source: "rtms" } };
    }
    return { entry, inputs: { deposit_won: entry.deposit_median_won,
      monthly_rent_won: entry.median_won, source: "rtms" } };
  }
  return { entry: null, inputs: { source: "rtms" } };
}

// Reference-price block shaped like referencePrice() output, from the
// candidate's own bucket medians (p25/p75 are not in the index — null,
// never invented).
export function referenceFromCandidate(candidate, areaM2) {
  const entries = (candidate && candidate.tenures) || [];
  const one = (key) => entries.find((e) => e.tenure === key) || null;
  const trade = one("trade");
  const jeonse = one("jeonse");
  const wolse = one("wolse");
  const stat = (e) => (e ? { count: e.deals || 0, median: e.median_won ?? null,
    p25: null, p75: null, min: e.min_won ?? null, max: e.max_won ?? null } : null);
  return {
    area_m2: areaM2,
    bucket_m2: 5,
    from: "candidate",
    note: "고른 후보의 실거래 요약(중간값)에서 가져왔어요",
    period: { from: null, to: null },
    trade: { ...(stat(trade) || { count: 0, median: null, p25: null, p75: null }),
      unit: "won", area_bucket_m2: areaM2 },
    jeonse: {
      deposit: { ...(stat(jeonse) || { count: 0, median: null, p25: null, p75: null }),
        unit: "won" },
      count: jeonse ? jeonse.deals || 0 : 0,
      period: { from: null, to: null }, area_bucket_m2: areaM2,
    },
    wolse: {
      deposit: { count: wolse ? wolse.deals || 0 : 0,
        median: wolse ? wolse.deposit_median_won ?? null : null,
        p25: null, p75: null, unit: "won" },
      monthly: { ...(stat(wolse) || { count: 0, median: null, p25: null, p75: null }),
        unit: "won" },
      count: wolse ? wolse.deals || 0 : 0,
      period: { from: null, to: null }, area_bucket_m2: areaM2,
    },
  };
}

// 전세가율 check from candidate medians (same band rule + thresholds
// as jeonseRatio, which needs raw rows the browser does not have).
export function jeonseCheckFromMedians({ areaM2, tradeMedian, tradeCount,
  jeonseMedian, jeonseCount, cautionPct = 70, warningPct = 80 } = {}) {
  const base = {
    area_m2: areaM2,
    bucket_m2: 5,
    from: "candidate",
    period: { from: null, to: null },
    trade: { count: tradeCount || 0, median: tradeMedian ?? null, unit: "won" },
    jeonse: { count: jeonseCount || 0, median: jeonseMedian ?? null, unit: "won" },
  };
  if (!(tradeCount >= JEONSE_MIN_TRADES) || !(jeonseCount > 0)
      || !(tradeMedian > 0) || !(jeonseMedian > 0)) {
    return { ...base, computable: false, ratio_pct: null, band: null,
      note: JEONSE_SPARSE_NOTE };
  }
  const ratio = Math.round((jeonseMedian / tradeMedian) * 1000) / 10;
  let band;
  if (ratio >= warningPct) {
    band = { key: "high", label: `80% 이상 (${JEONSE_WARNING_ID} 이상)`,
      criterion_id: JEONSE_WARNING_ID };
  } else if (ratio >= cautionPct) {
    band = { key: "watch", label: `70% 이상 (${JEONSE_CAUTION_ID} 이상)`,
      criterion_id: JEONSE_CAUTION_ID };
  } else {
    band = { key: "below", label: "70% 미만 (참고선 아래)",
      criterion_id: JEONSE_CAUTION_ID };
  }
  return { ...base, computable: true, ratio_pct: ratio, band,
    ref_note: JEONSE_REF_NOTE, caution_pct: cautionPct, warning_pct: warningPct };
}

// Weekend/leisure outings over the 30 days, from this run's own
// household totals (the same two counters compare sums as
// errands_done + park_visits). Embedded per home so the score reads
// the money doc only and never shifts when a panel opens.
export function leisureTripsFromRun(run) {
  const h = (run && run.totals && run.totals.household) || {};
  const e = Number(h.errands_done);
  const p = Number(h.park_visits);
  if (!Number.isFinite(e) || !Number.isFinite(p)) return null;
  return Math.round((e + p) * 10) / 10;
}

const PROFILE_TENURE_KO = { jeonse: "전세", wolse: "월세", trade: "매매",
  public: "공공임대", undecided: "전세" };

// Profile money fields → householdMonthlyNet inputs (member ids m1…).
export function moneyMembersFromProfile(profile, members) {
  const v = (k) => (profile && profile[k] ? profile[k].value : null);
  const salaries = v("salaryAnnual");
  const takehome = v("takehomeMonthly");
  const out = {};
  (members || []).forEach((m, i) => {
    const id = m.id || `m${i + 1}`;
    const entry = {};
    const annual = Array.isArray(salaries) ? salaries[i] ?? salaries[0] : salaries;
    if (Number.isFinite(Number(annual)) && Number(annual) > 0) {
      entry.annual_salary_won = Number(annual);
    }
    const net = Array.isArray(takehome) ? takehome[i] ?? takehome[0] : takehome;
    const intakeNet = Number(m.incomeMonthly);
    if (Number.isFinite(intakeNet) && intakeNet > 0) {
      entry.monthly_net_won = Math.round(intakeNet);
    } else if (Number.isFinite(Number(net)) && Number(net) > 0) {
      entry.monthly_net_won = Number(net);
    }
    out[id] = entry;
  });
  return out;
}

// fare stop coordinates from the region network (same fallback map as
// money.mjs).
export function fareStopCoordsFromNetwork(network) {
  const map = new Map();
  for (const line of (network && network.lines) || []) {
    for (const s of line.stops || []) {
      if (s && s.id !== undefined && Number.isFinite(s.lon) && Number.isFinite(s.lat)) {
        map.set(s.id, [s.lon, s.lat]);
      }
    }
  }
  return map;
}

// Build the money doc for picked homes. picked: [{label, candidate,
// complexName, areaId}]; areas: Map boxId -> area doc; runs: {label:
// run}; profile: the customer's profile; payrollTable: kr-payroll.json;
// network/schedule for fares. Pure except no I/O at all — callers pass
// everything in.
export function buildCustomMoneyDoc({ scenario, runs, picked, profile,
  payrollTable, areas, network = null, fareSchedule = null } = {}) {
  if (!scenario || !runs || !Array.isArray(picked) || picked.length === 0) {
    throw new Error("custom-money: scenario, runs and picked homes are required");
  }
  if (!payrollTable) throw new Error("custom-money: payroll table is required");
  const crit = resolveCriteria(scenario);
  const A = moneyOptsFromCriteria(crit);
  const members = (scenario.household && scenario.household.members) || [];
  const moneyMembers = moneyMembersFromProfile(profile, members);
  const net = householdMonthlyNet({ members: moneyMembers }, members, payrollTable);
  const profTenure = (profile && profile.tenure && profile.tenure.value) || "undecided";
  const defaultTenureKo = PROFILE_TENURE_KO[profTenure] || "전세";
  const cash = Number(profile && profile.cash && profile.cash.value);
  const cashWon = Number.isFinite(cash) && cash > 0 ? Math.round(cash) : 0;
  const fareStopCoords = fareSchedule ? fareStopCoordsFromNetwork(network) : null;
  const spendBase = {
    transit_fare_won: A.transit_fare_won, basket_won: A.basket_won,
    maintenance_won_month: A.maintenance_won_month,
    other_fixed_won_month: A.other_fixed_won_month,
    household_monthly_net_won: net.household_monthly_net_won,
    pay_day_of_month: A.pay_day_of_month,
    fixed_due_day_1based: A.fixed_due_day_1based,
    fare_schedule: fareSchedule, fare_stop_coords: fareStopCoords,
  };
  const defaultTenure = {};
  const homes = {};
  for (const p of picked) {
    const label = p.label;
    defaultTenure[label] = defaultTenureKo;
    const run = runs[label];
    const missing = [];
    if (!run) {
      missing.push({ field: "run", reason_ko: "이 집의 30일 실행 결과가 없어요" });
      homes[label] = { area: p.areaId || null, complex_name: p.complexName || "",
        area_m2: null, missing, by_tenure: {}, leisure_trips_30d: null };
      continue;
    }
    const cand = p.candidate || {};
    const area = areas && typeof areas.get === "function"
      ? areas.get(p.areaId) : null;
    const router = area && area.graph ? new Router(area.graph) : null;
    if (!router) missing.push({ field: "graph", reason_ko: "걸음 그래프가 없어 걸어서 잰 값을 계산하지 못했어요" });
    // Own area: the default-tenure bucket centre, else the first entry.
    const entries = cand.tenures || [];
    const ownEntry = entries.find((e) => e.tenure === { 전세: "jeonse", 월세: "wolse", 매매: "trade" }[defaultTenureKo])
      || entries[0] || null;
    const areaM2 = ownEntry ? ownEntry.bucket_center_m2 : null;
    if (areaM2 === null || areaM2 === undefined) {
      missing.push({ field: "area_m2", reason_ko: "실거래 면적대가 없어 가격을 계산하지 못했어요" });
    }
    const reference = referenceFromCandidate(cand, areaM2);
    const byTenure = {};
    for (const tenure of TENURES) {
      if (tenure === "공공임대") {
        byTenure[tenure] = null;
        continue;
      }
      const { inputs } = priceInputsFromCandidate(cand, tenure);
      const hasPrice = [inputs.price_won, inputs.deposit_won, inputs.monthly_rent_won]
        .some((n) => Number.isFinite(n));
      if (!hasPrice) {
        byTenure[tenure] = null;
        continue;
      }
      const housing = tenureCost({ tenure, ...inputs, cash_won: cashWon,
        loan_rate_pct: A.loan_rate_pct, loan_years: A.loan_years,
        jeonse_loan_cap_won: A.jeonse_loan_cap_won, source: inputs.source });
      const tl = moneyTimeline(run, scenario, { ...spendBase,
        housing_monthly_won: housing.monthly_won, tenure,
        housing_source: inputs.source });
      byTenure[tenure] = {
        housing, price_inputs: inputs,
        totals_by_category: tl.totals_by_category,
        monthly_spent_won: tl.monthly_spent_won,
        remaining_won: tl.remaining_won,
        burden_ratio: tl.burden_ratio,
        counts: tl.counts,
        flags: tl.flags,
        daily_balance_won: tl.daily_balance_won,
        payday_note: tl.payday_note,
      };
    }
    if (Object.values(byTenure).every((b) => b === null)) {
      missing.push({ field: "by_tenure", reason_ko: "이 집의 실거래가 없어 월 주거비를 계산하지 못했어요" });
    }
    const qol = router
      ? qualityCard(run, area, router, {}, crit.flat.convenience_minutes, { includeIds: true })
      : null;
    let qolEducation = null;
    let schoolRoutes = [];
    if (router) {
      try {
        const places = buildPlaces(area, router);
        const scenHome = (scenario.homes || []).find((h) => h.label === label);
        const homeNode = resolveHome(area, {
          area: p.areaId, complex_name: p.complexName,
          lon: scenHome && scenHome.lon, lat: scenHome && scenHome.lat,
        }, router).nodeId;
        qolEducation = educationCounts(places, router, homeNode);
        schoolRoutes = (run.agents || [])
          .filter((a) => a.household && a.role === "child")
          .map((a) => ({ ...schoolRoute(run, router, a.key), label: a.label, id: a.id }));
      } catch {
        qolEducation = null;
        schoolRoutes = [];
        missing.push({ field: "qol_education", reason_ko: "학교까지의 거리를 재지 못했어요" });
      }
    }
    // 전세가율 from the candidate's own medians.
    const tradeEntry = entries.find((e) => e.tenure === "trade") || null;
    const jeonseEntry = entries.find((e) => e.tenure === "jeonse") || null;
    const jeonseCheck = jeonseCheckFromMedians({
      areaM2,
      tradeMedian: tradeEntry ? tradeEntry.median_won : null,
      tradeCount: tradeEntry ? tradeEntry.deals : 0,
      jeonseMedian: jeonseEntry ? jeonseEntry.median_won : null,
      jeonseCount: jeonseEntry ? jeonseEntry.deals : 0,
      cautionPct: crit.flat.jeonse_caution_pct,
      warningPct: crit.flat.jeonse_warning_pct,
    });
    const complexRec = area && Array.isArray(area.complexes)
      ? area.complexes.find((c) => c.name === p.complexName) : null;
    const complexBuildings = complexRec && Array.isArray(area.buildings)
      ? area.buildings.filter((b) => (complexRec.building_ids || []).includes(b.id))
      : [];
    const spendTl = moneyTimeline(run, scenario, { ...spendBase, housing_monthly_won: 0 });
    homes[label] = {
      area: p.areaId || null,
      complex_name: p.complexName || "",
      area_m2: areaM2,
      match_method: "candidate",
      missing,
      reference,
      by_tenure: byTenure,
      jeonse_check: jeonseCheck,
      register_signals: registerSignals(complexBuildings),
      qol_time: qol ? qol.time : null,
      qol_convenience: qol ? qol.convenience : null,
      qol_fatigue: qol ? qol.fatigue : null,
      qol_education: qolEducation,
      school_routes: schoolRoutes,
      qol_safety: null,
      safety_missing: "공식 치안 통계를 이 화면에서 불러오지 못했어요",
      leisure_trips_30d: leisureTripsFromRun(run),
      spending_events: spendTl.events,
      flags: { ...spendTl.flags },
    };
  }
  return {
    scenario: scenario.name || "from-profile",
    custom: true,
    days: scenario.days || 30,
    payroll: { as_of: payrollTable.as_of || null, source: payrollTable.source || null },
    household_monthly_net_won: net.household_monthly_net_won,
    per_member_net: net.per_member,
    cash_won: cashWon,
    assumptions: {
      transit_fare_won: A.transit_fare_won, basket_won: A.basket_won,
      maintenance_won_month: A.maintenance_won_month,
      other_fixed_won_month: A.other_fixed_won_month,
      pay_day_of_month: A.pay_day_of_month,
      fixed_due_day_1based: A.fixed_due_day_1based,
      loan_rate_pct: A.loan_rate_pct, loan_years: A.loan_years,
      jeonse_loan_cap_won: A.jeonse_loan_cap_won,
    },
    burden_threshold_pct: crit.flat.burden_threshold_pct,
    criteria: { doc: CRITERIA_DOC_NAME, version: CRITERIA_VERSION,
      overrides: crit.overridden },
    default_tenure: defaultTenure,
    homes,
    runs_summary: null,
    support_rentals: null,
    public_listings: null,
  };
}

// US rent money doc (26d, pure, no payroll). picked: [{label, candidate,
// complexName, areaId}] like buildCustomMoneyDoc; labels accepted for
// call-site symmetry. Per home: {label, rent_usd_month, source, estimate}.
// currency is "USD"; there is no net pay and no loan.
export function buildUsRentMoneyDoc({ picked, labels } = {}) {
  if (!Array.isArray(picked) || picked.length === 0) {
    throw new Error("custom-money: picked homes are required");
  }
  const homes = {};
  for (const p of picked) {
    const label = p.label;
    const cand = p.candidate || {};
    const wolse = (cand.tenures || []).find((e) => e.tenure === "wolse") || null;
    let rent = wolse ? wolse.median_won : null;
    if (!Number.isFinite(rent)) {
      const bucket = (cand.buckets || [])[0] || null;
      const monthly = bucket && bucket.wolse ? bucket.wolse.monthly : null;
      rent = monthly ? monthly.median_won : null;
    }
    const price = cand.price || {};
    homes[label] = {
      label,
      complex_name: p.complexName || cand.name || "",
      area: p.areaId || null,
      rent_usd_month: Number.isFinite(rent) ? Math.round(rent) : null,
      source: price.zip && price.month
        ? `Zillow ZORI (ZIP ${price.zip}, ${price.month})`
        : "Zillow ZORI (ZIP 추정)",
      estimate: true,
    };
  }
  return {
    currency: "USD",
    custom: true,
    us_rent: true,
    labels: Array.isArray(labels) ? [...labels] : Object.keys(homes),
    default_tenure: Object.fromEntries(Object.keys(homes).map((l) => [l, "월세"])),
    homes,
  };
}
