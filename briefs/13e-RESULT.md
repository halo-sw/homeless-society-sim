# Stage 13e2 — RESULT (seven fixes)

Full suite: `cd web && npm test` → **830 pass / 0 fail**. Each item built
(`vite build` ✓) and committed separately.

## 1. Chat columns scroll on their own — `13e2: chat columns scroll on their own`
- `web/src/ui/ui.css` (appended `13e2-1` block): `.ui-chat
  [class*="astryx-layout-content"]` is now a clipped flex column with
  `height: 100%`; its direct wrappers pass the definite height down;
  `.ui-chat-thread > :first-child` clips while its first child (message
  list) owns `overflow-y: auto`; composer / chips / banner / thread `p`
  are `flex: none`; stage + stage-body `overflow: hidden`; drawer keeps
  `overflow-y: auto`.
- `web/tests/chat-scroll-13e2.test.js` (new): CSS-text assertions on
  these rules (4 tests).

## 2. Orb fills the stage — `13e2: orb fills the stage`
- `web/src/orb.js` (appended): pure `projectLonLat`,
  `shapeProjectedBounds`, `shapeCentroid`, `labelCentroids`,
  `slabDepth` (2 % of map width), `fitOrbView` (8 % margin, centred,
  framing distance for fov/aspect).
- `web/src/ui/orb.jsx`: scene `#f4f1ea`; camera fitted via
  `fitOrbView` (centre + distance, zoom-aware); desaturated slab
  palette + 1 px darker `EdgesGeometry` outline; slab height from
  `slabDepth`; `ResizeObserver` on the container (window-resize
  fallback, disconnected on cleanup); HTML region labels track the
  projected centroid each frame, clamped to the container, hidden when
  behind the camera. Hover tooltip, click-to-filter and candidate dots
  kept. Station points `0xffffff` → `0x57534a` (visible on light).
- `web/src/ui/ui.css`: `.ui-orb` → `position: absolute; inset: 0`
  (fills `.ui-chat-stage-body`); `.ui-chat-stage` background `#f4f1ea`;
  `.ui-orb-label(s)` pill styles.
- `web/tests/orb-fit-13e2.test.js` (new): projection, centre/margin
  math, aspect behaviour, empty fallback, centroids, slab depth (6).

## 3. Profile card source labels — `13e2: profile card labels`
- `web/src/chat/engine.js`: `SOURCE_KO` gains `asked: "물어볼 값"`;
  `sourceKo` returns `""` for unknown/empty; `fieldRows` maps
  null/empty/[] values to `text: "아직 몰라요"`, `source: "asked"`,
  `note: ""` (never defaults to `"customer"`).
- `web/src/profile.js`: `PROFILE_SOURCES` gains `"asked"`; `blank()`
  → `field(null, "asked", "")`; blank `mustHaves` → `"asked"`;
  `:295` note → `"세전 연봉이에요. 실수령은 따로 계산해요."`;
  example nulls (`:568,573,574`) → `field(null, "asked", "")`. Grep of
  `web/src` found no other user-visible snake_case tool name in notes
  (`check_listing`/`add_listing_c` in `listings.jsx` are functional chat
  commands, left alone).
- `web/src/ui/chat.jsx` (ProfileCard): badge renders only when
  `sourceKo` is non-empty; `neutral` for `asked`, `blue` otherwise;
  note hidden when it equals the label or the value text.
- `web/tests/profile-labels-13e2.test.js` (new): empty profile → no
  "내가 말한 값"; "연봉 4천" → exactly one (3).
- `web/tests/profile.test.js`: two assertions updated to the new
  contract (blank source `"asked"`; allowed-sources list).

## 4. Intake: no invented salary — `13e2: intake starts empty`
- `web/src/ui/intake.jsx`: `Stepper` accepts null (placeholder +
  `startValue`, first press lands on it); Income/Living/Commute/Budget
  steps start at null with `예: …` placeholders (4,000만 원 · 150만 원
  · 40분 · 3억 / 5,000만 / 100만 / 6억); kind/mode buttons no longer
  commit an empty amount. `intake.js` prefill verified honest (fills
  only from the extract). HouseholdCard draft `commuteMax: 45` left:
  visible draft default in an explicit add-form, not an answer.
