# Stage 29j2 — submit_report: the only way Muse can hand in the comparison, verified inside the handler (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
29j1 added the two-home verifier (`web/src/verify/compare.js`: `reportDigest`, `verifyComparison`, `runComparisonLoop`; `web/src/verify/evidence.js`: `citedEvents`). Today Muse's after-run text (the diary, `web/src/consult/diary.js`) is checked line by line but the **comparison** itself is never verified, and nothing stops the agent from opening the result panel before any check. This stage makes Muse hand in the comparison only through one tool, `submit_report`, whose handler runs the verify loop: Muse writes → code checks numbers and evidence ids → **Muse judges whether the cited records really support each judge sentence** → Muse rewrites from `feedback_ko` → after 3 failed retries the user is asked.

## Changes

### 1. New `web/src/consult/report.js`
- `REPORT_PROMPT` (Korean; plus `REPORT_PROMPT_EN` suffix and `reportPrompt(lang)` like `diaryPrompt` in `diary.js:15-24`):
  - 너는 두 집에서 30일을 살아 본 기록(digest)으로 비교 리포트를 쓴다. 최종 결과는 `submit_report` 도구로만 낸다(일반 답장 금지).
  - 문장 하나 = 집 하나(`home`: A/B/C) × 항목 하나(`item_id`). digest에 있는 항목만, 집마다 빠짐없이(must 먼저).
  - 숫자는 digest `values`의 숫자만. 숫자를 쓰면 `claims`에 `{field, value, unit}`: 시간 항목은 `field:"minutes", unit:"분"`, N01은 구성원마다 `member`(m1, m2…) 필수, C02는 `field:"monthly_total"`, `unit`은 digest의 unit(원 또는 $).
  - `events`가 있는 항목(judge)은 그 event의 `id`를 `evidence`에 1개 이상 달고, 그 기록이 말하는 것만 쓴다. `engine:"none"` 항목과 events가 비어 있는 항목은 쓰지 않는다.
  - 추천·계약·"낫다" 같은 판단은 하지 않는다.
- `SUBMIT_REPORT_DEF`: `{ type: "function", function: { name: "submit_report", description: "두 집 비교 리포트를 낸다 — 최종 비교는 이 도구로만 낸다. 코드가 숫자·근거를 검증하고, 실패하면 feedback_ko로 고쳐 다시 낸다.", parameters: { type: "object", additionalProperties: false, properties: { sentences: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: str, home: str, item_id: str, text_ko: str, claims: { type: "array", items: { type: "object", properties: { field: str, value: { type: "number" }, unit: str, member: str } } }, evidence: { type: "array", items: { type: "string" } } }, required: ["id", "home", "item_id", "text_ko"] } } }, required: ["sentences"] } } }`.
- `JUDGE_PROMPT`: 문장 하나와 그 문장이 인용한 시뮬레이션 기록(events)을 보고, 기록이 문장의 내용(시간·횟수·장소·상황)을 실제로 뒷받침하는지만 판정한다. 기록에 없는 내용을 단정하면 supported=false. JSON으로만: `{"supported": true|false, "reason": "한 줄"}`.
- `makeJudge({ call, provider })` → `async (sentence, events) => { supported, reason }`: one `call({ provider, messages: [system JUDGE_PROMPT, user JSON.stringify({ sentence: sentence.text_ko, item_id, events })], maxTokens: 800 })`, parse the JSON with `parseDiaryJson` (import from `./diary.js`); a parse failure throws (29j1 counts a throwing judge as no failure + `judge_error`).
- `export async function writeReport({ call, provider, runs, labels, homes, names = {}, persona, groundTruth, lang = "ko", onAttempt = null })`:
  1. `digest = reportDigest({ runs, labels, homes, persona, groundTruth, names })`. Unsupported persona → return `{ ok: true, status: "unsupported", reason_ko: UNSUPPORTED_PERSONA_KO, attempts: [], report: null, handoff: null }` with no model call.
  2. `session = { report: { runs, labels, homes, persona, groundTruth, judge: makeJudge({ call, provider }), revise, onAttempt }, context: null }`.
  3. `messages = [system reportPrompt(lang), user JSON.stringify(digest)]`; first `call({ provider, messages, tools: [SUBMIT_REPORT_DEF], maxTokens: 8000 })`. Take the first `submit_report` tool call's parsed arguments. No tool call → append the assistant message and one user line `"submit_report 도구로만 답해 주세요."`, call once more; still none → `{ sentences: [] }`.
  4. `revise(report, result, attempt)`: append the assistant tool-call message and a `role: "tool"` message `{ ok: false, attempt, feedback_ko: result.feedback_ko }` (tool_call_id of that call), call again with the same tools, return `{ persona, sentences: <new args>.sentences || [] }`.
  5. `out = await callTool(session, "submit_report", args)` (from `./tools.js`) — the handler is the single path that verifies.
  6. Return `{ ok: true, status: out.status, report: out.report, attempts: out.attempts, handoff: out.handoff, result: out.result, usage }`.

