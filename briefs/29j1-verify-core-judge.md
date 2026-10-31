# Stage 29j1 — Verify core: two judge items get real engine evidence, an injected Muse judge, and a two-home comparison loop (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the files/line ranges named here. Stop when the named tests pass.

## Why
The report verifier (`web/src/verify/`, stage 16a/16b) is pure and tested but checks judge items only for "is the cited id real?", and every judge item in `scenarios/verify/ground_truth.json` is `engine: "none"`, so no judge sentence is ever checked. The engine already records two judge-worthy things per run (`web/src/engine/life-events.js`):
- `darkSide(run)` (`life-events.js:66-140`): household commute trips that arrive **home after sunset** (`sunsetMinFor(run.meta)`), evidence = trip ids.
- `lateSide(run)` (`life-events.js:166-190`): household trips that arrive **home at or after 22:00** (`LATE_MIN = 1320`), evidence = trip ids.

These back two ground-truth items honestly: **C06 야간 귀갓길 안전** (dark_walk + late_home) and **N03 늦은 귀가 시 대중교통 막차** (late_home; the engine has no last-train timetable, so `partial`). Noise (C03) and morning bathroom/elevator congestion (C09) have **no** engine events and stay `none` — do not map them to anything.

The verifier also works on one run, while the product compares two homes. This stage adds the comparison layer the server (29j2) and the UI (29j3) will call.

## Changes

### 1. `scenarios/verify/ground_truth.json`
- C06: `"engine": "supported"`, `"evidence_events": ["dark_walk", "late_home"]`, `"engine_source": "life-events: household commute trips arriving home after sunset (dark_walk) and trips arriving home at/after 22:00 (late_home); evidence = trip ids"`.
- N03: `"engine": "partial"`, `"evidence_events": ["late_home"]`, `"engine_source": "life-events: household trips arriving home at/after 22:00 (late_home); evidence = trip ids. No last-train timetable in the engine."`.
- Nothing else changes.

### 2. `web/src/engine/life-events.js` — new pure export (after `lifeEvents`)
`lifeEventTrips(run, kind)` → array of `{ id, agent, day, depart_min, arrive_min, minutes, mode, from_label }` for `kind` `"dark_walk"` (same filter as `darkSide`) or `"late_home"` (same filter as `lateSide`), in run order. Reuse the existing filters (extract a small shared predicate per kind; `darkSide`/`lateSide` outputs must not change).

### 3. `web/src/verify/evidence.js`
- New export `judgeCandidates(run, itemId)`: C06 → `lifeEventTrips(run,"dark_walk")` ∪ `lifeEventTrips(run,"late_home")` (dedupe by id); N03 → `lifeEventTrips(run,"late_home")`; any other item → `[]`. Each entry gains `text_ko`, e.g. `"12일 19:42 집 도착 · 자전거 13분 (Meta HQ (1 Hacker Way)에서)"` (day is 1-based: `day + 1`; time via `hhmm` from `web/src/timeline.js`; mode `bike` → 자전거, else 걸어서).
- New export `citedEvents(run, ids)`: for each id in the run's `evidenceIndex`, a compact record — trip → `{ id, type: "trip", day: day+1, depart: hhmm, arrive: hhmm, purpose, minutes, mode, from_label, to_kind }`; away → `{ id, type: "away", day: day+1, kind, start: hhmm, end: hhmm, label }`; decision → `{ id, type: "decision", day: day+1, kind, chosen_key }`. Unknown ids are skipped.
- New export `async function judgeEvidence(report, run, loaded, judge)`: for every sentence whose item is engine-backed (`engine !== "none"`) and `verify === "judge"` **and** that already cites ≥1 indexed id, call `await judge(sentence, citedEvents(run, sentence.evidence))`; when it returns `{ supported: false, reason }` push `{ sentence_id, item_id, kind: "judge", reason_ko: "근거가 문장을 뒷받침하지 않아요" + (reason ? ` (${reason})` : "") }`. `judge` null → `{ failures: [] }`. A judge that throws counts as no failure for that sentence but adds `{ judge_error: true }` to the returned object.
- Update the file's header comment: C06/N03 are engine-backed now; the judge model call is injected through `judgeEvidence`.

### 4. `web/src/verify/loop.js`
- `verifyReport(report, run, persona, opts)` gains `opts.inapplicable` (array or Set of item ids, default empty): those items are removed from `supported` (they count neither as covered nor missing) and listed in a new result field `inapplicable: [{ item_id, reason_ko: "이 집 기록에 해당 장면이 없어요" }]`. Also `opts.extraFailures` (array, default empty) merged into `failures` before coverage is computed. Everything else is unchanged.
- Export `attemptSummary` (today a private function).

### 5. `web/src/verify/numbers.js` — currency for C02
`engineValue("C02", run, { home })`: when `home.currency === "USD"` return `{ value, unit: "$" }`; the C02 mismatch reason in `checkNumberClaims` reads `보고한 $4,300이 계산 $4,261과 달라요` for USD (`$` + `toLocaleString("en-US")`), today's 원 text otherwise.

