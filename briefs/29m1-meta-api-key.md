# Stage 29m1 — Name the Meta API plainly: META_API_KEY and the endpoint constants (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
A reviewer reading the repo should see at a glance that this app calls Meta's models. Today the key is called `MODEL_API_KEY` (generic), and the endpoint URLs are buried in `web/src/judge/providers.js:40-54` and `web/src/consult/voice.js:14`; the relay (`relay/handler.js`, `relay/server.mjs`) never names them. Rename the key to **`META_API_KEY`**, keep `MODEL_API_KEY` as a fallback so nothing deployed breaks (the live relay and local setups still set `MODEL_API_KEY`), and state the Meta and Baseten base URLs as named constants, including in `relay/`.

## Change

### 1. One place for the names — `web/src/judge/providers.js`
- `export const META_API_BASE = "https://api.meta.ai/v1";` and `export const BASETEN_API_BASE = "https://inference.baseten.co/v1";` near the top; `PROVIDERS.meta.baseUrl = META_API_BASE`, `PROVIDERS.baseten.baseUrl = BASETEN_API_BASE`.
- `PROVIDERS.meta.keyEnv = "META_API_KEY"` plus `keyEnvFallback: ["MODEL_API_KEY"]` (baseten: `keyEnv: "BASETEN_API_KEY"`, no fallback).
- `export function envKey(cfg, env)` → first non-empty of `env[cfg.keyEnv]`, then each `cfg.keyEnvFallback` name, else `""`. Use it at the two key lookups (`grep -n "process.env\[cfg.keyEnv\]" web/src/judge/providers.js`, today `:215` and `:302`). The missing-key messages say `META_API_KEY (or MODEL_API_KEY)` for meta.
- `export function metaApiKey(env = process.env)` = `envKey(PROVIDERS.meta, env || {})`.
- Update the header comment at `:24`.

### 2. Use it everywhere the meta key is read
- `web/src/consult/byok.js:45`: the env name for meta becomes `META_API_KEY` with the `MODEL_API_KEY` fallback (use `envKey`).
- `web/src/consult/voice.js`: `VOICE_URL = META_API_BASE + "/asr/transcribe"` (import the constant); the key from `metaApiKey(env)`; comment at `:8` says `META_API_KEY`.
- `web/src/consult/server.js:~310`: the error text uses the meta names above.
- `web/vite.config.js:~233-234` and `relay/handler.js:~217-218` (`/api/model/status`): `hasServerKey: Boolean(metaApiKey(env))` (vite: `process.env`).
- `relay/handler.js`: import and re-export `META_API_BASE` and `BASETEN_API_BASE` (`export { META_API_BASE, BASETEN_API_BASE } from "../web/src/judge/providers.js";`) with a short header line: `// Model endpoints this relay calls with the server key: Meta (META_API_BASE) for chat and voice; Baseten (BASETEN_API_BASE) only with a browser-supplied key.` Update the key list in the header comment (`:5`) to `META_API_KEY (or MODEL_API_KEY)`.
- `relay/server.mjs:11` `KEY_NAMES`: `["META_API_KEY", "MODEL_API_KEY", "VWORLD_KEY", "HOUSING_API_KEY"]`.
- `web/scripts/judge.mjs:16` comment.
- `docker-compose.yml:~29`: pass both `META_API_KEY: ${META_API_KEY:-}` and `MODEL_API_KEY: ${MODEL_API_KEY:-}`.

### 3. Docs
- `.env.example`: replace the `MODEL_API_KEY=` block with `META_API_KEY=` (comment: Muse Spark 1.3 and Muse Voice Transcribe 1.0 at `https://api.meta.ai/v1`; `MODEL_API_KEY` is still read as a fallback), immediately followed by the existing `BASETEN_API_KEY=` block, so the two Meta-model keys sit side by side.
- `README.md:~230,~254`, `README.ko.md:~229,~253`, `relay/README.md:17`: `MODEL_API_KEY` → `META_API_KEY` (add `(MODEL_API_KEY also works)` / `(MODEL_API_KEY도 돼요)` once per file). No other README lines.

## Test — new `web/tests/meta-key-29m1.test.js`
- `metaApiKey({ META_API_KEY: "a", MODEL_API_KEY: "b" }) === "a"`; `metaApiKey({ MODEL_API_KEY: "b" }) === "b"`; `metaApiKey({}) === ""`.
- `PROVIDERS.meta.baseUrl === META_API_BASE === "https://api.meta.ai/v1"`; `PROVIDERS.baseten.baseUrl === "https://inference.baseten.co/v1"`; `PROVIDERS.meta.keyEnv === "META_API_KEY"`.
- `relay/handler.js` source contains `META_API_BASE` and `BASETEN_API_BASE`; importing it exposes both constants with the URLs above.
- `createRelay({ env: { META_API_KEY: "k" } })` → `/api/model/status` has `meta.hasServerKey === true` and `voice.hasServerKey === true`; with `{ MODEL_API_KEY: "k" }` the same; with `{}` both false.
- `createTranscribeHandler({ env: { META_API_KEY: "k-new" }, fetchImpl })` sends `Authorization: Bearer k-new` to `https://api.meta.ai/v1/asr/transcribe`.
- `.env.example` has a `META_API_KEY=` line followed (within the next 6 lines) by `BASETEN_API_KEY=`, and no `MODEL_API_KEY=` line.

Run only:
```
cd web && node --test tests/meta-key-29m1.test.js $(grep -ln "MODEL_API_KEY\|keyEnv\|model/status" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Update older tests only where they set **only** an env key name and assert its exact error text; tests that set `MODEL_API_KEY` must keep passing through the fallback.

## Do not touch
Landing files, chat UI, map / 3D / engine files, recordings, `briefs/`.

## Final message
Changed files, one line each. Nothing else.