- `web/tests/intake-empty-13e2.test.js` (new): newlywed example
  prefills budget but no `income`/`said`/salary patch; stated salary
  still prefills; source-text guard against invented literals (3).

## 5. Tool rows say the label once — `13e2: tool rows`
- `web/src/ui/agent-float.js`: new `stripToolLabel(name, summary)`
  and `toolDurationKo(ms)` (≥100 ms → `0.2초` style, else `ms`).
- `web/src/ui/chat.jsx`: extract summary `""` / `"읽기 실패"`;
  find_homes `` `${n}곳 · ${HOME_SORT_KO[sort]}` ``; build_scenario →
  home names only; run → `` `30일 · ${labels}` ``; compare →
  `` `${n}개 지표` ``; recorded replies pass
  `stripToolLabel(t.name, t.summary)`.
- `web/src/ui/consult.jsx`: ToolRows duration via `toolDurationKo`.
- `web/tests/tool-rows-13e2.test.js` (new): strip over every
  `TOOL_ACTION_KO` entry + all recorded replies; chat.jsx summary
  formats; duration formats (4).

## 6. Station photos: no platforms or concourses — `13e2: station photo filter`
- `web/src/places/photo-filter.js`: `STATION_INTERIOR_ALLOW` replaced
  by `STATION_INTERIOR_KEYWORDS` (platform, concourse, ticket gate,
  lobby, 승강장, 대합실, 개찰구, 역사 내부) with a `station-interior`
  drop reason for `kind = "station"`. People list gains `commuters`,
  `waiting`, `women`, `기다리는`; `men` matches on word boundaries
  (`PEOPLE_WORD_KEYWORDS`) — substring `men` would drop 20/75 complex
  photos via "Apartment"/"document"/"environment".
- `web/src/places/select-photos.js`: verified, no change — empty
  station results already fall through to street photos, then the
  3D/map fallback.
- `web/scripts/photo-rule-counts-13e2.js` (new):
  `node scripts/photo-rule-counts-13e2.js` (from `web/`).
- Counts over `scenarios/places/commons-named.json` (884 photos):
  kept 555, removed 329 — `station-interior: 244`, `people: 39`,
  `logo-or-document: 27`, `other-city: 16`, `event: 3`.
  Station 514/809 kept; complex 41/75 kept.
  `File:대모산입구역 승강장.jpg` → dropped (`station-interior`).
  `File:대모산입구역.jpg` → also dropped — its description is
  "대합실 풍경", i.e. genuinely interior.
- Tests: `photo-filter-13.test.js` allow-rule test rewritten for the
  new rule + new-people-words test; `photos-13.test.js` station
  fixture switched to an exterior (`Seohyeon station exit.jpg`).

## 7. Sim map tags stay inside the stage — `13e2: map tags inside stage`
- `web/src/stage-tags.js` (new, pure): `stageRect(canvasRect,
  {drawerOpen, drawerWidth})` and `placeTag(nx, ny, canvasRect, …)`
  (NDC → px in the full canvas; hidden past the stage right edge or
  outside vertically).
- `web/src/main.js`: `paintTag` uses the `#scene`/`#scene-wrap` rects
  (viewport→wrap-local) and subtracts the measured right-drawer
  overlap (`.ui-sim13-drawer`, else open `.ui-chat-drawer`).
- `web/tests/stage-tags-13e2.test.js` (new): rect math, NDC mapping,
  drawer/vertical hiding (3).

# Stage 13e3 — RESULT (two fixes)

Full suite: `cd web && npm test` → **831 pass / 0 fail** (`vite build` ✓).

## 1. Stage beside thread — `13e3: stage beside thread`
- GPU showed `.ui-chat-stage` 1440×0: the 13e2-1 `> *` column rule hit
  `.ui-chat-main`, which must be a row. `web/src/ui/ui.css` gains
  `.ui-chat [class*="astryx-layout-content"] > .ui-chat-main
  { flex-direction: row; }`. Thread scroll rules untouched.
