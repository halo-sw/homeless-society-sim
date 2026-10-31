// Browser voice input: record the mic, encode 16 kHz mono 16-bit WAV,
// post it to /api/voice/transcribe through the relay (the browser never
// holds a key). Pure helpers are unit-tested; recordOnce needs a mic.

import { LIVE_API, apiUrl } from "../paths.js";

export const VOICE_SAMPLE_RATE = 16000;
export const VOICE_MAX_MS = 30000;

// Resample mono float samples (−1..1) to 16 000 Hz by linear
// interpolation, clamp, and pack a standard 44-byte RIFF/WAVE header
// (PCM, 1 channel, 16 000 Hz, 16-bit) + little-endian int16 data.
// Returns an ArrayBuffer. Pure — the test calls it in Node.
export function encodeWav16k(samples, sampleRate) {
  const rate = VOICE_SAMPLE_RATE;
  const n = samples.length;
  const outLen = Math.max(0, Math.round((n * rate) / sampleRate));
  const view = new DataView(new ArrayBuffer(44 + outLen * 2));
  const writeAscii = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + outLen * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, outLen * 2, true);
  for (let i = 0; i < outLen; i++) {
    const pos = (i * sampleRate) / rate;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = i0 >= 0 && i0 < n ? samples[i0] : 0;
    const b = i0 + 1 >= 0 && i0 + 1 < n ? samples[i0 + 1] : a;
    let v = a + (b - a) * frac;
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return view.buffer;
}

// Record one utterance from the mic. Resolves to a controller
// { stop(): Promise<ArrayBuffer> }: stop (or maxMs) ends the recording,
// decodes it, mixes to mono and returns encodeWav16k(...) bytes.
// The mic tracks always stop, on success and on failure.
export async function recordOnce({ maxMs = VOICE_MAX_MS, onTick } = {}) {
  const media = (typeof navigator !== "undefined" && navigator.mediaDevices) || null;
  if (!media || typeof media.getUserMedia !== "function") {
    throw new Error("no_mic");
  }
  const stream = await media.getUserMedia({ audio: true });
  const Rec = (typeof window !== "undefined" && window.MediaRecorder)
    || (typeof MediaRecorder !== "undefined" ? MediaRecorder : null);
  if (!Rec) {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* already stopped */
      }
    }
    throw new Error("no_mic");
  }
  const rec = new Rec(stream);
  const chunks = [];
  rec.ondataavailable = (ev) => {
    if (ev && ev.data && ev.data.size > 0) chunks.push(ev.data);
  };
  const ended = new Promise((resolve) => {
    rec.onstop = () => resolve();
  });
  const startedAt = Date.now();
  let tickTimer = null;
  if (typeof onTick === "function") {
    try {
      onTick(0);
    } catch {
      /* the clock never breaks the recording */
    }
    tickTimer = setInterval(() => {
      try {
        onTick(Date.now() - startedAt);
      } catch {
        /* the clock never breaks the recording */
      }
    }, 250);
  }
  rec.start();
  let pending = null;
  async function stop() {
    if (!pending) {
      pending = (async () => {
        try {
          if (rec.state !== "inactive") {
            try {
              rec.stop();
            } catch {
              /* already stopped */
            }
          }
          await ended;
          const blob = new Blob(chunks, { type: (rec.mimeType || "audio/webm") });
          const raw = await blob.arrayBuffer();
          const AC = (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext))
            || (typeof AudioContext !== "undefined" ? AudioContext : null);
          if (!AC) throw new Error("no_decoder");
          const ctx = new AC();
          try {
            const audio = await ctx.decodeAudioData(raw);
            const frames = audio.length;
            const mono = new Float32Array(frames);
            const channels = Math.max(1, audio.numberOfChannels || 1);
            for (let c = 0; c < channels; c++) {
              const data = audio.getChannelData(c);
              for (let i = 0; i < frames; i++) mono[i] += data[i] / channels;
            }
            return encodeWav16k(mono, audio.sampleRate || VOICE_SAMPLE_RATE);
          } finally {
            try {
              await ctx.close();
            } catch {
              /* already closed */
            }
          }
        } finally {
          if (tickTimer !== null) clearInterval(tickTimer);
          if (autoTimer !== null) clearTimeout(autoTimer);
          for (const track of stream.getTracks()) {
            try {
              track.stop();
            } catch {
              /* already stopped */
            }
          }
        }
      })();
    }
    return pending;
  }
  // Backstop: the mic never runs past maxMs, even if the caller forgets.
  const autoTimer = setTimeout(() => {
    stop().catch(() => {});
  }, maxMs);
  return { stop };
}

// POST WAV bytes, resolve the relay answer as { ok, transcript, error }.
// Never throws: every failure is { ok: false, error }. Static-only
// builds have no /api/* routes (22a), so there is nothing to post to.
export async function transcribe(wav) {
  if (!LIVE_API) return { ok: false, error: "offline" };
  let res;
  try {
    res = await fetch(apiUrl("/api/voice/transcribe"), {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: wav,
    });
  } catch {
    return { ok: false, error: "network" };
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: "upstream" };
  }
  if (body && body.ok) return { ok: true, transcript: String(body.transcript || "") };
  return { ok: false, error: (body && body.error) || "upstream" };
}

// Render the mic button only on browsers that can actually record.
export function voiceSupported(win = globalThis) {
  try {
    return Boolean(win
      && win.navigator
      && win.navigator.mediaDevices
      && typeof win.navigator.mediaDevices.getUserMedia === "function"
      && win.MediaRecorder);
  } catch {
    return false;
  }
}

// The relay's /api/model/status answer gates the button: voice needs
// the server key (voice.hasServerKey, or meta.hasServerKey on servers
// that predate the voice field).
export function voiceKeyReady(status) {
  if (!status || typeof status !== "object") return false;
  const voice = status.voice;
  if (voice && typeof voice === "object") return voice.hasServerKey === true;
  const meta = status.meta;
  return Boolean(meta && meta.hasServerKey === true);
}
