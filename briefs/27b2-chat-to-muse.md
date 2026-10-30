# Stage 27b2 — Every message goes to Muse; live ▸ rows; Muse opens panels; next-step chips (client side, brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section: no git, no full suite, no build, no exploring). Branch `chat-27` (27a and 27b1 are in). First edit within 3 tool calls. Read only the line ranges quoted here; use `grep -n` to find a quoted line when numbers moved. When the named tests pass, stop.

## Why
`docs/product.md`: the chat is a conversation with Muse, and the app's features are Muse's tools. Today `send()` in `web/src/ui/chat.jsx` (≈ line 1550) routes by regex: most text goes to `structuredFlow` (deterministic, no model), and `askAgent` (the Muse consult agent) is reached only by a few phrases and only when `IS_DEV`. On the public site Muse never answers. 27b1 added, server side: streamed `tool_start` / `tool_end` events (`body.stream === true`, NDJSON, last line `{ type: "done", ...out }`), `out.uiActions` (`{action:"panel", panel, home?, day?, time?}`, `{action:"pick", ids}`, `{action:"run"}`), and `out.suggestions` (≤ 3 strings).

## Changes

### 1. Streaming client — `web/src/ui/consult-client.js:15-45`
- Export `parseNdjson(buffer, chunk)` → `{ events: object[], rest: string }` (split on `\n`, parse each complete non-empty line, keep the partial tail in `rest`; skip lines that fail to parse).
- Export `postConsultStream({ provider, messages, scenario, context = null, byoKey = "" }, onEvent)`: same request as `postConsult` plus `stream: true` in the body. Same 429 / non-OK handling as `postConsult` (`consult-client.js:33-42`) when the status is not 200. Read `r.body.getReader()` with a `TextDecoder`, feed `parseNdjson`, call `onEvent(ev)` for `tool_start` / `tool_end`, throw `new Error(ev.error)` on `type: "error"`, return the `done` event's payload (without `type`) plus `latencyMs`. If the stream ends without `done`, throw `상담 응답이 끊겼어요`.

### 2. Route every message to Muse — `web/src/ui/chat.jsx` `send()` (`grep -n "async function send"`)
- Export a pure `routeTurn({ live, museDown })` → `"agent"` when `live && !museDown`, else `"local"`.
- New state `museDown` (false). In `send()`: keep the `매물 글 붙여 넣기` card path. Remove the `IS_DEV` checks in the 공공임대 / check_listing branches. Then:
  - `routeTurn({ live: LIVE_API, museDown }) === "agent"` → `await askAgent(content)`;
  - else → the existing regex branches + `structuredFlow(content)` as today.
- In `askAgent` (`grep -n "async function askAgent"`), on a thrown error (429, network, 5xx, missing key): set `museDown` true, push one system line `Muse 연결이 안 돼서 규칙으로 답했어요`, then run `structuredFlow(text)` for the same message. Do not push the old `상담 요청 실패` text in that case.

### 3. Live ▸ rows while Muse works — `askAgent`
- Call `postConsultStream` instead of `postConsult`.
- New state `liveRows` (array). On `tool_start` push `{ name, pending: true }`; on `tool_end` replace the last pending row of that name with `{ name, ok, summary, pending: false }`. Clear `liveRows` when the turn ends (success or failure).
- The busy bubble (`chat.jsx`, the `{busy && (<ChatMessage sender="assistant">…찾는 중…` block, `grep -n "찾는 중…"`): show `Muse가 생각하는 중…` when `liveRows` is empty; otherwise one line per row: pending → `▸ {toolActionKo(name)} 중…`; done → `✓ {toolActionKo(name)}` + ` · {stripToolLabel(name, summary)}` when present, `✕` instead of `✓` when `ok === false`. Import `toolActionKo`, `stripToolLabel` from `./agent-float.js`. Export the line builder `liveRowLine(row)` for the test.
- Composer placeholder while busy: `Muse가 일하는 중…`.
- Add labels for the new tools to `TOOL_ACTION_KO` (`web/src/ui/agent-float.js:72`): `open_panel: "화면 열기"`, `pick_homes: "찜하기"`, `start_life_run: "30일 살아 보기 맡기기"`, and if missing `find_homes: "후보 찾기"`, `extract_profile: "말씀 정리"`, `parse_listing: "매물 글 읽기"`, `check_listing: "실거래와 대조"`, `jeonse_check: "전세 점검"`, `support_programs: "도움 제도 찾기"`, `living_cost: "생활비 계산"`, `price_reference: "실거래 확인"`.