### 2. `web/src/consult/tools.js`
- Import `SUBMIT_REPORT_DEF` and push it into `TOOL_DEFS` after `start_life_run` (`tools.js:247-249`); add `submit_report` to `HANDLERS` (`tools.js:1310-1320`).
- Handler `async function submit_report(session, args)`: `const ctx = session.report;` no `ctx` → `fail("submit_report runs only in the report step after a 30-day run (the runs are not in this conversation)")`. `sentences` must be an array of ≤ 40 objects. Then `runComparisonLoop({ draft: { persona: ctx.persona, sentences }, revise: ctx.revise, runs: ctx.runs, labels: ctx.labels, homes: ctx.homes, persona: ctx.persona, groundTruth: ctx.groundTruth, judge: ctx.judge, onAttempt: ctx.onAttempt })`. `status` = `"unsupported"` when `result.status === "미지원"`, `"pass"` when `result.pass`, `"handoff"` when `handoff`, else `"fail"`. Store `session.reportStatus = status`. Return `{ ok: true, status, report: <last attempt's report>, attempts: attempts.map(({ attempt, summary_ko, result }) => ({ attempt, summary_ko, pass: !!result.pass, weighted_coverage: result.weighted_coverage ?? null, must_coverage: result.must_coverage ?? null })), handoff, result: { pass, weighted_coverage, must_coverage, feedback_ko, by_home: { A: { unsupported, inapplicable }, … } } }`.
- The general chat agent never sees `submit_report` (it has no runs): in `web/src/consult/agent.js:416` pass `TOOL_DEFS.filter((t) => t.function.name !== "submit_report")`.
- `open_panel` (`tools.js:1272-1295`): when `a.panel === "result"` and `!["pass", "handoff", "unsupported"].includes(session.context && session.context.report_status)` → `fail("the result opens only after the comparison report is verified (report_status: <value or none>) — tell the customer the report is still being checked")`.
- `formatAgentContext` (`agent.js:301-…`): when `ctx.report_status` is set, append ` 비교 리포트 검증: <pass=통과 | handoff=확인 요청 | unsupported=미지원 | checking=검증 중 | fail=실패>.`

### 3. `web/src/consult/server.js` — `body.task === "report"` (next to the diary task, `server.js:~317-340`)
- Validate: `labels` array of 2–3 of `"A"|"B"|"C"`; `runs[label]` objects with arrays `trips` (≤ 3000), `aways` (≤ 3000), `decisions` (≤ 2000); `homes[label]` object; `persona` string. Otherwise throw like the diary validation.
- Ground truth: `JSON.parse(await read("scen", "verify/ground_truth.json"))`, cached in the handler closure.
- `call = (args) => completeWithTools({ ...args, fetchImpl: fetchImpl || fetch, apiKey })` (same as the diary).
- `body.stream === true`: `Content-Type: application/x-ndjson`; write `ndjsonLine({ type: "attempt", ...a })` from `onAttempt`, then `ndjsonLine({ type: "done", ...out })` and end. Otherwise one JSON response at the end.

## Tests — new `web/tests/submit-report-29j2.test.js` (fake `call`, no network)
Build two tiny runs as in `web/tests/verify-compare-29j1.test.js` and `homes` `{ A: { monthly_won: 500000 }, B: { monthly_won: 600000 } }`, persona `newlywed_couple`, ground truth from `scenarios/verify/ground_truth.json`.
- `TOOL_DEFS` contains `submit_report`; the agent's tool list (export a tiny `chatToolDefs()` helper from `agent.js` that returns the filtered list, and use it at `agent.js:416`) does not.
- `callTool(session without report, "submit_report", { sentences: [] })` → `ok: false`.
- `writeReport` with a fake `call` whose 1st answer is a `submit_report` tool call missing home B's C01 and whose 2nd answer (after a `role:"tool"` message carrying `feedback_ko`) is a complete correct report; judge calls return `{"supported": true, "reason": "ok"}` → `status: "pass"`, `attempts.length === 2`, `attempts[0].pass === false`, `onAttempt` called twice. Assert the 2nd call's messages contain the feedback text.
- Judge answering `{"supported": false, "reason": "기록과 시간이 달라요"}` for a C06 sentence on every attempt → final `status: "handoff"`, `handoff.question_ko` non-empty, 4 attempts.
- `persona: "pet_owner"` → `status: "unsupported"`, the fake `call` never invoked.
- `open_panel` with `panel: "result"` fails without `context.report_status`, succeeds with `report_status: "pass"`; `formatAgentContext({ report_status: "checking" })` contains `검증 중`.
- Server: `createConsultHandler` with a fake `readText` and a stubbed provider is heavy — instead export the body validator `validateReportBody(body)` from `server.js` and test it (bad labels / oversized trips throw; a good body passes).

Run only:
```
cd web && node --test tests/submit-report-29j2.test.js $(grep -ln "TOOL_DEFS\|TOOL_NAMES\|open_panel\|formatAgentContext\|task: \"diary\"" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Update older pins only where they count `TOOL_DEFS` entries or list tool names exactly (add `submit_report`), or assert `open_panel("result")` always succeeds.

## Do not touch
UI files, `web/src/verify/*` (29j1 owns them), `diary.js` behavior, relay files, recordings, `briefs/`.

## Final message
Changed files, one line each. Nothing else.
