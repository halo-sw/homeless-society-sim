# Stage 29j3b — Break the report.js ⇄ tools.js import cycle; check-step padding on the spacing scale (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only what is named here. Stop when the named tests pass.

## Why
Full suite after 29j3 (orchestrator):
1. Ten test files fail to load, and the dev server does not start, with `ReferenceError: Cannot access 'SUBMIT_REPORT_DEF' before initialization`. `web/src/consult/server.js` imports `./report.js` → `report.js` imports `callTool` from `./tools.js` → `tools.js` imports `SUBMIT_REPORT_DEF` from `./report.js` (still initialising) and uses it while building `TOOL_DEFS`.
2. `28c one spacing scale` fails on two new rules in `web/src/ui/ui.css`: `.ui-check-step { padding: 2px var(--ui-s8); … }` and `.ui-check-badge { padding: 2px var(--ui-s8); … }` — `2px` is off the scale.

## Changes
1. New `web/src/consult/report-def.js` that holds only `SUBMIT_REPORT_DEF` (moved verbatim from `report.js`, no imports). `report.js` re-exports it (`export { SUBMIT_REPORT_DEF } from "./report-def.js";`) and imports it from there; `tools.js` imports it from `./report-def.js`. No other behavior change.
2. `ui.css`: in both rules use `padding: var(--ui-s4) var(--ui-s8);` (or the smallest scale token the 28c test accepts — read `web/tests/spacing-28c.test.js` header to confirm the allowed tokens with `grep -n "s4\|scale" web/tests/*28c*.test.js | head`).

## Test
Add to `web/tests/submit-report-29j2.test.js`: importing `../src/consult/server.js` first (before `tools.js`) succeeds and `TOOL_DEFS` contains `submit_report`.

Run only:
```
cd web && node --test tests/submit-report-29j2.test.js tests/consult-middleware.test.js tests/relay-23a.test.js tests/byok-proxy-13.test.js tests/report-check-29j3.test.js $(ls tests/*28c*.test.js) 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
Everything else; `briefs/`.

## Final message
Changed files, one line each. Nothing else.
