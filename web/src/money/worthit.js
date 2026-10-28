// "살 만한가?" multi-year housing-cost comparison (pure).
//
// Buy vs 전세 vs 월세 vs 공공임대 over a customer-picked horizon (5/10/20
// years), from real-transaction reference prices and the customer's own
// inputs. For each tenure: total cash out, interest paid, cash locked,
// opportunity cost of locked cash at a customer-set return rate (가정값),
// and — buying only — equity under customer-chosen price-change scenarios
// (default −2 / 0 / +2 % a year, each labelled "가정 시나리오, 전망 아님").
//
// Break-even: the first year where buying's net position (cumulative cash
// out minus recoverable equity under one scenario) is at or below a rental
// option's net position (cumulative cash out minus the returned deposit),
// or null ("기간 안에 없음"). Opportunity cost is shown alongside, never
// folded into break-even. No verdict text anywhere — the numbers compare,
// the customer decides.

import { amortisedMonthly } from "./tenure.js";

export const WORTHIT_HORIZONS = [5, 10, 20];
export const WORTHIT_SCENARIO_LABEL = "가정 시나리오, 전망 아님";
export const WORTHIT_DEFAULT_SCENARIOS = [-2, 0, 2];
export const LENDER_NOTE = "대출 가능 여부는 금융기관이 판단합니다.";
export const NO_BREAKEVEN_KO = "기간 안에 없음";

