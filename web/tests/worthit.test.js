import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { amortisedMonthly } from "../src/money/tenure.js";
import { amortisationSchedule, dsrRatio, rateStress, worthItComparison,
  breakevenLabel, validateOwnershipCosts, applyOwnershipCosts,
  WORTHIT_HORIZONS, WORTHIT_DEFAULT_SCENARIOS, LENDER_NOTE } from "../src/money/worthit.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

async function realCostsTable() {
  return JSON.parse(await readFile(join(REPO, "scenarios", "assumptions", "kr-ownership-costs.json"), "utf8"));
}

describe("amortisation schedule", () => {
  it("worked example: 12M at 0% for 1 year", () => {
    const s = amortisationSchedule(12000000, 0, 1);
    assert.equal(s.monthly_won, 1000000);
    assert.equal(s.yearly.length, 1);
    assert.deepEqual(s.yearly[0], { year: 1, paid_won: 12000000,
      interest_won: 0, principal_won: 12000000, balance_won: 0 });
    assert.equal(s.total_interest_won, 0);
  });

  it("worked example: 100M at 4% for 30 years", () => {
    const s = amortisationSchedule(100000000, 4, 30);
    assert.equal(s.monthly_won, amortisedMonthly(100000000, 4, 30));
    assert.equal(s.yearly.length, 30);
    const principalSum = s.yearly.reduce((a, r) => a + r.principal_won, 0);
    assert.ok(Math.abs(principalSum - 100000000) < 1000);
    assert.equal(s.yearly[29].balance_won, 0);
    assert.ok(Math.abs(s.total_paid_won - s.total_interest_won - 100000000) < 1000);
    assert.ok(s.yearly[0].interest_won > s.yearly[29].interest_won);
    assert.ok(s.yearly[0].balance_won > s.yearly[14].balance_won);
  });

  it("zero principal pays nothing", () => {
    const s = amortisationSchedule(0, 4, 30);
    assert.equal(s.monthly_won, 0);
    assert.equal(s.total_interest_won, 0);
  });
});

describe("dsr and rate stress", () => {
  it("dsr maths", () => {
    assert.equal(dsrRatio({ annualDebtServiceWon: 12000000, annualIncomeWon: 60000000 }), 20);
    assert.equal(dsrRatio({ annualDebtServiceWon: 0, annualIncomeWon: 60000000 }), 0);
    assert.equal(dsrRatio({ annualDebtServiceWon: 12000000, annualIncomeWon: 0 }), null);
    assert.equal(dsrRatio({ annualDebtServiceWon: 12000000, annualIncomeWon: null }), null);
  });

  it("rate stress rises with the bump", () => {
    const st = rateStress({ principalWon: 200000000, baseRatePct: 4, years: 30 });
    assert.deepEqual([st.plus_0pp.rate_pct, st.plus_1pp.rate_pct, st.plus_2pp.rate_pct], [4, 5, 6]);
    assert.ok(st.plus_0pp.monthly_won < st.plus_1pp.monthly_won);
    assert.ok(st.plus_1pp.monthly_won < st.plus_2pp.monthly_won);
    assert.equal(st.plus_0pp.monthly_won, amortisedMonthly(200000000, 4, 30));
  });
});

