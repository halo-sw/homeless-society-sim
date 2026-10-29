# Stage 17 — RESULT: Ithaca, the answer first

Date: 2026-10-30. Brief: `briefs/17-ithaca-result-first.md` (Ithaca name,
내 기준 점수 up front, 살아 보니 moments, GPU-capture fixes). All
product code by Muse (agent mode). No sub-agents. Branch `ithaca-17`;
`web/src/render/`, `web/src/scene/`, `web/src/camera.js` untouched.
Commits: `7b4d8fd` (part 1), `d1f8f58` (part 2), `3bbb603` (part 3),
`81c8908` (part 4), `cd7ee2d` (part-4 follow-up: badge rule without
`text-overflow`, keeping the existing no-ellipsis contract).

## What changed

**1. Ithaca name + brighter landing** (`7b4d8fd`). Product name is
"Ithaca" everywhere the UI shows it: top bar (`ui-bar-title`, latin,
semibold via the existing token, no subtitle), the three
`document.title` lines ("Ithaca — 대화", "Ithaca — {area}",
"Ithaca — {home} · {complex}"), `web/index.html` title, and the share
card footer ("Ithaca · 파일은 이 브라우저에만 저장돼요"). Landing
shows "Ithaca · The Pre-living Agent for Your Next Home" above the
kept Korean headline, and "We walk the odyssey. You just come home."
under the cards. The scrim is now a warm white veil
(`color-mix(--ui-page 65%)`, map ~35% visible) with dark ink text, so
the page reads bright. Tests: `web/tests/ithaca-name-17.test.js`
(source scan finds no "주거 시뮬레이터" in `web/src`/`index.html`,
plus render checks); three old name assertions updated.

**2. 내 기준 점수 up front** (`d1f8f58`). `weightedView` no longer
refuses without explicit weights: it computes with `defaultWeights()`
and returns `basis: "default"` (else `"customer"`); safety still never
enters the sum. New pure `myScore(values, weights, {explicit})` →
`{ok, basis, scores, groups, formula_ko}` (round of 100 × weighted
mean; A/B input order kept). The drawer shows the score row above the
hero — "내 기준 점수 A 45 · B 55" on the demo — with one neutral bar
per home, a 12 px tertiary caption (customer vs "모두 보통" wording),
and a "비중 정하기" link on the default basis; tapping the row opens
the existing 내 기준 tab, which now also shows per-group A/B bars with
the formula. The share card carries the same row first (data + canvas
+ preview) with the same caption. `priorityValues` moved to the pure
`priorities.js` (re-exported from `priorities.jsx`) so drawer, tab and
card share it. `scoreVerdict` strips only the three allowed phrases
("내 기준 점수", "내가 정한 비중", "주관적인 점수"), so they pass with
a number while safety/school scores, rankings and "추천 집" still trip
— including a verdict in the same sentence. Tests:
`web/tests/myscore-17.test.js` (basis, safety exclusion, order,
formula wording, guard both directions, drawer render, share data +
canvas order); the old refusal test now pins the default basis.

**3. 살아 보니 moments** (`3bbb603`). New pure
`web/src/engine/moments.js`: `pickMoments(runA, runB, {max: 3})` reads
trips, aways and decisions only (household members only). Four
candidate kinds, at most one each, ranked by relative A/B difference:
most crowded measured ride leg (가정값 skipped), longest door-to-door
출근, biggest gap in park visits / errands / evening-at-home minutes
(evenings recomputed off trips/aways with the criteria window —
verified byte-equal to the engine totals on the demo: A 19376,
B 20575), and a model/hook decision differing from the rule default
with its `reason_ko`. Every moment carries a `trip_id`/`decision_id`
that exists in its run. `main.js` publishes the picks as
`state.moments` (with follow slot + member label) once the other
home's run arrives; the drawer renders a "살아 보니" section (open by
default) under the score row — day + time, one sentence, "근거 ✓" chip
— and tapping seeks day/minute and follows the member via the existing
`setDay`/`setMinute`/`setFollow` actions. Tests:
`web/tests/moments-17.test.js` (demo: three moments, evidence ids
exist, measured congestion only, ranking; synthetic: decision kind,
assumed-leg skip, drawer render + seek attrs).

