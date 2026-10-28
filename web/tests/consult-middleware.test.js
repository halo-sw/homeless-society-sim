import { describe, it } from "node:test";
import assert from "node:assert/strict";
import config from "../vite.config.js";

function handlerFor(path) {
  const routes = new Map();
  for (const plugin of config.plugins) {
    if (typeof plugin.configureServer === "function") {
      plugin.configureServer({ middlewares: { use: (p, h) => routes.set(p, h) } });
    }
  }
  const hit = routes.get(path);
  assert.ok(hit, `${path} route registered`);
  return hit;
}

function mockReq(method, body) {
  const listeners = {};
  return {
    method,
    url: "/api/consult",
    on: (ev, fn) => {
      listeners[ev] = fn;
      return null;
    },
    destroy: () => {},
    _emit() {
      if (body !== null && listeners.data) listeners.data(Buffer.from(body));
      if (listeners.end) listeners.end();
    },
  };
}

function mockRes() {
  let resolve;
  const done = new Promise((r) => {
    resolve = r;
  });
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader: (k, v) => {
      res.headers[k] = v;
    },
    end: (chunk) => {
      res.body += chunk || "";
      resolve(res);
    },
  };
  return { res, done };
}

async function post(handler, payload) {
  const req = mockReq("POST", JSON.stringify(payload));
  const { res, done } = mockRes();
  const p = handler(req, res, () => {});
  req._emit();
  await p;
  return done;
}

const SCENARIO = {
  name: "tiny", start_date: "2026-11-02", days: 2, seed: 7, background: 0,
  household: { members: [{ id: "m1" }] },
  homes: [{ label: "A", area: "pangyo", complex_name: "알파" }],
};

function stubFetch(replies) {
  let n = 0;
  return async () => ({
    ok: true, status: 200,
    text: async () => JSON.stringify(replies[Math.min(n++, replies.length - 1)]),
  });
}

const textChoice = (content) => ({
  choices: [{ finish_reason: "stop", message: { content } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
});

describe("consult dev middleware", () => {
  it("rejects non-POST, unknown providers and missing scenarios", async () => {
    const handler = handlerFor("/api/consult");
    const req = mockReq("GET", null);
    const { res, done } = mockRes();
    const p = handler(req, res, () => {});
    req._emit();
    await p;
    assert.equal((await done).statusCode, 405);
    const badProvider = await post(handler, { provider: "nope", scenario: SCENARIO });
    assert.equal(badProvider.statusCode, 400);
    const saved = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = "test-key";
    try {
      const missing = await post(handler, { provider: "meta" });
      assert.equal(missing.statusCode, 400);
      assert.match(JSON.parse(missing.body).error, /scenario/);
    } finally {
      if (saved === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = saved;
    }
  });

  it("needs a server-side key (503 without one)", async () => {
    const saved = process.env.MODEL_API_KEY;
    delete process.env.MODEL_API_KEY;
    try {
      const handler = handlerFor("/api/consult");
      const r = await post(handler, {
        provider: "meta", scenario: SCENARIO, messages: [{ role: "user", content: "hi" }],
      });
      assert.equal(r.statusCode, 503);
      assert.equal(JSON.parse(r.body).ok, false);
    } finally {
      if (saved !== undefined) process.env.MODEL_API_KEY = saved;
    }
  });

  it("answers a text turn through the provider (stubbed fetch)", async () => {
    const savedKey = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = "test-key";
    const savedFetch = globalThis.fetch;
    globalThis.fetch = stubFetch([textChoice("누구와 사는지 알려주세요")]);
    try {
      const handler = handlerFor("/api/consult");
      const r = await post(handler, {
        provider: "meta", scenario: SCENARIO,
        messages: [{ role: "user", content: "안녕" }],
      });
      assert.equal(r.statusCode, 200);
      const payload = JSON.parse(r.body);
      assert.equal(payload.ok, true);
      assert.equal(payload.reply, "누구와 사는지 알려주세요");
      assert.equal(payload.provider, "meta");
      assert.equal(payload.model, "muse-spark-1.3");
      assert.deepEqual(payload.scenario.household.members, [{ id: "m1" }]);
      assert.equal(payload.usage.calls, 1);
      assert.ok(payload.usage.est_usd > 0);
      assert.deepEqual(payload.toolCalls, []);
      assert.equal(payload.view, null);
    } finally {
      globalThis.fetch = savedFetch;
      if (savedKey === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = savedKey;
    }
  });

  it("executes a tool round trip (list_areas) end to end", async () => {
    const savedKey = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = "test-key";
    const savedFetch = globalThis.fetch;
    globalThis.fetch = stubFetch([
      { choices: [{ finish_reason: "tool_calls",
        message: { content: "",
          tool_calls: [{ id: "c1", type: "function",
            function: { name: "list_areas", arguments: "{}" } }] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 } },
      textChoice("네 곳이 준비되어 있다"),
    ]);
    try {
      const handler = handlerFor("/api/consult");
      const r = await post(handler, {
        provider: "meta", scenario: SCENARIO,
        messages: [{ role: "user", content: "어디가 있어?" }],
      });
      assert.equal(r.statusCode, 200);
      const payload = JSON.parse(r.body);
      assert.equal(payload.ok, true);
      assert.equal(payload.toolCalls.length, 1);
      assert.equal(payload.toolCalls[0].name, "list_areas");
      assert.equal(payload.toolCalls[0].ok, true);
      const toolMsg = payload.messages.find((m) => m.role === "tool");
      assert.equal(JSON.parse(toolMsg.content).areas.length, 4);
      assert.equal(payload.reply, "네 곳이 준비되어 있다");
    } finally {
      globalThis.fetch = savedFetch;
      if (savedKey === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = savedKey;
    }
  });
});
