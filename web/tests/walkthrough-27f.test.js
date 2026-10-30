// 27f: fixes from the first real-Muse walkthrough.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

import { createStore } from "../src/ui/store.js";
import { SYSTEM_PROMPT } from "../src/consult/agent.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const diarySrc = readFileSync(join(HERE, "..", "src", "consult", "diary.js"), "utf8");
const chatSrc = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");

describe("27f walkthrough fixes", () => {
  let turnBubble;
  let diaryFallbackLine;
  let scrollChatToEnd;

  before(async () => {
    ({ turnBubble, diaryFallbackLine, scrollChatToEnd } =
      await import("../src/ui/chat.jsx"));
  });

  it("store keeps pendingScene", () => {
    const store = createStore();
    store.set({ pendingScene: { type: "scene", panel: "tour" } });
    assert.equal(store.getState().pendingScene.panel, "tour");
  });

  it("turnBubble merges one bubble per turn", () => {
    const out = { reply: "최종",
      messages: [
        { role: "assistant", content: "찾아볼게요", tool_calls: [{ id: "a" }] },
        { role: "tool", content: "{}" },
        { role: "assistant", content: "중간", tool_calls: [{ id: "b" }] },
        { role: "assistant", content: "최종" },
      ] };
    const b = turnBubble(out);
    assert.equal(b.content, "최종");
    assert.deepEqual(b.tool_calls.map((c) => c.id), ["a", "b"]);
    const b2 = turnBubble({ messages: out.messages });
    assert.equal(b2.content, "최종");
  });

  it("diaryFallbackLine reports one-way minutes", () => {
    assert.equal(
      diaryFallbackLine({ A: 11.2, B: 12 }, { A: "가", B: "나" }),
      "다 살아 봤어요. A 가는 출근 편도 평균 11분, B 나는 12분이었어요. 일기는 이번에 못 썼어요.");
    assert.ok(diaryFallbackLine({ A: 11 }, { A: "가" }).includes("—"));
  });

  it("scrollChatToEnd is safe with no DOM", () => {
    assert.equal(scrollChatToEnd(undefined), false);
  });

  it("sources carry the 27f wording", () => {
    assert.ok(diarySrc.includes("maxTokens: 8000"));
    assert.ok(!diarySrc.includes("maxTokens: 2000"));
    assert.ok(!chatSrc.includes("지도 아래 ‘이 집들로 30일 살아 보기’를 눌러 주세요"));
    const prompt = String(SYSTEM_PROMPT);
    assert.ok(prompt.includes("답 끝에 한 번만"));
    assert.ok(prompt.includes("일기로 알려 드릴게요"));
  });
});
