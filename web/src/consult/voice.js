// Voice transcribe relay: POST /api/voice/transcribe (vite dev only,
// Node-side) and the Vercel relay. The browser records 16 kHz mono
// 16-bit WAV (see ../ui/voice.js) and posts the raw bytes; the key stays
// server-side (env), exactly like /api/consult. Nothing is stored.
//
// Upstream (measured 2026-10-31):
//   POST https://api.meta.ai/v1/asr/transcribe
//   Authorization: Bearer <META_API_KEY>
//   multipart/form-data: request={"model":"muse-voice-transcribe-1.0",
//     "audioEncoding":"WAV"} + audio=<wav file>
//   → 200 {"transcript": "..."} (language detected automatically)

import { META_API_BASE, metaApiKey } from "../judge/providers.js";

export const VOICE_MODEL = "muse-voice-transcribe-1.0";
export const VOICE_URL = META_API_BASE + "/asr/transcribe";
// ≈ 37 s of 16 kHz mono 16-bit PCM plus the 44-byte WAV header.
export const VOICE_MAX_BYTES = 1_200_000;

const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"

export function buildTranscribeForm(wavBytes) {
  const form = new FormData();
  form.set("request", JSON.stringify({ model: VOICE_MODEL, audioEncoding: "WAV" }));
  form.set("audio", new Blob([wavBytes], { type: "audio/wav" }), "speech.wav");
  return form;
}

function readRawBody(req) {
  // Platforms that already parked the body (the relay): reuse it.
  const parked = req && req.body !== undefined && req.body !== null ? req.body : undefined;
  if (parked !== undefined) {
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(parked)) return Promise.resolve(parked);
    if (parked instanceof Uint8Array) return Promise.resolve(Buffer.from(parked));
    if (typeof parked === "string") return Promise.resolve(Buffer.from(parked, "utf8"));
    return Promise.resolve(Buffer.from(String(parked), "utf8"));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > VOICE_MAX_BYTES) {
        reject(new Error("body too large"));
        if (typeof req.destroy === "function") req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createTranscribeHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async (req, res) => {
    const send = (code, obj) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(obj));
    };
    if ((req.method || "GET") !== "POST") {
      send(405, { ok: false, error: "method" });
      return;
    }
    let bytes;
    try {
      bytes = await readRawBody(req);
    } catch {
      send(413, { ok: false, error: "too_large" });
      return;
    }
    if (!bytes || bytes.length > VOICE_MAX_BYTES) {
      send(413, { ok: false, error: "too_large" });
      return;
    }
    if (bytes.length < 4
        || bytes[0] !== RIFF[0] || bytes[1] !== RIFF[1]
        || bytes[2] !== RIFF[2] || bytes[3] !== RIFF[3]) {
      send(400, { ok: false, error: "bad_audio" });
      return;
    }
    const key = metaApiKey(env || {});
    if (!key) {
      send(503, { ok: false, error: "no_key" });
      return;
    }
    let resp = null;
    try {
      resp = await fetchImpl(VOICE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: buildTranscribeForm(bytes),
      });
    } catch {
      resp = null;
    }
    const status = (resp && typeof resp.status === "number") ? resp.status : 0;
    if (!resp || status !== 200) {
      // The upstream status number only — never upstream text, never the key.
      send(502, { ok: false, error: "upstream", status: status || 500 });
      return;
    }
    let data = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    const transcript = data && typeof data.transcript === "string"
      ? data.transcript.trim()
      : "";
    if (!transcript) {
      send(502, { ok: false, error: "upstream", status: 200 });
      return;
    }
    send(200, { ok: true, transcript, model: VOICE_MODEL });
  };
}
