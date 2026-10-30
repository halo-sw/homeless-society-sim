// 26u: English mode catches a Korean reply and asks once more in English.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { runTurn } from "../src/consult/agent.js";
import { isMostlyKorean } from "../src/consult/guards.js";

const KO = "말씀하신 후보를 찜했습니다. 비교나 출근길, 살아 보기를 원하시면 말씀해 주세요.";
const EN = "Saved A Cheonsa and B Sigma. Tell me if you want a comparison, a commute view, or a life run.";

function textReply(content) {
  return async () => ({
    message: { content, tool_calls: [] }, finish: "stop",
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
}

function scripted(replies) {
  let calls = 0;
  const fn = async (args) => {
    calls++;
    const next = replies[Math.min(calls - 1, replies.length - 1)];
    return next(args);
  };
  fn.calls = () => calls;
  return fn;
}

function baseTurn(completeFn, context) {
  return {
    provider: "meta",
    messages: [{ role: "user", content: "Save numbers 1 and 3" }],
    scenario: tinyScenario({ days: 2, background: 0 }),
    loadArea: async () => tinyArea(),
    context,
    completeFn,
  };
}

describe("26u english drift", () => {
  it("isMostlyKorean flags a Korean sentence", () => {
    assert.equal(isMostlyKorean("말씀하신 후보를 찜했습니다."), true);
  });

  it("isMostlyKorean ignores parenthesised Korean names", () => {
    assert.equal(
      isMostlyKorean("Saved A Cheonsa (천사의도시II오피스텔) and B Sigma 3."),
      false);
  });

  it("isMostlyKorean is false for empty text", () => {
    assert.equal(isMostlyKorean(""), false);
  });

  it("a Korean final answer is retried once in English", async () => {
    const complete = scripted([textReply(KO), textReply(EN)]);
    const out = await runTurn(baseTurn(complete, { lang: "en" }));
    assert.equal(out.ok, true);
    assert.equal(out.reply, EN);
    assert.equal(complete.calls(), 2);
  });

  it("an English final answer needs no retry", async () => {
    const complete = scripted([textReply(EN)]);
    const out = await runTurn(baseTurn(complete, { lang: "en" }));
    assert.equal(out.ok, true);
    assert.equal(out.reply, EN);
    assert.equal(complete.calls(), 1);
  });

  it("korean mode never retries a Korean answer", async () => {
    const complete = scripted([textReply(KO), textReply(EN)]);
    const out = await runTurn(baseTurn(complete, { lang: "ko" }));
    assert.equal(out.ok, true);
    assert.equal(out.reply, KO);
    assert.equal(complete.calls(), 1);
  });

  it("a still-Korean retry is kept but left translatable", async () => {
    const complete = scripted([textReply(KO), textReply(KO)]);
    const out = await runTurn(baseTurn(complete, { lang: "en" }));
    assert.equal(out.ok, true);
    assert.equal(out.reply, KO);
    assert.equal(complete.calls(), 2);
    // 26s fromModel clears on fallback, so the UI skips data-no-i18n
    // and the phrase layer translates what it can.
    assert.equal(out.fallback, true);
  });
});
