# Stage 29j3 — The verified comparison on screen: live check timeline, handoff bubble with buttons, honest 미지원, result gated (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
29j1 built the two-home verifier (`web/src/verify/compare.js`), 29j2 the server step: `POST /api/consult` with `task: "report"` runs Muse → `submit_report` → verify (numbers, evidence ids, Muse judge) → Muse rewrite → handoff after 3 retries, streaming NDJSON lines `{ type: "attempt", attempt, summary_ko, pass, weighted_coverage, must_coverage }` then `{ type: "done", ok, status: "pass"|"handoff"|"unsupported"|"fail", report, attempts, handoff, result }`. Nothing in the browser calls it yet, and the agent can still open the 3D result before anything is checked. This stage wires the real 30-day run into that step and shows the check.

## Changes

### 1. `web/src/verify/compare.js` (two small additions)
- `slimRunForReport(run)` (pure): household only (`householdKeys` from `web/src/engine/moments.js:46`), and only the fields the verifier reads — `meta: { start_date, area }`, `agents` (household entries), `totals: { per_member: <household keys only> }`, `trips` → `{ id, agent, day, depart_min, arrive_min, minutes, purpose, mode, distance_m, from: { id, label, kind }, to: { id, label, kind }, parts }` (drop `path`), `aways` → `{ agent, day, kind, start_min, end_min, label, detail: { ride: { minutesTotal }, rides: { out: { minutesTotal }, back: { minutesTotal } }, ride_minutes } }` (only the keys present), `decisions` → `{ id, agent, day, kind, chosen_key }`.
- `inapplicableItems(loaded, run, home = null)`: also return deterministic engine-backed items whose `engineValue(id, run, { home })` is `null` (e.g. no money doc → C02 cannot be checked for that home). `verifyComparison` passes `homes[label]`. The inapplicable reason for those reads `"이 집 자료로 계산할 수 없어요"` (keep `"이 집 기록에 해당 장면이 없어요"` for judge items) — pass a `reasons` map through `opts.inapplicable` as `[{ item_id, reason_ko }]` or keep ids and add `opts.inapplicableReasons`; keep 29j1's tests green.

### 2. `web/src/chat/custom-money.js` — `verifyHomeFor(moneyDoc, label)` (pure, exported)
- US doc (`moneyDoc.us_rent`): `{ monthly_won: homes[label].rent_usd_month, currency: "USD" }` (null rent → `{}`).
- KR doc: tenure `moneyDoc.default_tenure[label]` → `moneyDoc.homes[label].by_tenure[tenure].housing.monthly_won` + `maintenance_won_month: moneyDoc.assumptions.maintenance_won_month`; anything missing → `{}`.
- No doc → `{}`.

### 3. `web/src/ui/consult-client.js` — `postReportStream({ provider, persona, labels, runs, homes, names, lang, byoKey = "" }, onEvent)`
Same shape as `postConsultStream` (`consult-client.js:99-160`, reuse `parseNdjson`): body `{ task: "report", stream: true, provider, persona, labels, runs, homes, names, lang }`; calls `onEvent` per line; resolves with the `done` line; `!LIVE_API` → `{ off: true }`.

### 4. `web/src/ui/chat.jsx` — run → report
In `handleRun` (`grep -n "async function handleRun"`), right after the result `setMessages(...)` that stores `payload` and before the 27d diary block, when `LIVE_API`:
- `persona = personaFor(st.profile, { noCommute })`; `homes = Object.fromEntries(labels.map((l) => [l, verifyHomeFor(moneyDoc, l)]))`; `slim = Object.fromEntries(labels.map((l) => [l, slimRunForReport(runs[l])]))`.
- set the sim message `data.report = { status: "checking", persona, attempts: [] }`; then `postReportStream({ provider, persona, labels, runs: slim, homes, names: payload.names, lang: LANG, byoKey }, onEvent)` without blocking (like the diary `.then`). `attempt` lines append to `data.report.attempts`; `done` sets `data.report = { ...done, persona, attempts: done.attempts }`; a thrown error sets `status: "failed"`.
- When `done.status === "handoff"`: `pushMsg({ role: "assistant", kind: "handoff", data: { question_ko: done.handoff.question_ko, simId } })`.
- Not `LIVE_API` → `data.report = { status: "off" }`.

### 5. `web/src/ui/chat.jsx` — `ReportCheck` (new exported component, next to `DiarySection`, `chat.jsx:~672`) rendered in `SimulationCard` right **above** `<DiarySection …>` (`chat.jsx:~912`)
Props `{ report, names, onRetry }`. Nothing when `report` is missing.
- `checking` with no attempts: `<Text type="supporting">Muse가 비교 리포트를 쓰고, 코드가 숫자와 근거를 확인하는 중…</Text>`.
- Timeline (any status with attempts): section label `비교 리포트 검증`, then one row of steps `1차 반려 (67%) → 2차 통과 (83%)` — each step `${n}차 ${pass ? "통과" : "반려"} (${Math.round(weighted_coverage*100)}%)`, a `→` between steps, `title={summary_ko}`, pass steps styled `.ui-check-step.is-pass`, fail `.is-fail`. While still `checking`, a trailing step `${n+1}차 확인 중…`.
- `pass`: under the timeline, the verified sentences grouped by home — per home a disc (`ui-pick-disc` with `data-home`) + name, then each sentence's `text_ko` with a small supporting tag: `숫자 확인` when it has claims, `근거 ${evidence.length}개` when it has evidence. Then one supporting line: `Muse가 쓰고, 코드가 숫자를 다시 계산하고, Muse가 근거 기록을 한 번 더 판정했어요.`
- `handoff`: the same sentences; sentences whose id appears in `result.failures` (any home) get the tag `확인 필요` (`.is-fail`), plus `<Text type="supporting">{result.feedback_ko[0]}</Text>`.
- `unsupported`: a `Badge`-like span `.ui-check-badge` reading `미지원` and `이 가족 유형(${PERSONA_KO[persona]})은 아직 시뮬레이션 시나리오가 없어 비교 리포트를 검증할 수 없어요.` with `PERSONA_KO = { remote_worker: "재택근무", multigen_family: "삼대 가족", pet_owner: "반려동물과 사는 가족" }`.
- `failed`: `리포트 검증을 하지 못했어요 (연결 문제).` + secondary Button `다시 검증하기` → `onRetry`.
- `off`: nothing.
- `SimulationCard` (`chat.jsx:829`) gains `onReportRetry` and passes it; the `CardMsg` call site (`chat.jsx:~1158`) passes `handlers.onReportRetry`. `onReportRetry(simId)` re-runs step 4's report request from the stored custom run (`saveCustomRun` already persists `runs`, `labels`, `moneyDoc`, `names`; keep the slim inputs in a ref keyed by `customId` instead if reading back is awkward).

