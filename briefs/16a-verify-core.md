# Stage 16a — Built-in report verification, pure core (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `verify-16a`. Commit after each part (`git add -A web/src/verify web/tests && git commit -m "16a: …"`).

**Create new files only**, in `web/src/verify/` and `web/tests/verify-*.test.js`. Do not modify any existing file. Two other stages are changing the UI, render, engine and money files at the same time.

Read only these, once each, before the first edit:
- `docs/hackathon-checklist.md` section 7 (the design this stage implements)
- `web/src/engine/simulate.js:20-170` (the run shape: `trips`, `aways`, `decisions`, per-agent and household totals such as `commute_ride_minutes`, `errands_done`, `park_visits`)
- `web/src/engine/paired.js:35-50` (`engineMetrics`)
- `web/src/engine/decisions.js:1-60` (decision log fields: `decided_by`, `reason_ko`, `ref_ids`)
- `web/src/judge/guards.js` (reuse its number extraction; do not copy-paste, import it)

The first edit should land within 7 tool calls.

Principle: verification is not a tool the agent may skip. It sits inside the function that emits the report. Everything here is pure (no DOM, no three.js, no network), deterministic, and takes plain objects.

## 1. Report shape and number check
- `web/src/verify/report.js`:
  - A report is `{ home, household_type, sentences: [{ id, text_ko, claims: [{ metric, value, unit }], evidence: [ref_id…] }] }`.
  - `validateReportShape(report)` → list of problems (missing ids, empty text, unknown metric).
- `web/src/verify/numbers.js`:
  - `METRICS`: the metrics a sentence may claim, each mapped to how the engine computes it from a run (e.g. `commute_minutes_per_day`, `commute_km_per_day`, `fare_won_per_trip`, `transit_spend_won_month`, `errands_done`, `park_visits`, `home_evening_minutes`). Take the formulas from `engineMetrics` and the run totals; do not invent new ones. Where a metric needs money data the run does not carry, accept it as an input argument.
  - `checkNumbers(report, run, { tolerance })` → for each claim: `{ sentence_id, metric, claimed, engine, ok, reason_ko }`. Default tolerance: exact for counts, ±1 for minutes, ±1 % for won.
  - Also flag numbers that appear in `text_ko` but not in `claims` (use the guards' number extraction): reason "근거 없는 숫자".
- Tests: a matching report passes; an off-by-10-minutes claim fails with a Korean reason; a stray number in the text is caught.
- Commit `16a: report shape + number check`.

## 2. Evidence check
- `web/src/verify/evidence.js`:
  - `evidenceIndex(run)` → a Set of every ref id the run can back: trip ids, away ids, decision ids, plus the `ref_ids` inside decisions.
  - `checkEvidence(report, run)` → per sentence: `{ sentence_id, ok, missing: [...] }`. A sentence with no evidence, or with an id not in the index, fails with "근거 없는 문장".
- Tests with a tiny hand-made run object (3 trips, 1 decision).
- Commit `16a: evidence check`.

## 3. Coverage against a ground-truth checklist
- `web/src/verify/checklist.js`: `CHECKLISTS` keyed by household type: `single` (사회초년생), `couple` (예비 부부), `family` (자녀 가족). Each item: `{ id, label_ko, metrics: [...], required: true|false }`. Examples:
  - all: 출퇴근 시간, 출퇴근 혼잡, 교통비, 장보기 동선, 저녁 여유 시간, 공원·산책
  - couple: 두 사람 출퇴근 균형
  - family: 등원·등교 거리, 아이 동반 장보기
  - Only items the engine can back with a metric or an event kind. If an item has no engine source today, keep it with `metrics: []` and `status: "엔진 미지원"`; it never counts toward coverage.
- `web/src/verify/coverage.js`:
  - `coverage(report, run, type)` → `{ covered: [ids], missing: [ids], unsupported: [ids], ratio }`. An item is covered when at least one sentence claims one of its metrics **and** passes both the number and evidence checks.
  - `PASS_RATIO = 0.8` (exported, adjustable).
- Tests: 3 of 6 supported items → 0.5; 5 of 6 → 0.83 → pass.
- Commit `16a: checklist coverage`.

## 4. The verify loop (no model call here)
- `web/src/verify/loop.js`:
  - `verifyReport(report, run, type, opts)` → `{ pass, ratio, failures: [{ sentence_id, kind, reason_ko }], feedback_ko }`. `feedback_ko` is the short Korean text a writer agent gets back for a retry (which sentences to fix and why, which checklist items are missing).
  - `runVerifyLoop({ draft, revise, run, type, maxAttempts = 3 })`:
    - `draft` is the first report; `revise(report, feedback_ko, attempt)` is an injected async function (the model writer lives elsewhere, later).
    - Verify, then revise with the feedback, until pass or `maxAttempts`.
    - Returns `{ final, attempts: [{ attempt, ratio, pass, failures }], handoff }`. After 3 fails, `handoff` is `{ ask_user: true, question_ko }` asking the user to confirm the unclear condition; otherwise null.
  - The attempt log is what the demo shows: "검증 실패: 근거 없는 문장 2개, 커버리지 50%" → 67 % → 83 % 통과.
- Tests with a fake `revise` that fixes one problem per attempt: ratios 0.5 → 0.67 → 0.83, pass on attempt 3; a `revise` that never fixes → `handoff.ask_user` after 3.
- Commit `16a: verify loop`.

## End
- Run `cd web && node --test tests/verify-*.test.js 2>&1 | tail -6` and `npm test 2>&1 | tail -6` (one failure in `share.test.js` may come from another stage; say so if it is the only one).
- Write `briefs/16a-RESULT.md`: files, exported functions, the metric table, and a sample `attempts` log.
- Commit.
