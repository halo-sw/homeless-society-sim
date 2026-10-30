// Stage 29a7 — live Muse in English: Meta HQ coverage, English every
// turn, chips readable. node --test, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SYSTEM_PROMPT, runTurn, needsEnglishRetry, splitSuggestions,
} from "../src/consult/agent.js";
import { createSession, callTool } from "../src/consult/tools.js";
import { usRegionsForProfile } from "../src/consult/tools-search.js";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { createTranslator } from "../src/i18n/translate.js";
import { phrases, patterns } from "../src/i18n/en.js";
import { WORDS } from "../src/i18n/en-words.js";

const META = {
  id: "meta-hq", name: "Meta HQ (1 Hacker Way)",
  lon: -122.14823, lat: 37.48485,
};

function usHome(id, rent) {
  return {
    id, name: `Home ${id}`, kind: "아파트", region: "us-menlo",
    lon: -122.15, lat: 37.47, build_year: null, scene: "us-menlo",
    pnu: null, match: "osm_name", osm_name: `Home ${id}`,
    station: null,
    buckets: [{ center_m2: null, range_m2: null, trade: null,
      jeonse: null,
      wolse: { count: 1, deposit: null,
        monthly: { count: 1, median_won: rent, min_won: rent,
          max_won: rent } } }],
    currency: "USD", country: "US",
    price: { source: "zillow_zori_zip", zip: "94025",
      zip_source: "osm_nearest", month: "2026-09",
      label: "Zillow ZORI (typical rent for this ZIP, all home types)" },
    work_targets: { "meta-hq": { walk_m: 2900, walk_minutes: 40,
      bike_m: 3100, bike_minutes: 12, bike_speed_kmh: 15,
      bike_speed_source: "assumed" } },
  };
}

function krHome(id) {
  const h = usHome(id, 3000000);
  h.region = "seongdong";
  h.scene = null;
  h.currency = "KRW";
  h.country = "KR";
  h.work_targets = {};
  return h;
}

function usdProfile() {
  return {
    tenure: { value: "wolse", source: "customer", note: "" },
    monthlyMax: { value: 4500, source: "customer", note: "" },
    currency: { value: "USD", source: "customer", note: "" },
    workplaces: { value: [{ member: 0, text: "Meta HQ",
      resolved: { place: { ...META }, region: "us-menlo" } }],
    source: "customer", note: "" },
  };
}

function scriptedComplete(seen, script) {
  return async ({ messages }) => {
    seen.push(messages);
    const step = script[Math.min(seen.length - 1, script.length - 1)];
    return {
      message: { content: step.content || "",
        tool_calls: step.tool_calls || [] },
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    };
  };
}

function lastSystemIsEnglishNote(seen) {
  assert.ok(seen.length > 0);
  for (const req of seen) {
    const systems = req.filter((m) => m && m.role === "system");
    assert.ok(systems.length > 0);
    assert.match(systems[systems.length - 1].content, /plain English/);
  }
}

const EN_USER = "I work at Meta HQ in Menlo Park. Two of us, rent up to $4,000 a month.";

describe("29a7 prompt covers Meta HQ", () => {
  it("lists Menlo Park and never pins Korean-only replies", () => {
    const prompt = String(SYSTEM_PROMPT);
    assert.ok(prompt.includes("Menlo Park"));
    assert.ok(prompt.includes("Meta 본사 1 Hacker Way"));
    assert.ok(!prompt.includes("항상 정중한 존댓말로, 한국어로"));
  });

  it("needsEnglishRetry fires only for Korean text in English mode", () => {
    assert.equal(needsEnglishRetry("메타 본사 근처로 알아봤습니다.", true), true);
    assert.equal(needsEnglishRetry("I found two options.", true), false);
    assert.equal(needsEnglishRetry("메타 본사 근처로 알아봤습니다.", false), false);
  });

  it("splitSuggestions keeps English chips as they are", () => {
    const split = splitSuggestions(
      "Got it.\n[[다음: Compare them | Show the commute]]");
    assert.equal(split.text, "Got it.");
    assert.deepEqual(split.suggestions, ["Compare them", "Show the commute"]);
  });
});

