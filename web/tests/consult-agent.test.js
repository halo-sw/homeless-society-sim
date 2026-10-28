import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyRegion, tinyScenario } from "./engine-fixture.js";
import { runTurn, countMuseRuns } from "../src/consult/agent.js";
import { createRunCache } from "../src/consult/tools.js";
import { simulate } from "../src/engine/simulate.js";

function scenario() {
  return tinyScenario({
    days: 2, background: 0, seed: 7,
    homes: [
      { label: "A", area: "pangyo", complex_name: "알파" },
      { label: "B", area: "pangyo", complex_name: "베타" },
    ],
  });
}

const baseOpts = () => ({
  provider: "meta",
  scenario: scenario(),
  cache: createRunCache(),
  loadArea: async () => tinyArea(),
});

// Scripted fake provider: steps are functions(history) -> provider result.
// Tool results are the JSON the agent appends as {role:"tool"} messages.
function scripted(steps) {
  let n = 0;
  const calls = [];
  const fn = async ({ messages }) => {
    calls.push(messages.length);
    const step = steps[Math.min(n++, steps.length - 1)];
    return step(messages);
  };
  fn.calls = calls;
  return fn;
}

function toolResult(history, id) {
  const msg = history.filter((m) => m.role === "tool").at(-1);
  assert.ok(msg, `tool result for ${id}`);
  return JSON.parse(msg.content);
}

function textReply(content) {
  return async () => ({
    message: { content, tool_calls: [] }, finish: "stop",
    usage: { prompt_tokens: 10, completion_tokens: 5 },
    latency_ms: 1, provider: "meta", model: "muse-spark-1.3",
  });
}

function toolReply(calls) {
  return async () => ({
    message: { content: "", tool_calls: calls }, finish: "tool_calls",
    usage: { prompt_tokens: 10, completion_tokens: 5 },
    latency_ms: 1, provider: "meta", model: "muse-spark-1.3",
  });
}

