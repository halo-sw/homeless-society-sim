import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkOutput, forbiddenTopic, inventedNumber, optionNumbers, ruleReason, truncateReason } from "../src/judge/guards.js";

const SHOP = {
  kind: "shop_choice",
  default_key: "s0",
  options: [
    { key: "s0", label: "슈퍼1", minutes: 3.2, distance_m: 251 },
    { key: "s1", label: "슈퍼2", minutes: 5.1, distance_m: 402.5 },
  ],
};

const WEEKEND = {
  kind: "weekend_plan",
  default_key: "park",
  options: [
    { key: "park", label: "공원", minutes: 4.4, distance_m: 345 },
    { key: "supermarket", label: "슈퍼1", minutes: 3.2, distance_m: 251 },
    { key: "home", label: "집에서 휴식", minutes: 0, distance_m: 0 },
  ],
};

describe("judge guards", () => {
  it("accepts clean single and weekend replies", () => {
    const single = checkOutput(SHOP, {
      chosen_key: "s1", reason_ko: "슈퍼2가 5.1분 거리로 적당하다", reason_en: "Super2 at 5.1 min is fine",
    });
    assert.equal(single.ok, true);
    assert.equal(single.chosen_key, "s1");
    const wk = checkOutput(WEEKEND, {
      plan: ["park", "supermarket"], reason_ko: "공원 산책 후 장보기", reason_en: "Park then shopping",
    });
    assert.equal(wk.ok, true);
    assert.equal(wk.chosen_key, "park+supermarket");
    assert.deepEqual(wk.plan, ["park", "supermarket"]);
    const home = checkOutput(WEEKEND, { plan: ["home"], reason_ko: "휴식", reason_en: "Rest" });
    assert.equal(home.ok, true);
    assert.equal(home.chosen_key, "home");
    assert.deepEqual(home.plan, []);
  });

  it("rejects unknown keys and malformed plans", () => {
    assert.equal(checkOutput(SHOP, { chosen_key: "s9", reason_ko: "r", reason_en: "r" }).cause, "bad_key");
    assert.equal(checkOutput(SHOP, { reason_ko: "r", reason_en: "r" }).cause, "bad_key");
    assert.equal(checkOutput(WEEKEND, { plan: ["park", "없는곳"], reason_ko: "r", reason_en: "r" }).cause, "bad_key");
    assert.equal(checkOutput(WEEKEND, { plan: ["park", "supermarket", "home"], reason_ko: "r", reason_en: "r" }).cause, "bad_key");
    assert.equal(checkOutput(WEEKEND, { plan: ["park", "park"], reason_ko: "r", reason_en: "r" }).cause, "bad_key");
    assert.equal(checkOutput(WEEKEND, { plan: ["park", "supermarket", "clinic", "home"], reason_ko: "r", reason_en: "r" }).cause, "bad_key");
    assert.equal(checkOutput(SHOP, null).cause, "bad_json");
    assert.equal(checkOutput(SHOP, { chosen_key: "s0", reason_ko: "r" }).cause, "bad_json");
  });

  it("rejects numbers that do not appear in the options", () => {
    // Allowed: option minutes, distances, label digits (슈퍼1 → 1).
    assert.equal(checkOutput(SHOP, {
      chosen_key: "s0", reason_ko: "슈퍼1이 3.2분 251m로 가장 가깝다", reason_en: "Super1 is nearest at 3.2 min",
    }).ok, true);
    const badKo = checkOutput(SHOP, {
      chosen_key: "s0", reason_ko: "3.3분 거리라 가깝다", reason_en: "Nearest",
    });
    assert.equal(badKo.cause, "invented_number");
    const badEn = checkOutput(SHOP, {
      chosen_key: "s0", reason_ko: "가깝다", reason_en: "Only 7 minutes away",
    });
    assert.equal(badEn.cause, "invented_number");
    assert.equal(inventedNumber("251m", "", SHOP.options), null);
    assert.equal(inventedNumber("250m", "", SHOP.options), "250");
  });

  it("rejects forbidden topics in either language", () => {
    const cases = [
      ["가격이 저렴해서 선택", "Cheap", "price/ko"],
      ["가까워서 선택", "Good price here", "price/en"],
      ["안전한 길이라 선택", "Fine", "safety/ko"],
      ["선택", "A safe neighbourhood", "safety/en"],
      ["범죄가 없어서", "Fine", "crime/ko"],
      ["선택", "No crime here", "crime/en"],
      ["학군이 좋아서", "Fine", "school/ko"],
      ["선택", "Good school nearby", "school/en"],
      ["건강을 위해 산책", "Fine", "health/ko"],
      ["선택", "Healthy walk", "health/en"],
    ];
    for (const [ko, en, what] of cases) {
      const r = checkOutput(SHOP, { chosen_key: "s0", reason_ko: ko, reason_en: en });
      assert.equal(r.cause, "forbidden_topic", what);
    }
    // Place vocabulary is fine: clinic/school names are POI labels.
    assert.equal(forbiddenTopic("가까운 약국 선택", "Nearest pharmacy"), null);
    assert.equal(forbiddenTopic("학교 앞 슈퍼 선택", "Shop by the school"), null);
    assert.equal(forbiddenTopic("공원 산책 후 장보기", "Park then shopping"), null);
  });

  it("truncates reasons to the schema limits before checking", () => {
    assert.equal(truncateReason("가".repeat(100), 60).length, 60);
    assert.equal(truncateReason("short", 60), "short");
    const r = checkOutput(SHOP, {
      chosen_key: "s0", reason_ko: "가".repeat(100), reason_en: "e".repeat(100),
    });
    assert.equal(r.ok, true);
    assert.equal(r.reason_ko.length, 60);
    assert.equal(r.reason_en.length, 90);
    for (const reason of Object.values(ruleReason(SHOP))) assert.ok(reason.length <= 90);
    assert.ok(ruleReason(SHOP).reason_ko.length <= 60);
    assert.ok(ruleReason({ kind: "weekend_plan", default_key: "park" }).reason_ko.length <= 60);
    assert.ok(ruleReason({ kind: "park_or_home", default_key: "home" }).reason_ko.includes("집"));
  });

  it("collects the citable numbers from options", () => {
    const nums = optionNumbers(SHOP.options);
    assert.ok(nums.has(3.2) && nums.has(251) && nums.has(402.5));
    assert.ok(nums.has(1) && nums.has(2)); // label digits 슈퍼1/슈퍼2
  });
});
