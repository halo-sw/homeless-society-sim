# Stage 29b — Voice input: speak, Muse Voice writes it down, you check and send (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Judges should be able to *say* "I work at Meta HQ, two of us, rent up to $4,500" instead of typing it. Meta's speech model is reachable with the same key as Muse Spark. The orchestrator measured it on 2026-10-31:

```
POST https://api.meta.ai/v1/asr/transcribe
Authorization: Bearer <MODEL_API_KEY>
multipart/form-data:
  request = {"model":"muse-voice-transcribe-1.0","audioEncoding":"WAV"}   (JSON text part)
  audio   = <16 kHz mono 16-bit PCM WAV file>
→ 200 {"transcript": "..."}        language detected automatically (Korean and English both correct)
(/v1/audio/transcriptions is 404 — do not use it)
```

The browser never holds a key, so the audio goes through our relay (`relay/handler.js`, Vercel) or the vite dev server, exactly like `/api/consult`.

## Change

### 1. Server — new `web/src/consult/voice.js`
- `export const VOICE_MODEL = "muse-voice-transcribe-1.0"`, `export const VOICE_URL = "https://api.meta.ai/v1/asr/transcribe"`, `export const VOICE_MAX_BYTES = 1_200_000` (≈ 37 s of 16 kHz mono 16-bit).
- `export function buildTranscribeForm(wavBytes)`: returns a `FormData` with `request` = `JSON.stringify({ model: VOICE_MODEL, audioEncoding: "WAV" })` and `audio` = `new Blob([wavBytes], { type: "audio/wav" })` named `speech.wav`.
- `export function createTranscribeHandler({ env = process.env, fetchImpl = fetch } = {})` → `async (req, res)`:
  - only `POST` (else 405 JSON `{ ok:false, error:"method" }`);
  - read the raw body (use `readBody` from `./server.js` if it returns a Buffer/string you can turn into bytes; else collect chunks); `req.body` may already be set by the relay — accept a Buffer there too;
  - empty → 400 `bad_audio`; larger than `VOICE_MAX_BYTES` → 413 `too_large`; first four bytes not `RIFF` → 400 `bad_audio`;
  - no `env.MODEL_API_KEY` → 503 `no_key`;
  - POST to `VOICE_URL` with `Authorization: Bearer <key>` and the form; on non-200 or missing `transcript` → 502 `upstream` (include the upstream status number only);
  - 200 `{ ok: true, transcript: String(transcript).trim(), model: VOICE_MODEL }`.
  - The key never appears in a response, error or log line (same rule as consult).

### 2. Routes
- `relay/handler.js`: `path === "/api/voice/transcribe"` → its own buckets: 10 per 10 min and 40 per day per client, 300 per day global (same helpers as consult: `checkBucket`, `checkGlobal`), then `createTranscribeHandler({ env, fetchImpl })` (create once per relay, like `consultHandler`). Read the body once into `req.body` as a Buffer before calling it. CORS as for consult.
- `/api/model/status` (relay and `web/vite.config.js:~221`): add `voice: { hasServerKey: Boolean(<MODEL_API_KEY>) }` (booleans only).
- `web/vite.config.js` `consultApiPlugin` (`:~214`): `server.middlewares.use("/api/voice/transcribe", createTranscribeHandler({ env: process.env }))`.

### 3. Browser — new `web/src/ui/voice.js`
- `export function encodeWav16k(samples, sampleRate)`: `samples` is a `Float32Array` (mono, −1..1). Resample to 16 000 Hz by linear interpolation (or averaging when downsampling), clamp, write a standard 44-byte RIFF/WAVE header (PCM, 1 channel, 16 000 Hz, 16-bit) + little-endian int16 data. Returns an `ArrayBuffer`. Pure — the test calls it in Node.
- `export async function recordOnce({ maxMs = 30000, onTick })`: `navigator.mediaDevices.getUserMedia({ audio: true })` → `MediaRecorder`; returns a controller `{ stop(): Promise<ArrayBuffer> }` that, on stop (or at `maxMs`), decodes the recorded blob with `AudioContext.decodeAudioData`, mixes to mono, and returns `encodeWav16k(...)`. Always stops the mic tracks.
- `export async function transcribe(wav)`: `fetch(apiUrl("/api/voice/transcribe"), { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav })` → `{ ok, transcript, error }`.
- `export function voiceSupported(win = globalThis)`: true only when `win.navigator?.mediaDevices?.getUserMedia` and `win.MediaRecorder` exist.

