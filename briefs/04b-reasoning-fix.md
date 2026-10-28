# Stage 4b — live-run fix (brief for Muse, small)

Rules in `AGENTS.md`. The orchestrator ran `judge.mjs --home both --provider meta` live: 198/198 calls fell back with `fallback_cause: "bad_json"`. Root cause, verified by direct API calls today:
- `muse-spark-1.3` is a reasoning model. With `max_tokens: 400` the reasoning used all 400 tokens (`completion_tokens_details.reasoning_tokens: 398`), `finish_reason: "length"`, `message.content: null`.
- `reasoning_effort` is supported: values `minimal, low, medium, high, xhigh, max` (`none` is rejected with 400). With `max_tokens: 1500` + `json_schema`: `minimal` → valid JSON, 179 completion tokens (143 reasoning); `low` → valid JSON, 347 completion tokens (312 reasoning).

Fix in `web/src/judge/`:
1. Provider options: `reasoning_effort` (meta default `"low"`; CLI flag `--effort`; omit the field for baseten unless set) and `max_tokens` default 2000 (flag `--max-tokens`).
2. `finish_reason: "length"` or `content: null` → distinct `fallback_cause: "truncated"` (not `bad_json`), and record `reasoning_tokens` in usage when present. Cost estimate counts all completion tokens (reasoning included).
3. Update tests for these cases (fake fetch). Run `node --test` and `vite build`. Do not commit. Append a short note to `briefs/04-RESULT.md`.
