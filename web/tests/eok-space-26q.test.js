// Stage 26q: keep the space in "4억 이하" when localizing money.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTranslator, localizeNumbers } from "../src/i18n/translate.js";
import { phrases, patterns } from "../src/i18n/en.js";
import { WORDS } from "../src/i18n/en-words.js";

describe("stage 26q: eok space", () => {
  it("keeps the space after an 억 amount with no 원", () => {
    assert.equal(localizeNumbers("전세 4억 이하"), "전세 ₩400M 이하");
  });
  it("pins today's value with 원", () => {
    assert.equal(localizeNumbers("전세 2억 원 이하"), "전세 ₩200M 이하");
  });
  it("pins today's 억+만 value", () => {
    assert.equal(localizeNumbers("전세 1억 8,500만 원"), "전세 ₩185M");
  });
  it("full translator has no glued romanized 이하", () => {
    const tr = createTranslator({ phrases, patterns, words: WORDS });
    const dep = tr.translate("보증금 1억 이하");
    assert.ok(dep.includes("₩100M"), dep);
    assert.ok(!dep.includes("iha"), dep);
    assert.equal(
      tr.translate("맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상"),
      "Dual-income engaged couple, working in Gangnam, jeonse under 400M won, 59㎡ or larger",
    );
  });
});
