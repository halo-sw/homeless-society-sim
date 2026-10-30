// Stage 24c: English mode — no observer loop, words before romanizing,
// Muse answers in English.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { translateTree } from "../src/i18n/dom.js";
import { createTranslator } from "../src/i18n/translate.js";
import { phrases, patterns } from "../src/i18n/en.js";
import { WORDS } from "../src/i18n/en-words.js";
import { runTurn } from "../src/consult/agent.js";
import { createRunCache } from "../src/consult/tools.js";
import { checkConsultReply } from "../src/consult/guards.js";
import { tinyArea, tinyScenario } from "./engine-fixture.js";

// Counting text node: nodeValue setter bumps writes.
function countingText(value) {
  let v = value;
  return {
    nodeType: 3,
    parentNode: null,
    childNodes: [],
    writes: 0,
    get nodeValue() { return v; },
    set nodeValue(nv) { this.writes++; v = nv; },
  };
}
function wrapEl(kids) {
  const el = { nodeType: 1, tagName: "DIV", parentNode: null, childNodes: kids,
    _attrs: {},
    getAttribute(n) { return Object.hasOwn(this._attrs, n) ? this._attrs[n] : null; },
    setAttribute(n, val) { this._attrs[n] = String(val); } };
  for (const k of kids) k.parentNode = el;
  return el;
}
// Output still holds Hangul (partial translation): the old code rewrote
// the same value forever, queuing a mutation per write.
const hangulLeak = { translate: (s) => (s === "5분 남음" ? "5 분 남음" : s) };

describe("24c observer loop", () => {
  it("second pass over a Hangul-leaking leaf makes no write", () => {
    const a = countingText("5");
    const b = countingText("분 남음");
    const root = wrapEl([a, b]);
    translateTree(root, hangulLeak);
    const firstWrites = a.writes + b.writes;
    assert.ok(firstWrites > 0, "first pass writes");
    a.writes = 0;
    b.writes = 0;
    translateTree(root, hangulLeak);
    assert.equal(a.writes + b.writes, 0, "second pass writes nothing");
  });
  it("placeholder equal to its translation is not set again", () => {
    let sets = 0;
    const el = { nodeType: 1, tagName: "INPUT", parentNode: null, childNodes: [],
      _attrs: { placeholder: "Name", "data-i18n-src-placeholder": "이름" },
      getAttribute(n) { return Object.hasOwn(this._attrs, n) ? this._attrs[n] : null; },
      setAttribute(n, val) { sets++; this._attrs[n] = String(val); } };
    const root = wrapEl([el]);
    translateTree(root, { translate: (s) => (s === "이름" ? "Name" : s) });
    assert.equal(sets, 0);
  });
});

describe("24c words before romanizing", () => {
  const { translate } = createTranslator({ phrases, patterns, words: WORDS });
  it("joined persona label reads as words", () => {
    assert.equal(translate("강남 출근 · 1인 · 전세 3억 원 이하"),
      "Gangnam commute · 1 person · jeonse ₩300M or less");
  });
  it("eok + man money localizes through the word path", () => {
    assert.equal(translate("전세 2억 6,000만 원"), "jeonse ₩260M");
  });
  it("station + on foot keeps the name readable", () => {
    const out = translate("잠실역까지 걸어서");
    assert.ok(out.includes("Jamsil"), out);
    assert.ok(out.includes("on foot"), out);
  });
});

describe("24c Muse answers in English", () => {
  const scenario = () => tinyScenario({ days: 1, background: 0, seed: 7,
    homes: [{ label: "A", area: "pangyo", complex_name: "알파" }] });
  const baseOpts = () => ({ provider: "meta", scenario: scenario(),
    cache: createRunCache(), loadArea: async () => tinyArea() });
  function recordingComplete(seen) {
    return async ({ messages }) => {
      seen.push(...messages);
      return { message: { content: "안녕하세요", tool_calls: [] }, finish: "stop",
        usage: { prompt_tokens: 1, completion_tokens: 1 }, latency_ms: 1,
        provider: "meta", model: "muse-spark-1.3" };
    };
  }
  it("adds the English instruction when context.lang is en", async () => {
    const seen = [];
    await runTurn({ ...baseOpts(), messages: [{ role: "user", content: "hi" }],
      context: { lang: "en" }, completeFn: recordingComplete(seen) });
    assert.ok(seen.some((m) => m.role === "system"
      && m.content.includes("Answer in plain English")), "no English instruction");
  });
  it("no English instruction without lang", async () => {
    const seen = [];
    await runTurn({ ...baseOpts(), messages: [{ role: "user", content: "hi" }],
      context: null, completeFn: recordingComplete(seen) });
    assert.ok(!seen.some((m) => m.role === "system"
      && m.content.includes("Answer in plain English")), "unexpected English instruction");
  });
});

describe("24c guards", () => {
  it("₩300M cites a 300000000 tool result", () => {
    assert.deepEqual(
      checkConsultReply("The deposit is ₩300M.", [{ deposit: 300000000 }]),
      { ok: true });
  });
  it("I recommend trips the verdict guard", () => {
    const r = checkConsultReply("I recommend home A", []);
    assert.equal(r.ok, false);
  });
  it("Korean guards still hold", () => {
    assert.deepEqual(checkConsultReply("도보 16분", [{ minutes: 16 }]), { ok: true });
    assert.equal(checkConsultReply("이 집을 추천합니다", []).ok, false);
    assert.equal(checkConsultReply("지금이 매수 적기입니다", []).ok, false);
    assert.equal(checkConsultReply("계약하세요", []).ok, false);
    assert.equal(checkConsultReply("집값이 오를 것 같습니다", []).cause, "forecast_claim");
    assert.equal(checkConsultReply("대출이 나옵니다", []).cause, "loan_verdict");
  });
});
