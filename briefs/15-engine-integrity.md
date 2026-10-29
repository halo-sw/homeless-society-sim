# Stage 15 — Engine integrity (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Commit after each part (`git add -A web pipeline tests scenarios && git commit -m "15: …"`). The first edit should land within 5 tool calls. Do not explore beyond the files named below unless a test fails.

[제품] "계약 전에 30일 먼저 살아보기" — an AI agent household lives 30 days in candidate homes and shows which one fits better, with evidence.
[목표] Anyone with a link, no sign-up, sees a result in 30 seconds and can trust what the agents did.
[원칙] The first screen is the answer; the rest is evidence on tap. The agent is the narrator. 3D is evidence only.
[금지] No new modes, tabs or buttons. The model never produces a result number. No model name, tokens or internal errors on screen. Never delete a feature (hide or move it).
[보고] Per part: changed files, gate results. Do only this stage, then stop.

**This stage changes the engine and the money data only. Do not touch `web/src/ui/`, `main.js`, `render/`, `scene/`, `chat/`.** Keep every existing field in `*-money.json` and the run objects; add new fields next to them. The UI is rebuilt in a later stage.

Why (orchestrator measured `node web/scripts/money.mjs --scenario scenarios/demo-two-homes.json`, 전세, today):

| | A 레이크팰리스 | B 백현마을 | problem |
|---|---|---|---|
| 면적 | 59.97㎡ | 84.82㎡ | different sizes compared |
| 장보기 | 33회 · 990,000원 | 17회 · 510,000원 | the gap comes from agent choices, not the home (most of the 71만 원/월 gap) |
| 교통 | 88회 × 1,500원 = 132,000원 | 0회 · 0원 | B walks to work, but walking commutes are not counted at all; fare is one assumed number |
| 출퇴근 | 126.7분/일 | 48.4분/일 | ride minutes are a 30-min assumption |
| 전세 중간값 | 9.8억 (47건) | 9.5억 (133건) | |
| 대출 | 7.8억, "갚는 기간 30년" | 7.5억 | 전세 is interest-only; an unrealistic loan with no cap |
| 남는 돈/월 | 3,349,468원 | 4,061,468원 | |
| 실거래 기간 | 202510–202610 | same | floors and period not reported next to the median |

Causes found:
- `engine/agents.js:163` — one random stream per agent (`streamFor(seed, agent.key)`). Route length changes how many draws are used, so the two homes drift apart even with the same seed.
- `engine/routines.js` (~694–703) weekend plans add supermarket/convenience trips chosen as "fastest", so the number of errands depends on the home. `money/timeline.js:83` charges a basket per errand trip from home.
- `money/timeline.js:77` charges a fare only on commute trips that touch a ride, so walking commutes vanish from the count.

## 1. Paired runs, 10 repeats
- New pure module `web/src/engine/paired.js`:
  - `runPaired(areas, scenario, { seeds, decide, decisions, region, destAreas })` → `{ seeds, runs: [{ seed, A, B }], summary }`.
  - Each seed runs A and B with the same scenario, the same start date and `scenario.seed = seed`.
  - Default seeds: `scenario.seed … scenario.seed + 9` (10 runs).
- Home-independent randomness must not depend on the route:
  - Draw schedules, departure jitter, errand days, park days and weekend wishes from streams keyed by `(seed, agent, day, purpose)` (e.g. `streamFor(seed, \`${agent}:${day}:weekend\`)`).
  - Draw them **before** any routing, so A and B see the same draws.
  - Route-dependent choices may still differ.
- Decisions:
  - Run 1 uses the given decider or replay (judged run stays byte-identical to its replay).
  - Runs 2–10 use the rule decider and are labelled `decided_by: "일정"`.
  - Never call the model for runs 2–10.
- `summary` for each home and metric gives `{ mean, min, max, n }`:
  - `commute_minutes_per_day`
  - `remaining_won_per_month` (per tenure)
  - `fatigue`
  - `grocery_won`
  - `transit_won`
- `money.mjs` writes it as `runs_summary` (keep the run-1 fields as they are).
- Tests:
  - Same seed → identical schedule draws (errand days, park days, weekend wishes) for A and B.
  - 10 runs → `n == 10` and `min ≤ mean ≤ max`.
  - A replayed judged run is still byte-identical.
- Commit `15: paired runs and repeats`.

## 2. Living costs that do not depend on the home
- Grocery spend is a household plan, not a trip count:
  - `Σ members errands_per_week × days/7 × basket_won`, computed once in a pure function `householdGrocery(scenario)`.
  - The same number for A and B.
  - Errand trips are still simulated (they cost time and fatigue) but no longer emit a grocery spend event.
  - Weekend-plan shopping is part of the plan and adds no extra spend.
- Grocery events in the timeline are spread on the planned errand days from part 1 (same days for A and B).
  - Label: `source: "가구 공통 (주 N회 × 3만 원, 가정값)"`.
- `maintenance_won_month` and `other_fixed_won_month` stay household-common.
- Test: with the seed fixed, A and B have equal non-housing living cost (grocery + maintenance + other fixed).
- Commit `15: household-common living costs`.

## 3. Count every commute, then price it
- Count every commute trip, walk or ride (`counts.commute_trips`, plus `commute_ride_trips` / `commute_walk_trips`).
  - A walking commute costs 0원 and carries `fare_note: "걸어서 출근"`.