- `web/tests/chat-scroll-13e2.test.js` gains a row assertion (5 tests).

## 2. Landing footer readable — `13e3: landing footer readable`
- `web/src/ui/landing.jsx`: coverage line + sources wrapped in
  `.ui-landing-foot`; `web/src/ui/ui.css` gives it the subtitle colour
  `rgba(255,255,255,0.88)` for p/span/button.

## Capture URLs (from `briefs/13d-RESULT.md`)
- `/?chat=판교로%20출근하는%20신입%2C%20연봉%204천%2C%20모은%20돈%205천%2C%20전세%202억%20이하&example=single-firstjob`
- `/?chat=맞벌이%20예비부부%2C%20강남%20출근%2C%20전세%204억%20이하%2C%2059㎡%20이상&example=newlywed-couple`
- `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`

# Stage 13e4 — RESULT (three leftovers from the 13e3 GPU capture)

Full suite: `cd web && npm test` → **841 pass / 0 fail** (`vite build` ✓).
Captures: `briefs/img/13e4-chat.png`, `briefs/img/13e4-sim.png` (1440×900).

## 1. Orb fitted and centred — `13e4: orb fitted and centred`
- Diagnosis: 13e2 fitted the raw world depth, but the tilted camera
  `(0, 7.5, 9)` compresses ground z to ~0.64× on screen and near/far
  edges sit at different depths — so the regions filled a 550×200
  strip of the 1000×811 stage.
- `web/src/orb.js`: `fitOrbView` now iterates in NDC (camera basis
  right +X, up (0, vz, −vy)): rescale distance to target fill,
  re-centre the NDC box, 12 rounds → projected box fills
  `ORB_FIT_FILL` (0.84) of the shorter side, centred. New
  `projectedOrbBounds` helper (centre ±5 %, per-axis fill);
  `ORB_VIEW_DIR` must match `ui/orb.jsx`.
- `web/src/ui/orb.jsx`: re-fits (centre + distance) on container
  resize, not just aspect.
- Tests: `web/tests/stage-13e4.test.js` orb block (2- and 9-slab
  samples at 1000×811: centred ±5 %, fill 0.84 ± 0.02). Note:
  `web/tests/orb-fit-13e2.test.js` "exact world centre" and "wider
  from closer" assertions are superseded by the brief's projected
  contract (same-axis aspects share one distance; portrait frames
  from farther) and updated with 13e4 comments.

## 2. Sim tags never over drawer or top bar — `13e4: sim tags never over drawer or top bar`
- Diagnosis: `paintTag` (`web/src/main.js`, the only `.style.left`
  writer — `paintTagPin` delegates to it) hid tags by anchor point
  only; the "직장" anchor at x≈1058 passed left of the drawer at
  x=1060 while its box (to x≈1092) overlapped it. Drawer rect is
  read live, so layout timing was not the cause.
- `web/src/stage-tags.js`: new pure `rectsIntersect(a, b)` /
  `tagBoxBlocked(tagBox, blockers)` (touching edges and zero-area
  rects never block).
- `web/src/main.js` `paintTag`: after positioning, hides the tag
  when its measured box intersects the drawer rect
  (`.ui-sim13-drawer`, else open `.ui-chat-drawer`) or the top bar
  rect (`.ui-sim13-top`).
- Tests: `stage-13e4.test.js` tag block replays the capture coords
  (4).

## 3. Rule titles, not IDs — `13e4: rule titles, not IDs`
- `web/src/engine/criteria.js`: new `criterionTitle(id)` — Korean
  title from the same table the 기준 tab renders (`CRITERIA_BY_ID`),
  id fallback.
- `web/src/ui/app.jsx` `CriterionChips` (the "적용한 기준" chips):
  `label={criterionTitle(id)}`, id kept in `title` only.
- `web/src/ui` grep for other visible `C-` ids: only
  `criteria.jsx:59` (id badge next to the already-shown title) —
  badge removed, id moved to `title` on the title text.
  `aria-label`s and code comparisons untouched.
- Tests: `stage-13e4.test.js` title block —
  `criterionTitle("C-commute-depart")` is "출근·등교 출발 시각" (2).
