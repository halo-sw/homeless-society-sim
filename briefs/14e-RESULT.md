# Stage 14e — RESULT: painted isometric map look

Date: 2026-10-30. Brief: `briefs/14e-painted-map.md` (code-only HypeSeoul
look: camera, palette, post, procedural details). All product code by
Muse (agent mode). The first run stopped on the subscription quota
mid-part-2 (`6ff177c` WIP: palette, two-tone roads, night lerp, an
unfinished test); this run fixed the test file, then finished parts
2–5 on top of the WIP without redoing it. Commits on `ui-13f`:
`d8b097c` (part 1, previous run), `cdec3bb`, `37a261e`, `6f7ec1b`,
`6479d3a`.

## What changed

**1. Near-isometric camera** (`d8b097c`, previous run). `cameraStyle(style)`
in `web/src/camera.js`: painted uses 10° FOV, 32° pitch, one fixed azimuth,
no rotate; photo keeps the 24°/45° tour values. Far plane covers 2× the
narrow-FOV distance; painted zoom clamps to 150 m…span framed width.

**2. Painted palette + clear fog** (`cdec3bb`, on top of the WIP).
`PAINTED_LOOK` in `web/src/render/look.js` overrides the daytime table with
the brief's sRGB targets (warm beige ground `#cfc4ad`, dark asphalt
`#5b5d60`/`#6c6e70`, deep greens, calm water `#3f6f8f`), fog 4×/9× of the
framed width, grade saturation 1.2. `resolveLook(search, style)` picks the
style base (`?style=`, painted default); `?look=` still overrides on top.
Walls/roofs separate via `facadeTintFor` (`#c9c4bb`/`#ddd8ce`), water skins
use `PAINTED_WATER`, arterials vs minor streets split into two ribbon
tones (`roadTone`), and painted nights lerp ground planes to navy
`#1d2330` while carriageways keep day asphalt (`nightMats` /
`applyPaintedNight` in `web/src/main.js`). Fog colour already came from
the sky horizon each frame (`render/rig.js` + `look: LOOK`); the far
ranges clear the sim-view haze. This run's own edit: the WIP test
asserted roads lead blue in every channel, which the brief's pinned
hexes (`#5b5d60`: B−R = 5) fail — relaxed to near-neutral (B−R ≤ 5,
spread ≤ 8) and closed the dropped `describe` brace.

**3. Outlines, AO, painterly post** (`37a261e`). New
`web/src/render/painted.js`: one `PaintedPass` (packed-depth prepass via
RGBADepthPacking override, shadows and `noPaintedDepth` sprites skipped;
Laplacian outlines at most 35 % darker with a 1500→3000 m framed-width
fade; 8-direction × 2-radii AO at most 40 %), a radius-baked Kuwahara
pass (3 high, 2 medium), and main-pass pixelation (1.5 on high, `?px=1`
disables, nearest upscale). Chain
`render → outline → kuwahara → bloom → grade → output`, no tilt-shift;
low has no composer. `postChainSpec(level, {style})` defaults to photo so
old callers keep today's chain. Wiring: `render/renderer.js` plumbs
`?style=`/`?px=` and per-frame `framedWidthM` (minimal edits to an
unlisted file — the style has to cross the renderer seam);
`quality.js` untouched (`composerSamples: 0`, guard intact). Dev-only
one-shot log: `[post] style=painted passes=… ms=…`. Tests:
`web/tests/render-painted.test.js`.

**4. Road markings + tree clusters** (`6f7ec1b`). `buildRoadMarkings` in
`web/src/scene/roads.js` builds one merged mesh from the ribbon stations
(`ribbonStations` extracted so paint hugs ribbons, bridges included):
white dashed dividers (2 m / 4 m gap, 0.15 m) on lanes ≥ 2 (3.25 m
lanes from width), solid yellow double centre (±0.3 m) on
primary/secondary, zebra bars (3 × 0.5 m at 1 m pitch, spanning the road)
at at-grade footway crossings. Painted scene mode only, hidden past
2 km framed width; ground lane paint sits out there to avoid doubling
(kerbs go with it — same mesh). Broadleaf crowns are two overlapping
spheres at 50 tris (≤ 60); `treeColour(seed, dateISO)` seeds greens plus
a 55 % autumn share (`#d9b13b`/`#c8742f`/`#a84232`) from 15 Oct to
30 Nov (tour uses 2026-10-15, sim the scenario start date; conifers stay
evergreen); `fillStreetTrees` plants both sidewalks every 9 m on
residential-and-larger at-grade roads with no data trees nearby, skipping
footprints and trees within 3 m, capped at 4000 — labelled in the legend
("가로수 위치 일부는 규칙으로 채운 값(가정값)입니다"). Motorway/trunk get
white dashes only (brief pins yellow to primary/secondary).

