// Stage 24d: English mode — units read as English, the language sticks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { currentLang, persistLangParam } from "../src/i18n/lang.js";
import { createTranslator, localizeNumbers } from "../src/i18n/translate.js";
import { WORDS } from "../src/i18n/en-words.js";
import * as en from "../src/i18n/en.js";

describe("24d localizeNumbers units", () => {
  it("23점 → 23 pts", () => {
    assert.equal(localizeNumbers("23점"), "23 pts");
  });
  it("점심 unchanged", () => {
    assert.equal(localizeNumbers("점심"), "점심");
  });
  it("1일차 08:02 → Day 1 08:02", () => {
    assert.equal(localizeNumbers("1일차 08:02"), "Day 1 08:02");
  });
  it("176시간 → 176 h", () => {
    assert.equal(localizeNumbers("176시간"), "176 h");
  });
  it("2015년 → 2015", () => {
    assert.equal(localizeNumbers("2015년"), "2015");
  });
  it("3년 → 3 yr", () => {
    assert.equal(localizeNumbers("3년"), "3 yr");
  });
  it("11/2 (월) → 11/2 (Mon)", () => {
    assert.equal(localizeNumbers("11/2 (월)"), "11/2 (Mon)");
  });
  it("1만 7천 원 → ₩17,000", () => {
    assert.equal(localizeNumbers("1만 7천 원"), "₩17,000");
  });
  it("100만 7천 원 → ₩1.01M", () => {
    assert.equal(localizeNumbers("100만 7천 원"), "₩1.01M");
  });
  it("5천만 원 → ₩50M", () => {
    assert.equal(localizeNumbers("5천만 원"), "₩50M");
  });
  it("30대 → 30s", () => {
    assert.equal(localizeNumbers("30대"), "30s");
  });
  it("101동 → Bldg 101", () => {
    assert.equal(localizeNumbers("101동"), "Bldg 101");
  });
});

describe("24d real table fallback", () => {
  it("day counter and hours read as English, never romanized", () => {
    const { translate } = createTranslator({ ...en, words: WORDS });
    const out = translate("2일차 18:00 B 저녁에 집 A 176시간 vs B 177시간");
    assert.ok(out.includes("Day 2"), out);
    assert.ok(out.includes("176 h"), out);
    assert.ok(!out.includes("sigan"), out);
  });
});

describe("24d ?lang= sticks", () => {
  it("persistLangParam stores the query value", () => {
    const kept = {};
    persistLangParam("?lang=en", { setItem: (k, v) => { kept[k] = v; } });
    assert.equal(kept["ithaca.lang"], "en");
  });
  it("currentLang stores ?lang=en", () => {
    const prev = globalThis.window;
    const kept = {};
    globalThis.window = {
      location: { search: "?lang=en" },
      localStorage: {
        getItem: () => kept["ithaca.lang"] ?? null,
        setItem: (k, v) => { kept[k] = v; },
      },
      navigator: { language: "ko-KR" },
    };
    try {
      assert.equal(currentLang(), "en");
      assert.equal(kept["ithaca.lang"], "en");
    } finally {
      if (prev === undefined) delete globalThis.window;
      else globalThis.window = prev;
    }
  });
});
