// 26s: English mode for chat-first Muse — diary in English, model
// text not re-translated (SSR, no DOM, no keys).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import {
  DIARY_PROMPT, DIARY_PROMPT_EN, diaryPrompt, checkDiary, writeDiary,
} from "../src/consult/diary.js";

const DIGESTS = [
  { label: "A", name: "Alpha",
    facts: [{ id: "c1", day: 2, minute: 461, kind: "commute",
      text_ko: "3일째 출근 23분 (집 07:41 출발)", numbers: [3, 23, 7, 41] }],
    totals: { one_way_min: 23, park_visits: 1, late_returns: 0 } },
  { label: "B", name: "Beta",
    facts: [{ id: "c2", day: 0, minute: 480, kind: "commute",
      text_ko: "1일째 출근 35분 (집 08:00 출발)", numbers: [1, 35, 8, 0] }],
    totals: { one_way_min: 35, park_visits: 0, late_returns: 0 } },
];

describe("26s english muse", () => {
  let React;
  let renderToString;
  let AssistantMsg;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ AssistantMsg } = await import("../src/ui/consult.jsx"));
  });

  it("korean prompt is byte-identical to today", () => {
    assert.equal(DIARY_PROMPT.length, 492);
    assert.equal(diaryPrompt("ko"), DIARY_PROMPT);
    assert.equal(diaryPrompt(), DIARY_PROMPT);
    assert.equal(diaryPrompt("xx"), DIARY_PROMPT);
  });

  it("english prompt adds a plain-English instruction only", () => {
    const en = diaryPrompt("en");
    assert.ok(en.includes("plain English"));
    assert.ok(en.includes(DIARY_PROMPT_EN));
    assert.equal(en.slice(0, DIARY_PROMPT.length), DIARY_PROMPT);
  });

  it("writeDiary sends the english prompt when lang is en", async () => {
    let system = "";
    const complete = async ({ messages }) => {
      system = (messages && messages[0] && messages[0].content) || "";
      return { message: { content: JSON.stringify({
        summary: "Both homes in two sentences.",
        lines: [{ home: "A", id: "c1", text: "Day 3: the commute took 23 min, left at 07:41." }],
      }) }, usage: {} };
    };
    const out = await writeDiary({ complete, provider: "meta", digests: DIGESTS, lang: "en" });
    assert.ok(system.includes("plain English"));
    assert.equal(out.lines.length, 1);
  });

  it("checkDiary accepts an english line citing its fact numbers", () => {
    const good = checkDiary(
      { summary: "Home A averaged 23 min one way.",
        lines: [{ home: "A", id: "c1", text: "Day 3: the commute took 23 min, left at 07:41." }] },
      DIGESTS);
    assert.equal(good.failures.length, 0);
    assert.equal(good.summaryOk, true);
  });

  it("checkDiary still rejects a number not in the facts", () => {
    const bad = checkDiary(
      { summary: "Home A averaged 23 min one way.",
        lines: [{ home: "A", id: "c1", text: "Day 3: the commute took 45 min, left at 07:41." }] },
      DIGESTS);
    assert.equal(bad.failures.length, 1);
    assert.match(bad.failures[0].reason_ko, /기록에 없는 숫자/);
  });

  it("checkDiary accepts comma-grouped won either way", () => {
    const whole = [{ label: "A", name: "A",
      facts: [{ id: "w1", day: 1, minute: 480, kind: "money",
        text_ko: "월세 660000원", numbers: [660000] }],
      totals: { one_way_min: 23 } }];
    const comma = [{ label: "A", name: "A",
      facts: [{ id: "w1", day: 1, minute: 480, kind: "money",
        text_ko: "월세 660,000원", numbers: [660, 0] }],
      totals: { one_way_min: 23 } }];
    for (const digests of [whole, comma]) {
      const r = checkDiary(
        { summary: "Rent is fine.",
          lines: [{ home: "A", id: "w1", text: "Paid \u20A9660,000 monthly rent." }] },
        digests);
      assert.equal(r.failures.length, 0);
    }
  });

  it("model-written english bubble carries data-no-i18n; rule text does not", () => {
    const model = renderToString(React.createElement(AssistantMsg,
      { msg: { role: "assistant", content: "Gangnam Stn (강남역) takes 23 min.", fromModel: true }, toolRows: {}, lang: "en" }));
    assert.ok(model.includes("data-no-i18n"));
    const rule = renderToString(React.createElement(AssistantMsg,
      { msg: { role: "assistant", content: "Muse 연결이 안 돼서 규칙으로 답했어요" }, toolRows: {}, lang: "en" }));
    assert.ok(!rule.includes("data-no-i18n"));
    const ko = renderToString(React.createElement(AssistantMsg,
      { msg: { role: "assistant", content: "Gangnam Stn (강남역) takes 23 min.", fromModel: true }, toolRows: {}, lang: "ko" }));
    assert.ok(!ko.includes("data-no-i18n"));
  });
});
