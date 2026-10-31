// 29a6c: replay banner polish + English result lines (banner row,
// evening moment, US money cell, USGS source, tray CTA).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

describe("29a6c replay bar", () => {
  it("the replay notice renders through Banner (info) with both actions", () => {
    const src = read("../src/ui/chat.jsx");
    assert.ok(src.includes("<ReplayNotice"), "notice component");
    assert.ok(src.includes('status="info"'), "info Banner");
    assert.ok(src.includes('label="건너뛰기"'), "Skip action");
    assert.ok(src.includes('label="직접 해 보기"'), "Try-it-yourself action");
    assert.ok(!src.includes("ds-replay-bar"), "custom strip gone from chat.jsx");
    assert.ok(!read("../src/ui/ui.css").includes("ds-replay-bar"),
      "strip CSS gone from ui.css");
  });
  it("banner shows while replaying; the done chip follows when finished", () => {
    const src = read("../src/ui/chat.jsx");
    assert.ok(src.includes("replayId && replaying"), "bar hides when replay finished");
    assert.ok(src.includes("ds-replay-done"), "Try-it-yourself chip under the last message");
  });
});

describe("29a6c evening moment", () => {
  let pickMoments;
  let tr;
  before(async () => {
    ({ pickMoments } = await import("../src/engine/moments.js"));
    const { createTranslator } = await import("../src/i18n/translate.js");
    const { phrases, patterns } = await import("../src/i18n/en.js");
    const { WORDS } = await import("../src/i18n/en-words.js");
    tr = createTranslator({ phrases, patterns, words: WORDS });
  });
  // Evening window is 18:00-24:00 (360 min/agent/day): A keeps
  // 236 x 90 = 21240 min (354 h), B keeps 21000 min (350 h).
  function eveningRun(home, awayPerAgent) {
    const agents = ["h1", "h2", "h3"].map((key) => ({ key, household: true }));
    const aways = [];
    agents.forEach(({ key }, ai) => {
      for (let day = 0; day < 30; day++) {
        const len = awayPerAgent[ai];
        aways.push({ id: `${home}-a${ai}d${day}`, agent: key, day,
          start_min: 1080, end_min: 1080 + len, kind: "outing" });
      }
    });
    return {
      meta: { home, days: 30 },
      agents,
      trips: [{ id: `${home}-t0`, agent: "h1", day: 0,
        depart_min: 600, arrive_min: 620 }],
      aways,
      decisions: [],
    };
  }
  it("ko names the metric; en reads Evenings at home", () => {
    const moments = pickMoments(eveningRun("A", [124, 124, 124]),
      eveningRun("B", [127, 127, 126]), { max: 3 });
    assert.equal(moments.length, 1, "only the evening gap qualifies");
    assert.equal(moments[0].kind, "gap");
    assert.equal(moments[0].text_ko, "저녁에 집에 있던 시간: A 354시간 · B 350시간");
    assert.equal(tr.translate(moments[0].text_ko), "Evenings at home: A 354 h · B 350 h");
  });
});

describe("29a6c US money cell", () => {
  it("splits $4,261/mo from its ZIP estimate source", async () => {
    const { splitMoneyNote } = await import("../src/ui/chat.jsx");
    const parts = splitMoneyNote("$4,261/mo (ZIP estimate)");
    assert.equal(parts.main, "$4,261/mo");
    assert.ok(parts.note.includes("ZIP estimate"), `note: ${parts.note}`);
    assert.ok(!parts.main.includes("mo("), "no joined mo(");
  });
  it("the source note renders as the small second line", () => {
    const css = read("../src/ui/ui.css");
    const at = css.indexOf(".ui-result-note {");
    assert.ok(at >= 0, "ui-result-note rule exists");
    assert.ok(css.slice(at, at + 200).includes("display: block"), "note is its own line");
  });
});

describe("29a6c USGS source", () => {
  it("en.js names the whole source; sources.js shortens the chip", async () => {
    const { phrases } = await import("../src/i18n/en.js");
    assert.equal(phrases["USGS The National Map (지도·항공사진, 퍼블릭 도메인)"],
      "USGS The National Map (map · aerial photo, public domain)");
    const { SOURCES } = await import("../src/sources.js");
    assert.equal(SOURCES.find((s) => s.id === "usgs").short, "USGS");
  });
});

describe("29a6c tray CTA", () => {
  it("uses the short live-in label", async () => {
    const { RUN_BUTTON_LABEL } = await import("../src/ui/chat.jsx");
    assert.equal(RUN_BUTTON_LABEL, "30일 살아 보기");
  });
});

describe("29a6e replay bar is not the chat layout", () => {
  it("ui.css targets the chat layout by class, never by bare first-child", () => {
    const css = read("../src/ui/ui.css");
    assert.ok(!css.includes(".ui-chat-thread > :first-child {"),
      "no bare .ui-chat-thread > :first-child rule");
    assert.ok(css.includes(".ui-chat-thread > .astryx-chat-layout {"),
      "chat layout targeted by class");
    assert.ok(!css.includes("ds-replay-bar"),
      "custom replay bar class gone from the stylesheet");
  });
  it("the replay notice is a Banner in flow, not a layout of its own", () => {
    const src = read("../src/ui/chat.jsx");
    assert.ok(!src.includes("ds-replay-bar"), "no custom replay bar in chat.jsx");
    assert.ok(src.includes("ui-replay-notice"), "notice rides an in-flow wrapper");
    const css = read("../src/ui/ui.css");
    const m = css.match(/\.ui-chat-thread\s*>\s*\.ui-replay-notice\s*\{[^}]*\}/);
    assert.ok(m, "wrapper rule present");
    assert.ok(m[0].includes("position: static"), "in flow, never over content");
    assert.ok(m[0].includes("var(--ds-s-16)"), "16 px gutters like the messages");
  });
  it("diary check line reads naturally in English", async () => {
    const { createTranslator } = await import("../src/i18n/translate.js");
    const { phrases, patterns } = await import("../src/i18n/en.js");
    const { WORDS } = await import("../src/i18n/en-words.js");
    const tr = createTranslator({ phrases, patterns, words: WORDS });
    assert.equal(
      tr.translate("✓ 문장 6개 모두 기록과 대조 · 1번 고쳐 씀 · 2줄은 근거가 없어 뺐어요"),
      "✓ All sentences checked against the record (6) · rewritten once · dropped 2 lines with no evidence");
  });
});