describe("worth-it worked examples", () => {
  // Cash buy 300M vs cash jeonse 200M: both nets are flat, so the
  // break-even is pure price-scenario arithmetic.
  function cashCase(scenarios) {
    return worthItComparison({
      horizon_years: 5, cash_won: 300000000,
      loan_rate_pct: 4, loan_years: 30, opportunity_rate_pct: 0,
      scenarios_pct: scenarios,
      buy: { price_won: 300000000 },
      jeonse: { deposit_won: 200000000 },
    });
  }

  it("flat prices: break-even in year 1", () => {
    const w = cashCase([0]);
    assert.equal(w.tenures["매매"].total_interest_won, 0);
    assert.equal(w.tenures["매매"].locked_won, 300000000);
    assert.equal(w.tenures["전세"].yearly[4].net_won, 0);
    assert.deepEqual(w.tenures["매매"].yearly_by_scenario["0"].map((r) => r.net_won),
      [0, 0, 0, 0, 0]);
    assert.equal(w.breakeven["전세"]["0"], 1);
  });

  it("falling prices: no break-even in the horizon", () => {
    const w = cashCase([-2]);
    assert.ok(w.tenures["매매"].yearly_by_scenario["-2"].every((r) => r.net_won > 0));
    assert.equal(w.breakeven["전세"]["-2"], null);
    assert.equal(breakevenLabel(null), "기간 안에 없음");
  });

  it("rising prices: break-even in year 1", () => {
    const w = cashCase([2]);
    assert.ok(w.tenures["매매"].yearly_by_scenario["2"].every((r) => r.net_won < 0));
    assert.equal(w.breakeven["전세"]["2"], 1);
    assert.equal(breakevenLabel(1), "1년차");
  });

  it("loan case ties to the amortised schedule", () => {
    const w = worthItComparison({
      horizon_years: 10, cash_won: 200000000,
      loan_rate_pct: 4, loan_years: 30, opportunity_rate_pct: 0,
      scenarios_pct: [0],
      buy: { price_won: 1000000000 },
      jeonse: { deposit_won: 500000000 },
      wolse: { deposit_won: 100000000, monthly_won: 2000000 },
    });
    const buy = w.tenures["매매"];
    assert.equal(buy.loan_won, 800000000);
    assert.equal(buy.monthly_won, amortisedMonthly(800000000, 4, 30));
    assert.ok(buy.total_interest_won > 0);
    assert.equal(buy.yearly_by_scenario["0"][9].equity_won,
      1000000000 - buy.schedule.yearly[9].balance_won);
    // 전세 shortfall accrues interest-only: (500M − 200M) × 4%.
    assert.equal(w.tenures["전세"].total_interest_won, 300000000 * 0.04 * 10);
    assert.equal(w.tenures["월세"].yearly[9].cash_out_won, 100000000 + 2000000 * 12 * 10);
    assert.equal(w.tenures["월세"].yearly[9].net_won, 2000000 * 12 * 10);
  });

  it("opportunity cost is compound on locked cash", () => {
    const w = worthItComparison({
      horizon_years: 10, cash_won: 300000000,
      loan_rate_pct: 4, loan_years: 30, opportunity_rate_pct: 5,
      scenarios_pct: [0],
      buy: { price_won: 300000000 },
      jeonse: { deposit_won: 200000000 },
    });
    // 200M × (1.05^10 − 1) = 125,778,925.355… → 125778925.
    assert.equal(w.tenures["전세"].opportunity_cum_won, 125778925);
    assert.equal(w.tenures["매매"].opportunity_cum_won,
      Math.round(300000000 * (Math.pow(1.05, 10) - 1)));
  });

  it("scenario band spans the scenario nets", () => {
    const w = cashCase([-2, 0, 2]);
    const buy = w.tenures["매매"];
    for (let y = 0; y < 5; y++) {
      const nets = [-2, 0, 2].map((g) => buy.yearly_by_scenario[String(g)][y].net_won);
      assert.equal(buy.band[y].net_min_won, Math.min(...nets));
      assert.equal(buy.band[y].net_max_won, Math.max(...nets));
    }
    assert.equal(w.scenario_label, "가정 시나리오, 전망 아님");
  });

  it("dsr travels with the lender note", () => {
    const w = worthItComparison({
      horizon_years: 5, cash_won: 200000000,
      loan_rate_pct: 4, loan_years: 30,
      scenarios_pct: [0],
      buy: { price_won: 1000000000 },
      annual_income_won: 110000000,
    });
    assert.ok(w.dsr.ratio_pct > 0);
    assert.equal(w.dsr.note, LENDER_NOTE);
    assert.equal(w.lender_note, LENDER_NOTE);
    assert.match(LENDER_NOTE, /금융기관/);
  });

  it("horizon is one of 5/10/20", () => {
    assert.deepEqual(WORTHIT_HORIZONS, [5, 10, 20]);
    assert.deepEqual(WORTHIT_DEFAULT_SCENARIOS, [-2, 0, 2]);
    assert.throws(() => worthItComparison({ horizon_years: 7, buy: { price_won: 1 } }),
      /horizon_years wants one of/);
  });
});

