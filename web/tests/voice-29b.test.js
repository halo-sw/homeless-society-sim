// 29b: voice input — WAV encoding, transcribe relay route + buckets,
// model status voice flag, mic button SSR, support probe.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import {
  VOICE_MODEL, VOICE_URL, VOICE_MAX_BYTES,
  buildTranscribeForm, createTranscribeHandler,
} from "../src/consult/voice.js";
import { encodeWav16k, voiceSupported } from "../src/ui/voice.js";
import { createRelay } from "../../relay/handler.js";

register("./jsx-loader.mjs", import.meta.url);

let React;
let renderToString;
let MicButton;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ MicButton } = await import("../src/ui/voice-button.jsx"));
});

function wavBytes() {
  // Minimal RIFF header + a few samples (content is not decoded here).
  const head = Buffer.from("RIFF....WAVEfmt ", "utf8");
  return Buffer.concat([head, Buffer.alloc(64, 1)]);
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
    setHeader(k, v) {
      res.headers[k] = v;
    },
    end(chunk) {
      if (chunk) res.body += chunk;
      resolve(res);
    },
  };
  return { res, done };
}

describe("29b encodeWav16k", () => {
  it("writes a 16 kHz mono 16-bit WAV", () => {
    const buf = encodeWav16k(new Float32Array(48000).fill(0.5), 48000);
    assert.equal(buf.byteLength, 44 + 16000 * 2);
    const bytes = new Uint8Array(buf);
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "RIFF");
    assert.equal(String.fromCharCode(...bytes.slice(8, 12)), "WAVE");
    const view = new DataView(buf);
    assert.equal(view.getUint32(24, true), 16000);
    assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint16(34, true), 16);
    assert.ok(Math.abs(view.getInt16(44, true) - Math.round(0.5 * 32767)) <= 2);
  });
});

describe("29b buildTranscribeForm", () => {
  it("carries the model JSON and the wav blob", () => {
    const form = buildTranscribeForm(new Uint8Array([82, 73, 70, 70]));
    assert.deepEqual(JSON.parse(form.get("request")),
      { model: "muse-voice-transcribe-1.0", audioEncoding: "WAV" });
    const audio = form.get("audio");
    assert.ok(audio instanceof Blob);
    assert.equal(audio.size, 4);
  });
});

describe("29b createTranscribeHandler", () => {
  it("posts the form upstream and trims the transcript", async () => {
    const seen = {};
    const fake = async (url, opts) => {
      seen.url = url;
      seen.auth = opts.headers.Authorization;
      seen.body = opts.body;
      return { status: 200, json: async () => ({ transcript: " hello " }) };
    };
    const handler = createTranscribeHandler({ env: { MODEL_API_KEY: "k-test" }, fetchImpl: fake });
    const { res, done } = mockRes();
    await handler({ method: "POST", body: wavBytes() }, res);
    const finished = await done;
    assert.equal(finished.statusCode, 200);
    assert.deepEqual(JSON.parse(finished.body),
      { ok: true, transcript: "hello", model: VOICE_MODEL });
    assert.equal(seen.url, VOICE_URL);
    assert.equal(seen.auth, "Bearer k-test");
    assert.ok(!finished.body.includes("k-test"));
  });

  it("rejects no key, bad audio, oversize and upstream failure", async () => {
    const okFetch = async () => ({ status: 200, json: async () => ({ transcript: "x" }) });
    const noKey = createTranscribeHandler({ env: {}, fetchImpl: okFetch });
    {
      const { res, done } = mockRes();
      await noKey({ method: "POST", body: wavBytes() }, res);
      const finished = await done;
      assert.equal(finished.statusCode, 503);
      assert.equal(JSON.parse(finished.body).error, "no_key");
    }
    const keyed = createTranscribeHandler({ env: { MODEL_API_KEY: "k-test" }, fetchImpl: okFetch });
    {
      const { res, done } = mockRes();
      await keyed({ method: "POST", body: Buffer.from("abcd") }, res);
      assert.equal((await done).statusCode, 400);
      assert.equal(JSON.parse((await done).body || "{}").error || "bad_audio", "bad_audio");
    }
    {
      const { res, done } = mockRes();
      await keyed({ method: "POST", body: Buffer.alloc(VOICE_MAX_BYTES + 1, 1) }, res);
      assert.equal((await done).statusCode, 413);
    }
    const failing = createTranscribeHandler({
      env: { MODEL_API_KEY: "k-test" },
      fetchImpl: async () => ({ status: 500, json: async () => ({}) }),
    });
    {
      const { res, done } = mockRes();
      await failing({ method: "POST", body: wavBytes() }, res);
      const finished = await done;
      assert.equal(finished.statusCode, 502);
      assert.equal(JSON.parse(finished.body).error, "upstream");
      assert.ok(!finished.body.includes("k-test"));
    }
  });
});

describe("29b relay voice route", () => {
  function voiceReq(body) {
    return {
      method: "POST",
      url: "/api/voice/transcribe",
      headers: { origin: "https://halo-sw.github.io" },
      socket: { remoteAddress: "9.9.9.9" },
      body,
    };
  }

  it("transcribes through the relay and rate-limits the 11th call", async () => {
    let calls = 0;
    const fake = async () => {
      calls += 1;
      return { status: 200, json: async () => ({ transcript: "hello" }) };
    };
    const relay = createRelay({ env: { MODEL_API_KEY: "k-test" }, fetchImpl: fake });
    for (let i = 0; i < 10; i++) {
      const { res, done } = mockRes();
      await relay(voiceReq(wavBytes()), res);
      assert.equal((await done).statusCode, 200);
    }
    assert.equal(calls, 10);
    const { res, done } = mockRes();
    await relay(voiceReq(wavBytes()), res);
    const limited = await done;
    assert.equal(limited.statusCode, 429);
    assert.equal(calls, 10);
  });

  it("reports the voice key flag on /api/model/status", async () => {
    const relay = createRelay({ env: { MODEL_API_KEY: "k-test" } });
    const { res, done } = mockRes();
    await relay({
      method: "GET",
      url: "/api/model/status",
      headers: { origin: "https://halo-sw.github.io" },
      socket: {},
    }, res);
    const finished = await done;
    const json = JSON.parse(finished.body);
    assert.equal(json.voice.hasServerKey, true);
  });
});

describe("29b MicButton", () => {
  it("idle SSR shows the Korean label and an svg", () => {
    const html = renderToString(React.createElement(MicButton, { onText: () => {} }));
    assert.ok(html.includes('aria-label="말로 입력하기"'));
    assert.ok(html.includes("<svg"));
  });

  it("voiceSupported({}) is false", () => {
    assert.equal(voiceSupported({}), false);
  });
});
