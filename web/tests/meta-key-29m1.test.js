// Stage 29m1: the Meta key is named META_API_KEY (MODEL_API_KEY still
// works as a fallback) and the endpoint URLs are named constants.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASETEN_API_BASE, META_API_BASE, PROVIDERS, envKey, metaApiKey,
} from "../src/judge/providers.js";
import { createTranscribeHandler } from "../src/consult/voice.js";
import { createRelay } from "../../relay/handler.js";
import * as relayHandler from "../../relay/handler.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

function mockRes() {
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  const res = {
    statusCode: 200,
    headers: {},
    chunks: [],
    setHeader(k, v) { res.headers[String(k).toLowerCase()] = v; },
    end(chunk) {
      if (chunk !== undefined) res.chunks.push(Buffer.from(chunk));
      resolve(res);
    },
  };
  return { res, done };
}

async function getStatus(env) {
  const relay = createRelay({ env, fetchImpl: async () => ({}) });
  const { res, done } = mockRes();
  await relay({ method: "GET", url: "/api/model/status", headers: {}, socket: { remoteAddress: "1.2.3.4" } }, res);
  return JSON.parse(Buffer.concat((await done).chunks).toString("utf8"));
}

function wavBytes() {
  const head = Buffer.from("RIFF....WAVEfmt ", "utf8");
  return Buffer.concat([head, Buffer.alloc(64, 1)]);
}

describe("29m1 metaApiKey falls back to MODEL_API_KEY", () => {
  it("prefers META_API_KEY, then MODEL_API_KEY, else empty", () => {
    assert.equal(metaApiKey({ META_API_KEY: "a", MODEL_API_KEY: "b" }), "a");
    assert.equal(metaApiKey({ MODEL_API_KEY: "b" }), "b");
    assert.equal(metaApiKey({}), "");
  });

  it("names the Meta endpoint constants", () => {
    assert.equal(META_API_BASE, "https://api.meta.ai/v1");
    assert.equal(PROVIDERS.meta.baseUrl, META_API_BASE);
    assert.equal(PROVIDERS.baseten.baseUrl, BASETEN_API_BASE);
    assert.equal(BASETEN_API_BASE, "https://inference.baseten.co/v1");
    assert.equal(PROVIDERS.meta.keyEnv, "META_API_KEY");
    assert.deepEqual(envKey(PROVIDERS.meta, { MODEL_API_KEY: "b" }), "b");
  });
});

describe("29m1 relay names the Meta endpoints", () => {
  it("re-exports both base URLs and mentions them in source", () => {
    const source = readFileSync(join(ROOT, "relay", "handler.js"), "utf8");
    assert.ok(source.includes("META_API_BASE"));
    assert.ok(source.includes("BASETEN_API_BASE"));
    assert.equal(relayHandler.META_API_BASE, "https://api.meta.ai/v1");
    assert.equal(relayHandler.BASETEN_API_BASE, "https://inference.baseten.co/v1");
  });

  it("reports the server key from either env name", async () => {
    for (const env of [{ META_API_KEY: "k" }, { MODEL_API_KEY: "k" }]) {
      const body = await getStatus(env);
      assert.equal(body.meta.hasServerKey, true);
      assert.equal(body.voice.hasServerKey, true);
    }
    const empty = await getStatus({});
    assert.equal(empty.meta.hasServerKey, false);
    assert.equal(empty.voice.hasServerKey, false);
  });
});

describe("29m1 voice posts to the Meta endpoint with the Meta key", () => {
  it("sends Bearer k-new to META_API_BASE + /asr/transcribe", async () => {
    const seen = {};
    const fetchImpl = async (url, opts) => {
      seen.url = url;
      seen.auth = opts.headers.Authorization;
      return { status: 200, json: async () => ({ transcript: " hi " }) };
    };
    const handler = createTranscribeHandler({ env: { META_API_KEY: "k-new" }, fetchImpl });
    const { res, done } = mockRes();
    res.body = "";
    const origEnd = res.end.bind(res);
    res.end = (chunk) => { if (chunk !== undefined) res.body += chunk; origEnd(chunk); };
    await handler({ method: "POST", body: wavBytes() }, res);
    await done;
    assert.equal(seen.url, "https://api.meta.ai/v1/asr/transcribe");
    assert.equal(seen.auth, "Bearer k-new");
  });
});

describe("29m1 .env.example lists META_API_KEY next to BASETEN_API_KEY", () => {
  it("has META_API_KEY= followed by BASETEN_API_KEY= and no MODEL_API_KEY=", () => {
    const lines = readFileSync(join(ROOT, ".env.example"), "utf8").split("\n");
    const metaIdx = lines.findIndex((l) => l.trim() === "META_API_KEY=");
    assert.ok(metaIdx >= 0, "expected a META_API_KEY= line");
    assert.ok(lines.slice(metaIdx + 1, metaIdx + 7).some((l) => l.trim() === "BASETEN_API_KEY="));
    assert.ok(!lines.some((l) => l.trim() === "MODEL_API_KEY="));
  });
});
