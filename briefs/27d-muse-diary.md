# Stage 27d — After the 30 days, Muse writes "my diary" and the result paragraph; code checks every line (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section: no git, no full suite, no build, no exploring). Branch `chat-27` (27a–27c2, 27b3 are in). First edit within 3 tool calls. Read only the line ranges quoted here (use `grep -n` when numbers moved). When the named tests pass, stop.

## Why
User decision (2026-10-31): the engine lives the 30 days (seconds, in the browser worker, as today in `handleRun`). Then Muse reads the record and writes, as the person who lived there, a short diary per home and one result paragraph for the customer. Code checks every line against the record: each line cites a record id and may only use that record's numbers. A failed line goes back to Muse once with the reasons, then is dropped. The checklist's "verification built in, feedback loop" design (`docs/hackathon-checklist.md` §7) becomes visible here: "✓ 문장 9개 모두 기록과 대조 · 1번 고쳐 씀".

## Changes

### 1. Record digest (pure) — new `web/src/diary/digest.js`
Export `runDigest(run, label, { name = "", maxFacts = 40 } = {})` → `{ label, name, facts, totals }`.
- Household members only (same rule as `householdKeys` in `web/src/engine/moments.js:46`; export it from there if needed, or re-implement it the same way).
- `facts`: code-written one-liners, each `{ id, day, minute, kind, text_ko, numbers }`. `id` must be in `evidenceIndex(run)` (`web/src/verify/evidence.js:20-35`; aways use `awayId`). `numbers` lists every number that appears in `text_ko`. Kinds:
  - `commute`: each workday's morning door-to-door 출근, e.g. `2일째 출근 31분 (집 08:05 출발)`. Use the trips / aways the way `commuteCandidate` in `moments.js` does, and the trip or away id.
  - `crowded`: a measured ride leg (`leg.congestion.hasData`, not 가정값, as in `crowdedCandidate`, `moments.js:101-135`) at 80 % or more, e.g. `9일째 2호선 잠실→강남 혼잡 93% (실측)`.
  - `evening`: an evening away (park, errand) with its kind and minutes.
  - `late`: arrival home at or after 22:00.
  - `decision`: a decision whose choice differs from the rule default, with its `reason_ko` (as in `decisionCandidate`).
  Order by day and minute. Cap at `maxFacts`, keeping every kind represented (round-robin by kind if over the cap).
- `totals`: `{ one_way_min: oneWayCommuteOfRun(run) }` (`web/src/verify/numbers.js:192`, rounded), plus `park_visits` and `late_returns` counts from the facts' source data. Each total is a number or `null`.

### 2. Muse writes, code checks — new `web/src/consult/diary.js`
- `DIARY_PROMPT` (Korean):
  > 너는 이 집들에서 각각 30일을 살아 본 '나'다. 아래 기록(facts)만 보고 쓴다.
  > 1) 집마다 일기 4~6줄. 한 줄은 fact 하나만 다루고 그 fact의 id를 단다. 일기체(~했다), 짧게, 그날의 느낌을 한마디 덧붙여도 되지만 숫자는 그 fact에 있는 숫자만 쓴다.
  > 2) summary: 고객에게 존댓말로 두 집의 차이를 3문장 이내로. 숫자는 totals와 facts에 있는 것만. 어느 집이 낫다, 계약하라 같은 판단은 하지 않는다.
  > JSON으로만 답한다: {"summary": "...", "lines": [{"home": "A", "id": "<fact id>", "text": "..."}]}
