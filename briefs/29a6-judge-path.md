# Stage 29a6 — The judge path: watch a recorded month, Meta HQ, Seoul (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Judges open the public site once, mostly outside Korea, with no key and limited time. Today:
- English is already the default for non-Korean browsers (`web/src/i18n/lang.js:2-11`, `detectLang`) — keep it.
- The landing hero (`web/src/ui/landing-page.jsx:~175-190`) offers `시작하기` and one Seoul example. Nothing says "watch it work without typing", and the Meta HQ case (`us-menlo`, 26c, `web/src/ui/chat.jsx:~1435-1445`) is invisible.
- If the relay is over its limit (429, `relay/handler.js:~128-137`) or static-off (`STATIC_OFF_LINE`, `chat.jsx:~1180`), the judge sees a rules answer and has no way to see what Muse actually does.

The fix: a keyless **recorded conversation** that replays a real Muse Spark session step by step, plus three clear entry buttons.

## Change

### 1. Recording format and loader — new `web/src/chat/recording.js`
A recording is exactly the transcript document `saveTranscript` already writes (`web/src/chat/urls.js:156`; fields `messages, toolRows, profile, candidatesData, picks, exampleId, scenario, intake, household, overrides, usageLog, compare`, see `chat.jsx` `saveTranscript({` call) plus
`meta: { id, title, titleEn, recordedAt, model, lang }`.
Export:
- `validateRecording(doc)` → `{ ok, errors }` (messages array non-empty, every message has `role` and `kind`, `meta.id` matches `/^[a-z0-9-]+$/`, `meta.model` a string).
- `recordingUrl(id)` → `appUrl("recorded/" + id + ".json")` (`web/src/paths.js`).
- `replaySchedule(messages)` → array of `{ index, delayMs }`: user messages 700 ms after the previous step, assistant text 1200 ms, cards (`kind` not `text`/`system`) 1600 ms. Pure.
- `RECORDINGS` — list of known ids with titles: `[{ id: "menlo-month", title: "Meta 본사 출근 · 두 사람의 한 달", titleEn: "Commuting to Meta HQ · a month for two" }, { id: "seoul-couple", title: "강남 출근 예비부부 · 30일", titleEn: "Engaged couple, Gangnam commute · 30 days" }]`.
The orchestrator records the two JSON files into `web/public/recorded/` from real live sessions after this stage; for the tests, put one small fixture at `web/tests/fixtures/recording-mini.json` (3 messages, hand-written, `meta.model: "fixture"`).

### 2. Replay mode — `web/src/chat/urls.js` and `web/src/ui/chat.jsx`
- `?replay=<id>` (add to the parsed chat params next to `ask`, `chat/urls.js:~36`; routes to chat mode in `routeForSearch`).
- In `ChatScreen`'s first-load effect (`chat.jsx:~2170-2230`, before `loadTranscript()`), when `replay` is set: fetch `recordingUrl(id)`, `validateRecording`; on failure show one system line `기록을 불러오지 못했어요 · 직접 해 보기` and stop. On success set `profile`, `toolRows`, `candidatesData` (open the work panel when the first `candidates` message is revealed, not before), `household`, `intake`, then reveal `messages` one by one with `replaySchedule`. **No call to `/api/consult` or the model in replay mode** (gate the send path; the composer is read-only while replaying).
- A sticky banner at the top of the thread while `replay` is set: `기록된 대화 · {meta.recordedAt 날짜} {meta.model} 실제 답변 · 키 없이 재생` + ghost sm `건너뛰기` (reveal all now) + secondary sm `직접 해 보기` (clears replay, keeps the language, opens an empty chat). English via en.js: `Recorded conversation · real {model} answers from {date} · plays without a key`, `Skip`, `Try it yourself`.
- Simulation cards in a recording keep their recorded `data` (done state, inline `compare`); if the 3D button needs a run that is not in IndexedDB, the existing `onRun` path recomputes it locally (rules decisions) — do not change the engine.

### 3. Three entry buttons — `web/src/ui/landing-page.jsx` hero and the chat empty state
Hero CTA group (replace the current two buttons, same `ds-lp-*` classes):
- primary `기록된 한 달 보기` / `Watch a recorded month` → `appUrl("?replay=menlo-month")` when `currentLang()` is `en`, `?replay=seoul-couple` when `ko` (keep `lang`).
- secondary `Meta 본사 출근으로 해 보기` / `I work at Meta HQ` → `chatUrl("I work at Meta HQ in Menlo Park. Two of us, rent up to $4,000 a month.")`.
- secondary `서울로 해 보기` / `Try Seoul` → `chatUrl(EXAMPLE_PROMPTS[0].prompt)`.
A one-line note under them (`--ds-ink-2`, 13 px): `기록 재생은 키 없이 돼요. 직접 해 보기는 Muse에 실시간으로 물어요(하루 한도 있음).` / English in en.js.
The chat empty state (the greeting / starter chips, `grep -n "GREETING\|starter" web/src/ui/chat.jsx`) shows the same three as its first chips.

### 4. When Muse is unavailable
Where the 27j rules-fallback system lines and `STATIC_OFF_LINE` are pushed (`grep -n "Muse가 이어받아요\|STATIC_OFF_LINE\|rate_limited" web/src/ui/chat.jsx web/src/ui/consult-client.js`), add a secondary sm button `기록된 대화 보기` / `Watch the recorded conversation` that opens `?replay=…` (same id choice as the landing). A 429 from the relay shows `오늘 Muse 사용 한도에 닿았어요. 기록된 대화로 보시거나 내일 다시 와 주세요.` instead of the generic slow line.

## Test — new `web/tests/judge-path-29a6.test.js`
- `validateRecording(fixture)` ok; missing `meta.id` or empty `messages` → not ok.
- `replaySchedule` on [user, text, candidates] → delays `[700, 1200, 1600]`.
- `routeForSearch("?replay=menlo-month")` → `"chat"`; parsed params carry `replay`.
- Landing SSR (both `ko` and `en` via the existing lang hook the landing tests use, `grep -ln "LandingPage" web/tests/*.test.js`) contains the three labels and `replay=`.
- `chat.jsx` source: the replay branch never calls the consult client (assert the send path checks `replay` before `consult`), the banner strings exist, en.js has `Watch a recorded month`, `I work at Meta HQ`, `Try Seoul`.

Run only:
```
cd web && node --test tests/judge-path-29a6.test.js $(grep -ln "LandingPage\|routeForSearch\|saveTranscript" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
If an older landing pin asserts the removed hero buttons, update only that pin.

## Do not touch
Map / 3D / engine files, `candidate-card.jsx`, `intake.jsx`, `web/src/i18n/dom.js`, `relay/`.

## Final message
Changed files, one line each. Nothing else.