describe("ownership-cost table", () => {
  it("shipped table validates and stays null-safe", async () => {
    const table = await realCostsTable();
    assert.deepEqual(validateOwnershipCosts(table), []);
    const applied = applyOwnershipCosts(table, "KR");
    assert.equal(applied.one_off_won, 0);
    assert.equal(applied.annual_won, 0);
    assert.deepEqual(applied.included, []);
    assert.deepEqual(applied.excluded.map((e) => e.label),
      ["취득세", "중개수수료", "재산세(연)", "보유세(연)", "이사비"]);
    assert.ok(applied.excluded.every((e) => e.note === "미포함"));
  });

  it("provided rules add to the buyer cash-out", () => {
    const table = {
      locale: { country: "KR", currency: "KRW" },
      buy_costs: {
        acquisition_tax: { label: "취득세", kind: "one_off", value: 10000000,
          source: "t", as_of: "t", needs_confirmation: false },
        brokerage_fee: { label: "중개수수료", kind: "one_off", value: 2000000,
          source: "t", as_of: "t", needs_confirmation: false },
        property_tax_annual: { label: "재산세(연)", kind: "annual", value: 1000000,
          source: "t", as_of: "t", needs_confirmation: false },
        holding_tax_annual: { label: "보유세(연)", kind: "annual", value: null,
          source: null, as_of: null, needs_confirmation: true },
        moving_cost: { label: "이사비", kind: "one_off", value: null,
          source: null, as_of: null, needs_confirmation: true },
      },
    };
    assert.deepEqual(validateOwnershipCosts(table), []);
    const applied = applyOwnershipCosts(table, "KR");
    assert.equal(applied.one_off_won, 12000000);
    assert.equal(applied.annual_won, 1000000);
    assert.deepEqual(applied.excluded.map((e) => e.label), ["보유세(연)", "이사비"]);
    const w = worthItComparison({
      horizon_years: 5, cash_won: 400000000, loan_rate_pct: 4, loan_years: 30,
      scenarios_pct: [0], buy: { price_won: 300000000 },
      ownership_costs: applied,
    });
    assert.equal(w.tenures["매매"].band[4].cash_out_won, 300000000 + 12000000 + 1000000 * 5);
    assert.deepEqual(w.ownership_excluded.map((e) => e.label), ["보유세(연)", "이사비"]);
  });

  it("monthly-kind entries annualise", () => {
    const applied = applyOwnershipCosts({
      locale: { country: "KR", currency: "KRW" },
      buy_costs: {
        x: { label: "X", kind: "monthly", value: 100000,
          source: "t", as_of: "t", needs_confirmation: false },
      },
    }, "KR");
    assert.equal(applied.annual_won, 1200000);
  });

  it("us extension is schema-only with nulls", async () => {
    const table = await realCostsTable();
    const us = table.us_extension;
    assert.deepEqual(Object.keys(us).filter((k) => k !== "note").sort(),
      ["hoa_monthly", "homeowners_insurance_annual", "pmi_monthly", "property_tax_annual"]);
    assert.ok(Object.values(us).filter((v) => v && typeof v === "object")
      .every((e) => e.value === null && e.needs_confirmation === true));
    const applied = applyOwnershipCosts(table, "US");
    assert.equal(applied.one_off_won, 0);
    assert.equal(applied.annual_won, 0);
    assert.equal(applied.excluded.length, 4);
  });

  it("validation rejects bad shapes", () => {
    assert.ok(validateOwnershipCosts(null).length > 0);
    assert.ok(validateOwnershipCosts({ locale: {}, buy_costs: {} })
      .some((e) => e.includes("locale.country")));
    assert.ok(validateOwnershipCosts({ locale: { country: "KR", currency: "KRW" },
      buy_costs: { a: { label: "A", kind: "weekly", value: 1,
        source: "s", as_of: "a", needs_confirmation: false } } })
      .some((e) => e.includes("kind")));
    assert.ok(validateOwnershipCosts({ locale: { country: "KR", currency: "KRW" },
      buy_costs: { a: { label: "A", kind: "annual", value: "많이",
        source: "s", as_of: "a", needs_confirmation: false } } })
      .some((e) => e.includes("value")));
    assert.ok(validateOwnershipCosts({ locale: { country: "KR", currency: "KRW" },
      buy_costs: { a: { label: "A", kind: "annual", value: null } } })
      .some((e) => e.includes("needs_confirmation")));
  });
});
