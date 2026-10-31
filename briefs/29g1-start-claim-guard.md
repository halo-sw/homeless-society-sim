# Stage 29g1 — "It's started" only when the run really starts (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Live recording on 2026-10-31 (Korean, real Muse Spark 1.3):
```
user: 1번이랑 2번 찜해 줘        → Muse: pick_homes · "말씀해 주신 곳을 찜해 두었습니다. …"
user: 두 집에서 살아 봐 줘       → Muse: pick_homes · "시작했어요. 다 살면 일기로 알려 드릴게요."
```
Muse wrote the start sentence but never called `start_life_run`, so no `{ action: "run" }` reached the UI (`uiActions`, `web/src/consult/agent.js:350`, pushed at `:519`; the browser turns it into a run in `uiEffects`, `web/src/ui/chat.jsx:~1167`). The customer is told the month is running; nothing runs. The system prompt (`agent.js:42`) dictates that exact sentence for the start turn, and the model copied the sentence without the call.

## Change — `web/src/consult/agent.js` (+ one export in `web/src/chat/intent.js`)
1. `web/src/chat/intent.js`: `export function isRunRequest(text)` → `RUN_RE.test(String(text || ""))` and not `PROFILE_RE` (reuse the existing regexes at `:11-19`).
2. `agent.js`: new exported pure `fixStartClaim({ text, userText, uiActions, isEnglish })` → `{ text, addRun }`:
   - A **start claim** is text containing `시작했어요` or (English) `/\b(it'?s started|started the (month|run)|starting the (month|run))\b/i`.
   - If there is no claim, or `uiActions` already has `{ action: "run" }` → unchanged, `addRun: false`.
   - Claim without a run, and `isRunRequest(userText)` → keep the text, `addRun: true` (the customer did ask; start it for real).
   - Claim without a run and no run request → replace the text with `아직 시작하지 않았어요. "두 집에서 살아 봐 줘"라고 말씀해 주시면 바로 시작할게요.` (English mode: `It hasn't started yet. Say "Live in both homes for a month" and I'll start it.`), `addRun: false`.
3. Apply it once in `finish()` (`grep -n "function finish" web/src/consult/agent.js`) to the final assistant text that the turn returns (find the field the branches pass — the reply text also stored as the last `appended` assistant message; update both consistently). The user text of this turn is the last `role: "user"` message of the incoming history. When `addRun`: push `{ action: "run" }` to `uiActions` and add a tool row `{ name: "start_life_run", ok: true, summary: "30일 살아 보기 맡김", ms: 0, target: "{}", auto: true }` to `toolCalls` so the activity row shows it.
4. Prompt line at `:42`: append `그 문장은 start_life_run을 실제로 호출한 턴에만 쓴다. 호출하지 않았으면 시작했다고 말하지 않는다.`

## Test — new `web/tests/start-claim-29g1.test.js`
- `fixStartClaim({ text: "시작했어요. 다 살면 일기로 알려 드릴게요.", userText: "두 집에서 살아 봐 줘", uiActions: [{ action: "pick", ids: ["a","b"] }] })` → `addRun: true`, text unchanged.
- same with `uiActions: [{ action: "run" }]` → `addRun: false`, unchanged.
- same text, `userText: "1번이랑 2번 찜해 줘"`, no run → `addRun: false`, text starts with `아직 시작하지 않았어요`.
- English: `text: "It's started — I'll share the diary once the month is done."`, `userText: "Live in both homes for a month"`, `isEnglish: true` → `addRun: true`; with `userText: "Pick 1 and 2"` → text starts with `It hasn't started yet`.
- no claim (`"찜해 두었어요."`) → unchanged, `addRun: false`.
- `isRunRequest("두 집에서 살아 봐 줘") === true`, `isRunRequest("강남 출근 전세 4억") === false`.
- `runTurn` with a fake provider whose only reply is the start sentence (no tool calls) and a history ending in user `두 집에서 살아 봐 줘` → result `uiActions` contains `{ action: "run" }` and `toolCalls` has a `start_life_run` row (follow the fake-provider pattern of an existing `runTurn` test, `grep -ln "runTurn" web/tests/*.test.js | head -3`).
- `SYSTEM_PROMPT` contains `실제로 호출한 턴에만`.

Run only:
```
cd web && node --test tests/start-claim-29g1.test.js $(grep -ln "runTurn\|SYSTEM_PROMPT\|readChatIntent" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
`chat.jsx`, tools.js, landing, map / 3D / engine files, recordings.

## Final message
Changed files, one line each. Nothing else.