### 6. New `web/src/verify/compare.js` (pure; no DOM, no network)
```js
// 29j1: the two-home layer over verifyReport — a report is
// { persona, sentences: [{ id, home: "A"|"B", item_id, text_ko, claims, evidence }] }.
export function personaFor(profile, { noCommute = false } = {})
export function inapplicableItems(loaded, run)
export function reportDigest({ runs, labels, homes, persona, groundTruth, names = {} })
export async function verifyComparison(report, { runs, labels, homes, persona, groundTruth, judge = null })
export async function runComparisonLoop({ draft, revise, runs, labels, homes, persona, groundTruth, judge = null, maxRetries, onAttempt = null })
```
- `personaFor`: value of `profile.members` (`profile.members.value` when it is a field object) → any `role === "child"` → `"young_family"`; `noCommute` → `"remote_worker"`; any member with `ageBand` in `["60s", "70s", "80+"]` or `role === "senior"` → `"multigen_family"`; `profile.pets` truthy (field `.value` or plain) → `"pet_owner"`; exactly one adult → `"single_firstjob"`; otherwise `"newlywed_couple"`.
- `inapplicableItems(loaded, run)`: ids of engine-backed judge items with `judgeCandidates(run, id).length === 0`.
- `reportDigest`: `{ persona, unsupported: bool, homes: { A: { name }, … }, items: [...] }` from `loadGroundTruth(groundTruth, persona)` (`web/src/verify/checklist.js`). Unsupported persona (`persona_map[persona] === null`) → `{ persona, unsupported: true, items: [] }`. For each item:
  - engine `none` → `{ id, label_ko, priority, engine: "none" }` (the writer is told to skip these).
  - deterministic → per label `values: { A: engineValue(id, runs[A], { home: homes[A] }), … }`; for **N01** per member: `values: { A: { m1: {value, unit}, m2: … } }` over `householdMembers(run)` (both from `numbers.js`).
  - judge (engine-backed) → per label `events: { A: judgeCandidates(runs[A], id).slice(0, 8), … }` (id + text_ko only).
- `verifyComparison`: for each label, `sentences.filter(s => s.home === label)` → `report_l = { persona, home: homes[label], sentences }`; judge failures via `judgeEvidence(report_l, runs[label], loaded, judge)`; `verifyReport(report_l, runs[label], persona, { groundTruth, inapplicable: inapplicableItems(loaded, runs[label]), extraFailures })`. A sentence whose `home` is not one of `labels` is a failure `"알 수 없는 집이에요"`. Returns `{ pass: every home passes, status: "미지원" when the persona is unsupported, must_coverage: min over homes, weighted_coverage: min over homes, by_home: { A: result, … }, failures: [...each with home], feedback_ko: [...each line prefixed "A: "] }`.
- `runComparisonLoop`: same contract as `runVerifyLoop` (`loop.js:105-130`) but over `verifyComparison`; after each attempt call `onAttempt?.({ attempt, summary_ko, pass, weighted_coverage, must_coverage })`; `summary_ko` from `attemptSummary`. Handoff: `{ ask_user: true, question_ko }` exactly like `runVerifyLoop`. Unsupported persona → one attempt, `status: "미지원"`, no revise call.

## Tests
New `web/tests/verify-compare-29j1.test.js` (hand-made runs like `web/tests/verify-loop.test.js:23-37`, with `meta: { start_date: "2026-11-01", area: "seoul-x" }`, `agents` m1/m2 household, trips including `to: { kind: "home" }` ones arriving 18:30 and 22:40):
- ground truth: C06 engine `supported`, N03 `partial`, C03 and C09 still `none`.
- `lifeEventTrips(run,"late_home")` returns the 22:40 trip only; `"dark_walk"` returns the commute trips home after the November Seoul sunset (17:25).
- `judgeCandidates(run,"C06")` deduped; `citedEvents` skips unknown ids and formats `arrive` as `"22:40"`.
- `judgeEvidence` with a fake judge returning `{ supported: false, reason: "시간이 안 맞아요" }` → one `kind: "judge"` failure with that reason; a sentence citing no indexed id is **not** sent to the judge (the structural check already fails it).
- `verifyReport(..., { inapplicable: ["N03"] })` removes N03 from coverage and lists it in `inapplicable`.
- `personaFor`: child → young_family; noCommute → remote_worker; pets → pet_owner; one adult → single_firstjob; two adults → newlywed_couple.
- `runComparisonLoop` with a scripted draft failing (missing C01 for home B) then a revise that fixes it → 2 attempts, first `pass: false`, second `pass: true`; `onAttempt` called twice with `summary_ko` starting `검증 실패` then `검증 통과`. Three always-failing revises → `handoff.ask_user === true`. `remote_worker` → `status: "미지원"`, revise never called.
- C02 with `home: { monthly_won: 4261, currency: "USD" }` and claim 4300 → reason contains `$4,300` and `$4,261`.

Update older pins only where they hard-code the old engine flags: `web/tests/verify-loop.test.js:92` (unsupported count 9 → the new count for young_family: C06 is engine-backed now, so 8) and the "all real judge items are engine:none" comments/assertions in `web/tests/verify-claims.test.js:199-230`.

Run only:
```
cd web && node --test tests/verify-compare-29j1.test.js tests/verify-loop.test.js tests/verify-claims.test.js tests/verify-checklist.test.js $(grep -ln "life-events\|lifeEvents" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Also run `.venv/bin/pytest -q tests 2>&1 | tail -3` from the repo root once at the end (the Python reference reads the same ground truth; it must stay green).

## Do not touch
UI files, `web/src/consult/*`, relay, recordings, `darkSide`/`lateSide` outputs, `briefs/`.

## Final message
Changed files, one line each. Nothing else.
