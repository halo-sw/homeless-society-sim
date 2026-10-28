// Criteria consult tools (stage 7, Part D): list_criteria,
// explain_criterion, and criterion overrides through update_scenario —
// exercised directly and through the agent loop with a fake provider.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { runTurn } from "../src/consult/agent.js";
import { createRunCache, createSession, callTool } from "../src/consult/tools.js";

function scenario() {
  return tinyScenario({
    days: 2, background: 0, seed: 7,
    homes: [
      { label: "A", area: "pangyo", complex_name: "알파" },
      { label: "B", area: "pangyo", complex_name: "베타" },
    ],
  });
}

function session(over = {}) {
  return createSession({ scenario: scenario(), loadArea: async () => tinyArea(), ...over });
}

function scripted(steps) {
  let n = 0;
  return async () => steps[Math.min(n++, steps.length - 1)]();
}

const textReply = (content) => async () => ({
  message: { content, tool_calls: [] }, finish: "stop",
  usage: { prompt_tokens: 10, completion_tokens: 5 },
  latency_ms: 1, provider: "meta", model: "muse-spark-1.3",
});

const toolReply = (calls) => async () => ({
  message: { content: "", tool_calls: calls }, finish: "tool_calls",
  usage: { prompt_tokens: 10, completion_tokens: 5 },
  latency_ms: 1, provider: "meta", model: "muse-spark-1.3",
});

describe("criteria consult tools", () => {
  it("list_criteria lists all, or one group", async () => {
    const all = await callTool(session(), "list_criteria", {});
    assert.equal(all.ok, true);
    assert.ok(all.count >= 20);
    assert.ok(all.criteria.some((c) => c.id === "C-shop-dwell"));
    const move = await callTool(session(), "list_criteria", { group: "move" });
    assert.equal(move.ok, true);
    assert.ok(move.criteria.length > 0);
    assert.ok(move.criteria.every((c) => c.group === "move"));
    const bad = await callTool(session(), "list_criteria", { group: "nope" });
    assert.equal(bad.ok, false);
  });

  it("explain_criterion shows the rule, values and change path", async () => {
    const r = await callTool(session(), "explain_criterion", { id: "C-shop-dwell" });
    assert.equal(r.ok, true);
    assert.equal(r.title, "장보기 머무는 시간");
    assert.ok(r.rule.includes("15분"));
    assert.deepEqual(r.values.dwell_min, { value: 15, unit: "분", overridable: true });
    assert.equal(r.source, "engine 기본값");
    assert.equal(r.overridden, false);
    assert.equal(r.editable, true);
    assert.ok(r.how_to_change.includes("update_scenario"));
    const fixed = await callTool(session(), "explain_criterion", { id: "C-decide-kinds" });
    assert.equal(fixed.editable, false);
    const bad = await callTool(session(), "explain_criterion", { id: "C-nope" });
    assert.equal(bad.ok, false);
  });

  it("update_scenario accepts criterion overrides and re-runs use them", async () => {
    const s = session();
    const u = await callTool(s, "update_scenario", {
      criteria_overrides: { "C-shop-dwell": { dwell_min: 45 } },
    });
    assert.deepEqual(Object.keys(u), ["ok", "scenario", "warnings"]);
    assert.equal(u.ok, true);
    assert.deepEqual(s.scenario.criteria_overrides, { "C-shop-dwell": { dwell_min: 45 } });
    const ex = await callTool(s, "explain_criterion", { id: "C-shop-dwell" });
    assert.equal(ex.values.dwell_min.value, 45);
    assert.equal(ex.source, "고객 입력");
    assert.equal(ex.overridden, true);
    const run = await callTool(s, "run_simulation", { home: "A" });
    assert.equal(run.ok, true);
    const day = await callTool(s, "get_day", { run: run.run_ids.A, day: 1, member: "h1" });
    assert.equal(day.ok, true);
    const errands = day.aways.filter((a) => a.kind === "errand");
    if (errands.length > 0) {
      for (const e of errands) {
        const mins = (h) => Number(h.start.slice(0, 2)) * 60 + Number(h.start.slice(3));
        const end = Number(e.end.slice(0, 2)) * 60 + Number(e.end.slice(3));
        assert.equal(end - mins(e), 45);
      }
    }
    assert.ok(day.trips.every((t) => t.cause && t.cause.text));
  });

  it("update_scenario rejects bad criterion overrides", async () => {
    const s = session();
    const badId = await callTool(s, "update_scenario", {
      criteria_overrides: { "C-nope": { dwell_min: 1 } },
    });
    assert.equal(badId.ok, false);
    const fixed = await callTool(s, "update_scenario", {
      criteria_overrides: { "C-weekend-plan": { max_activities: 5 } },
    });
    assert.equal(fixed.ok, false);
    assert.deepEqual(s.scenario.criteria_overrides || {}, {});
  });

  it("the agent cites criterion ids with a fake provider", async () => {
    const complete = scripted([
      toolReply([{ id: "c1", name: "list_criteria", args: { group: "daily" } }]),
      toolReply([{ id: "c2", name: "explain_criterion", args: { id: "C-shop-dwell" } }]),
      textReply("장보기는 가게에서 15분 머뭅니다 (C-shop-dwell, engine 기본값). 바꾸려면 말씀해 주세요."),
    ]);
    const out = await runTurn({
      provider: "meta",
      messages: [{ role: "user", content: "장보기 시간 기준이 뭐야?" }],
      scenario: scenario(), cache: createRunCache(),
      loadArea: async () => tinyArea(),
      completeFn: complete,
    });
    assert.equal(out.ok, true);
    assert.equal(out.fallback, false);
    assert.equal(out.toolCalls.length, 2);
    assert.ok(out.reply.includes("C-shop-dwell"));
  });
});
