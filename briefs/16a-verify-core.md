# Stage 16a — Built-in verification on the user's ground truth (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `verify-16a`. Commit after each part (`git add -A web/src/verify web/tests scenarios/verify && git commit -m "16a: …"`).

**Create new files only**, in `web/src/verify/` and `web/tests/verify-*.test.js`, plus edits to `scenarios/verify/ground_truth.json` where part 1 says. Do not modify any other existing file. Two other stages are changing UI, render, engine and money files at the same time.

The user wrote the ground truth and a reference scorer:
- `scenarios/verify/ground_truth.json`: 9 common items + 5 personas (5–6 items each), `must`/`should`, weights 3/1, `verify: deterministic | judge`, acceptance must 100 % and weighted ≥ 0.8, 3 retries then the user.
- `tools/verify_checklist.py`: the reference scorer (keyword match). Treat it as the spec for scoring; your JS must give the same numbers on clean input.

Read these once each before the first edit: the two files above, `docs/hackathon-checklist.md` section 7, `web/src/engine/simulate.js:20-170` (run shape: `trips` with `purpose` commute/errand/park/clinic/school, `aways`, `decisions`, per-agent totals), `web/src/engine/decisions.js:1-60` (`decided_by`, `reason_ko`, `ref_ids`), `web/src/judge/guards.js` (import its number extraction; do not copy it). First edit within 8 tool calls.

Everything is pure (no DOM, no three.js, no network), deterministic, plain objects in and out.

## Audit results from the orchestrator (fix these)
Measured by running the reference scorer on all five personas (2026-10-29):
1. **False positives from short keywords.** "향후 이사 계획" and "방향 감각" cover C04 (keyword "향"). "짐작" covers C07 ("짐"). "주차장(parking)" covers F03 ("park"). "recall" covers R02 ("call"). "안전한 투자" covers F02 ("안전"). "아침 식사 메뉴" covers C09. "병원비" covers F05/M02.
2. **Negation counts as coverage.** "소음은 확인하지 않았어요" covers C03.
3. **One line can cover many items.** "엘리베이터 대기" covers C09, F04 and M01 at once. A single line that lists one keyword per item passes every persona at 100 %.
4. Overlaps per persona: young_family C03~F06, C09~F04 · remote_worker C03~R02, C04~R05 · newlywed C01~N01, C06~N03 · multigen C09~M01/M03/M04, M03~M04.

## 1. Ground truth: engine support map
- Our engine cannot back every item yet. Add to each item in `ground_truth.json` an `engine` field: `"supported"`, `"partial"` or `"none"`, plus `engine_source` (what backs it), using exactly this table (the orchestrator checked the code):
  - supported: C01 (commute trips), N01 (per-member commute), C05 (errand trips), F03 / P02 (park trips)
  - partial: C02 (전세 money timeline; 월세·관리비 only when the listing has them), F01 (`school` trips; daycare is the child's school anchor), F05 / M02 (`clinic` trips)
  - none: every other item (no listing field for orientation, elevator, step-free, internet, pets, rooms; no event kinds noise, late_return, storage, move_in, maintenance_issue, morning_routine, child_outing, work_session, delivery, elder_outing, daily_routine)
- Add `persona_map`: `young_family → scenarios/personas/dual-income-child.json`, `newlywed_couple → newlywed-couple.json`; `remote_worker`, `multigen_family`, `pet_owner` → null (no scenario yet). Add `single_firstjob` as an alias of the common items only, for `single-firstjob.json`.
- Keep the user's ids, labels, weights and acceptance unchanged.
- Commit `16a: ground truth engine map`.

## 2. Checklist scorer (JS port + the audit fixes)
- `web/src/verify/checklist.js`:
  - `loadGroundTruth(json, persona)` and `scoreChecklist(persona, agentItems, { judge })` → `{ passed, must_coverage, weighted_coverage, covered, missing, feedback_ko }`, same numbers as `tools/verify_checklist.py` on clean input.
  - Fixes:
    - Keywords of 1 Korean syllable or ≤ 4 Latin letters only match as a whole word (Korean: the syllable followed by a particle or space, e.g. "남향", "향이" yes, "향후", "방향" no; Latin: `\b…\b`). Put the rule in one function, tested.
    - Negation guard: an agent item containing 않, 안 했, 못, 없이, 제외, "skip", "not" next to the keyword does not cover it.
    - One-to-one matching: each agent item covers at most one ground-truth item (greedy by priority must → should, then by keyword length). A line that lists many keywords counts once.
  - `judge` is an injected async function for unmatched items (Muse Spark later); default none.
- Tests: the clean labels of each persona pass at 1.0 (parity with the Python numbers, hard-code them); every false positive in the audit list above no longer covers; the one-line keyword salad fails; negation fails.
- Commit `16a: checklist scorer`.

## 3. Report claim checks
- A report is `{ persona, home, sentences: [{ id, text_ko, item_id, claims: [{ field, value, unit, member? }], evidence: [ref_id…] }] }`.
- `web/src/verify/numbers.js`: for `verify: "deterministic"` items with `engine: supported|partial`, compute the engine value from the run and compare with the item's `rule` tolerance (C01/N01 ±5 min, C05/F01/F03/P02 ±2 min, F05/M02 ±3 min, C02 exact won). Numbers in `text_ko` with no claim → "근거 없는 숫자".
- `web/src/verify/evidence.js`: `evidenceIndex(run)` (trip, away, decision ids and decisions' `ref_ids`); a `judge` item's sentence needs at least one evidence id from the index, else "근거 없는 문장". The judge model call itself is injected later.
- Items with `engine: "none"` are reported as `미지원` and are never counted as covered or as failed. When a `must` item is `none`, the result says "엔진이 아직 확인할 수 없는 필수 항목" and acceptance uses the supported must items only. Never claim a pass on an unsupported must item.
- Tests with a tiny hand-made run (3 trips, 1 decision).
- Commit `16a: claim checks`.

## 4. Verify loop
- `web/src/verify/loop.js`:
  - `verifyReport(report, run, persona)` → `{ pass, must_coverage, weighted_coverage, unsupported, failures: [{ sentence_id, item_id, kind, reason_ko }], feedback_ko }`.
  - `runVerifyLoop({ draft, revise, run, persona, maxRetries })`, `maxRetries` from the ground truth (3). After the last fail: `handoff = { ask_user: true, question_ko }` (`on_fail_after_retries: "escalate_to_user"`).
  - Returns the attempt log for the demo: "검증 실패: 근거 없는 문장 2개, 커버리지 50%" → 67 % → 83 % 통과.
- Tests with a fake `revise` that fixes one problem per attempt, and one that never fixes (handoff).
- Commit `16a: verify loop`.

## End
- `cd web && node --test tests/verify-*.test.js 2>&1 | tail -6` and `npm test 2>&1 | tail -6` (one `share.test.js` failure may come from another stage; say so if it is the only one).
- `briefs/16a-RESULT.md`: files, exports, the support map per persona (how many must/should items are supported), parity numbers vs Python, and a sample attempt log.
- Commit.
