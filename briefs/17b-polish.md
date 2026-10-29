# Stage 17b — Polish from the GPU capture (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Commit after each part (`git add -A web/src web/tests && git commit -m "17b: …"`). First edit within 5 tool calls. Small, targeted changes only; keep every existing test green.

Read once: `briefs/17-RESULT.md`, the "14f" section at the end of `briefs/14e-RESULT.md`, `web/src/render/sky.js` (`PAINTED_LIGHT`), `web/src/render/look.js` (`PAINTED_LOOK`, `regionalGround`, `corridorDarken`), `web/src/render/facades.js` (`litFractionFor`, `eveningHomeFraction`).

The orchestrator captured `ithaca-17` (17 + 14f) on the laptop GPU, 1440×900, 2026-10-30 04:30.

## 1. Moment text says the time twice
- The drawer shows "2일차 08:12 | 2일차 08:12 A 2호선 잠실→강남 혼잡 93% (실측)" — the left column already has day + time.
- The sentence drops the leading "N일차 HH:MM" and the home letter; the home goes in a small "A"/"B" chip before the sentence. Same in `pickMoments`' `text_ko` (keep a separate `when_ko`). Update the moment tests.
- Commit `17b: moment text once`.

## 2. Painted day: shade and roads
Tour `?area=songpa-jamsil&shot=0&q=high&time=14:00`:
- Shaded walls are near-black navy, much heavier than the reference's soft shade. Lift them: a shaded wall's luminance ≥ 55 % of the same wall in sun (raise the painted hemisphere/ground fill, or lower shadow strength further). Keep outlines.
- Roads barely separate from the beige ground. Carriageways must read as dark asphalt: luminance difference between `#5b5d60` road and `#cfc4ad` ground ≥ 25 levels on screen in sun. Check that the painted road material isn't lit/tinted into beige (use `?debug=albedo` to compare).
- Pure tests for the new light values.
- Commit `17b: softer shade, darker roads`.

## 3. Painted night
Tour `…&time=21:00`: only one tower is lit; every other building and all roads are near black.
- At 21:00 on a weekday, residential buildings show most floors lit (target ≥ 60 % of residential floors; offices fewer), using the existing deterministic floor bands.
- Roads glow faintly warm under street lamps (a lit road band, not black); ground stays navy `#1d2330`, building walls a visible dark slate (≥ 15 levels above the ground).
- Tests: lit fraction at 21:00 for residential ≥ 0.6; night road colour lighter than night ground.
- Commit `17b: lit night`.

## 4. Sim regional view is one brown
Sim `?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`: ground, buildings and roads are all the same mid brown; nothing reads.
- Painted regional/corridor view: ground the painted beige (`#cfc4ad`), building walls `#c9c4bb` with roofs `#ddd8ce` and outlines, roads dark asphalt, the river `#3f6f8f`. No brown multiplier on top (`regionalGround`, `corridorDarken` painted overrides).
- Measure: walls vs ground luminance difference ≥ 15 levels; road vs ground ≥ 25.
- Commit `17b: readable regional view`.

## End
- `cd web && npm test 2>&1 | tail -6` (all green expected) and `npx vite build 2>&1 | tail -2`.
- Append a "17b" section to `briefs/17-RESULT.md` with what changed and the capture URLs.
- Commit.
