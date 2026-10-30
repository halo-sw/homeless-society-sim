# Stage 27b1 — Muse agent: live tool events, panel actions, next-step replies (server side, brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section: no git, no full suite, no build, no exploring). Branch `chat-27`. First edit within 3 tool calls. Read only the line ranges quoted here. When the named test passes, stop.

## Why
Product decision (user, 2026-10-31, `docs/product.md`): every chat message goes to Muse; Muse uses the app's features as tools; the customer sees each tool as it runs (▸ rows), Muse opens the right panel only for what the customer asked, and every answer ends with 2–3 suggested next requests. The consult agent already has the tools (`web/src/consult/tools.js:79-229`). This stage adds the server side. 27b2 wires the chat screen.

## Changes

### 1. Live events from the loop — `web/src/consult/agent.js:202-296`
- `runTurn(opts)` takes a new option `onEvent = null`.
- In the tool loop (`agent.js:286-296`), around `await callTool(session, c.name, c.args || {})`:
  - before: `onEvent && onEvent({ type: "tool_start", name: c.name, target: shortJson(c.args || {}, 80) })`
  - after `summarizeToolCall`: `onEvent && onEvent({ type: "tool_end", name: c.name, ok, summary, ms })`
- A throwing `onEvent` must not break the turn (wrap in try/catch).

### 2. Panel actions as tools — `web/src/consult/tools.js`
Add three tools to `TOOL_DEFS` (`tools.js:79-225`) and `HANDLERS` (`tools.js:1187-1195`):
- `open_panel` — "고객이 요청한 것을 오른쪽 작업판에 연다." params `{ panel: enum ["map","compare","tour","commute","result","money","jeonse","support","priorities"], home?: enum ["A","B","C"], candidate_id?: string, day?: integer 1–30, time?: string "HH:MM" }`, `panel` required. Handler validates the enum / ranges and returns `{ ok: true, ui: { action: "panel", panel, home, candidate_id, day, time } }` (omit undefined keys), else `fail(...)`.
- `pick_homes` — "고객이 고른 후보 2–3곳을 찜한다." params `{ candidate_ids: string[] (1–3) }`. Returns `{ ok: true, ui: { action: "pick", ids } }`.
- `start_life_run` — "고객이 '살아 봐 줘'처럼 요청했을 때만, 찜한 집들로 30일 살아 보기를 시작한다." params `{}`. Returns `{ ok: true, ui: { action: "run" } }`.

In `runTurn`, collect `uiActions`: after each tool result, `if (result && result.ok && result.ui) uiActions.push(result.ui)`. `finish()` (`agent.js:298-306`) adds `uiActions`.

`summarizeToolCall` (`agent.js:84`) Korean rows: `open_panel` → `화면 열기: {지도|비교|동네|출근길|결과|생활비|전세 점검|도움 제도|내 기준}`; `pick_homes` → `찜 {n}곳`; `start_life_run` → `30일 살아 보기 맡김`. Export the panel label map as `PANEL_KO`.

### 3. Suggested next requests — `web/src/consult/agent.js`
- Export `splitSuggestions(reply)`: if the last non-empty line matches `/^\s*\[\[\s*다음\s*:\s*(.+?)\s*\]\]\s*$/`, return `{ text: <reply without that line, trimmed>, suggestions: <split on "|", trimmed, non-empty, max 3, each cut to 20 chars> }`; else `{ text: reply, suggestions: [] }`. Also accept `[[Next: …]]` for English.
- In `runTurn`, apply it to `reply` (and `reply2` on the retry path) **before** `checkConsultReply`, so the guard sees only the text. The appended assistant message keeps only the text. `finish()` adds `suggestions`.

