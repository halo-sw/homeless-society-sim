import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tenureCost, amortisedMonthly, TENURE_DISCLAIMER, TRADE_TAX_NOTE } from "../src/money/tenure.js";

describe("tenure costs (worked examples)", () => {
  it("wolse: deposit from cash, monthly rent only", () => {
    const r = tenureCost({ tenure: "월세", deposit_won: 400000000, monthly_rent_won: 2000000,
      cash_won: 500000000, loan_rate_pct: 4, loan_years: 30 });
    assert.equal(r.monthly_won, 2000000);
    assert.equal(r.upfront_won, 400000000);
    assert.equal(r.loan_won, 0);
    assert.equal(r.cash_shortfall_won, 0);
    assert.ok(r.disclaimers.includes(TENURE_DISCLAIMER));
  });

  it("jeonse: interest on the shortfall only", () => {
    const r = tenureCost({ tenure: "전세", price_won: 980000000, cash_won: 200000000,
      loan_rate_pct: 4.0, loan_years: 30 });
    assert.equal(r.loan_won, 780000000);
    assert.equal(r.monthly_won, 2600000); // 7.8억 × 4% / 12
    // No shortfall: no monthly cost.
    const full = tenureCost({ tenure: "전세", price_won: 980000000, cash_won: 1000000000,
      loan_rate_pct: 4.0, loan_years: 30 });
    assert.equal(full.monthly_won, 0);
    assert.equal(full.loan_won, 0);
  });

  it("trade: amortised payment + tax note", () => {
    const m = amortisedMonthly(2150000000, 4.0, 30);
    assert.equal(m, 10264429); // standard PMT, ceil
    assert.equal(amortisedMonthly(12000000, 0, 1), 1000000); // zero rate: straight split
    assert.equal(amortisedMonthly(0, 4, 30), 0);
    const r = tenureCost({ tenure: "매매", price_won: 2650000000, cash_won: 500000000,
      loan_rate_pct: 4.0, loan_years: 30 });
    assert.equal(r.monthly_won, 10264429);
    assert.equal(r.loan_won, 2150000000);
    assert.ok(r.disclaimers.includes(TRADE_TAX_NOTE));
  });

  it("public rental: API deposit + monthly as-is", () => {
    const r = tenureCost({ tenure: "공공임대", deposit_won: 89000000, monthly_rent_won: 350000,
      cash_won: 100000000, loan_rate_pct: 4, loan_years: 30, source: "housing_api" });
    assert.equal(r.monthly_won, 350000);
    assert.equal(r.upfront_won, 89000000);
    assert.equal(r.source, "housing_api");
  });

  it("rejects unknown tenures", () => {
    assert.throws(() => tenureCost({ tenure: "lease" }), /unknown/);
  });
});
