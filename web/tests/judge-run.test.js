import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canon } from "../src/engine/canonical.js";
import { makeDecider } from "../src/engine/decisions.js";
import { simulate } from "../src/engine/simulate.js";
import { costUsd, decisionsFile, emptyUsage, entryToAnswer, judgeHome, judgeSingle, planCalls } from "../src/judge/run.js";
import { buildPrompt, estimateTokens } from "../src/judge/context.js";
import { tinyArea, tinyScenario } from "./engine-fixture.js";

const householdShells = (run) => run.decisions.filter((d) => d.agent === "h1" || d.agent === "h2");

// Fake judge: always the rule choice, stamped as a model decision.
function ruleStampedModel(calls) {
  return async ({ prompt, shell }) => {
    calls.push(shell.id);
    assert.ok(prompt.system.length > 50 && prompt.user.length > 50);
    const weekend = shell.kind === "weekend_plan";
    return {
      ...(weekend ? { chosen_key: shell.default_key, plan: [shell.default_key] } : { chosen_key: shell.default_key }),
      chosen_by: "model",
      reason_ko: "테스트 이유", reason_en: "Test reason",
      provider: "meta", model: "muse-spark-1.3",
      usage: { prompt_tokens: 100, completion_tokens: 20 }, latency_ms: 5,
    };
  };
}

