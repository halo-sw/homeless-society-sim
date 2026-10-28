// Net-pay estimation from gross salary (pure).
//
// Uses the replaceable rule table scenarios/assumptions/kr-payroll.json
// (social insurance rates + a simplified income-tax table). Every rate
// carries as_of/source; uncertain rates carry needs_confirmation. The UI
// shows "추정 실수령액" with the breakdown and lets the customer type the
// real monthly net instead — the override always wins. Income is never
// stored server-side (browser memory only, like the scenario).

export function estimateNetPay(annualGrossWon, table) {
  const annual = Number(annualGrossWon);
  if (!Number.isFinite(annual) || annual < 0) {
    throw new Error("payroll: annual salary must be >= 0");
  }
  if (!table || typeof table !== "object") throw new Error("payroll: rule table is required");
  const si = table.social_insurance || {};
  const monthlyGross = Math.floor(annual / 12);
  const pct = (entry) => {
    const v = entry && typeof entry === "object" ? entry.value : entry;
    return Number(v) || 0;
  };
  const pension = Math.floor(monthlyGross * pct(si.pension_employee_pct) / 100);
  const health = Math.floor(monthlyGross * pct(si.health_employee_pct) / 100);
  const longterm = Math.floor(health * pct(si.longterm_care_pct_of_health) / 100);
  const employment = Math.floor(monthlyGross * pct(si.employment_employee_pct) / 100);
  const social = pension + health + longterm + employment;

  const taxCfg = table.income_tax || {};
  const relief = Number(taxCfg.standard_relief_won_month) || 0;
  const taxable = Math.max(0, monthlyGross - social - relief);
  let incomeTax = 0;
  let prevUpTo = 0;
  for (const b of taxCfg.brackets || []) {
    const rate = Number(b.rate_pct) || 0;
    const upTo = b.up_to === null || b.up_to === undefined ? Infinity : Number(b.up_to);
    const band = Math.max(0, Math.min(taxable, upTo) - prevUpTo);
    incomeTax += band * rate / 100;
    prevUpTo = upTo;
    if (taxable <= upTo) break;
  }
  incomeTax = Math.floor(incomeTax);
  const localEntry = table.local_income_tax_pct_of_income_tax;
  const localPct = localEntry && typeof localEntry === "object" ? Number(localEntry.value) || 0 : Number(localEntry) || 0;
  const localTax = Math.floor(incomeTax * localPct / 100);

  const deductions = { pension, health, longterm_care: longterm, employment, income_tax: incomeTax, local_tax: localTax };
  const total = pension + health + longterm + employment + incomeTax + localTax;
  const monthlyNet = monthlyGross - total;
  return {
    annual_gross_won: Math.round(annual),
    monthly_gross_won: monthlyGross,
    deductions,
    total_deductions_won: total,
    monthly_net_won: monthlyNet,
    estimated: true,
    source: "payroll_estimate",
    table_as_of: table.as_of || null,
    table_source: table.source || null,
    note: "추정 실수령액: 단순화된 요율표 기준. 실제 급여명세서 값을 입력하면 그 값을 씁니다.",
  };
}

// Resolve one member's monthly net: explicit monthly_net_won wins (the
// customer's real number), else the table estimate from annual salary.
export function memberMonthlyNet(memberMoney, table) {
  const m = memberMoney || {};
  if (Number.isFinite(Number(m.monthly_net_won)) && Number(m.monthly_net_won) > 0) {
    return {
      monthly_net_won: Math.round(Number(m.monthly_net_won)),
      estimated: false,
      source: "user_input",
      note: "고객 입력 실수령액",
    };
  }
  if (Number.isFinite(Number(m.annual_salary_won)) && Number(m.annual_salary_won) > 0) {
    return estimateNetPay(Number(m.annual_salary_won), table);
  }
  return { monthly_net_won: 0, estimated: false, source: "none", note: "소득 미입력" };
}

export function householdMonthlyNet(money, members, table) {
  const perMember = {};
  let total = 0;
  for (const mem of members || []) {
    const id = mem.id || mem.label;
    const r = memberMonthlyNet((money && money.members && money.members[id]) || {}, table);
    perMember[id] = { ...r, label: mem.label || id };
    total += r.monthly_net_won || 0;
  }
  return { per_member: perMember, household_monthly_net_won: total };
}
