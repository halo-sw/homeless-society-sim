// Stage 13e2-4: intake starts empty — the newlywed example
// (?example=newlywed-couple, no salary said) prefills no salary, and
// the step cards carry no invented amounts.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extract_profile } from "../src/profile.js";
import { intakeState0, intakeToProfilePatch, prefillFromExtract } from "../src/intake.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// ?example=newlywed-couple first message (ui/landing.jsx EXAMPLE_PROMPTS).
const NEWLYWED_FIRST = "맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상";

describe("13e2 intake starts empty", () => {
  it("newlywed example prefills no salary value", () => {
    const ex = extract_profile(NEWLYWED_FIRST, null, { stations: ["강남"] });
    const st = prefillFromExtract(intakeState0(), ex);
    // The extract works (budget prefilled) but says no salary.
    assert.equal(st.values.budget.tenure, "jeonse");
    assert.equal(st.values.budget.depositMax, 400000000);
    assert.ok(!("income" in st.values), "no income step value");
    assert.ok(!st.said.income, "no said badge");
    const patch = intakeToProfilePatch(st, null);
    assert.ok(!("salaryAnnual" in patch), "no salaryAnnual patch");
    assert.ok(!("takehomeMonthly" in patch), "no takehomeMonthly patch");
  });

  it("a stated salary still prefills", () => {
    const ex = extract_profile(
      "판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하",
      null, { stations: ["판교"] });
    const st = prefillFromExtract(intakeState0(), ex);
    assert.equal(st.values.income.kind, "annual");
    assert.ok([st.values.income.amount].flat().includes(40000000));
    assert.equal(st.said.income, true);
  });

  it("step cards invent no amounts in source", () => {
    const src = readFileSync(join(HERE, "..", "src", "ui", "intake.jsx"), "utf8");
    for (const invented of ["amount: 40000000", "?? 1500000",
      "?? 300000000", "?? 1000000", "?? 600000000", "maxMin: 40, mode"]) {
      assert.ok(!src.includes(invented), `no invented default: ${invented}`);
    }
    assert.ok(src.includes("예: 4,000만 원"), "income placeholder");
    assert.ok(src.includes("4,000만"), "income quick chip");
  });
});