### 6. Handoff bubble — new `msg.kind === "handoff"` in `CardMsg` (`chat.jsx:~1128-1170`)
Assistant bubble: the `question_ko` text, then two buttons: primary `확인했어요` → set the linked sim message `data.report.confirmed = true` and push `{ role: "assistant", kind: "text", content: "확인해 주셔서 고마워요. 확인이 필요한 문장은 표시해 둔 채로 결과를 열어 둘게요." }`; secondary `다시 검증하기` → `onReportRetry(simId)`. After either click the buttons hide (store `data.done = true` on the handoff message).

### 7. Gate the result (pure helper + two call sites)
- `export function reportUnlocked(messages)`: the latest `simulation` message's `data.report`: missing (recorded / older payloads) → true; status `off`, `pass`, `unsupported` → true; `handoff` → `confirmed === true`; `checking`, `fail`, `failed` → false.
- Muse turn effects (`chat.jsx:~2387`, the `eff.type === "scene"` branch): when `eff.panel === "result"` and `!reportUnlocked(stateRef.current.messages)` → do not set `pendingScene`; push `{ role: "assistant", kind: "text", content: "비교 리포트를 검증하는 중이에요. 통과하면 결과를 열게요." }` once.
- `handleViewResult` (`chat.jsx:~2903`): same check, same line, no scroll.
- Agent context (`chat.jsx:~2301`, `const ctx = { … }`): add `report_status` = the latest sim message's `data.report.status` (`handoff` + `confirmed` → `"handoff"`; `handoff` unconfirmed → `"checking"`), omitted when there is no report.

### 8. CSS (`web/src/ui/ui.css`, near the result section rules) and `web/src/i18n/en.js`
`.ui-check-steps { display: flex; flex-wrap: wrap; gap: var(--ui-s8); align-items: center; }`, `.ui-check-step { padding: 2px var(--ui-s8); border-radius: var(--ui-r-chip); background: var(--ui-sunken); }`, `.ui-check-step.is-pass { color: var(--ds-success, var(--ui-ink-1)); }`, `.ui-check-step.is-fail { color: var(--ds-danger, var(--ui-ink-1)); }`, `.ui-check-badge { … same pill … font-weight: var(--ui-w600); }` — tokens only, no ellipsis, no `text-overflow`. Add English for every new Korean string (`비교 리포트 검증` → `Report check`, `1차 반려 ({0}%)` style patterns → `Try {n}: sent back ({0}%)` / `Try {n}: passed ({0}%)`, `미지원` → `Not supported`, `확인했어요` → `Got it`, `다시 검증하기` → `Check again`, `숫자 확인` → `Numbers checked`, `근거 {0}개` → `{0} records cited`, `확인 필요` → `Needs a look`, and the full sentences above).

## Tests — new `web/tests/report-check-29j3.test.js`
- `slimRunForReport`: on a hand-made run with a background agent `b01` and trips with `path`, the slim run has no `b01` trips and no `path`, and `engineValue("C01")`, `judgeCandidates(_, "C06")` give identical results on full and slim.
- `inapplicableItems(loaded, run, {})` includes `C02`; with `{ monthly_won: 500000 }` it does not.
- `verifyHomeFor`: US doc → `{ monthly_won: 4261, currency: "USD" }`; KR doc fixture → monthly + maintenance; missing → `{}`.
- `reportUnlocked`: no report → true; `checking` → false; `handoff` → false, with `confirmed` → true; `pass`/`unsupported`/`off` → true.
- SSR (`renderToStaticMarkup`) of `ReportCheck`: attempts `[{attempt:1,pass:false,weighted_coverage:0.67},{attempt:2,pass:true,weighted_coverage:0.83}]`, status `pass` → text contains `1차 반려 (67%)` and `2차 통과 (83%)` and a sentence text; status `unsupported` with persona `pet_owner` → contains `미지원` and `반려동물과 사는 가족`; `checking` with one attempt → contains `2차 확인 중`.
- `chat.jsx` source: the `handoff` kind renders `확인했어요` and `다시 검증하기`; `postReportStream` is called inside `handleRun`; the scene effect branch checks `reportUnlocked`.

Run only:
```
cd web && node --test tests/report-check-29j3.test.js tests/verify-compare-29j1.test.js tests/submit-report-29j2.test.js $(grep -ln "SimulationCard\|handleViewResult\|DiarySection\|custom-money" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
`web/src/consult/*` (29j2), the diary flow's behavior, relay, recordings, the engine, `briefs/`.

## Final message
Changed files, one line each. Nothing else.
