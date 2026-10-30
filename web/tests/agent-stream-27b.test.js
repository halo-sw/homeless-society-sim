// Stage 27b1: live tool events, panel/pick/run tools, next-step replies.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { runTurn, splitSuggestions } from "../src/consult/agent.js";
import { callTool, createRunCache, createSession } from "../src/consult/tools.js";
import { ndjsonLine } from "../src/consult/server.js";

const usage = { prompt_tokens: 10, completion_tokens: 5 };

function session() {
  return createSession({
    scenario: tinyScenario({ days: 2, background: 0 }),
    cache: createRunCache(),
    loadArea: async () => tinyArea(),
  });
}

function textReply(content) {
  return async () => ({
    message: { content, tool_calls: [] }, finish: "stop", usage,
  });
}

function toolReply(calls) {
  return async () => ({
    message: { content: "", tool_calls: calls }, finish: "tool_calls", usage,
  });
}

function scripted(steps) {
  let n = 0;
  return async (args) => steps[Math.min(n++, steps.length - 1)](args);
}

describe("27b1 live tool events and ui actions", () => {
  it("emits tool_start/tool_end, collects uiActions and suggestions", async () => {
    const events = [];
    const completeFn = scripted([
      toolReply([{ id: "c1", name: "open_panel", args: { panel: "map" } }]),
      // NOTE: number-free reply — a digit here (e.g. "41곳이에요.")
      // trips the existing invented-number guard because open_panel
      // results cite no numbers, sending the turn down the retry path.
      textReply("지도를 열었어요.\n[[다음: 비교해 줘 | 살아 봐 줘]]"),
    ]);
    const out = await runTurn({
      provider: "meta",
      messages: [{ role: "user", content: "후보 지도 보여 줘" }],
      scenario: tinyScenario({ days: 2, background: 0 }),
      loadArea: async () => tinyArea(),
      completeFn,
      onEvent: (ev) => events.push(ev),
    });
    assert.deepEqual(events.map((e) => e.type), ["tool_start", "tool_end"]);
    assert.equal(events[0].name, "open_panel");
    assert.equal(events[1].name, "open_panel");
    assert.equal(events[1].ok, true);
    assert.deepEqual(out.uiActions, [{ action: "panel", panel: "map" }]);
    assert.deepEqual(out.suggestions, ["비교해 줘", "살아 봐 줘"]);
    const lastAssistant = out.messages.filter((m) => m.role === "assistant").at(-1);
    assert.equal(lastAssistant.content, "지도를 열었어요.");
  });

  it("open_panel rejects an unknown panel with no ui action", async () => {
    const r = await callTool(session(), "open_panel", { panel: "kitchen" });
    assert.equal(r.ok, false);
    assert.equal(r.ui, undefined);
  });

  it("pick_homes takes 1-3 ids", async () => {
    const bad = await callTool(session(), "pick_homes",
      { candidate_ids: ["a", "b", "c", "d"] });
    assert.equal(bad.ok, false);
    assert.equal(bad.ui, undefined);
    const good = await callTool(session(), "pick_homes",
      { candidate_ids: ["a", "b"] });
    assert.equal(good.ok, true);
    assert.equal(good.ui.action, "pick");
    assert.deepEqual(good.ui.ids, ["a", "b"]);
  });

  it("splitSuggestions splits ko/en markers and cuts long items", () => {
    assert.deepEqual(splitSuggestions("안녕하세요"),
      { text: "안녕하세요", suggestions: [] });
    assert.deepEqual(splitSuggestions("본문입니다.\n[[Next: Compare | Run it]]"),
      { text: "본문입니다.", suggestions: ["Compare", "Run it"] });
    const long = `본문\n[[다음: ${"가".repeat(30)}]]`;
    const cut = splitSuggestions(long);
    assert.equal(cut.text, "본문");
    assert.equal(cut.suggestions.length, 1);
    assert.equal(cut.suggestions[0].length, 20);
  });

  it("a throwing onEvent does not break runTurn", async () => {
    const completeFn = scripted([
      toolReply([{ id: "c1", name: "start_life_run", args: {} }]),
      textReply("살아 보기를 시작할게요."),
    ]);
    const out = await runTurn({
      provider: "meta",
      messages: [{ role: "user", content: "살아 봐 줘" }],
      scenario: tinyScenario({ days: 2, background: 0 }),
      loadArea: async () => tinyArea(),
      completeFn,
      onEvent: () => { throw new Error("listener boom"); },
    });
    assert.equal(out.ok, true);
    assert.deepEqual(out.uiActions, [{ action: "run" }]);
  });

  it("ndjsonLine is one JSON object per line", () => {
    const ev = { type: "tool_start", name: "open_panel" };
    assert.equal(ndjsonLine(ev), `${JSON.stringify(ev)}\n`);
  });
});
