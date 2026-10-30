// Stage 29a3: intake cards don't ask twice — spouse pre-filled, one
// commute ceiling, number fields with quick chips.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { extract_profile, missingQuestions } from "../src/profile.js";
import {
  intakeState0, prefillFromExtract, householdFromExtract, household0,
  addMember, intakeToProfilePatch,
} from "../src/intake.js";

let React;
let renderToString;
let IntakeCard;
let HouseholdCard;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ IntakeCard, HouseholdCard } = await import("../src/ui/intake.jsx"));
});

describe("29a3 spouse pre-filled", () => {
  it("couple sentence starts with one 배우자 member, age null", () => {
    const ex = extract_profile("맞벌이 예비부부, 강남 출근", null, { stations: ["강남"] });
    assert.equal(ex.profile.members.value.length, 2);
    const hh = householdFromExtract(ex);
    assert.equal(hh.members.length, 1);
    assert.equal(hh.members[0].relation, "배우자");
    assert.equal(hh.members[0].ageBand, null);
    const st = prefillFromExtract(intakeState0(), ex);
    assert.equal(st.household.members.length, 1);
    assert.equal(st.household.members[0].relation, "배우자");
    assert.equal(st.household.members[0].ageBand, null);
  });

  it("addMember keeps ageBand null instead of inventing 20대", () => {
    const r = addMember(household0(), { relation: "배우자", ageBand: null });
    assert.equal(r.ok, true);
    assert.equal(r.household.members[0].ageBand, null);
  });
});

describe("29a3 one commute ceiling", () => {
  it("member cap settles the patch and clears the missing list", () => {
    const hh = addMember(household0(),
      { relation: "배우자", ageBand: null, commuteMax: 45 }).household;
    const patch = intakeToProfilePatch({ values: {} }, hh);
    assert.equal(patch.commuteMax, 45);
    const both = intakeToProfilePatch(
      { values: { commute: { maxMin: 30, mode: "transit" } } }, hh);
    assert.equal(both.commuteMax, 30);
    const missing = missingQuestions({ commuteMax: { value: 45, source: "customer" } });
    assert.ok(!missing.some((q) => q.field === "commuteMax"), "출퇴근 상한? not unknown");
    const memberOnly = missingQuestions({
      commuteMax: { value: null },
      members: { value: [{ role: "member", commuteMax: 45 }] },
    });
    assert.ok(!memberOnly.some((q) => q.field === "commuteMax"), "member cap settles it");
  });
});

describe("29a3 household card", () => {
  it("renders the said spouse with 나이 미정, labeled chips, no zero pay", () => {
    const hh = { members: [{ relation: "배우자", ageBand: null,
      workplace: { known: false }, incomeMonthly: null, commuteMax: null, _said: true }] };
    const html = renderToString(React.createElement(HouseholdCard,
      { household: hh, stations: ["강남"], onAdd() {}, onRemove() {} }));
    assert.ok(html.includes("나이 미정"), "null age renders 나이 미정");
    assert.ok(html.includes("관계"), "relation row labeled");
    assert.ok(html.includes("나이"), "age row labeled");
    assert.ok(html.includes("aria-pressed"), "chip pressed state named");
    assert.ok(html.includes("모름"), "empty pay shows 모름");
    assert.ok(!html.includes("월 0만") && !html.includes(">0만<"), "unknown pay never shows 0");
  });
});

describe("29a3 income card", () => {
  it("uses a numeric field with quick chips and a primary 다음", () => {
    const html = renderToString(React.createElement(IntakeCard,
      { step: "income", index: 0, total: 6, value: null, said: false,
        onAnswer() {}, onSkip() {} }));
    assert.ok(html.includes("<input") && /inputmode="numeric"/i.test(html), "numeric input");
    assert.ok(html.includes("4,000만"), "income quick chip");
    const iNext = html.indexOf(">다음<");
    assert.ok(iNext > 0, "다음 rendered");
    const open = html.lastIndexOf("<button", iNext);
    assert.ok(html.slice(open, iNext).includes('data-variant="primary"'), "다음 is primary");
  });
});
