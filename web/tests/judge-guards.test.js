import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_CAUSES, checkOutput, contextNumbers, findInventedNumbers, forbiddenTopic, inventedNumber, optionNumbers, ruleReason, truncateReason } from "../src/judge/guards.js";

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
    assert.equal(inventedNumber("240m", "", SHOP.options), "240");
  });

  it("accepts normal roundings of option numbers (live-reject styles)", () => {
    // B station_route shell: 16.3 min / 1272.02 m both exits.
    const station = {
      kind: "station_route", default_key: "s0", day: 0, minute: 501,
      options: [
        { key: "s0", label: "판교", minutes: 16.3, distance_m: 1272.02 },
        { key: "s1", label: "판교", minutes: 16.3, distance_m: 1273.58 },
      ],
    };
    const ctx = {
      member: { role: "adult", preferences: "" }, agentLabel: "구성원 1",
      date: "2026-11-02", minute: 501, tripsToday: [], memory: [],
    };
    for (const [ko, en] of [
      ["16분 거리라 선택", "16 min walk"], // integer-rounded minutes
      ["1.3km라 조금 멀지만 선택", "1.3 km but fine"], // km, 1 decimal
      ["1.27km 거리 출구 선택", "Exit at 1.27 km"], // km, 2 decimals
      ["1270m 거리라 선택", "1270 m away"], // metres to 10 m
      ["16.3분 거리라 선택", "16.3 min walk"], // exact, as before
    ]) {
      const r = checkOutput(station, { chosen_key: "s0", reason_ko: ko, reason_en: en }, ctx);
      assert.equal(r.ok, true, `${ko} / ${en}: ${r.cause || ""} ${r.detail || ""}`);
    }
    // Still strict: nearby but unrounded numbers fail.
    for (const [ko, en] of [
      ["15분 거리라 선택", "15 min walk"], // 16.3 rounds to 16, not 15
      ["5km 거리라 선택", "5 km away"], // 1.27 km only
      ["900m 거리라 선택", "900 m away"], // 1272 m rounds to 1270 m
    ]) {
      const r = checkOutput(station, { chosen_key: "s0", reason_ko: ko, reason_en: en }, ctx);
      assert.equal(r.cause, "invented_number", `${ko} / ${en}`);
    }
  });

  it("rejects the home option's 0 even at :00 on day 0 with 0s in memory", () => {
    const shell = {
      kind: "park_or_home", default_key: "home", day: 0, minute: 600,
      options: [
        { key: "park", label: "공원", minutes: 11.2, distance_m: 871.26 },
        { key: "home", label: "집", minutes: 0, distance_m: 0 },
      ],
    };
    const ctx = {
      member: { role: "adult", preferences: "아침에 일찍 일어나 산책하기를 좋아한다." },
      agentLabel: "구성원 1", date: "2026-11-02", minute: 600, tripsToday: [],
      memory: [{ day: 0, minute: 450, kind: "station_route", chosen: "s0", reason_ko: "0분 0m 집에서 쉬며 마무리" }],
    };
    // The real accepted-style strings from the live run must now fail:
    // the home option sends no minutes, the 10:00 clock and day 0 do
    // not license a bare 0, and remembered reason text is not citable.
    for (const [ko, en] of [
      ["귀가 후 0분 거리 집에서 휴식하기", "Rest at home with 0 min walk after returning"],
      ["0분 0m 집에서 쉬며 마무리", "Stay home with 0 min 0 m to rest"],
      ["0m 거리 집에서 편안한 저녁 보내기", "Stay at home with 0 m"],
    ]) {
      const r = checkOutput(shell, { chosen_key: "home", reason_ko: ko, reason_en: en }, ctx);
      assert.equal(r.cause, "invented_number", ko);
      assert.deepEqual(r.offending, ["0"]);
    }
    // The park leg's own numbers still cite fine.
    assert.equal(checkOutput(shell, {
      chosen_key: "park", reason_ko: "11분 거리 공원 산책", reason_en: "Park walk 0.9 km away",
    }, ctx).ok, true);
  });

  it("cites clock times, day numbers and profile numbers — but not trip legs", () => {
    const shell = {
      kind: "shop_choice", default_key: "s0", day: 5, minute: 1164,
      options: [
        { key: "s0", label: "마트", minutes: 11.5, distance_m: 894.09 },
        { key: "s1", label: "시장", minutes: 13.1, distance_m: 1022.08 },
      ],
    };
    const ctx = {
      member: { role: "adult", preferences: "주 3회 운동하고 장보기는 한 번에 끝낸다." },
      agentLabel: "구성원", date: "2026-11-07", minute: 1164,
      tripsToday: [{ depart_min: 450, arrive_min: 460, purpose: "commute",
        from_label: "집", to_label: "중앙역", minutes: 1.3, distance_m: 100 }],
      memory: [{ day: 4, minute: 1140, kind: "shop_choice", chosen: "s0", reason_ko: "9분 거리라 선택" }],
    };
    const allowed = contextNumbers({ ...ctx, shell });
    assert.ok(allowed.has(19) && allowed.has(24), "branch 19:24 + trip/memory times");
    assert.ok(allowed.has(7) && allowed.has(30), "trip 07:30 clock");
    assert.ok(allowed.has(5) && allowed.has(4), "day numbers");
    assert.ok(allowed.has(3), "profile verbatim");
    assert.ok(!allowed.has(1.3) && !allowed.has(100), "trip legs are not citable");
    assert.ok(!allowed.has(9), "remembered reason text is not citable");
    assert.equal(checkOutput(shell, {
      chosen_key: "s0", reason_ko: "아침 7시 출근 후 3곳 중 선택", reason_en: "Chose after 5 days",
    }, ctx).ok, true);
    assert.equal(checkOutput(shell, {
      chosen_key: "s0", reason_ko: "1.3분 거리라 가깝다", reason_en: "Nearest",
    }, ctx).cause, "invented_number");
    assert.equal(checkOutput(shell, {
      chosen_key: "s0", reason_ko: "9분 거리라 선택", reason_en: "Nearest",
    }, ctx).cause, "invented_number");
  });

  it("skips ordinals, list markers and Korean counters", () => {
    const shell = {
      kind: "shop_choice", default_key: "s0", day: 6, minute: 599,
      options: [{ key: "s0", label: "마트", minutes: 3.2, distance_m: 251 }],
    };
    const ctx = {
      member: { role: "adult", preferences: "장보기는 한 번에" },
      agentLabel: "구성원", date: "2026-11-08", minute: 599, tripsToday: [], memory: [],
    };
    const allowed = contextNumbers({ ...ctx, shell });
    assert.ok(!allowed.has(1) && !allowed.has(2) && !allowed.has(4), "exemption digits are not citable");
    for (const [ko, en] of [
      ["1번에 장보기", "Shopping in one go"], // Korean counter (also digit-free 한 번)
      ["3회 방문 단골", "Regular, 3rd visit"], // counter + English ordinal
      ["2번째로 가까운 곳", "2nd nearest"], // Korean ordinal
      ["1. 마트 선택", "Chose (1)"], // list markers
    ]) {
      const r = checkOutput(shell, { chosen_key: "s0", reason_ko: ko, reason_en: en }, ctx);
      assert.equal(r.ok, true, `${ko} / ${en}: ${r.cause || ""} ${r.detail || ""}`);
    }
    // The same digits as data citations still fail.
    assert.equal(checkOutput(shell, {
      chosen_key: "s0", reason_ko: "4분 거리라 가깝다", reason_en: "Nearest",
    }, ctx).cause, "invented_number");
    assert.deepEqual(findInventedNumbers("1st 2nd 3rd 4th 1. (2) 3회", "", new Set()), []);
  });

  it("stores the refused reply as rejected on every guard rejection", () => {
    const badKey = checkOutput(SHOP, { chosen_key: "s9", reason_ko: "r", reason_en: "r" });
    assert.equal(badKey.cause, "bad_key");
    assert.deepEqual(badKey.rejected, {
      chosen_key: "s9", reason_ko: "r", reason_en: "r", offending: ["s9"],
    });
    const badNum = checkOutput(SHOP, {
      chosen_key: "s0", reason_ko: "7분 거리", reason_en: "r",
    });
    assert.equal(badNum.cause, "invented_number");
    assert.deepEqual(badNum.rejected, {
      chosen_key: "s0", reason_ko: "7분 거리", reason_en: "r", offending: ["7"],
    });
    const badTopic = checkOutput(SHOP, {
      chosen_key: "s0", reason_ko: "가격이 저렴", reason_en: "r",
    });
    assert.equal(badTopic.cause, "forbidden_topic");
    assert.deepEqual(badTopic.rejected, {
      chosen_key: "s0", reason_ko: "가격이 저렴", reason_en: "r", offending: ["가격"],
    });
    const badPlan = checkOutput(WEEKEND, {
      plan: ["park", "없는곳"], reason_ko: "r", reason_en: "r",
    });
    assert.equal(badPlan.cause, "bad_key");
    assert.deepEqual(badPlan.rejected, {
      plan: ["park", "없는곳"], reason_ko: "r", reason_en: "r", offending: ["없는곳"],
    });
    const badShape = checkOutput(SHOP, { chosen_key: "s0", reason_ko: "r" });
    assert.equal(badShape.cause, "bad_json");
    assert.deepEqual(badShape.rejected, { chosen_key: "s0", reason_ko: "r", offending: ["reason_en"] });
    // Nothing parsed, nothing stored: unparseable replies carry no
    // rejected (raw responses are never stored).
    assert.equal(checkOutput(SHOP, null).rejected, undefined);
    assert.equal(checkOutput(SHOP, "nope").rejected, undefined);
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
    // The home option sends no minutes/distance: its 0s are not citable.
    assert.ok(!optionNumbers(WEEKEND.options).has(0));
    assert.ok(!contextNumbers({ shell: WEEKEND }).has(0));
  });

  it("lists every fallback cause, including truncated cutoffs", () => {
    assert.deepEqual(
      [...FALLBACK_CAUSES].sort(),
      ["bad_json", "bad_key", "forbidden_topic", "invented_number", "provider_error", "truncated"],
    );
  });
});
