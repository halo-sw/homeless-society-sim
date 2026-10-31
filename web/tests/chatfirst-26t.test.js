// Stage 26t: chat-first polish — action turns, deterministic English text,
// no cut chips/labels, 만+comma money.
// (node --test, no browser, no keys.)
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

import {
  checkConsultReply, actionConfirmation, numbersOnlyAnswer,
} from "../src/consult/guards.js";
import { writeDiary } from "../src/consult/diary.js";
import { createTranslator, localizeNumbers } from "../src/i18n/translate.js";
import { phrases, patterns } from "../src/i18n/en.js";
import { WORDS } from "../src/i18n/en-words.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

// ui.css with every @media block removed (brace-matched).
function stripMedia(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const at = src.indexOf("@media", i);
    if (at < 0) { out += src.slice(i); break; }
    out += src.slice(i, at);
    let j = at;
    while (j < src.length && src[j] !== "{") j++;
    let depth = 0;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {
        depth--;
        if (depth === 0) { j++; break; }
      }
    }
    i = j;
  }
  return out;
}

const PICK_RESULTS = [{ ok: true, ui: { action: "pick", ids: ["xa", "xb"] } }];

describe("26t guard list indices", () => {
  it("passes an English save reply with a pick tool result", () => {
    assert.deepEqual(
      checkConsultReply("Saved numbers 1 and 3: A Alpha, B Beta.", PICK_RESULTS),
      { ok: true });
  });

  it("passes Korean indices with a pick tool result", () => {
    assert.deepEqual(
      checkConsultReply("1번이랑 3번 찜했어요.", PICK_RESULTS),
      { ok: true });
  });

  it("still rejects bare numbers with no pick or candidate list", () => {
    const r = checkConsultReply("Saved numbers 1 and 3.", []);
    assert.equal(r.ok, false);
    assert.equal(r.cause, "invented_number");
  });
});

describe("26t action confirmation fallback", () => {
  it("confirms a named pick instead of the numbers-only text", () => {
    const c = actionConfirmation([
      { ok: true,
        candidates: [
          { id: "a", name: "천사의도시II오피스텔" },
          { id: "b", name: "시그마 3" },
        ] },
      { ok: true, ui: { action: "pick", ids: ["a", "b"] } },
    ]);
    assert.ok(c.includes("찜했어요"), c);
    assert.ok(c.includes("천사의도시II오피스텔"), c);
    assert.ok(c.includes("시그마 3"), c);
    assert.ok(!c.includes("도구 결과의 수치만"), c);
  });

  it("confirms an id-only pick without names", () => {
    const c = actionConfirmation(PICK_RESULTS);
    assert.ok(c.includes("찜했어요"), c);
    assert.ok(!c.includes("도구 결과의 수치만"), c);
  });

  it("returns null when there is no action or there are report numbers", () => {
    assert.equal(actionConfirmation([]), null);
    assert.equal(
      actionConfirmation([{ ok: true, candidates: [{ id: "a", name: "A" }] }]),
      null);
    assert.equal(
      actionConfirmation([
        { ok: true, ui: { action: "pick", ids: ["a"] } },
        { ok: true, compare: { metrics: [] } },
      ]),
      null);
  });
});

describe("26t diary fallback summary language", () => {
  const DIGESTS = [
    { label: "A", name: "Alpha", facts: [], totals: { one_way_min: 11 } },
    { label: "B", name: "Beta", facts: [], totals: { one_way_min: 14 } },
  ];
  const badComplete = async () => ({
    message: {
      content: JSON.stringify({ summary: "averaged 99 min, clearly off record", lines: [] }),
    },
    usage: {},
  });

  it("builds the fallback summary in English with no Hangul", async () => {
    const out = await writeDiary(
      { complete: badComplete, provider: "meta", digests: DIGESTS, lang: "en" });
    assert.equal(out.summary,
      "A Alpha: average one-way commute 11 min; B Beta: 14 min.");
    assert.ok(!/[가-힣]/.test(out.summary), out.summary);
  });

  it("keeps the Korean fallback unchanged", async () => {
    const out = await writeDiary(
      { complete: badComplete, provider: "meta", digests: DIGESTS, lang: "ko" });
    assert.equal(out.summary,
      "A는 출근 편도 평균 11분, B는 출근 편도 평균 14분이었어요.");
  });
});