- `writeDiary({ complete, provider, digests })`:
  - one `complete({ provider, messages: [system DIARY_PROMPT, user JSON.stringify(digests)], maxTokens: 2000 })`; parse the content as JSON (strip a ```json fence if present);
  - `checkDiary(parsed, digests)`;
  - on failures, one retry with a user message listing them (`줄 n: <이유>`), then check again;
  - drop the lines that still fail. If the summary fails, replace it with a code-built line from totals, e.g. `A는 출근 편도 평균 {a}분, B는 {b}분이었어요.`, and mark `summary_fallback: true`.
  - Return `{ ok: true, summary, lines, check: { total, passed, retried, dropped, summary_fallback }, usage }`. Each kept line gets the fact's `day` and `minute` added.
- Export `checkDiary(parsed, digests)` → `{ failures: [{ index, reason_ko }], summaryOk }`. A line fails when:
  - its `home` is unknown;
  - its `id` is not one of that home's fact ids (`근거 없는 줄`);
  - a number in `text` is not in that fact's `numbers` (`기록에 없는 숫자`);
  - it is empty or over 80 chars.
  The summary fails when it has a number not found in any digest's totals or facts numbers, or contains `추천` / `계약하` / `사세요` / `낫다`.
  For number extraction reuse the judge guard helpers (`web/src/judge/guards.js:147-200`, `contextNumbers` / `findInventedNumbers`) rather than a new regex.

### 3. Route — `web/src/consult/server.js`
In the handler, after the key is resolved (`grep -n "resolveProxyKey"`): when `body.task === "diary"`, validate `body.digests` (array of 1–3, each with ≤ 60 facts), call `writeDiary` with the same `completeWithTools` the agent uses (no tools), and respond JSON. The scenario check (`body.scenario must be an object`) does not apply to this task. Errors use the same redaction.

### 4. Client — `web/src/ui/consult-client.js`, `web/src/ui/chat.jsx`
- `postDiary({ provider, digests })`: POST `/api/consult` `{ task: "diary", provider, digests }`, same error handling as `postConsult`.
- In `handleRun`, right after the message is updated with the done `payload` (`grep -n "const payload = { status: \"done\""`), when `LIVE_API`:
  - build `digests` with `runDigest(runs[l], l, { name: names[l] })` for each label;
  - set `data.diary = { status: "writing" }` on that message, call `postDiary`, and on success set `data.diary = { status: "done", ...result }`, else `{ status: "failed" }`;
  - on success, also push one assistant text message: `다 살아 봤어요. ` + `result.summary`, with `suggestions: ["출근길 보여 줘", "한 달에 얼마 들어?", "동네 걸어 보기"]`.
  - Do this without blocking the run result: the result card renders first.
- `ResultSummary` (`chat.jsx:387`), top of the card:
  - `writing` → supporting text `Muse가 기록을 읽고 일기를 쓰는 중…`;
  - `done` →
    - the summary paragraph with a small `Muse` badge;
    - a `살아 본 일기` section: one row per line with the home disc, `{day+1}일째 {HH:MM}` (use the existing `hhmm`), the text, and a ghost button `장면 보기` → `onScene({ url: simMomentUrl({ custom: data.customId, home: line.home, day: line.day + 1, t: hhmm(line.minute), follow: 1, embed: true }), title: … })`;
    - the check line `✓ 문장 {passed}개 모두 기록과 대조` plus ` · {retried}번 고쳐 씀` when `retried > 0` (if `dropped > 0`: ` · {dropped}줄은 근거가 없어 뺐어요`);
  - `failed` → nothing extra.
  Export `diaryCheckLine(check)` for the test.

## Tests — new `web/tests/diary-27d.test.js`
- Run the engine on `tinyScenario({ days: 3, background: 0 })` / `tinyArea()` (`web/tests/engine-fixture.js`; follow how an existing test calls `simulate`). `runDigest` → every `facts[i].id` is in `evidenceIndex(run)`; every number in `text_ko` is in `numbers`; `totals.one_way_min` is a number or null.
- `checkDiary`: a line with an unknown id fails `근거 없는 줄`; a line with `45분` when the fact says 31 fails `기록에 없는 숫자`; a good line passes; a summary with `A가 낫다` fails.
- `writeDiary` with a fake `complete`: the first reply has one bad line, the retry reply fixes it → `check.retried === 1`, `dropped === 0`. A second fake that stays bad → the line is dropped and `dropped === 1`. Fenced JSON parses.
- `diaryCheckLine({ passed: 9, retried: 1, dropped: 0 })` → `✓ 문장 9개 모두 기록과 대조 · 1번 고쳐 씀`.

Run only:
```
cd web && node --test tests/diary-27d.test.js tests/chat-muse-27b2.test.js tests/scene-panel-27c1.test.js 2>&1 | tail -15
```