- If a member with workdays has 0 commute trips in a run, log `[engine] commute-missing <member> <home>` and set `flags.commute_missing = true` in the result.
- Fares (this replaces stage 14d part 1, which never ran — follow it exactly):
  - New pure module `web/src/money/fare.js` with `fareForTrip({ legs, card: "transit_card", age: "adult" })`.
  - 수도권 통합 거리비례 운임 (교통카드, 성인), 시행 2025-06-28:
    - base **1,550원** up to 10 km
    - 10–50 km: +100원 per started 5 km
    - over 50 km: +100원 per started 8 km
    - single-use ticket +100원
    - transfers inside the integrated system add no new base fare
  - Distance: the sum of ride legs' km from `scenarios/transit/seoul-metro-interstation.csv` (via `web/src/transit/schedule.js`).
    - When a leg lacks an official distance, use the straight line × 1.2 and mark the trip `distance: "추정"`.
  - 신분당선 legs:
    - Add 구간별 별도운임 from a config table `SHINBUNDANG_EXTRA` keyed by segment (신사–강남, 강남–정자, 정자–광교).
    - Values stay **null** with `status: "확인 필요"`; the orchestrator fills them from the operator's official page.
    - While null, the trip shows "신분당선 별도운임 확인 중" and that trip's fare source stays 가정값.
    - Never invent these numbers.
  - Each commute trip's fare comes from `fareForTrip` when the route is known.
    - `transit_fare_won` stays as the fallback, labelled 가정값.
  - Source entry in `web/src/sources.js` + `ATTRIBUTION.md`: 국토교통부 수도권 전철 운임 조정 (2025-06-28 시행).
- Tests:
  - 9.9 km → 1,550
  - 10.1 → 1,650
  - 50 → 2,350
  - 58.1 → 2,450
  - a transfer adds no base fare
  - 신분당선 null → `확인 필요`
  - a walking commute counts with 0원
  - 0 commutes → flag
- Commit `15: commutes counted, distance fares`.

## 4. Same size, realistic loans, recent prices
- Same size (`money.mjs` + a pure helper in `web/src/money/prices.js`):
  - Compare homes within ±5㎡ of 전용면적.
  - Anchor = home A's area. For each other home, use the real-transaction area bucket closest to the anchor.
  - If that bucket is within ±5㎡, use it and record `area_match: { from: 84.82, to: <m2>, basis: "실거래" }`.
  - Otherwise keep its own area and set `flags.area_mismatch = { a, b, diff_m2 }`.
  - Do not edit the scenario file.
- Loans (`web/src/money/tenure.js`):
  - 전세 is interest-only: `repayment: "이자만"` and `loan_years: null` in the 전세 breakdown (keep the field, set it null).
  - Only 매매 uses `loan_years` 원리금균등.
  - New assumption `jeonse_loan_cap_won` (default 500,000,000, labelled 가정값, in the scenario assumptions and the criteria file like the other 가정값).
  - Interest is computed on `min(loan, cap)`. When the loan is over the cap, add `loan_shortfall_won = loan − cap` and `flags.loan_shortfall = true`.
  - Keep `LENDER_NOTE`. Never judge eligibility.
- Recent prices (`web/src/money/rtms.js`, `prices.js`):
  - The reference window is the 12 months ending at the latest contract month in the data, computed (not a fixed constant).
  - Report next to every median:
    - `period {from, to}`
    - `count`
    - `floors {min, max}`
    - `area_bucket_m2`
- Tests:
  - 84.82 vs 59.97 → matched bucket or mismatch flag
  - 전세 7.8억 loan with a 5억 cap → shortfall 2.8억, interest on 5억, `loan_years` null
  - 매매 still amortises over 30 years
  - the window follows the latest month
- Commit `15: same size, loan cap, recent prices`.

## 5. Decision log
- Every decision record (all kinds, all runs) gets:
  - `decided_by`: `"일정"` for rule / rule_fallback / replay-of-rule, `"에이전트"` for model / hook / replay-of-model.
  - `reason_ko`: rule decisions get the rule's own sentence (e.g. "주간 일정: 주 2회 장보기"); model decisions keep theirs.
  - `ref_ids`: the data ids the choice used — place id, route/edge ids, criterion ids (the routines already list criterion ids next to each decision; reuse them).
- Shape: `{ id, agent, day, minute, kind, chosen_key, decided_by, reason_ko, ref_ids }` plus the existing fields.
- Extend the replay allow-list so replay stays byte-identical.
- Tests: every decision in the demo run has `decided_by`, a non-empty `reason_ko` and ≥ 1 `ref_ids`; replay is byte-identical.
- Commit `15: decision log`.

## End
- Write `web/scripts/engine-check.mjs`. It runs the demo scenario and prints a markdown table:
  - A/B
  - 면적 (matched)
  - 장보기 횟수·금액
  - 출퇴근 횟수 (걸음/탈것)·교통비
  - 출퇴근 분/일 (mean, min–max)
  - 남는 돈/월 (mean, min–max)
  - 대출·부족액
  - 실거래 기간·건수·층
- Gates:
  - `.venv/bin/python -m pytest -q`
  - `cd web && npm test` (update tests that asserted the old per-trip grocery or ride-only commute counts; list each one in the RESULT)
  - `cd web && npx vite build`
- Write `briefs/15-RESULT.md`:
  - the before table above and the new table side by side
  - the seeds used
  - the list of changed files
  - every gate result
  - anything you could not do
- Commit `15: result note`.