**4. Badges + share test + data-free skips** (`81c8908`, `cd7ee2d`).
오늘 rows: the label shrinks first and wraps (`overflow-wrap`), the
badge keeps its full word (`flex: none`, `white-space: nowrap`,
`max-width: none`, `overflow: visible`) — no `text-overflow`, per the
existing no-ellipsis contract. `share.test.js` now reads the expected
housing figure from the built money doc (stage-15 loan cap:
"월 166만 6,667 원") instead of the hard-coded pre-15 string. The
three clean-clone ENOENT failures got the share test's
`{skip: !existsSync(...)}` guard: `engine-simulate.test.js` (jamsil,
pangyo) and `tour.test.js:114` (songpa-jamsil). Tests:
`web/tests/fixes-17.test.js` (badge rule).

## Demo score and moments

Money + compare docs from `data/build/sim/demo-two-homes-*`
(전세/전세, no explicit weights):

- Score: **A 45 · B 55, basis default** ("아직 비중을 안 정해서 모두
  보통으로 계산했어요"). Relative fit between the two homes on screen,
  not an absolute grade; safety not summed.
- Moments (`pickMoments`, gapRel desc):
  1. crowded — "2일차 08:12 A 2호선 잠실→강남 혼잡 93% (실측)",
     evidence `trip:t000005` (run A), gapRel 1.000.
  2. commute — "1일차 A 출근 44분", evidence `trip:t000001` (run A),
     gapRel 0.636.
  3. gap — "공원 A 10번 vs B 26번", evidence
     `decision:h1:d4:1053:park_or_home:00` (run B), gapRel 0.615.
- No decision moment on the demo: both runs are rule-only (1831/1868
  rule decisions, zero model/hook). Covered by synthetic tests.

## Capture URLs

Base: the dev server root (`npm run dev` in `web/`).

- Landing (bright veil + brand lines): `/`
- Sim drawer (score row + 살아 보니 + hero): \
  `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1` \
  (moments arrive async with the other home's run)
- 내 기준 tab (group bars + formula): same URL + `&tab=priorities`
- Share card (score first): same URL + `&share=1`
- 오늘 badges (full 실측/가정값 words): the sim URL, 오늘 section

Checks: top bar reads "Ithaca" with no subtitle; score row shows
"A 45 · B 55" with the default caption and 비중 정하기, both bars the
same neutral fill, no ranking or winner wording anywhere; three moment
cards open by default and each tap moves the playhead and follows the
member; share card shows the score before the twelve rows.

## Tests and build

- `cd web && npm test`: **1105 pass, 0 fail, 1 skipped** (the skip is
  pre-existing). Includes the four new 17 test files (28 tests) and the
  full neighbouring suites (drawer, share, priorities, consult guards).
- `npx vite build` could not run in this sandbox: the same EPERM as
  14e (vite writes its config temp to read-only
  `web/node_modules/.vite-temp`). Stand-ins, all green: `node --check`
  on every edited plain-JS file, the SSR suites as import smoke for
  every edited JSX module, and a full esbuild bundle of `src/main.js`
  (JSX + CSS + `three/addons`, `--external:/fonts/*` for the public
  font, 5.0 MB, zero errors) in `/tmp/17-bundle`.

## Known limitations / follow-ups

- One home at a time: a moment from home B seeks the shared 30-day
  clock while the scene still shows the current home's map (same
  household, both homes' labels on the cards).
- Clean-clone skip guards follow the share test's proven pattern but
  were verified by inspection only here (data/build is present); CI on
  a clean clone is the real check (brief expectation: all skipped, 0
  failed).
- The decision moment kind never fires on rule-only runs (today's
  demo); it will appear once judged runs ship.

---

# Stage 17b — RESULT: polish from the GPU capture

Date: 2026-10-30. Brief: stage-17b prompt (four findings from the
laptop-GPU capture of `ithaca-17`, 1440×900, 2026-10-30 04:30). All
product code by Muse (agent mode). No sub-agents. Commits on
`ithaca-17`: `f560e8b` (part 1), `c482dc7` (part 2), `62b5bf0`
(part 3), `b7c7764` (part 4).

## What changed

**1. Moment text once** (`f560e8b`). `pickMoments` sentences no
longer repeat the day/time or the home letter: each moment now carries
`text_ko` (e.g. "2호선 잠실→강남 혼잡 93% (실측)", "출근 44분") with
`when_ko` ("2일차 08:12") beside it (`sentence` stays as an alias of
`text_ko`). The drawer keeps day + time in its left column and shows
the home in a small "A"/"B" chip before the sentence. Tests:
`moments-17.test.js` updated (no leading day/time in `text_ko`,
`when_ko` == day + time, home chip in the render).

**2. Softer shade, darker roads** (`c482dc7`). Two real causes, both
in code: (a) shade — `PAINTED_LIGHT.shadowStrength` 0.45 → 0.30 plus
a new `hemiBoost` ×1.35 on the day hemisphere fill (blended by
daylight, nights untouched); pure `shadeSunRatio` resolves 0.76 at
14:00 against the ≥ 0.55 bar. (b) roads — the ribbon builder pushed
sRGB 0..1 straight into vertex colours, which three.js consumes as
linear, so `#5b5d60` rendered ≈ `#a2a4a7` next to the correctly
decoded beige terrain; palette hexes now linearize through
`hexToLinearRgb` (painted + photo both render true). Post chain
untouched, outlines kept. Tests: `painted-17b.test.js` (new values,
boost day/night, shade ratio, ribbon linearity + round-trip, road vs
ground ≥ 25 levels); two `scene-14` colour pins moved to linear.

**3. Lit night** (`62b5bf0`). Tour nights lit only register-known
towers (sparse data) and capped every tower at 0.35: tour mode now
lights every residential-class building from the evening estimate
(`eveningHomeFraction(21:00)` = 0.9 → capped 0.65, ≥ 0.6 for any
hash) with offices on a small deterministic share (`≈ 0.18–0.27`,
new `tourOfficeFraction` via an `emptyFrac` fallback opt — sim
behaviour unchanged). Painted `nightLitCap` 0.35 → 0.65 (photo keeps
0.35). Roads lerp to warm lamp-lit asphalt (`0x4a4136`, lighter than
the navy ground) plus a faint warm emissive (`0x2a2118` — moonlight
alone leaves albedo black); walls/roofs lerp to dark slate
(`0x3a4152`, +30 levels over the `#1d2330` ground). Tests: 21:00
residential ≥ 0.6, offices fewer-but-some, road lighter than ground,
wall slate ≥ 15 above ground.

**4. Readable regional view** (`b7c7764`). Same colour-space bug one
level up: corridor flat colours were authored as sRGB/255 but
consumed raw, so sunlit blocks rendered tan-brown ≈ the beige base —
the one-brown view. `palette.js` now owns `srgbToLinear` /
`hexToLinearRgb` (roads.js re-exports); corridor walls/roofs are the
linearized painted targets (`#c9c4bb` / `#ddd8ce`), `hexToRgb`
linearizes the look-table road/river, and the painted base map keeps
`#cfc4ad` / `#5b5d60` / `#3f6f8f` with `corridorDarken` 1 (no brown
multiplier; 14f outlines kept). Tests: corridor round-trips, tile
emission, roof vs ground ≥ 15, road vs ground ≥ 25, and a
representative-morning lit model (`litLumaU8`: shaded wall vs
sunlit ground ≈ 23 ≥ 15 at 08:50).

## Capture URLs

Base: the dev server root (`npm run dev` in `web/`).

- Day shade + roads (part 2): \\
  `/?area=songpa-jamsil&shot=0&q=high&time=14:00` \\
  plus `&debug=albedo` to compare palette vs lighting.
- Night (part 3): `/?area=songpa-jamsil&shot=0&q=high&time=21:00` —
  most residential floors lit, warm road bands, slate walls.
- Regional (part 4):
  `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`
- Moments (part 1): the sim URL above — "살아 보니" cards show
  "2일차 08:12 ＋ A chip ＋ 2호선 …" with no repeated time.

Checks: shaded walls soft (≥ 55 % of sun), carriageways dark
asphalt (≥ 25 levels under the beige), night towers mostly lit with
a faint warm road glow, regional blocks/walls/roads/river each
readable with outlines.

## Tests and build

- `cd web && npm test`: **1131 pass, 0 fail, 1 skipped** (the skip
  is pre-existing). Includes `painted-17b.test.js` (16 tests) and
  the updated pins (`moments-17`, `scene-14`, `render-look`,
  `ride-11b`).
- `npx vite build` still hits the known sandbox EPERM
  (`node_modules/.vite-temp`, same as 14e/17). Stand-ins, all green:
  `node --check` on every edited plain-JS file, the SSR suites as
  import smoke for the edited JSX, and a full esbuild bundle of
  `src/main.js` (5.3 MB, warnings only) in `/tmp/17b-bundle`.

## Known limitations / follow-ups

- Photo style inherits the corrected (darker, truer) ribbon and
  corridor blocks — palettes unchanged, on-screen values now match
  them; worth one photo-capture glance.
- The ≥ 15 wall/ground bar is geometry-aided (shaded faces vs
  sunlit ground, roofs +20 in albedo); fully sunlit walls still sit
  near the ground tone — the capture measures the mixed frame.
- Night rails keep day albedo (moonlit → dark); only carriageways
  got the lamp band.