### 4. Mic button — `web/src/ui/chat.jsx` (main composer `:~2588`, and the empty-state composer `:~2824`)
New `MicButton({ onText, disabled })` (in `web/src/ui/voice-button.jsx`), passed through `ChatComposer`'s `sendActions` slot so it sits next to the send button:
- **idle**: ghost icon button, a small microphone glyph (inline SVG, 18 px, `currentColor`), `aria-label="말로 입력하기"`, title the same.
- **recording**: red dot (`--ds-danger` or the existing error colour token) + elapsed `0:07`, `aria-label="녹음 멈추기"`, `aria-pressed="true"`; click stops. Auto-stops at 30 s.
- **transcribing**: disabled, text `받아 적는 중…`.
- **done**: the transcript is put **into the composer** (append with a space if there is already text) — never auto-sent, the customer reads it and presses send. A one-line supporting caption under the composer for 4 s: `Muse Voice가 받아 적었어요 · 확인하고 보내 주세요`.
- **error** (permission denied, `no_key`, `upstream`, `too_large`, rate limited): caption `음성 입력이 안 됐어요. 글로 써 주세요.` — no throw, the composer stays usable.
- Render the button only when `voiceSupported()` and the model status says `voice.hasServerKey` (or `meta.hasServerKey` when `voice` is missing), and never in replay mode (`replayId`) or while `busy`. Keep the existing `isDisabled` behaviour of the composer.

English strings in `web/src/i18n/en.js`: `말로 입력하기` → `Speak instead`, `녹음 멈추기` → `Stop recording`, `받아 적는 중…` → `Writing it down…`, `Muse Voice가 받아 적었어요 · 확인하고 보내 주세요` → `Muse Voice wrote this down · check it, then send`, `음성 입력이 안 됐어요. 글로 써 주세요.` → `Voice input didn't work. Please type instead.`

### 5. README — `README.md` "Meta AI usage" table (`:~85`)
One new row after Muse Spark 1.3: `| **Muse Voice Transcribe 1.0** (`muse-voice-transcribe-1.0`) | `https://api.meta.ai/v1/asr/transcribe` | Speak instead of typing in the chat (Korean and English, detected automatically); the transcript goes into the box for the customer to check | [`consult/voice.js`](web/src/consult/voice.js) via the relay `/api/voice/transcribe` | — |`. Do not touch other README lines.

## Test — new `web/tests/voice-29b.test.js`
- `encodeWav16k(new Float32Array(48000).fill(0.5), 48000)`: byteLength `44 + 16000*2`; bytes 0–3 `RIFF`, 8–11 `WAVE`; sample rate field (offset 24, uint32 LE) 16000; channels (22) 1; bits (34) 16; first sample ≈ `0.5*32767` (±2).
- `buildTranscribeForm(new Uint8Array([82,73,70,70]))`: `form.get("request")` parses to `{ model: "muse-voice-transcribe-1.0", audioEncoding: "WAV" }`; `form.get("audio")` is a Blob of size 4.
- `createTranscribeHandler` with a fake `fetchImpl` and a fake req/res (POST, `req.body` = a Buffer starting with `RIFF`, env with a fake key `k-test`): the fake fetch receives `VOICE_URL`, header `Authorization: Bearer k-test`, a FormData body; respond `{ transcript: " hello " }` → res 200 JSON `{ ok:true, transcript:"hello" }`. Response body never contains `k-test`.
- Same handler: no key → 503 `no_key`; body `"abcd"` → 400 `bad_audio`; body larger than `VOICE_MAX_BYTES` → 413; upstream 500 → 502 `upstream` and no key text.
- Relay: `createRelay({ env: { MODEL_API_KEY: "k-test" }, fetchImpl: fake })` handles `POST /api/voice/transcribe` (origin `https://halo-sw.github.io`), and the 11th request in 10 min from one client → 429. `/api/model/status` JSON has `voice.hasServerKey === true`.
- SSR `MicButton` idle: contains `aria-label="말로 입력하기"` and an `<svg`.
- `voiceSupported({})` → false.

Run only:
```
cd web && node --test tests/voice-29b.test.js $(grep -ln "createRelay\|model/status\|ChatComposer" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Update older pins only where they assert the exact `/api/model/status` JSON keys.

## Do not touch
Landing files, map / 3D / engine files, `web/src/i18n/dom.js`, `agent.js`, recordings.

## Final message
Changed files, one line each. Nothing else.
