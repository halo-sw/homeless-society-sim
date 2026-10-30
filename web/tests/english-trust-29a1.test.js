// Stage 29a1: English mode keeps the customer's words and reads them right.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

register("./jsx-loader.mjs", import.meta.url);

import { createTranslator } from "../src/i18n/translate.js";
import { phrases, patterns } from "../src/i18n/en.js";
import { WORDS } from "../src/i18n/en-words.js";
import { callTool, createSession } from "../src/consult/tools.js";
import { translateTree, createState } from "../src/i18n/dom.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const NETWORK = {
  lines: [{
    id: "line1", name: "2호선",
    stops: [
      { id: "s1", key: "강남", name: "강남" },
      { id: "s2", key: "정자", name: "정자" },
    ],
    patterns: [{ id: "p1", stops: ["s1", "s2"], chainage_km: [0, 5.0] }],
  }],
};

function session(over = {}) {
  return createSession({
    scenario: { name: "t", household: { members: [] }, homes: [] },
    loadRegion: async () => ({ network: NETWORK, congestion: null }),
    ...over,
  });
}

describe("29a1 english trust", () => {
  it("user bubble keeps data-no-i18n in source", () => {
    const src = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
    const bubble = src.split("\n")
      .find((l) => l.includes("<ChatMessageBubble") && l.includes("{m.content}"));
    assert.ok(bubble && bubble.includes("data-no-i18n"), bubble);
  });

  it("extract_profile reads the customer's original words", async () => {
    const r = await callTool(
      session({ context: { customer_text: ["맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상"] } }),
      "extract_profile",
      { text: "dual-income engaged couple, commute to Gangnam, jeonse up to 400M, 59 m2+" },
    );
    assert.equal(r.ok, true);
    assert.equal(r.profile.tenure.value, "jeonse");
    assert.equal(r.profile.depositMax.value, 400000000);
    assert.equal(r.profile.sizeMin.value, 59);
    assert.equal(r.profile.members.value.length, 2);
    assert.equal(r.profile.workplaces.value[0].resolved.station, "강남");
  });

  it("commute particle is a preposition, never romanized", () => {
    const tr = createTranslator({ phrases, patterns, words: WORDS });
    const t = tr.translate("강남까지 약 11분");
    assert.ok(t.includes("11 min"), t);
    assert.ok(t.includes("Gangnam"), t);
    assert.ok(!t.includes("kkaji"), t);
  });

  it("counts use English plurals", () => {
    const tr = createTranslator({ phrases, patterns, words: WORDS });
    assert.equal(tr.translate("확인한 것 1가지"), "1 thing checked");
    assert.equal(tr.translate("확인한 것 3가지"), "3 things checked");
    assert.equal(tr.translate("모르는 값 1개 — 채우면 더 정확해요"),
      "1 unknown value — fill them in for better accuracy");
  });

  let localNoAnswerLine;
  before(async () => {
    ({ localNoAnswerLine } = await import("../src/ui/chat.jsx"));
  });

  it("live-in fallback never points below a map", () => {
    assert.ok(!localNoAnswerLine("두 집에서 살아 봐 줘").includes("지도 아래"));
  });
});

// Stage 29a1b: the translator never touches what the customer is typing.
// Minimal DOM fakes (same shape as i18n-24a.test.js): the dom core only
// uses nodeType, nodeValue, childNodes, parentNode, tagName, getAttribute.
function fakeText(value) {
  return { nodeType: 3, nodeValue: value, parentNode: null, childNodes: [] };
}
function fakeEl(tag, { attrs = {}, kids = [] } = {}) {
  const el = {
    nodeType: 1,
    tagName: tag,
    parentNode: null,
    childNodes: kids,
    _attrs: { ...attrs },
    getAttribute(name) {
      return Object.hasOwn(this._attrs, name) ? this._attrs[name] : null;
    },
    setAttribute(name, value) {
      this._attrs[name] = String(value);
    },
  };
  for (const k of kids) k.parentNode = el;
  return el;
}

describe("29a1b composer guard", () => {
  const TYPED = "맞벌이 예비부부, 강남 출근";
  const tr = () => createTranslator({
    phrases: { [TYPED]: "MANGLED", "출퇴근 상한?": "Commute cap?" },
    patterns: [],
  });
  it("typing inside contenteditable is never translated", () => {
    const text = fakeText(TYPED);
    const ed = fakeEl("DIV", { attrs: { contenteditable: "true" }, kids: [
      fakeEl("P", { kids: [fakeEl("SPAN", { kids: [text] })] }),
    ] });
    translateTree(ed, tr(), createState());
    assert.equal(text.nodeValue, TYPED);
  });
  it("the added span itself is skipped too", () => {
    const text = fakeText(TYPED);
    const span = fakeEl("SPAN", { kids: [text] });
    fakeEl("DIV", { attrs: { contenteditable: "true" }, kids: [
      fakeEl("P", { kids: [span] }),
    ] });
    translateTree(span, tr(), createState());
    assert.equal(text.nodeValue, TYPED);
  });
  it("textarea content is never translated", () => {
    const text = fakeText(TYPED);
    translateTree(fakeEl("TEXTAREA", { kids: [text] }), tr(), createState());
    assert.equal(text.nodeValue, TYPED);
  });
  it("a normal div is still translated", () => {
    const text = fakeText("출퇴근 상한?");
    translateTree(fakeEl("DIV", { kids: [fakeEl("SPAN", { kids: [text] })] }), tr(), createState());
    assert.equal(text.nodeValue, "Commute cap?");
  });
});

describe("29a1b name gloss", () => {
  it("keeps digits, hyphens and brackets tight", async () => {
    const { HomeName } = await import("../src/ui/candidate-card.jsx");
    const el = HomeName({ name: "현대아파트(75-1)", lang: "en" });
    assert.equal(el.props.children[1].props.children, " (Hyeondaeapateu(75-1))");
  });
  it("no Hangul means no gloss", async () => {
    const { HomeName } = await import("../src/ui/candidate-card.jsx");
    const el = HomeName({ name: "Maple 101", lang: "en" });
    assert.equal(el.props.children[1], null);
  });
});
