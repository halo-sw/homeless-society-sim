import { describe, it } from "node:test";
import assert from "node:assert/strict";
import config from "../vite.config.js";
import { BYOK_HEADER } from "../src/consult/byok.js";

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

function mockReq(method, body, headers = {}) {
  const listeners = {};
  return {
    method,
    url: "/api/consult",
    headers,
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

describe("BYOK proxy (no key in logs or errors)", () => {
  it("rejects a bad BYOK request without echoing the key", async () => {
    const handler = handlerFor("/api/consult");
    const key = "sk-byok-secret-9f8e7d6c5b4a";
    const req = mockReq("POST", JSON.stringify({ provider: "meta" }),
      { [BYOK_HEADER]: key });
    const { res, done } = mockRes();
    const p = handler(req, res, () => {});
    req._emit();
    await p;
    const finished = await done;
    assert.ok(finished.body.length > 0);
    assert.ok(!finished.body.includes(key),
      `error must not contain the key: ${finished.body.slice(0, 200)}`);
    assert.ok(!JSON.stringify(finished.headers).includes(key));
  });
  it("serves model status as booleans, never keys", async () => {
    const handler = handlerFor("/api/model/status");
    const req = mockReq("GET", null);
    const { res, done } = mockRes();
    await handler(req, res, () => {});
    const finished = await done;
    const payload = JSON.parse(finished.body);
    assert.equal(payload.ok, true);
    assert.equal(typeof payload.meta.hasServerKey, "boolean");
    assert.equal(typeof payload.baseten.hasServerKey, "boolean");
    const envKey = process.env.MODEL_API_KEY || process.env.BASETEN_API_KEY || "";
    if (envKey) assert.ok(!finished.body.includes(envKey));
  });
});