describe("29a7 English every turn (no-tool turn)", () => {
  it("a Korean first answer is replaced by the English retry", async () => {
    const seen = [];
    const out = await runTurn({
      provider: "meta",
      messages: [{ role: "user", content: EN_USER }],
      scenario: tinyScenario({ days: 2, background: 0 }),
      loadArea: async () => tinyArea(),
      context: { lang: "en" },
      completeFn: scriptedComplete(seen, [
        { content: "메타 본사 근처로 알아봤습니다.\n[[다음: 후보 찾아줘 | 동네 보여줘]]" },
        { content: "I found two options near Meta HQ.\n[[다음: Compare them | Show the commute]]" },
      ]),
    });
    assert.equal(out.ok, true);
    assert.equal(out.reply, "I found two options near Meta HQ.");
    assert.deepEqual(out.suggestions, ["Compare them", "Show the commute"]);
    assert.equal(seen.length, 2);
    lastSystemIsEnglishNote(seen);
  });

  it("a still-Korean retry is kept but flagged, never the first reply", async () => {
    const seen = [];
    const out = await runTurn({
      provider: "meta",
      messages: [{ role: "user", content: EN_USER }],
      scenario: tinyScenario({ days: 2, background: 0 }),
      loadArea: async () => tinyArea(),
      context: { lang: "en" },
      completeFn: scriptedComplete(seen, [
        { content: "메타 본사 근처로 알아봤습니다." },
        { content: "다시 한국어로 답합니다." },
      ]),
    });
    assert.equal(out.ok, true);
    assert.equal(out.reply, "다시 한국어로 답합니다.");
    assert.equal(out.fallback, true);
    assert.equal(out.guardCause, "english_retry_korean");
    lastSystemIsEnglishNote(seen);
  });
});

describe("29a7 English every turn (tool turn)", () => {
  it("a Korean answer after tool results is replaced too", async () => {
    const seen = [];
    const out = await runTurn({
      provider: "meta",
      messages: [{ role: "user", content: EN_USER }],
      scenario: tinyScenario({ days: 2, background: 0 }),
      loadArea: async () => tinyArea(),
      context: { lang: "en" },
      completeFn: scriptedComplete(seen, [
        { tool_calls: [{ id: "t1", name: "get_scenario", args: {} }] },
        { content: "시나리오를 확인했습니다.\n[[다음: 후보 찾아줘 | 살아 봐 줘]]" },
        { content: "I checked the scenario.\n[[다음: Compare them | Live in both]]" },
      ]),
    });
    assert.equal(out.ok, true);
    assert.equal(out.reply, "I checked the scenario.");
    assert.deepEqual(out.suggestions, ["Compare them", "Live in both"]);
    assert.equal(seen.length, 3);
    lastSystemIsEnglishNote(seen);
  });
});

describe("29a7 find_homes routes a USD profile to us-menlo", () => {
  it("usRegionsForProfile pins the routing", () => {
    assert.deepEqual(usRegionsForProfile(usdProfile()), ["us-menlo"]);
    assert.equal(usRegionsForProfile({
      currency: { value: "KRW", source: "customer", note: "" },
    }), null);
  });

  it("returns us-menlo candidates, never Korean ones", async () => {
    const session = createSession({
      scenario: tinyScenario({ days: 2, background: 0 }),
      loadHomes: async () => ({ homes: [
        usHome("us-home-0001", 3800),
        usHome("us-home-0002", 4261),
        krHome("kr-home-0001"),
      ] }),
      loadArea: async () => ({ graph: null, pois: [] }),
    });
    const res = await callTool(session, "find_homes",
      { profile: usdProfile() });
    assert.equal(res.ok, true);
    assert.deepEqual(res.asked_for.regions, ["us-menlo"]);
    assert.ok(res.candidates.length >= 1);
    for (const c of res.candidates) {
      assert.ok(c.id.startsWith("us-"), c.id);
      assert.ok(!c.id.startsWith("kr-"), c.id);
    }
  });
});

describe("29a7 chips never romanize ordinary words", () => {
  const tr = () => createTranslator({ phrases, patterns, words: WORDS });
  const cases = [
    ["후보 찾아줘", "Find candidates"],
    ["동네 보여줘", "Show neighborhood"],
    ["돈 계산해줘", "Calculate costs"],
    ["출근길 보여줘", "Show commute route"],
  ];
  for (const [ko, en] of cases) {
    it(`${ko} → ${en}`, () => {
      const out = tr().translate(ko);
      assert.equal(out, en);
      assert.ok(!/jwo\b/i.test(out), out);
    });
  }

  it("a bare request tail keeps its Korean", () => {
    const out = tr().translate("찾아줘");
    assert.equal(out, "찾아줘");
    assert.ok(!/jwo\b/i.test(out), out);
  });
});
