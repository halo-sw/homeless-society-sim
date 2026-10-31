// Stage 32d: subway lines read "Line N" and clock times keep "08:12".
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTranslator, localizeNumbers } from "../src/i18n/translate.js";
import { phrases, patterns } from "../src/i18n/en.js";
import { WORDS } from "../src/i18n/en-words.js";

const { translate } = createTranslator({ phrases, patterns, words: WORDS });

describe("translator-32d subway lines", () => {
  it("2호선 reads Line 2", () => {
    assert.equal(translate("2호선"), "Line 2");
  });
  it("9호선 reads Line 9", () => {
    assert.equal(translate("9호선"), "Line 9");
  });
  it("crowding line keeps Line 2", () => {
    assert.equal(translate("2호선 잠실→강남 혼잡 93%"), "Line 2 Jamsil→Gangnam crowding 93%");
  });
  it("101호 still reads No. 101", () => {
    assert.match(translate("101호"), /No\. 101/);
  });
  it("localizeNumbers maps 호선 before 호", () => {
    assert.equal(localizeNumbers("2호선"), "Line 2");
    assert.equal(localizeNumbers("101호"), "No. 101");
  });
});

describe("translator-32d clock times", () => {
  it("08:35 route keeps its colon", () => {
    const out = translate("08:35 2호선 잠실→강남");
    assert.match(out, /08:35/);
    assert.match(out, /Line 2/);
    assert.doesNotMatch(out, /08: 35/);
  });
  it("day line starts Day 2 08:12 A Line 2", () => {
    assert.ok(translate("2일차 08:12 A 2호선 잠실→강남 혼잡 93%").startsWith("Day 2 08:12 A Line 2"));
  });
  it("word colon still splits (직장: 판교)", () => {
    assert.equal(translate("직장: 판교"), "Workplace: Pangyo");
  });
});

describe("translator-32d orchestrator table entries", () => {
  it("pins the landing and unit strings", () => {
    assert.equal(translate("Ithaca — 살아 보고 고르는 집"), "Ithaca — The Pre-living Agent for Your Next Home");
    assert.equal(translate("Ithaca — A · 레이크팰리스"), "Ithaca — A · Lake Palace");
    assert.equal(translate("Ithaca — 송파구 잠실역 인근"), "Ithaca — Near Jamsil Station, Songpa-gu");
    assert.equal(translate("27.2초"), "27.2 s");
    assert.equal(translate("21건"), "21 deals");
    assert.equal(translate("1건"), "1 deal");
    assert.equal(translate("프로필 읽기(1개 물어봄)"), "Reading profile (1 question asked)");
  });
});