describe("26t deterministic text stays translatable", () => {
  let React;
  let renderToString;
  let AssistantMsg;
  let diaryFallbackLine;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ AssistantMsg } = await import("../src/ui/consult.jsx"));
    ({ diaryFallbackLine } = await import("../src/ui/chat.jsx"));
  });

  it("numbers-only fallback has no data-no-i18n in English mode", () => {
    const msg = numbersOnlyAnswer([
      { places: [{ name: "슈퍼", minutes: 5, distance_m: 300 }] },
    ]);
    assert.ok(msg.includes("도구 결과의 수치만"), msg);
    const html = renderToString(React.createElement(AssistantMsg,
      { msg: { role: "assistant", content: msg }, toolRows: {}, lang: "en" }));
    assert.ok(!html.includes("data-no-i18n"), html);
  });

  it("agent bubbles mark only model text as fromModel", () => {
    const src = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
    assert.ok(src.includes("fromModel: !out.fallback"),
      "fallbacks are not fromModel");
  });

  it("diary failure line is English with no Hangul in en mode", () => {
    const en = diaryFallbackLine({ A: 11, B: 14 }, { A: "Alpha", B: "Beta" }, "en");
    assert.ok(en.includes("average one-way commute"), en);
    assert.ok(!/[가-힣]/.test(en), en);
    const ko = diaryFallbackLine({ A: 11, B: 14 }, { A: "가", B: "나" });
    assert.ok(ko.startsWith("다 살아 봤어요."), ko);
  });
});

describe("26t CSS never cuts labels", () => {
  it("chips never shrink outside any media query", () => {
    const base = stripMedia(css);
    assert.ok(/\.ui-chat-chips > \*\s*\{[^}]*flex:\s*none/.test(base),
      ".ui-chat-chips > * flex none at base");
  });

  it("moment rows are one grid button; the text takes the shrink", () => {
    const base = stripMedia(css);
    const row = base.match(/\.ui-result-moment\s*\{[^}]*\}/);
    assert.ok(row, ".ui-result-moment rule exists at base");
    assert.ok(/display:\s*grid/.test(row[0]), "row is a grid");
    assert.ok(!/\.ui-result-moment button\s*\{/.test(base), "no inner buttons");
    const m = base.match(/\.ui-result-text\s*\{[^}]*\}/);
    assert.ok(m, ".ui-result-text rule exists at base");
    assert.ok(/overflow-wrap:\s*anywhere/.test(m[0]), "text wraps in its column");
  });

  it("result values never break inside the number", () => {
    const m = css.match(/\.ui-result-value\s*\{[^}]*\}/);
    assert.ok(m, ".ui-result-value rule exists");
    assert.ok(m[0].includes("word-break: keep-all"), "keep-all");
    assert.ok(m[0].includes("overflow-wrap: normal"), "no mid-number wrap");
  });

  it("still truncates nothing, anywhere", () => {
    assert.ok(!css.includes("text-overflow: ellipsis"), "no ellipsis truncation");
    assert.ok(!css.includes("text-overflow"), "no truncation at all");
  });
});

describe("26t translate 만 + comma money", () => {
  it("localizes N만 M,MMM원 as one amount", () => {
    assert.ok(localizeNumbers("월 83만 5,000원").includes("₩835,000"),
      localizeNumbers("월 83만 5,000원"));
  });

  it("keeps digit groups whole through the full translator", () => {
    const tr = createTranslator({ phrases, patterns, words: WORDS });
    const t = tr.translate("월 83만 5천 원");
    assert.ok(t.includes("₩835,000"), t);
    assert.ok(!t.includes(", 000"), t);
  });

  it("pins today's outputs", () => {
    assert.equal(localizeNumbers("전세 2억 원 이하"), "전세 ₩200M 이하");
    assert.equal(localizeNumbers("전세 1억 8,500만 원"), "전세 ₩185M");
    assert.equal(localizeNumbers("월세 50만 원 이하"), "월세 ₩0.5M 이하");
    assert.equal(localizeNumbers("전세 4억 이하"), "전세 ₩400M 이하");
  });
});
