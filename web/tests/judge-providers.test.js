import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { complete, createPool, extractJson, providerConfig, PROVIDERS } from "../src/judge/providers.js";
import { DECISION_SCHEMA } from "../src/judge/context.js";

function okJson(payload) {
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify(payload),
  };
}

function completion(content, usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }) {
  return okJson({ choices: [{ message: { content } }], usage });
}

describe("judge providers", () => {
  it("posts an OpenAI-compatible chat completion with the schema", async () => {
    const seen = {};
    const fake = async (url, init) => {
      seen.url = url;
      seen.init = init;
      return completion('{"chosen_key":"s0","reason_ko":"가까운 곳","reason_en":"Nearest"}');
    };
    const res = await complete({
      provider: "meta", system: "sys", user: "pick", schema: DECISION_SCHEMA,
      apiKey: "test-key-1", fetchImpl: fake,
    });
    assert.equal(seen.url, "https://api.meta.ai/v1/chat/completions");
    assert.equal(seen.init.method, "POST");
    assert.equal(seen.init.headers.Authorization, "Bearer test-key-1");
    assert.equal(seen.init.headers["Content-Type"], "application/json");
    const body = JSON.parse(seen.init.body);
    assert.equal(body.model, "muse-spark-1.3");
    assert.deepEqual(body.messages, [{ role: "system", content: "sys" }, { role: "user", content: "pick" }]);
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.name, "decision");
    assert.deepEqual(body.response_format.json_schema.schema, DECISION_SCHEMA);
    assert.equal(body.temperature, 0);
    assert.deepEqual(res.json, { chosen_key: "s0", reason_ko: "가까운 곳", reason_en: "Nearest" });
    assert.deepEqual(res.usage, { prompt_tokens: 100, completion_tokens: 20 });
    assert.equal(res.provider, "meta");
    assert.equal(res.model, "muse-spark-1.3");
    assert.ok(Number.isFinite(res.latency_ms));
  });

  it("reads the baseten config (model + key env)", () => {
    const cfg = providerConfig("baseten");
    assert.equal(cfg.baseUrl, "https://inference.baseten.co/v1");
    assert.equal(cfg.model, "meta-models/muse-spark-open-1026");
    assert.equal(cfg.keyEnv, "BASETEN_API_KEY");
    assert.throws(() => providerConfig("nope"), /unknown provider/);
  });

  it("falls back to a JSON-only reply when json_schema is rejected", async () => {
    const bodies = [];
    let n = 0;
    const fake = async (url, init) => {
      bodies.push(JSON.parse(init.body));
      n++;
      if (n === 1) {
        return { ok: false, status: 400,
          text: async () => '{"error":{"message":"response_format json_schema is not supported"}}' };
      }
      return completion('```json\n{"chosen_key":"park","reason_ko":"산책","reason_en":"Walk"}\n```');
    };
    const res = await complete({
      provider: "baseten", system: "sys", user: "pick", schema: DECISION_SCHEMA,
      apiKey: "k", fetchImpl: fake,
    });
    assert.equal(bodies.length, 2);
    assert.ok(bodies[0].response_format);
    assert.ok(!bodies[1].response_format);
    assert.ok(bodies[1].messages[1].content.includes("Reply with JSON only."));
    assert.equal(res.json.chosen_key, "park");
    assert.equal(res.provider, "baseten");
  });

  it("retries 429/5xx with backoff, then gives up", async () => {
    let n = 0;
    const fake = async () => {
      n++;
      if (n < 3) return { ok: false, status: 429, text: async () => "slow down" };
      return completion('{"chosen_key":"s0","reason_ko":"r","reason_en":"r"}');
    };
    const res = await complete({
      provider: "meta", system: "s", user: "u", schema: DECISION_SCHEMA,
      apiKey: "k", fetchImpl: fake, retryBaseMs: 1,
    });
    assert.equal(n, 3);
    assert.equal(res.json.chosen_key, "s0");
    let m = 0;
    const always500 = async () => {
      m++;
      return { ok: false, status: 500, text: async () => "boom" };
    };
    await assert.rejects(() => complete({
      provider: "meta", system: "s", user: "u", schema: DECISION_SCHEMA,
      apiKey: "k", fetchImpl: always500, retries: 2, retryBaseMs: 1,
    }), /returned 500/);
    assert.equal(m, 3); // initial + 2 retries
  });

  it("fails fast on non-retryable 4xx without the key in the message", async () => {
    const fake = async () => ({ ok: false, status: 401, text: async () => "bad key" });
    const err = await complete({
      provider: "meta", system: "s", user: "u", schema: DECISION_SCHEMA,
      apiKey: "sk-live-SUPERSECRET", fetchImpl: fake,
    }).then(() => null, (e) => e);
    assert.ok(err);
    assert.match(err.message, /401/);
    assert.ok(!err.message.includes("SUPERSECRET"));
  });

  it("requires a key and times out slow providers", async () => {
    const saved = process.env.MODEL_API_KEY;
    delete process.env.MODEL_API_KEY;
    try {
      await assert.rejects(() => complete({
        provider: "meta", system: "s", user: "u", schema: DECISION_SCHEMA, fetchImpl: async () => ({}),
      }), /MODEL_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.MODEL_API_KEY = saved;
    }
    const hanging = (url, init) => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        reject(e);
      });
    });
    await assert.rejects(() => complete({
      provider: "meta", system: "s", user: "u", schema: DECISION_SCHEMA,
      apiKey: "k", fetchImpl: hanging, timeoutMs: 10, retries: 0,
    }), /timed out/);
  });

  it("caps concurrency at 4", async () => {
    const pool = createPool(4);
    let active = 0;
    let peak = 0;
    const jobs = Array.from({ length: 10 }, (_, i) => pool.run(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return i;
    }));
    const out = await Promise.all(jobs);
    assert.deepEqual(out, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.ok(peak <= 4, `peak ${peak}`);
    assert.ok(peak > 1, `peak ${peak}`);
  });

  it("extracts JSON objects tolerantly", () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
    assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(extractJson('Here: {"a":1} done'), { a: 1 });
    assert.throws(() => extractJson("no json here"), /not a JSON object/);
  });

  it("keeps cached-token usage when the provider reports it", async () => {
    const fake = async () => completion('{"chosen_key":"s0","reason_ko":"r","reason_en":"r"}', {
      prompt_tokens: 100, completion_tokens: 5,
      prompt_tokens_details: { cached_tokens: 40 },
    });
    const res = await complete({
      provider: "meta", system: "s", user: "u", schema: DECISION_SCHEMA,
      apiKey: "k", fetchImpl: fake,
    });
    assert.deepEqual(res.usage, { prompt_tokens: 100, completion_tokens: 5, cached_tokens: 40 });
  });
});