function won(n) {
  const v = Math.round(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

// Amortised schedule, yearly rows. Monthly payment matches tenure.js
// (원리금균등상환, ceil); the last payment absorbs rounding so the balance
// ends at exactly 0 and total principal equals the loan.
export function amortisationSchedule(principalWon, annualRatePct, years) {
  const p = won(principalWon);
  const n = Math.max(1, Math.round(Number(years) * 12));
  const monthly = amortisedMonthly(p, annualRatePct, years);
  const r = Number(annualRatePct) / 100 / 12;
  const rows = [];
  let balance = p;
  let totalInterest = 0;
  let totalPaid = 0;
  const yearCount = Math.ceil(n / 12);
  for (let y = 1; y <= yearCount; y++) {
    let paid = 0;
    let interest = 0;
    let principal = 0;
    for (let m = 0; m < 12 && (y - 1) * 12 + m < n; m++) {
      const isLast = (y - 1) * 12 + m === n - 1;
      const im = r > 0 ? balance * r : 0;
      let pm = monthly - im;
      if (isLast || pm >= balance) {
        pm = balance;
      }
      const pay = pm + im;
      balance = Math.max(0, balance - pm);
      paid += pay;
      interest += im;
      principal += pm;
    }
    totalInterest += interest;
    totalPaid += paid;
    rows.push({
      year: y,
      paid_won: Math.round(paid),
      interest_won: Math.round(interest),
      principal_won: Math.round(principal),
      balance_won: Math.round(balance),
    });
  }
  return {
    principal_won: p,
    rate_pct: Number(annualRatePct),
    years,
    monthly_won: monthly,
    total_paid_won: Math.round(totalPaid),
    total_interest_won: Math.round(totalInterest),
    yearly: rows,
  };
}

// DSR display maths: annual debt service ÷ annual income. Display only —
// the lender note always travels with it.
export function dsrRatio({ annualDebtServiceWon, annualIncomeWon }) {
  const service = Number(annualDebtServiceWon);
  const income = Number(annualIncomeWon);
  if (!(income > 0) || !(service >= 0)) return null;
  return Math.round((service / income) * 1000) / 10;
}

// Monthly payment under rate stress (+1/+2 %p), same principal and term.
export function rateStress({ principalWon, baseRatePct, years }) {
  const out = {};
  for (const bump of [0, 1, 2]) {
    out[`plus_${bump}pp`] = {
      rate_pct: Number(baseRatePct) + bump,
      monthly_won: amortisedMonthly(principalWon, Number(baseRatePct) + bump, years),
    };
  }
  return out;
}

// --- ownership-cost rule table (scenarios/assumptions/kr-ownership-costs.json) ---

const COST_KINDS = new Set(["one_off", "annual", "monthly"]);

export function validateOwnershipCosts(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") return ["table must be an object"];
  const locale = doc.locale || {};
  if (typeof locale.country !== "string" || !locale.country) errors.push("locale.country must be a non-empty string");
  if (typeof locale.currency !== "string" || !locale.currency) errors.push("locale.currency must be a non-empty string");
  for (const [section, required] of [["buy_costs", true], ["us_extension", false]]) {
    const block = doc[section];
    if (block === undefined && !required) continue;
    if (!block || typeof block !== "object") {
      errors.push(`${section} must be an object`);
      continue;
    }
    for (const [key, entry] of Object.entries(block)) {
      if (key === "note") continue;
      if (!entry || typeof entry !== "object") {
        errors.push(`${section}.${key} must be an object`);
        continue;
      }
      if (typeof entry.label !== "string" || !entry.label) errors.push(`${section}.${key}.label must be a non-empty string`);
      if (!COST_KINDS.has(entry.kind)) errors.push(`${section}.${key}.kind must be one_off/annual/monthly`);
      if (entry.value !== null && !Number.isFinite(entry.value)) {
        errors.push(`${section}.${key}.value must be a number or null`);
      }
      if (typeof entry.needs_confirmation !== "boolean") {
        errors.push(`${section}.${key}.needs_confirmation must be a boolean`);
      }
      if (!("source" in entry)) errors.push(`${section}.${key} needs a source field`);
      if (!("as_of" in entry)) errors.push(`${section}.${key} needs an as_of field`);
    }
  }
  return errors;
}

// Null-safe application: filled entries add to the buyer's cash out;
// null entries are listed as excluded ("미포함"), never guessed.
export function applyOwnershipCosts(table, country = "KR") {
  const block = country === "US" && table && table.us_extension
    ? table.us_extension
    : (table && table.buy_costs) || {};
  let oneOff = 0;
  let annual = 0;
  const included = [];
  const excluded = [];
  for (const [key, entry] of Object.entries(block)) {
    if (key === "note" || !entry || typeof entry !== "object") continue;
    const label = entry.label || key;
    if (Number.isFinite(entry.value) && entry.value >= 0) {
      if (entry.kind === "one_off") oneOff += entry.value;
      else if (entry.kind === "annual") annual += entry.value;
      else if (entry.kind === "monthly") annual += entry.value * 12;
      included.push({ key, label, value_won: entry.value, kind: entry.kind,
        source: entry.source ?? null, as_of: entry.as_of ?? null });
    } else {
      excluded.push({ key, label, note: "미포함" });
    }
  }
  return {
    country,
    one_off_won: Math.round(oneOff),
    annual_won: Math.round(annual),
    included,
    excluded,
  };
}

// --- the comparison -----------------------------------------------------------

function scenarioValue(priceWon, pctPerYear, year) {
  return priceWon * Math.pow(1 + pctPerYear / 100, year);
}

function opportunityCost(lockedWon, ratePct, year) {
  const r = Number(ratePct) || 0;
  if (!(r > 0) || !(lockedWon > 0)) return 0;
  return lockedWon * (Math.pow(1 + r / 100, year) - 1);
}

// opts: {
//   horizon_years: 5|10|20,
//   cash_won, loan_rate_pct, loan_years,
//   opportunity_rate_pct (가정값, default 0),
//   scenarios_pct: [-2,0,2] (customer-chosen),
//   buy: {price_won} | null,
//   jeonse: {deposit_won} | null,
//   wolse: {deposit_won, monthly_won} | null,
//   public: {deposit_won, monthly_won} | null,
//   ownership_costs: applyOwnershipCosts() result | null,
//   annual_income_won (for the DSR display; null skips it),
//   other_debt_service_annual_won (customer-stated, default 0),
// }
export function worthItComparison(opts = {}) {
  const horizon = Number(opts.horizon_years);
  if (!WORTHIT_HORIZONS.includes(horizon)) {
    throw new Error(`horizon_years wants one of ${WORTHIT_HORIZONS.join("/")} (got ${JSON.stringify(opts.horizon_years)})`);
  }
  const scenarios = Array.isArray(opts.scenarios_pct) && opts.scenarios_pct.length > 0
    ? opts.scenarios_pct.map(Number).filter(Number.isFinite)
    : [...WORTHIT_DEFAULT_SCENARIOS];
  if (scenarios.length === 0) throw new Error("scenarios_pct needs at least one finite number");
  const cash = won(opts.cash_won);
  const rate = Number(opts.loan_rate_pct);
  const years = Number(opts.loan_years);
  const oppRate = Number(opts.opportunity_rate_pct) || 0;
  const costs = opts.ownership_costs || { one_off_won: 0, annual_won: 0, included: [], excluded: [] };

  const tenures = {};

  // Buy: down payment from cash, amortised loan on the rest, ownership
  // costs on top. Equity (value minus remaining balance) per scenario.
  const buyPrice = won(opts.buy && opts.buy.price_won);
  if (buyPrice > 0) {
    const down = Math.min(cash, buyPrice);
    const loan = buyPrice - down;
    const sched = amortisationSchedule(loan, rate, years);
    const yearlyByScenario = {};
    for (const g of scenarios) yearlyByScenario[String(g)] = [];
    const band = [];
    let cumCash = down + won(costs.one_off_won);
    let cumInterest = 0;
    for (let y = 1; y <= horizon; y++) {
      const row = sched.yearly[y - 1] || { paid_won: 0, interest_won: 0, balance_won: 0 };
      // Past the loan term the payment stops; ownership costs continue.
      const paidThisYear = y <= sched.yearly.length ? row.paid_won : 0;
      const intThisYear = y <= sched.yearly.length ? row.interest_won : 0;
      const balance = y <= sched.yearly.length ? row.balance_won : 0;
      cumCash += paidThisYear + won(costs.annual_won);
      cumInterest += intThisYear;
      const nets = {};
      for (const g of scenarios) {
        const equity = Math.round(scenarioValue(buyPrice, g, y) - balance);
        const net = Math.round(cumCash - equity);
        nets[String(g)] = { equity_won: equity, net_won: net };
        yearlyByScenario[String(g)].push({ year: y, cash_out_won: cumCash,
          interest_cum_won: cumInterest, equity_won: equity, net_won: net });
      }
      const netVals = Object.values(nets).map((n) => n.net_won);
      band.push({ year: y, cash_out_won: cumCash, interest_cum_won: cumInterest,
        net_min_won: Math.min(...netVals), net_max_won: Math.max(...netVals) });
    }
    tenures["매매"] = {
      kind: "buy",
      price_won: buyPrice,
      down_won: down,
      loan_won: loan,
      locked_won: down,
      monthly_won: sched.monthly_won,
      total_interest_won: cumInterest,
      schedule: sched,
      yearly_by_scenario: yearlyByScenario,
      band,
      opportunity_cum_won: Math.round(opportunityCost(down, oppRate, horizon)),
      opportunity_rate_pct: oppRate,
      costs_applied: { one_off_won: won(costs.one_off_won), annual_won: won(costs.annual_won) },
      scenario_label: WORTHIT_SCENARIO_LABEL,
    };
  }

  // Rentals: deposit locked (assumed returned in full at the horizon —
  // stated, not modelled), monthly costs accumulate. 전세 shortfall accrues
  // interest-only at the same 가정값 rate as the 30-day view.
  const rental = (name, input, monthlyFn, loanFn) => {
    const deposit = won(input && input.deposit_won);
    const hasMonthly = input && Number.isFinite(Number(input.monthly_won));
    if (!(deposit > 0) && !hasMonthly) return;
    const monthly = won(input.monthly_won);
    const loan = loanFn ? won(loanFn(deposit)) : 0;
    const yearly = [];
    let cumCash = deposit;
    let cumInterest = 0;
    for (let y = 1; y <= horizon; y++) {
      const mCost = monthlyFn ? monthlyFn(monthly, loan, y) : { cash: monthly * 12, interest: 0 };
      cumCash += mCost.cash;
      cumInterest += mCost.interest;
      yearly.push({ year: y, cash_out_won: cumCash, interest_cum_won: cumInterest,
        net_won: Math.round(cumCash - deposit) });
    }
    tenures[name] = {
      kind: name === "전세" ? "jeonse" : "rent",
      deposit_won: deposit,
      monthly_won: monthly,
      loan_won: loan,
      locked_won: deposit,
      total_interest_won: cumInterest,
      yearly,
      opportunity_cum_won: Math.round(opportunityCost(deposit, oppRate, horizon)),
      opportunity_rate_pct: oppRate,
      deposit_note: "보증금은 기간 끝에 전액 돌려받는 것으로 둔다 (가정).",
    };
  };
  if (opts.jeonse) {
    rental("전세", opts.jeonse,
      (monthly, loan) => {
        const interest = loan > 0 && rate > 0 ? loan * (rate / 100) : 0;
        return { cash: Math.round(interest), interest: Math.round(interest) };
      },
      (deposit) => Math.max(0, deposit - cash));
  }
  if (opts.wolse) rental("월세", opts.wolse, (monthly) => ({ cash: monthly * 12, interest: 0 }), null);
  if (opts.public) rental("공공임대", opts.public, (monthly) => ({ cash: monthly * 12, interest: 0 }), null);

  // Break-even per scenario: first year buy net ≤ rental net.
  const breakeven = {};
  const buy = tenures["매매"];
  for (const name of ["전세", "월세", "공공임대"]) {
    const rent = tenures[name];
    if (!buy || !rent) continue;
    breakeven[name] = {};
    for (const g of scenarios) {
      const key = String(g);
      let found = null;
      for (let y = 1; y <= horizon; y++) {
        const bNet = buy.yearly_by_scenario[key][y - 1].net_won;
        const rNet = rent.yearly[y - 1].net_won;
        if (bNet <= rNet) {
          found = y;
          break;
        }
      }
      breakeven[name][key] = found;
    }
  }

  // DSR display: buyer's first-year service + stated other debts.
  let dsr = null;
  const income = Number(opts.annual_income_won);
  if (buy && income > 0) {
    const firstYear = buy.schedule.yearly[0];
    const service = (firstYear ? firstYear.paid_won : 0) + won(opts.other_debt_service_annual_won);
    dsr = {
      annual_service_won: service,
      annual_income_won: Math.round(income),
      ratio_pct: dsrRatio({ annualDebtServiceWon: service, annualIncomeWon: income }),
      note: LENDER_NOTE,
    };
  }

  return {
    horizon_years: horizon,
    scenarios_pct: scenarios,
    scenario_label: WORTHIT_SCENARIO_LABEL,
    cash_won: cash,
    loan_rate_pct: rate,
    loan_years: years,
    rate_stress: buy ? rateStress({ principalWon: buy.loan_won, baseRatePct: rate, years }) : null,
    tenures,
    breakeven,
    breakeven_none_label: NO_BREAKEVEN_KO,
    dsr,
    lender_note: LENDER_NOTE,
    ownership_excluded: costs.excluded || [],
    ownership_included: costs.included || [],
  };
}

export function breakevenLabel(yearOrNull) {
  return yearOrNull === null || yearOrNull === undefined ? NO_BREAKEVEN_KO : `${yearOrNull}년차`;
}
