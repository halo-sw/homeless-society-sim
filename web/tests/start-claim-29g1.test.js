import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fixStartClaim, runTurn, SYSTEM_PROMPT } from "../src/consult/agent.js";
import { isRunRequest } from "../src/chat/intent.js";
import { tinyArea, tinyScenario } from "./engine-fixture.js";

const START = "시작했어요. 다 살면 일기로 알려 드릴게요.";

describe("fixStartClaim 29g1", () => {
  it("claim + run request starts the run for real", () => {
    const out = fixStartClaim({
      text: START,
      userText: "두 집에서 살아 봐 줘",
      uiActions: [{ action: "pick", ids: ["a", "b"] }],
    });
    assert.equal(out.addRun, true);
    assert.equal(out.text, START);
  });

  it("claim with an existing run action stays unchanged", () => {
    const out = fixStartClaim({
      text: START,
      userText: "두 집에서 살아 봐 줘",
      uiActions: [{ action: "run" }],
    });
    assert.equal(out.addRun, false);
    assert.equal(out.text, START);
  });

  it("claim without a run request becomes a not-started correction", () => {
    const out = fixStartClaim({
      text: START,
      userText: "1번이랑 2번 찜해 줘",
      uiActions: [],
    });
    assert.equal(out.addRun, false);
    assert.ok(out.text.startsWith("아직 시작하지 않았어요"));
  });

  it("english claim + run request starts the run", () => {
    const out = fixStartClaim({
      text: "It's started — I'll share the diary once the month is done.",
      userText: "Live in both homes for a month",
      uiActions: [],
      isEnglish: true,
    });
    assert.equal(out.addRun, true);
  });

  it("english claim without a run request is corrected", () => {
    const out = fixStartClaim({
      text: "It's started — I'll share the diary once the month is done.",
      userText: "Pick 1 and 2",
      uiActions: [],
      isEnglish: true,
    });
    assert.equal(out.addRun, false);
    assert.ok(out.text.startsWith("It hasn't started yet"));
  });

  it("no claim passes through", () => {
    const out = fixStartClaim({
      text: "찜해 두었어요.",
      userText: "두 집에서 살아 봐 줘",
      uiActions: [],
    });
    assert.equal(out.addRun, false);
    assert.equal(out.text, "찜해 두었어요.");
  });
});

describe("isRunRequest 29g1", () => {
  it("detects run requests and ignores profile text", () => {
    assert.equal(isRunRequest("두 집에서 살아 봐 줘"), true);
    assert.equal(isRunRequest("강남 출근 전세 4억"), false);
  });
});

describe("runTurn start claim 29g1", () => {
  it("a bare start sentence with a run request gains a real run action", async () => {
    const completeFn = async () => ({
      message: { content: START, tool_calls: [] },
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    });
    const out = await runTurn({
      provider: "meta",
      messages: [{ role: "user", content: "두 집에서 살아 봐 줘" }],
      scenario: tinyScenario({ days: 2, background: 0 }),
      loadArea: async () => tinyArea(),
      completeFn,
    });
    assert.equal(out.ok, true);
    assert.ok(out.uiActions.some((a) => a && a.action === "run"));
    assert.ok(out.toolCalls.some((t) => t && t.name === "start_life_run"));
  });

  it("SYSTEM_PROMPT limits the start sentence to real run turns", () => {
    const joined = Array.isArray(SYSTEM_PROMPT)
      ? SYSTEM_PROMPT.join("\n")
      : String(SYSTEM_PROMPT);
    assert.match(joined, /실제로 호출한 턴에만/);
  });
});
