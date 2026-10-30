import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extract_profile, parseEnglishMoney } from "../src/profile.js";

const STATIONS = ["강남", "잠실", "판교", "선릉", "역삼", "정자"];

function assertVerbatim(text, r) {
  for (const [key, f] of Object.entries(r.profile)) {
    if (!f || typeof f !== "object" || f.value === null) continue;
    // Engine defaults (e.g. currency KRW) are labelled constants,
    // not customer claims — they need no verbatim evidence.
    if (f.source === "default") continue;
    if ((key === "mustHaves" || key === "home_kinds")
      && Array.isArray(f.value) && f.value.length === 0) continue;
    const parts = f.evidence.includes("·") ? f.evidence.split("·") : [f.evidence];
    for (const part of parts) {
      assert.ok(part && text.includes(part),
        `${key} evidence ${JSON.stringify(f.evidence)} not in the text`);
    }
  }
}

describe("profile english 24b", () => {
  it("reads the Gangnam landing sentence", () => {
    const text = "I commute to Gangnam Station. I live alone, jeonse up to 300M won, an officetel near the station would be nice.";
    const r = extract_profile(text, null, { stations: STATIONS });
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.profile.workplaces.value[0].resolved, { station: "강남" });
    assert.deepEqual(r.profile.members.value, [{ role: "adult" }]);
    assert.equal(r.profile.tenure.value, "jeonse");
    assert.equal(r.profile.depositMax.value, 300000000);
    assert.deepEqual(r.profile.home_kinds.value, ["오피스텔"]);
    assertVerbatim(text, r);
  });

  it("reads the Pangyo family sentence", () => {
    const text = "We're a married couple with a kid in elementary school, I work in Pangyo, budget jeonse 450 million, apartment, commute within 40 minutes";
    const r = extract_profile(text, null, { stations: STATIONS });
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.profile.members.value,
      [{ role: "adult" }, { role: "adult" }, { role: "child" }]);
    assert.deepEqual(r.profile.workplaces.value[0].resolved, { station: "판교" });
    assert.equal(r.profile.depositMax.value, 450000000);
    assert.deepEqual(r.profile.home_kinds.value, ["아파트"]);
    assert.equal(r.profile.commuteMax.value, 40);
    assertVerbatim(text, r);
  });

  it("reads monthly rent near Seolleung via the near-station rule", () => {
    const text = "monthly rent, deposit 10M and 800K per month, studio near Seolleung station for work";
    const r = extract_profile(text, null, { stations: STATIONS });
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.equal(r.profile.tenure.value, "wolse");
    assert.equal(r.profile.monthlyMax.value, 800000);
    assert.deepEqual(r.profile.home_kinds.value, ["원룸"]);
    assert.deepEqual(r.profile.workplaces.value[0].resolved, { station: "선릉" });
    assertVerbatim(text, r);
  });

  it("parseEnglishMoney handles marked amounts, rejects bare numbers", () => {
    assert.equal(parseEnglishMoney("₩1.2B"), 1200000000);
    assert.equal(parseEnglishMoney("KRW 300M"), 300000000);
    assert.equal(parseEnglishMoney("40,000,000 won"), 40000000);
    assert.equal(parseEnglishMoney("300"), null);
  });
});
