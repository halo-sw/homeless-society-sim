import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BYOK_HEADER, saveByoKey, loadByoKey, clearByoKey, hasByoKey,
  resolveProxyKey, redactSecrets, safeProxyError,
} from "../src/consult/byok.js";

function memStorage() {
  const m = new Map();
  return {
    setItem: (k, v) => m.set(k, String(v)),
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    removeItem: (k) => m.delete(k),
  };
}

describe("BYO key handling", () => {
  it("keeps the key in sessionStorage only, with wipe", () => {
    const s = memStorage();
    assert.equal(hasByoKey(s, "meta"), false);
    saveByoKey(s, "meta", "sk-test-12345");
    assert.equal(loadByoKey(s, "meta"), "sk-test-12345");
    assert.equal(hasByoKey(s, "meta"), true);
    clearByoKey(s, "meta");
    assert.equal(hasByoKey(s, "meta"), false);
  });
  it("prefers the per-request header over the server env key", () => {
    const r = resolveProxyKey({ headers: { [BYOK_HEADER]: "byo-key" },
      provider: "meta", env: { MODEL_API_KEY: "env-key" } });
    assert.equal(r.key, "byo-key");
    assert.equal(r.from, "byok");
    const e = resolveProxyKey({ headers: {}, provider: "meta",
      env: { MODEL_API_KEY: "env-key" } });
    assert.equal(e.key, "env-key");
    assert.equal(e.from, "env");
    const n = resolveProxyKey({ headers: {}, provider: "meta", env: {} });
    assert.equal(n.key, null);
  });
  it("never leaves the key in logs or errors", () => {
    const key = "sk-live user key 9f8e7d6c";
    const line = `POST /api/model provider=meta ${BYOK_HEADER}: ${key} ok`;
    const red = redactSecrets(line, [key]);
    assert.ok(!red.includes(key));
    assert.match(red, /redacted/);
    const bearer = redactSecrets("auth: Bearer abcDEF123._~-+/=", []);
    assert.ok(!bearer.includes("abcDEF123"));
    const err = safeProxyError(
      { httpStatus: 401, providerMessage: `bad key ${key}` }, [key]);
    assert.equal(err.httpStatus, 401);
    assert.ok(!JSON.stringify(err).includes(key));
  });
});