describe("consult agent loop", () => {
  it("runs setup -> run with a fake provider, citing tool numbers", async () => {
    const complete = scripted([
      toolReply([{ id: "c1", name: "get_scenario", args: {} }]),
      toolReply([{ id: "c2", name: "update_scenario",
        args: { members: [{ id: "m1", park_walks_per_week: 3 }] } }]),
      toolReply([{ id: "c3", name: "run_simulation", args: { home: "both" } }]),
      async (history) => {
        const r = toolResult(history, "c3");
        assert.equal(r.ok, true);
        const walk = r.compare.metrics.find((m) => m.key === "walk_minutes");
        return textReply(`A ${walk.a}분 · B ${walk.b}분, 차이 ${walk.delta_b_minus_a}분입니다`)();
      },
    ]);
    const out = await runTurn({ ...baseOpts(),
      messages: [{ role: "user", content: "성인 둘이 살아. 실행해줘" }],
      completeFn: complete });
    assert.equal(out.ok, true);
    assert.equal(out.fallback, false);
    assert.equal(out.toolCalls.length, 3);
    assert.deepEqual(out.toolCalls.map((t) => t.name),
      ["get_scenario", "update_scenario", "run_simulation"]);
    assert.ok(out.toolCalls.every((t) => t.ok));
    assert.equal(out.scenario.household.members[0].park_walks_per_week, 3);
    assert.equal(out.usage.calls, 4);
    assert.equal(out.usage.prompt_tokens, 40);
    assert.ok(out.usage.est_usd > 0);
    assert.equal(out.provider, "meta");
    assert.match(out.reply, /분입니다/);
    // Browser-kept history: user + assistant/tool rounds + final text.
    assert.ok(out.messages.length >= 5);
  });

  it("answers journey + fatigue with a fake provider, citing sources", async () => {
    const scen = scenario();
    scen.household.members[0].work.destination_station = "직장역";
    let journey = null;
    const complete = scripted([
      toolReply([{ id: "c1", name: "run_simulation", args: { home: "A" } }]),
      async (history) => {
        const r = toolResult(history, "c1");
        return toolReply([{ id: "c2", name: "get_journey",
          args: { run: r.run_ids.A, day: 1, member: "h1" } }])(history);
      },
      async (history) => {
        journey = toolResult(history, "c2");
        return toolReply([{ id: "c3", name: "get_fatigue",
          args: { run: journey.run, member: "h1", day: 1 } }])(history);
      },
      async (history) => {
        const f = toolResult(history, "c3");
        assert.equal(journey.rides[0].out.legs.length, 2);
        assert.ok(Number.isFinite(f.summary_30d.avg_30d));
        return textReply(
          `출근 ${journey.rides[0].out.legs[0].line} ${journey.rides[0].out.minutes_total}분` +
          `(혼잡도 ${journey.rides[0].out.legs[0].congestion_source}), ` +
          `피로도 평균 ${f.summary_30d.avg_30d}(C-fatigue-load, 가정 모델이며 건강·의학적 판단이 아닙니다).`)();
      },
    ]);
    const out = await runTurn({ ...baseOpts(), scenario: scen,
      loadRegion: async () => tinyRegion(),
      messages: [{ role: "user", content: "출근길이랑 피로도 알려줘" }],
      completeFn: complete });
    assert.equal(out.ok, true);
    assert.equal(out.fallback, false);
    assert.deepEqual(out.toolCalls.map((t) => t.name),
      ["run_simulation", "get_journey", "get_fatigue"]);
    assert.match(out.reply, /가정 모델이며 건강·의학적 판단이 아닙니다/);
  });

  it("does what-if: patch a copy, re-run, report before/after", async () => {
    const cache = createRunCache();
    const opts = { ...baseOpts(), cache };
    const first = scripted([
      toolReply([{ id: "c1", name: "run_simulation", args: { home: "both" } }]),
      async (history) => {
        const r = toolResult(history, "c1");
        const walk = r.compare.metrics.find((m) => m.key === "walk_minutes");
        return textReply(`기준 결과는 A ${walk.a}분, B ${walk.b}분이다`)();
      },
    ]);
    const t1 = await runTurn({ ...opts,
      messages: [{ role: "user", content: "실행해줘" }], completeFn: first });
    assert.equal(t1.fallback, false);
    const before = t1.toolCalls.length;
    assert.equal(before, 1);
    const history = [{ role: "user", content: "실행해줘" }, ...t1.messages];
    const runIds = t1.messages
      .filter((m) => m.role === "tool").map((m) => JSON.parse(m.content).run_ids);

    const second = scripted([
      toolReply([{ id: "c2", name: "update_scenario",
        args: { members: [{ id: "m1", park_walks_per_week: 0 }] } }]),
      toolReply([{ id: "c3", name: "run_simulation", args: { home: "both" } }]),
      async (history2) => {
        const r = toolResult(history2, "c3");
        return toolReply([{ id: "c4", name: "compare",
          args: { run_a: runIds[0].A, run_b: r.run_ids.A } }])();
      },
      async (history2) => {
        const r = toolResult(history2, "c4");
        const walk = r.compare.metrics.find((m) => m.key === "walk_minutes");
        return textReply(`전 ${walk.a}분에서 후 ${walk.b}분으로, 차이 ${walk.delta_b_minus_a}분이다`)();
      },
    ]);
    const t2 = await runTurn({ ...opts, scenario: t1.scenario,
      messages: [...history, { role: "user", content: "산책을 빼면 어떻게 돼?" }],
      completeFn: second });
    assert.equal(t2.fallback, false);
    assert.equal(t2.toolCalls.length, 3);
    assert.match(t2.reply, /차이/);
  });

  it("passes set_view through to the browser", async () => {
    const complete = scripted([
      toolReply([{ id: "c1", name: "set_view",
        args: { home: "B", day: 2, time: "08:18" } }]),
      textReply("화면을 옮겼다"),
    ]);
    const out = await runTurn({ ...baseOpts(),
      messages: [{ role: "user", content: "B 보여줘" }], completeFn: complete });
    assert.deepEqual(out.view, { home: "B", day: 2, time: "08:18", chip: "화면 이동: B · 2일차 08:18" });
  });

  it("retries once on guard failure, then answers numbers-only", async () => {
    const bad = scripted([
      toolReply([{ id: "c1", name: "run_simulation", args: { home: "A" } }]),
      textReply("도보 99999분입니다"),
      textReply("도보 시간은 도구 결과를 확인하세요"),
    ]);
    const once = await runTurn({ ...baseOpts(),
      messages: [{ role: "user", content: "실행해줘" }], completeFn: bad });
    assert.equal(once.fallback, false);
    assert.equal(once.reply, "도보 시간은 도구 결과를 확인하세요");

    const worse = scripted([
      toolReply([{ id: "c1", name: "run_simulation", args: { home: "A" } }]),
      textReply("도보 99999분입니다"),
      textReply("아무튼 88888분입니다"),
    ]);
    const twice = await runTurn({ ...baseOpts(),
      messages: [{ role: "user", content: "실행해줘" }], completeFn: worse });
    assert.equal(twice.fallback, true);
    assert.match(twice.reply, /도구 결과의 수치만/);
  });

  it("caps muse runs at one per conversation (stateless history scan)", async () => {
    const judgeHome = async ({ area, scenarioRaw, homeLabel }) => ({
      run: simulate(area, scenarioRaw, homeLabel),
      usage: { calls: 1, prompt_tokens: 10, completion_tokens: 5 },
    });
    const t1 = await runTurn({ ...baseOpts(), judgeHome,
      messages: [{ role: "user", content: "Muse로 실행해줘" }],
      completeFn: scripted([
        toolReply([{ id: "c1", name: "run_simulation",
          args: { home: "A", decisions: "muse" } }]),
        textReply("라이브 판단으로 실행했다"),
      ]) });
    assert.equal(t1.toolCalls[0].ok, true);
    const history = [{ role: "user", content: "Muse로 실행해줘" }, ...t1.messages];
    assert.equal(countMuseRuns(history), 1);
    assert.equal(countMuseRuns([{ role: "user", content: "hi" }]), 0);
    const t2 = await runTurn({ ...baseOpts(), judgeHome,
      messages: [...history, { role: "user", content: "한 번 더 Muse로" }],
      completeFn: scripted([
        toolReply([{ id: "c2", name: "run_simulation",
          args: { home: "B", decisions: "muse" } }]),
        textReply("추가 실행은 규칙으로만 가능하다"),
      ]) });
    assert.equal(t2.toolCalls[0].ok, false);
    assert.match(t2.toolCalls[0].summary, /capped at 1/);
  });

  it("stops after six tool rounds with the numbers so far", async () => {
    const loop = scripted([
      async () => toolReply([{ id: `c${Math.random()}`, name: "list_areas", args: {} }])(),
    ]);
    const out = await runTurn({ ...baseOpts(),
      messages: [{ role: "user", content: "계속 조회해" }], completeFn: loop });
    assert.equal(out.fallback, true);
    assert.match(out.reply, /6라운드/);
    assert.ok(out.toolCalls.length <= 7);
  });
});
