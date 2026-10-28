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
    url: "/api/judge",
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

const SHELL = {
  kind: "shop_choice", default_key: "s0",
  options: [
    { key: "s0", label: "슈퍼1", minutes: 3.2, distance_m: 251 },
    { key: "s1", label: "슈퍼2", minutes: 5.1, distance_m: 402.5 },
  ],
};

describe("judge dev middleware", () => {
  it("rejects non-POST and bad shells", async () => {
    const handler = handlerFor("/api/judge");
    const req = mockReq("GET", null);
    const { res, done } = mockRes();
    const p = handler(req, res, () => {});
    req._emit();
    await p;
    assert.equal((await done).statusCode, 405);
    const bad = await post(handler, { provider: "meta", shell: { kind: "nope" } });
    assert.equal(bad.statusCode, 400);
    assert.equal(JSON.parse(bad.body).ok, false);
  });

  it("needs a server-side key (503 without one)", async () => {
    const saved = process.env.MODEL_API_KEY;
    delete process.env.MODEL_API_KEY;
    try {
      const handler = handlerFor("/api/judge");
      const r = await post(handler, { provider: "meta", shell: SHELL });
      assert.equal(r.statusCode, 503);
      assert.equal(JSON.parse(r.body).ok, false);
    } finally {
      if (saved !== undefined) process.env.MODEL_API_KEY = saved;
    }
  });

  it("judges one decision through the provider (stubbed fetch)", async () => {
    const savedKey = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = "test-key";
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: '{"chosen_key":"s1","reason_ko":"슈퍼2 선택","reason_en":"Chose Super2"}' } }],
        usage: { prompt_tokens: 80, completion_tokens: 12 },
      }),
    });
    try {
      const handler = handlerFor("/api/judge");
      const r = await post(handler, {
        provider: "meta", shell: SHELL,
        member: { role: "adult", preferences: "" }, agentLabel: "구성원 1",
        date: "2026-11-02", weekday: "Mon", minute: 600, tripsToday: [], memory: [],
      });
      assert.equal(r.statusCode, 200);
      const payload = JSON.parse(r.body);
      assert.equal(payload.ok, true);
      assert.equal(payload.entry.chosen_key, "s1");
      assert.equal(payload.entry.chosen_by, "model");
      assert.equal(payload.entry.reason_ko, "슈퍼2 선택");
      assert.equal(payload.usage.calls, 1);
    } finally {
      globalThis.fetch = savedFetch;
      if (savedKey === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = savedKey;
    }
  });
});