### 4. Muse opens panels and picks — after the `done` payload in `askAgent`
- Export a pure `uiEffects(actions, { candidateIds, pickCount })` → array of effects:
  - `{action:"panel", panel:"map"}` → `{ type: "work" }`;
  - `panel` in `compare, priorities, money, worthit, jeonse, support` (`web/src/ui/compare-tabs.js:9-21`) → `{ type: "work" }` and `{ type: "tab", tab: panel }` (`"compare"` maps to tab `"compare"`);
  - `panel` in `tour, commute, result` → `{ type: "work" }` and `{ type: "scene", panel, home, day, time }` (27c renders it; for now only the work panel opens);
  - `{action:"pick", ids}` → `{ type: "pick", ids: ids filtered to candidateIds, max 3 }` (skip when none remain);
  - `{action:"run"}` → `{ type: "run" }` when `pickCount ≥ 2` (count the picks after a pick effect in the same list), else `{ type: "say", text: "먼저 두 곳을 찜해 주세요." }`.
- Apply them in `askAgent`: work → `setWorkOpen(true)`; tab → `store.set({ compareOpen: true, compareTab: tab })`; pick → `setPicks(ids)`; run → `handleRun()`; say → push an assistant text; scene → `store.set({ pendingScene: eff })` only.

### 5. Next-step chips
- The final assistant message pushed by `askAgent` carries `suggestions: out.suggestions || []`.
- The chips row (`grep -n "ui-chat-chips"`): when the latest assistant message has `suggestions.length > 0`, render those (click → `send(chip)`); otherwise the current `chatChipsFor(...)` chips. Export `chipsForLatest(messages, fallback)` for the test.

### 6. Context Muse needs — `askAgent` and `web/src/consult/agent.js:187-201`
- In `askAgent`, extend the context sent: `candidates`: up to 6 of the current candidates as `{ id, name, price, commute_min }` (from `candidatesData.result.candidates`, use the fields the candidate cards read), `picks`: the picked ids, `work_open`: boolean.
- `formatAgentContext(ctx)` (`agent.js:187`): append `후보: {id} {name} …` (one short item each, `; `-joined) and `찜: {ids}` when present, so Muse can call `pick_homes` with real ids.

## Tests — new `web/tests/chat-muse-27b2.test.js` (SSR loader like `web/tests/topbar-13f.test.js:1-30` where JSX is imported)
- `parseNdjson("", '{"type":"tool_start","name":"find_homes"}\n{"type":"do')` → one event, `rest` `{"type":"do`; feeding `'ne"}\n'` next gives the `done` event.
- `routeTurn({ live: true, museDown: false })` is `"agent"`; `museDown: true` or `live: false` → `"local"`.
- `liveRowLine({ name: "find_homes", pending: true })` contains `후보 찾기 중`; a done row with `summary: "41곳"` contains `✓` and `41곳`; `ok: false` contains `✕`.
- `uiEffects`: map → `[{type:"work"}]`; `money` → work + tab money; `pick` with an unknown id dropped; `[pick 2 ids, run]` → pick then run; `[run]` with `pickCount: 0` → say.
- `chipsForLatest`: latest assistant message with suggestions wins; none → fallback.
- `formatAgentContext({ candidates: [{ id: "h1", name: "가나", price: 2e8, commute_min: 18 }], picks: ["h1"] })` contains `h1` and `찜`.

Run only:
```
cd web && node --test tests/chat-muse-27b2.test.js tests/agent-stream-27b.test.js tests/agent-float.test.js tests/chat-first-27a.test.js 2>&1 | tail -15
```