**5. Night details** (`6479d3a`). Facade emissive thresholds are now
seeded whole-floor bands (`floorBand`/`floorWindowThreshold`): each tile
row owns a distinct band, so floors step off crisply as the lit fraction
falls — deterministic in floor + minute, no scrub flicker — while the
tile stays ~uniform (lit fraction f still lights ~f of windows; the old
RNG draw count is unchanged, so albedo/roughness buffers are identical).
Red aviation beacons on buildings ≥ 60 m (`needsAviationLight`): one
4 px Points cloud at roof-tip height, hard blink once per 1.5 s
procedural in t (`aviationBlink`), both styles, day and night.

## Switch and flags

- `?style=painted` (default) vs `?style=photo` (today's look). Painted
  changes camera, palette, fog, post, markings, trees, night ground and
  beacons; photo pixels are unchanged (painted-only branches, defaults
  preserved, old chain spec intact).
- New flag: `?px=` — painted main-pass pixel factor (`?px=1` disables
  pixelation; `?px=2` doubles it). Default 1.5 on high, 1 on medium/low.
- Existing flags and how they interact now: `?q=` (high/medium/low, all
  chains), `?look=` (overrides on top of the style base), `?tilt=` and
  `?sao=` (photo only — painted has no tilt-shift and replaces SAO),
  `?grain=` (both), `?time=HH:MM` (tour sun), `?shot=` (still framing).

## Frame time, painted vs photo

Not measured in this sandbox (no GPU/headless browser here). Capture on
the laptop with the URLs below at `?q=high` and `?q=medium` and read:
`[post] style=painted passes=… ms=…` (dev-only one-shot, first painted
frame; budget ≤ 6 ms extra at 1440×900), `[render] frame=120 … frameMs=…`
(scene-only means at frames 30/120), and the `[scene14] drawCalls=…`
line (painted adds: markings mesh, ≤4000 fill-tree instances into the
existing three tree meshes, one aviation Points cloud, one depth
prepass). The painted depth prepass skips shadow-map work; the composer
runs at 1/1.5 resolution on high.

## Capture URLs

Base: the dev server root (`npm run dev` in `web/`).

- Tour day: `/?area=songpa-jamsil&shot=0`
- Tour night: `/?area=songpa-jamsil&shot=0&time=21:00`
- Sim morning: `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`
- Wide clamp: `/?area=st-가천대` then zoom out to the stop (clamp holds
  the framed width at the box span). Append `&style=photo` to any URL
  for the before/after pair.

Haze check (brief §2): on the sim 08:50 capture, the frame centre must
not be uniform haze (mean luminance spread ≥ 25 levels) — re-check on
the laptop captures; the 4×/9× ranges are asserted in
`web/tests/render-look.test.js` ("painted fog + night").

## Tests and build

- `cd web && npm test`: 956/957 pass. The single failure is
  `share.test.js` "result card on the real demo build", the known
  engine-stage failure from main — ignored per the resume brief.
- `npx vite build` could not run in this sandbox: vite 6.3.5 writes its
  config temp to `web/node_modules/.vite-temp`, which is read-only here
  (EPERM; vite's fallback only covers EACCES), and sandbox escalation
  needs human approval, which is disabled in this run. Stand-ins, all
  green: `node --check` on every edited file, node import smoke over all
  edited modules, and a full esbuild bundle of `src/main.js`
  (JSX + CSS + `three/addons`, 5.0 MB, zero errors) in `/tmp/14e-bundle`.

## Known limitations / follow-ups

- Painted GLSL (outline/AO, Kuwahara) is brace-balanced and
  spec-reviewed but never compiled here — confirm on the first laptop
  capture (a shader error would show as a dark/vanilla frame; photo is
  unaffected).
- Ground crosswalks (baked into the ground mesh) stay visible under the
  new zebras in painted scene mode — reads as one denser crossing.
- Flat-fallback boxes (no scene.json) keep ground paint and decorative
  trees in both styles; the painted markings/fill need scene data.
- `corridorDarken` has no painted override (the brief gives no target);
  journey corridor tiles keep the photo darkening.
- Sim leaf dates use the scenario start date (day 1); multi-day runs
  crossing 15 Oct / 1 Dec keep opening-day foliage.