### 4. System prompt — `web/src/consult/agent.js:23-49`
Replace the three lines that start with `"역할: …"`, `"첫 질문은 '어떤 상황이세요?'다 …"` and `"그 뒤 find_homes로 …"` (`agent.js:25-27`) with these lines (keep every other line as is):
```
"너는 Ithaca의 Muse다. 고객의 집 고민을 대화로 돕는다. 앱의 기능은 모두 네 도구다: 찾기(find_homes), 매물 읽기(parse_listing·check_listing), 비교(compare), 30일 살아 보기(start_life_run), 생활비·전세·지원 제도·안전·교육·출근길 도구.",
"질문은 한 번에 하나만 짧게 한다. 설문처럼 여러 개를 묻지 않는다. 모르는 값은 기본값으로 두고 '가정'이라고 밝힌다. 출근지나 예산 중 하나라도 있으면 extract_profile 다음 바로 find_homes로 후보를 보여 준다. 우선순위는 고객이 말할 때만 set_priorities로 기록한다.",
"화면은 보여 줄 것이 생겼거나 고객이 요청했을 때만 open_panel로 연다: 후보를 찾으면 map, 비교를 원하면 compare, 동네를 물으면 tour, 출근길은 commute, 돈은 money, 전세는 jeonse, 지원은 support.",
"고객이 후보를 고르면(예: '이 두 곳', '1번이랑 3번') pick_homes로 찜한다. start_life_run은 고객이 살아 보기를 요청했을 때만 부르고, 그 전에는 제안만 한다.",
"다루지 않는 지역이면 '아직 준비 중이에요'라고 말하고 가장 가까운 다루는 지역을 제안한다. 엉뚱한 질문에도 한 줄로 답하고 집 고민으로 돌아온다.",
"답은 3문장 이내. 마지막 줄에는 고객이 다음에 할 만한 요청 2~3개를 [[다음: 비교해 줘 | 출근길 보여 줘 | 살아 봐 줘]] 형식으로 쓴다(각 12자 이내, 고객 말투).",
```

### 5. Streaming response — `web/src/consult/server.js:269-290`
When `body.stream === true`:
- set `res.statusCode = 200`, headers `Content-Type: application/x-ndjson; charset=utf-8`, `Cache-Control: no-cache`, call `res.flushHeaders?.()`;
- pass `onEvent: (ev) => res.write(JSON.stringify(ev) + "\n")` into `runTurn`;
- at the end write `JSON.stringify({ type: "done", ...out }) + "\n"` and `res.end()`;
- if an error happens after headers were sent, write one line `{ type: "error", error: <redacted msg, 500 chars> }` and end (same redaction as the catch block).
Without `stream`, the response stays exactly as today.

## Tests — new `web/tests/agent-stream-27b.test.js`
Use `tinyScenario` / `tinyArea` from `./engine-fixture.js` and a `completeFn` stub, like `web/tests/agent-float.test.js:56-75`.
- A stub that first returns `tool_calls: [{ id: "c1", name: "open_panel", args: { panel: "map" } }]`, then `content: "41곳이에요.\n[[다음: 비교해 줘 | 살아 봐 줘]]"`:
  - `onEvent` saw `tool_start` then `tool_end` for `open_panel` (`ok: true`);
  - `out.uiActions` deep-equals `[{ action: "panel", panel: "map" }]`;
  - `out.suggestions` deep-equals `["비교해 줘", "살아 봐 줘"]`; the last assistant message content is `41곳이에요.`.
- `open_panel` with `panel: "kitchen"` → the tool result `ok: false`, no ui action.
- `pick_homes` with 4 ids → `ok: false`; with 2 → `ui.action === "pick"`.
- `splitSuggestions("안녕하세요")` → no suggestions; `"[[Next: Compare | Run it]]"` style works; a 30-char suggestion is cut to 20.
- A throwing `onEvent` does not break `runTurn`.
- Streaming: call the handler from `createConsultHandler({ readText: async () => { throw new Error("no data"); }, env: { MODEL_API_KEY: "x" } })` only if it can run without network; otherwise test a small exported helper `ndjsonLine(ev)` (returns `JSON.stringify(ev) + "\n"`) and keep the server change minimal. Do not make network calls in tests.

Run only:
```
cd web && node --test tests/agent-stream-27b.test.js tests/agent-float.test.js tests/consult-agent.test.js 2>&1 | tail -15
```
If a pin in `consult-agent.test.js` checks the removed prompt lines, update that line only.