describe("judge run", () => {
  it("judges household shells only, sequentially per member", async () => {
    const calls = [];
    const judged = await judgeHome({
      area: tinyArea(), scenarioRaw: tinyScenario(), homeLabel: "A",
      provider: "meta", judgeOne: ruleStampedModel(calls),
    });
    const hh = householdShells(judged.run);
    assert.equal(calls.length, hh.length);
    assert.ok(calls.length > 10);
    // Member order: every h1 call precedes every h2 call.
    const agents = calls.map((id) => id.split(":")[0]);
    assert.ok(agents.includes("h1") && agents.includes("h2"));
    assert.ok(Math.max(...agents.map((a, i) => (a === "h1" ? i : -1)))
      < Math.min(...agents.map((a, i) => (a === "h2" ? i : Infinity))));
    // Each member in day/minute order.
    for (const agent of ["h1", "h2"]) {
      const mine = judged.run.decisions.filter((d) => d.agent === agent);
      const order = mine.map((d) => d.day * 10000 + d.minute);
      assert.deepEqual([...order].sort((a, b) => a - b), order);
    }
    // Provenance: household model, background rule.
    assert.ok(hh.every((d) => d.chosen_by === "model"));
    assert.ok(judged.run.decisions.filter((d) => !d.agent.startsWith("h")).every((d) => d.chosen_by === "rule"));
    assert.equal(judged.usage.by_kind.weekend_plan, 4); // 2 members × Sat/Sun
  });

  it("replays with zero provider calls, byte-identical", async () => {
    const judged = await judgeHome({
      area: tinyArea(), scenarioRaw: tinyScenario(), homeLabel: "A",
      provider: "meta", judgeOne: ruleStampedModel([]),
    });
    let hookCalls = 0;
    const replayed = simulate(tinyArea(), tinyScenario(), "A", {
      decisions: judged.decisions,
      decide: () => {
        hookCalls++;
        return "s0";
      },
    });
    assert.equal(hookCalls, 0);
    assert.equal(canon(replayed), canon(judged.run));
    // The decisions file carries every choice the replay needs.
    const file = decisionsFile({
      scenarioName: "tiny", homeLabel: "A", provider: "meta",
      decisions: judged.decisions, usage: judged.usage,
    });
    const replayed2 = simulate(tinyArea(), tinyScenario(), "A", {
      decisions: JSON.parse(JSON.stringify(file)),
    });
    assert.equal(canon(replayed2), canon(judged.run));
    assert.equal(file.meta.model, "muse-spark-1.3");
  });

  it("leans on background-0 runs without changing household shells", () => {
    const full = simulate(tinyArea(), tinyScenario(), "A");
    const lean = tinyScenario();
    lean.background = 0;
    const slim = simulate(tinyArea(), lean, "A");
    const ids = (run) => householdShells(run).map((d) => d.id);
    assert.deepEqual(ids(slim), ids(full));
    assert.deepEqual(
      householdShells(slim).map((d) => d.default_key),
      householdShells(full).map((d) => d.default_key),
    );
  });

  it("falls back to the rule on bad model output, keeping the usage", async () => {
    const script = [
      '{"chosen_key":"nope","reason_ko":"r","reason_en":"r"}', // bad key
      '{"chosen_key":"s0","reason_ko":"7분 거리","reason_en":"r"}', // invented number
      '{"chosen_key":"s0","reason_ko":"가격이 저렴","reason_en":"r"}', // forbidden topic
    ];
    let n = 0;
    const fetchImpl = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: script[n++] } }],
        usage: { prompt_tokens: 50, completion_tokens: 10 },
      }),
    });
    const shell = {
      id: "h1:d0:0600:shop_choice:00", agent: "h1", day: 0, minute: 600,
      kind: "shop_choice", default_key: "s0",
      options: [
        { key: "s0", label: "슈퍼1", minutes: 3.2, distance_m: 251 },
        { key: "s1", label: "슈퍼2", minutes: 5.1, distance_m: 402.5 },
      ],
    };
    const ctx = {
      member: { role: "adult", preferences: "" }, agentLabel: "구성원 1",
      date: "2026-11-02", weekday: "Mon", minute: 600, tripsToday: [], memory: [], shell,
    };
    const prompt = buildPrompt(ctx);
    const wantRejected = {
      bad_key: { chosen_key: "nope", reason_ko: "r", reason_en: "r", offending: ["nope"] },
      invented_number: { chosen_key: "s0", reason_ko: "7분 거리", reason_en: "r", offending: ["7"] },
      forbidden_topic: { chosen_key: "s0", reason_ko: "가격이 저렴", reason_en: "r", offending: ["가격"] },
    };
    for (const cause of ["bad_key", "invented_number", "forbidden_topic"]) {
      const usage = emptyUsage();
      const entry = await judgeSingle({ provider: "meta", prompt, shell, ctx, usage, fetchImpl, providerOpts: { apiKey: "test-key" } });
      assert.equal(entry.chosen_by, "rule_fallback");
      assert.equal(entry.chosen_key, "s0");
      assert.equal(entry.fallback_cause, cause);
      assert.deepEqual(entry.rejected, wantRejected[cause]);
      assert.ok(entry.reason_ko.length > 0);
      assert.deepEqual(entry.usage, { prompt_tokens: 50, completion_tokens: 10 });
      assert.equal(usage.fallbacks, 1);
      assert.equal(usage.calls, 1);
    }
  });

  it("round-trips rejected through the decider and replay", () => {
    const shell = {
      agent: "h1", day: 0, minute: 600, kind: "shop_choice",
      options: [
        { key: "s0", label: "슈퍼1", minutes: 3.2, distance_m: 251 },
        { key: "s1", label: "슈퍼2", minutes: 5.1, distance_m: 402.5 },
      ],
      default_key: "s0",
    };
    const entry = {
      chosen_key: "s0", chosen_by: "rule_fallback",
      reason_ko: "가장 가까운 곳으로 결정", reason_en: "Chose the nearest option",
      fallback_cause: "invented_number",
      rejected: { chosen_key: "s0", reason_ko: "7분 거리", reason_en: "r", offending: ["7"] },
    };
    assert.deepEqual(entryToAnswer(entry).rejected, entry.rejected);
    const rec = makeDecider({ decide: () => entryToAnswer(entry) }).resolve(shell, 0);
    assert.deepEqual(rec.rejected, entry.rejected);
    const rec2 = makeDecider({ decisions: [rec] }).resolve(shell, 0);
    assert.equal(canon(rec2), canon(rec));
    assert.throws(
      () => makeDecider({ decide: () => ({ chosen_key: "s0", rejected: { offending: [7] } }) }).resolve(shell, 0),
      /rejected\.offending wants an array of strings/,
    );
  });

  it("falls back without usage when the provider fails", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, text: async () => "boom" });
    const shell = {
      id: "h1:d5:0600:weekend_plan:00", agent: "h1", day: 5, minute: 600,
      kind: "weekend_plan", default_key: "park",
      options: [
        { key: "park", label: "공원", minutes: 4.4, distance_m: 345 },
        { key: "home", label: "집에서 휴식", minutes: 0, distance_m: 0 },
      ],
    };
    const prompt = buildPrompt({
      member: { role: "adult", preferences: "" }, agentLabel: "구성원 1",
      date: "2026-11-07", weekday: "Sat", minute: 600, tripsToday: [], memory: [], shell,
    });
    const usage = emptyUsage();
    const entry = await judgeSingle({
      provider: "meta", prompt, shell, usage, fetchImpl, providerOpts: { retries: 0, apiKey: "test-key" },
    });
    assert.equal(entry.chosen_by, "rule_fallback");
    assert.equal(entry.chosen_key, "park");
    assert.deepEqual(entry.plan, ["park"]);
    assert.equal(entry.fallback_cause, "provider_error");
    assert.equal(entry.provider, undefined);
    assert.equal(entry.rejected, undefined); // nothing parsed, nothing stored
    assert.equal(usage.errors, 1);
  });

  it("falls back as truncated with usage when the budget cuts the reply", async () => {
    const fetchImpl = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: null }, finish_reason: "length" }],
        usage: {
          prompt_tokens: 200, completion_tokens: 400,
          completion_tokens_details: { reasoning_tokens: 398 },
        },
      }),
    });
    const shell = {
      id: "h1:d0:0600:shop_choice:00", agent: "h1", day: 0, minute: 600,
      kind: "shop_choice", default_key: "s0",
      options: [
        { key: "s0", label: "슈퍼1", minutes: 3.2, distance_m: 251 },
        { key: "s1", label: "슈퍼2", minutes: 5.1, distance_m: 402.5 },
      ],
    };
    const prompt = buildPrompt({
      member: { role: "adult", preferences: "" }, agentLabel: "구성원 1",
      date: "2026-11-02", weekday: "Mon", minute: 600, tripsToday: [], memory: [], shell,
    });
    const usage = emptyUsage();
    assert.equal(usage.reasoning_tokens, 0);
    const entry = await judgeSingle({ provider: "meta", prompt, shell, usage, fetchImpl, providerOpts: { apiKey: "test-key" } });
    assert.equal(entry.chosen_by, "rule_fallback");
    assert.equal(entry.chosen_key, "s0");
    assert.equal(entry.fallback_cause, "truncated");
    assert.equal(entry.provider, "meta");
    assert.equal(entry.model, "muse-spark-1.3");
    assert.deepEqual(entry.usage, { prompt_tokens: 200, completion_tokens: 400, reasoning_tokens: 398 });
    assert.equal(usage.errors, 1);
    assert.equal(usage.fallbacks, 1);
    assert.equal(usage.calls, 0);
    assert.equal(usage.prompt_tokens, 200);
    assert.equal(usage.completion_tokens, 400);
    assert.equal(usage.reasoning_tokens, 398);
  });

  it("accepts a model weekend plan from available categories only", async () => {
    const fetchImpl = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: '{"plan":["park","supermarket"],"reason_ko":"산책 후 장보기","reason_en":"Park then shopping"}' } }],
        usage: { prompt_tokens: 60, completion_tokens: 12 },
      }),
    });
    const shell = {
      id: "h1:d5:0600:weekend_plan:00", agent: "h1", day: 5, minute: 600,
      kind: "weekend_plan", default_key: "park",
      options: [
        { key: "park", label: "공원", minutes: 4.4, distance_m: 345 },
        { key: "supermarket", label: "슈퍼1", minutes: 3.2, distance_m: 251 },
        { key: "home", label: "집에서 휴식", minutes: 0, distance_m: 0 },
      ],
    };
    const prompt = buildPrompt({
      member: { role: "adult", preferences: "" }, agentLabel: "구성원 1",
      date: "2026-11-07", weekday: "Sat", minute: 600, tripsToday: [], memory: [], shell,
    });
    const usage = emptyUsage();
    const entry = await judgeSingle({ provider: "meta", prompt, shell, usage, fetchImpl, providerOpts: { apiKey: "test-key" } });
    assert.equal(entry.chosen_key, "park+supermarket");
    assert.deepEqual(entry.plan, ["park", "supermarket"]);
    assert.equal(entry.chosen_by, "model");
  });

  it("dry-run counts match the judging pass exactly", async () => {
    const plan = planCalls(tinyArea(), tinyScenario(), "A");
    const calls = [];
    await judgeHome({
      area: tinyArea(), scenarioRaw: tinyScenario(), homeLabel: "A",
      provider: "meta", judgeOne: ruleStampedModel(calls),
    });
    assert.equal(plan.calls, calls.length);
    assert.deepEqual(plan.call_list.map((c) => c.id), calls);
    assert.ok(plan.est_input_tokens > plan.calls * 50);
    assert.equal(plan.est_completion_tokens, plan.calls * 60);
    assert.ok(plan.est_usd_meta > 0 && plan.est_usd_meta < 1);
    assert.ok(plan.note.includes("headroom"));
  });

  it("builds prompts with profile, trips, memory and graph numbers", () => {
    const shell = {
      id: "h1:d0:0600:shop_choice:00", agent: "h1", day: 0, minute: 600,
      kind: "shop_choice", default_key: "s0",
      options: [{ key: "s0", label: "슈퍼1", minutes: 3.2, distance_m: 251 }],
    };
    const prompt = buildPrompt({
      member: { role: "adult", preferences: "장보기는 한 번에" },
      agentLabel: "구성원 1", date: "2026-11-02", weekday: "Mon", minute: 600,
      tripsToday: [{ depart_min: 450, arrive_min: 460, purpose: "commute",
        from_label: "집", to_label: "중앙역", minutes: 1.3, distance_m: 100 }],
      memory: [{ day: 0, minute: 450, kind: "station_route", chosen: "s0", reason_ko: "가까운 출구" }],
      shell,
    });
    assert.ok(prompt.system.includes("simulated"));
    assert.ok(prompt.user.includes("장보기는 한 번에"));
    assert.ok(prompt.user.includes("07:30→07:40"));
    assert.ok(prompt.user.includes("station_route chose s0"));
    assert.ok(prompt.user.includes("3.2 min"));
    assert.ok(prompt.user.includes("251 m"));
    assert.ok(estimateTokens("abcd") >= 1);
  });

  it("prices meta usage and leaves baseten token-only", () => {
    const usd = costUsd("meta", { prompt_tokens: 1e6, completion_tokens: 1e6, cached_tokens: 0 });
    assert.equal(usd, 5.5);
    const cached = costUsd("meta", { prompt_tokens: 1e6, completion_tokens: 0, cached_tokens: 1e6 });
    assert.equal(cached, 0.15);
    // reasoning_tokens ride inside completion_tokens: counted, never added.
    const reasoned = costUsd("meta", {
      prompt_tokens: 0, completion_tokens: 347, cached_tokens: 0, reasoning_tokens: 312,
    });
    assert.equal(reasoned, (347 * 4.25) / 1e6);
    assert.equal(costUsd("baseten", { prompt_tokens: 1, completion_tokens: 1 }), null);
  });

  it("never writes the key to decisions or usage files", async () => {
    const secret = "sk-test-NEVER-WRITE-987654321";
    const saved = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = secret;
    let authed = "";
    const fetchImpl = async (url, init) => {
      authed = init.headers.Authorization;
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: '{"chosen_key":"s0","reason_ko":"가까운 곳","reason_en":"Nearest"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      };
    };
    try {
      const shell = {
        id: "h1:d0:0600:shop_choice:00", agent: "h1", day: 0, minute: 600,
        kind: "shop_choice", default_key: "s0",
        options: [{ key: "s0", label: "슈퍼1", minutes: 3.2, distance_m: 251 }],
      };
      const prompt = buildPrompt({
        member: { role: "adult", preferences: "" }, agentLabel: "구성원 1",
        date: "2026-11-02", weekday: "Mon", minute: 600, tripsToday: [], memory: [], shell,
      });
      const usage = emptyUsage();
      const entry = await judgeSingle({ provider: "meta", prompt, shell, usage, fetchImpl });
      assert.equal(authed, `Bearer ${secret}`); // the key really authenticated this call
      const dir = await mkdtemp(join(tmpdir(), "judge-key-"));
      const decPath = join(dir, "tiny-A-meta.json");
      const usePath = join(dir, "tiny-A-meta-usage.json");
      await writeFile(decPath, canon(decisionsFile({
        scenarioName: "tiny", homeLabel: "A", provider: "meta",
        decisions: [{ ...shell, ...entry }], usage,
      })));
      await writeFile(usePath, canon({ ...usage, est_usd: costUsd("meta", usage) }));
      for (const path of [decPath, usePath]) {
        const body = await readFile(path, "utf8");
        assert.ok(!body.includes("NEVER-WRITE"), `${path} leaks the key`);
        assert.ok(!body.includes("sk-test"), `${path} leaks the key`);
        assert.ok(!body.includes("Authorization"), `${path} leaks headers`);
      }
    } finally {
      if (saved === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = saved;
    }
  });
});
