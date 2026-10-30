// 29a6: judge path — recorded replay, three entries, fallback link.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");

describe("29a6 judge path", () => {
  let validateRecording;
  let replaySchedule;
  let routeForSearch;
  let parseChatSearch;
  let React;
  let renderToStaticMarkup;
  let LandingPage;

  before(async () => {
    ({ validateRecording, replaySchedule } = await import("../src/chat/recording.js"));
    ({ routeForSearch, parseChatSearch } = await import("../src/chat/urls.js"));
    React = (await import("react")).default;
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ LandingPage } = await import("../src/ui/landing-page.jsx"));
  });

  it("validates the recording fixture", async () => {
    const fixture = JSON.parse(read("./fixtures/recording-mini.json"));
    assert.equal(validateRecording(fixture).ok, true);
    assert.equal(validateRecording({ ...fixture, messages: [] }).ok, false);
    assert.equal(validateRecording({ ...fixture, meta: { model: "x" } }).ok, false);
  });

  it("schedules user/text/cards delays", () => {
    const delays = replaySchedule([
      { role: "user", kind: "text" },
      { role: "assistant", kind: "text" },
      { role: "assistant", kind: "candidates" },
    ]).map((s) => s.delayMs);
    assert.deepEqual(delays, [700, 1200, 1600]);
  });

  it("routes ?replay= to chat and parses the id", () => {
    assert.equal(routeForSearch("?replay=menlo-month"), "chat");
    assert.equal(parseChatSearch("?replay=menlo-month").replay, "menlo-month");
  });

  it("landing shows the three entries (ko SSR, en translator)", async () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    for (const s of ["기록된 한 달 보기", "Meta 본사 출근으로 해 보기", "서울로 해 보기"]) {
      assert.ok(html.includes(s), s);
    }
    assert.ok(html.includes("replay="), "replay link in SSR");
    const { createTranslator } = await import("../src/i18n/translate.js");
    const { phrases, patterns } = await import("../src/i18n/en.js");
    const { WORDS } = await import("../src/i18n/en-words.js");
    const tr = createTranslator({ phrases, patterns, words: WORDS });
    assert.equal(tr.translate("기록된 한 달 보기"), "Watch a recorded month");
    assert.equal(tr.translate("Meta 본사 출근으로 해 보기"), "I work at Meta HQ");
    assert.equal(tr.translate("서울로 해 보기"), "Try Seoul");
  });

  it("chat replay never calls the consult client; banner + en.js exist", () => {
    const src = read("../src/ui/chat.jsx");
    const sendBody = src.slice(src.indexOf("async function send(text)"), src.indexOf("async function send(text)") + 600);
    assert.ok(sendBody.includes("replay"), "send gates replay");
    assert.ok(sendBody.includes("consult"), "send names the consult client");
    assert.ok(sendBody.indexOf("replay") < sendBody.indexOf("consult"), "replay checked before consult");
    const branch = src.slice(src.indexOf("29a6: ?replay"), src.indexOf("const mem = loadTranscript()"));
    assert.ok(branch.length > 100, "replay branch exists");
    assert.ok(!branch.includes("postConsult") && !branch.includes("/api/consult"), "no consult call in replay branch");
    for (const s of ["기록된 대화 ·", "실제 답변 · 키 없이 재생", "건너뛰기", "직접 해 보기",
      "기록을 불러오지 못했어요 · 직접 해 보기",
      "오늘 Muse 사용 한도에 닿았어요. 기록된 대화로 보시거나 내일 다시 와 주세요.",
      "기록된 대화 보기"]) {
      assert.ok(src.includes(s), s);
    }
    const en = read("../src/i18n/en.js");
    for (const s of ["Watch a recorded month", "I work at Meta HQ", "Try Seoul"]) {
      assert.ok(en.includes(s), s);
    }
  });
});
