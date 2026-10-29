import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INTAKE_STEPS, INTAKE_KO, SAID_VALUE_BADGE, INTAKE_AREAS,
  intakeState0, currentStep, prefillFromExtract, answerStep, skipStep,
  skippedChips, HOUSEHOLD_MAX, addMember, removeMember,
  intakeToProfilePatch, household0,
} from "../src/intake.js";

describe("intake order", () => {
  it("runs the six steps in the briefed order", () => {
    assert.deepEqual(INTAKE_STEPS,
      ["income", "current", "areas", "living", "commute", "budget"]);
    for (const s of INTAKE_STEPS) assert.ok(INTAKE_KO[s]);
  });
  it("advances on answer and finishes when all are answered or skipped", () => {
    let st = intakeState0();
    assert.equal(currentStep(st), "income");
    st = answerStep(st, "income", { kind: "annual", amount: 40000000 });
    assert.equal(currentStep(st), "current");
    for (const s of ["current", "areas", "living", "commute"]) {
      st = skipStep(st, s);
    }
    assert.equal(st.done, false);
    st = answerStep(st, "budget", { tenure: "jeonse", unknown: true });
    assert.equal(st.done, true);
    assert.equal(currentStep(st), null);
  });
  it("skips with 나중에 and keeps skipped essentials as chips", () => {
    let st = intakeState0();
    st = skipStep(st, "income");
    st = answerStep(st, "current", "성남 분당");
    const chips = skippedChips(st);
    assert.equal(chips.length, 1);
    assert.equal(chips[0].step, "income");
    assert.match(chips[0].label, /연봉/);
  });
  it("pre-fills values from the first message and marks the source", () => {
    const st0 = intakeState0();
    const extract = { profile: {
      salaryAnnual: { value: 40000000, source: "customer" },
      commuteMax: { value: 40, source: "customer" },
      tenure: { value: "jeonse", source: "customer" },
      depositMax: { value: 200000000, source: "customer" },
    } };
    const st = prefillFromExtract(st0, extract);
    assert.deepEqual(st.values.income, { kind: "annual", amount: 40000000 });
    assert.equal(st.said.income, true);
    assert.equal(st.said.commute, true);
    assert.equal(st.said.budget, true);
    assert.equal(st.said.current, undefined);
    assert.equal(SAID_VALUE_BADGE, "내가 말한 값");
  });
  it("covers the 11 areas plus anywhere", () => {
    assert.equal(INTAKE_AREAS.length, 11);
  });
});

describe("household", () => {
  it("adds up to 4 members and refuses the 5th with a message", () => {
    let hh = household0();
    for (let i = 0; i < HOUSEHOLD_MAX; i++) {
      const r = addMember(hh, { relation: "동거인" });
      assert.equal(r.ok, true);
      hh = r.household;
    }
    assert.equal(hh.members.length, 4);
    const r5 = addMember(hh, { relation: "동거인" });
    assert.equal(r5.ok, false);
    assert.match(r5.error, /4명/);
    assert.equal(r5.household.members.length, 4);
  });
  it("removes members and folds intake into a profile patch", () => {
    let hh = household0();
    hh = addMember(hh, { relation: "배우자", ageBand: "30대",
      workplace: { known: true, station: "강남" }, commuteMax: 45 }).household;
    hh = removeMember(hh, 0);
    assert.equal(hh.members.length, 0);
    const patch = intakeToProfilePatch(
      { values: { income: { kind: "annual", amount: 1 },
        commute: { maxMin: 30, mode: "transit" } } },
      addMember(household0(), { relation: "배우자" }).household);
    assert.equal(patch.salaryAnnual, 1);
    assert.equal(patch.commuteMax, 30);
    assert.equal(patch.members.length, 2);
    assert.equal(patch.members[1].relation, "배우자");
  });
});
