import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { estimateNetPay, memberMonthlyNet, householdMonthlyNet } from "../src/money/payroll.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

async function realTable() {
  return JSON.parse(await readFile(join(REPO, "scenarios", "assumptions", "kr-payroll.json"), "utf8"));
}

describe("payroll", () => {
  it("estimates net pay with a full breakdown (real table)", async () => {
    const table = await realTable();
    assert.ok(table.as_of);
    assert.ok(table.source);
    const r = estimateNetPay(60000000, table);
    assert.equal(r.monthly_gross_won, 5000000);
    assert.equal(r.deductions.pension, 225000); // 500만 × 4.5%
    assert.equal(r.deductions.health, 177250); // 500만 × 3.545%
    assert.equal(r.deductions.employment, 45000); // 500만 × 0.9%
    assert.equal(r.deductions.longterm_care, Math.floor(177250 * 12.95 / 100));
    assert.equal(r.total_deductions_won,
      r.deductions.pension + r.deductions.health + r.deductions.longterm_care
      + r.deductions.employment + r.deductions.income_tax + r.deductions.local_tax);
    assert.equal(r.monthly_net_won, r.monthly_gross_won - r.total_deductions_won);
    assert.equal(r.estimated, true);
    assert.equal(r.source, "payroll_estimate");
  });

  it("marks every rate with as_of/source and confirmation flags", async () => {
    const table = await realTable();
    for (const entry of Object.values(table.social_insurance)) {
      assert.equal(typeof entry.value, "number");
      assert.equal(typeof entry.needs_confirmation, "boolean");
    }
    assert.equal(table.income_tax.needs_confirmation, true);
    assert.equal(table.local_income_tax_pct_of_income_tax.needs_confirmation, true);
  });

  it("lets the typed real net override the estimate", async () => {
    const table = await realTable();
    const typed = memberMonthlyNet({ annual_salary_won: 60000000, monthly_net_won: 4100000 }, table);
    assert.equal(typed.monthly_net_won, 4100000);
    assert.equal(typed.estimated, false);
    assert.equal(typed.source, "user_input");
    const est = memberMonthlyNet({ annual_salary_won: 60000000 }, table);
    assert.equal(est.estimated, true);
    const none = memberMonthlyNet({}, table);
    assert.equal(none.monthly_net_won, 0);
  });

  it("sums the household and rejects bad input", async () => {
    const table = await realTable();
    const net = householdMonthlyNet(
      { members: { m1: { monthly_net_won: 3000000 }, m2: { monthly_net_won: 2500000 } } },
      [{ id: "m1", label: "구성원 1" }, { id: "m2", label: "구성원 2" }], table);
    assert.equal(net.household_monthly_net_won, 5500000);
    assert.throws(() => estimateNetPay(-1, table), /salary/);
    assert.throws(() => estimateNetPay(100, null), /rule table/);
  });
});
