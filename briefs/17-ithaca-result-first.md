# Stage 17 — Ithaca: the answer first (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the Priorities rule again: it changed on 2026-10-30). Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Do not touch `web/src/render/`, `web/src/scene/` or `web/src/camera.js` (another stage is changing them). Commit after each part (`git add -A web/src web/tests web/index.html && git commit -m "17: …"`). First edit within 6 tool calls. Do not explore beyond the files named below unless a test fails.

[제품] **Ithaca** — The Pre-living Agent for Your Next Home. "We walk the odyssey. You just come home."
[목표] Someone opens a link and, within 30 seconds, sees which home fits *their* priorities better and the 3 moments from the 30 days that show why.
[원칙] The first screen is the answer; the rest is evidence on tap. Numbers come from the engine. 3D is evidence.
[금지] No new modes or tabs. No model name, tokens or internal errors on screen. No "추천 집", "이긴 집", "더 좋은 집". Never delete a feature (hide or move it). No elevator, noise or other events the engine does not produce.

## 1. Name: Ithaca
- Product name everywhere the UI shows it: `ui/topbar.jsx:131` (`ui-bar-title`), `main.js` `document.title` (:778, :1145, :2604), `web/index.html` `<title>`, `ui/share.js:437` (card footer).
  - Top bar: "Ithaca" (latin, semibold) — no subtitle.
  - `document.title`: "Ithaca — 대화", "Ithaca — {area}", "Ithaca — {home} · {complex}".
  - Share card footer: "Ithaca · 파일은 이 브라우저에만 저장돼요".
- Landing (`ui/landing.jsx`): above the existing headline, a small line "Ithaca · The Pre-living Agent for Your Next Home". Keep the Korean headline "계약 전에, 그 집에서 30일 먼저 살아 봐요". Under the composer chips, one quiet line: "We walk the odyssey. You just come home."
- Landing backdrop: today it is a dark grey blur. Make it lighter (the map visible at ~35 % under a warm white veil, `--ui-*` tokens), so the page reads bright, not murky.
- Tests: a UI scan finds no "주거 시뮬레이터" outside `briefs/` and tests' fixtures.
- Commit `17: Ithaca name + brighter landing`.

## 2. 내 기준 점수 (my-priorities score), up front
Files: `web/src/priorities.js` (`weightedView` :112, `defaultWeights` :73), `web/src/consult/guards.js` (`scoreVerdict` :203), the sim drawer hero (`ui/app.jsx`, from 13f-2), `ui/priorities.jsx`.
- `weightedView(values, weights, { explicit })`: when `explicit` is false, compute with `defaultWeights()` instead of refusing, and return `basis: "default"` (else `basis: "customer"`). Safety still never enters the sum.
- Score per home = round(100 × weighted mean). Pure helper `myScore(values, weights, { explicit })` → `{ ok, basis, scores: {A: 62, B: 38}, groups: {...}, formula_ko }`.
- **Where it shows:** top of the sim drawer, above the hero, one row per home: "내 기준 점수  A 62 · B 38".
  - Under it, 12 px tertiary: basis customer → "내가 정한 비중으로 계산한 주관적인 점수예요"; basis default → "아직 비중을 안 정해서 모두 보통으로 계산했어요 · 비중 정하기" (link opens the existing 내 기준으로 보기 tab).
  - Tap the row → the existing priorities tab with group bars and the formula.
  - The two homes keep their A/B order. Never sort, never crown, never colour one as the winner (both bars use the neutral accent).
- Same row in the share card (`ui/share.js` `resultCardData`), first row, with the same caption.
- Guard: `scoreVerdict` must allow the phrases "내 기준 점수", "내가 정한 비중", "주관적인 점수" with a number, and still trip safety/school scores, rankings and "추천 집". Tests for both directions.
- Note for the formula text: with two homes every metric is scaled 0–1 between them, so the score shows *relative* fit between the homes on screen, not an absolute grade. Say this in `formula_ko`.
- Tests: default basis, customer basis, safety excluded, A/B order kept, guard allow/deny.
- Commit `17: 내 기준 점수 up front`.

## 3. 살아 보니 — three moments from the 30 days
The 30-day run already holds moments a listing never shows. Surface them; invent nothing.
- Pure `web/src/engine/moments.js`: `pickMoments(runA, runB, { max: 3 })` from trips, aways and decisions only. Candidate kinds (each with `trip_id`/`decision_id` as evidence):
  - the most crowded ride leg (measured congestion only; skip assumed lines) — "3일차 08:35 2호선 잠실→강남 혼잡 93% (실측)"
  - the longest door-to-door commute day per home — "12일차 출근 1시간 9분"
  - the biggest gap between the homes in park visits, errands or evenings at home over 30 days — "공원 26번 vs 10번"
  - a Muse decision that differs from the rule default, with its `reason_ko` — "퇴근길에 마트 대신 집으로: '피곤해서 바로 쉬고 싶어요'"
  - Rank by size of difference between A and B; at most one per kind.
- UI: a "살아 보니" section right under the score row in the drawer (open by default), three one-line cards. Each card: day + time, one sentence, a small "근거 ✓" chip; tapping the card seeks the timeline to that moment (existing seek API) and follows that member.
- Tests with the demo build: three moments, each with an evidence id that exists in the run; no moment uses an assumed congestion value.
- Commit `17: 살아 보니 moments`.

## 4. Small fixes from the GPU capture (10-30, 1440×900)
- Source badges in the 오늘 list are cut ("실…", "가…"). Badges never truncate: shrink the line text first, then wrap the text; the badge keeps its full word.
- `web/tests/share.test.js:230` still expects "월 260만 원" from before stage 15. The stage-15 money build gives "월 166만 6,667 원" (loan cap). Update the expectation to read the value from the built money doc instead of a hard-coded string.
- On a clean clone without `data/build` (what CI sees), 3 tests fail with ENOENT instead of skipping: `tests/engine-simulate.test.js:353` and `:369` (real jamsil / pangyo data) and `tests/tour.test.js:114`. Give them the same `{ skip: !existsSync(...) }` guard the share test uses. Measured 10-30: 867 pass, 3 fail, 29 skipped on a clean clone.
- Commit `17: badges + share test + data-free skips`.

## End
- `cd web && npm test 2>&1 | tail -6` (all green expected) and `npx vite build 2>&1 | tail -2`.
- `briefs/17-RESULT.md`: per part what changed, the score for the demo (A, B, basis), the three moments with their evidence ids, capture URLs.
- Commit.
