# Stage 14e — Painted isometric map look (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ui-13f` (this worktree). Commit after each part (`git add -A web/src web/tests && git commit -m "14e: …"`). Do not explore beyond the files named below. The first edit should land within 6 tool calls.

User request (2026-10-29): make the map itself look like **HypeSeoul** (hypeseoul.xyz), an isometric painted map of Seoul.
- Attached image 1 is HypeSeoul zoomed in. It is a **visual reference only**: never copy its code, images or colours by sampling.
- Attached image 2 is our tour view today (`/?area=songpa-jamsil&shot=0`).
- Attached image 3 is our sim view today (`/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`).

HypeSeoul repaints its renders with a fine-tuned image model. We have no image model, so we get close **in code only**: camera, palette, post-processing and a few procedural details. What makes their look, and what we lack today:

| HypeSeoul | Ours today |
|---|---|
| fixed oblique camera, near-orthographic (no perspective stretch) | 24° FOV perspective, close and tilted; towers lean and fill the frame |
| strong, warm, saturated ground: dark asphalt, light warm sidewalks, deep greens, autumn tree tints | washed-out pale grey-blue sheet; the sim view is a brown haze |
| crisp edges: every building has a dark outline and contact shadow (AO) | soft, foggy, no outlines |
| roads read as roads: lane lines, yellow centre lines, crosswalks at junctions | flat ribbons, bluish |
| dense round tree clusters with colour variety | sparse identical trees |
| slightly pixel-crisp painterly finish | smooth, blurry (tilt-shift) |

Everything goes behind one style switch so the old look stays available: `?style=painted` (new default) and `?style=photo` (today's look, unchanged pixels).

## 1. Camera: fixed near-isometric view
Files: `web/src/camera.js:17-18` (`TOUR_FOV_DEG`, `TOUR_PITCH_DEG`), `:59-60` (journey cruise), `web/src/main.js:206-213` (camera + `OrbitControls`).
- Add `cameraStyle(style)` in `camera.js` returning `{ fovDeg, pitchDeg, azimuth, rotate }`.
  - painted: FOV **10°**, pitch **32°** above the horizon (≈ 0.56 rad), one fixed azimuth, `rotate: false`.
  - photo: today's values.
- Every call site that uses `TOUR_FOV_DEG` / `TOUR_PITCH_DEG` / `JOURNEY_CRUISE_PITCH_DEG` reads from `cameraStyle(STYLE)` instead (grep them; there are about 8 in `main.js`). `distanceForWidth` already takes the FOV, so framing stays correct.
- The camera far plane (`span * 8` at `main.js:206`) must cover the longer distance a narrow FOV needs (at least `distance × 2`).
- Painted: `controls.enableRotate = false`; pan and zoom stay. Clamp zoom so the frame is between 150 m and the box span wide (never the void past the ground disc).
- The arch lens (`ARCH_*`, `archLensPose`) is unchanged.
- Tests (pure): `cameraStyle` values; `distanceForWidth(300, 10, 1.6)` frames 300 m.
- Commit `14e: near-isometric camera`.

## 2. Painted palette
Files: `web/src/render/look.js` (`DEFAULT_LOOK`, `resolveLook`), `web/src/render/sky.js:38` (`SKY_COLORS`), fog at `main.js:200-201` and `:2292-2305`.
- Add `PAINTED_LOOK` (overrides on top of `DEFAULT_LOOK`), picked by the style. Target daytime values (sRGB):
  - ground / built land: warm beige `#cfc4ad`
  - sidewalks / footways: light warm grey `#d9d3c7`
  - roads: dark asphalt `#5b5d60` (primary/secondary) and `#6c6e70` (residential/service); never blue
  - cycleways: muted red-brown `#a0705a`
  - grass / parks: `#8a9a5b`; forest: `#5d7040`; scrub: `#9a8f5a`
  - water: deep calm blue `#3f6f8f`
  - building walls: warm light concrete `#c9c4bb`, roofs one step lighter `#ddd8ce`, so roof and wall separate at a glance
- **Fog:** in painted style, fog only fades the very far edge (near ≥ 4× and far ≥ 9× the framed width) and takes the sky's horizon colour, never brown. The sim regional view (`regionalFogRange`, `regionalGround`, `corridorDarken`) gets the same treatment. Measure on the 08:50 sim view that the centre of the frame is not a uniform haze (mean luminance spread across the frame ≥ 25 levels).
- Grade saturation 1.2 for painted.
- Night/dusk keep the existing sky phases; painted night ground goes dark navy-grey `#1d2330`, roads a little lighter, so lit windows and roads read like the HypeSeoul night view.
- Tests: `resolveLook` with style painted returns the overrides; `?look=` still overrides on top.
- Commit `14e: painted palette + clear fog`.

## 3. Post: outlines, AO, painterly finish
Files: `web/src/render/post.js` (`postChainSpec` :106, `createPost` :147, `build()`), `web/src/render/quality.js`.
- New passes in a new file `web/src/render/painted.js` (shaders as strings, like `TiltShiftShader` in `post.js`):
  1. **Depth outlines.** Render depth into a `DepthTexture` on the composer's render target. Outline where the second derivative of linear depth jumps (silhouettes and roof edges). Colour: 35 % darker than the pixel, not black. Width 1 px at high zoom, fading out when the framed width is over 3 km so the wide view does not turn to noise.
  2. **Screen-space AO.** 8 directions, two radii (3 px and 6 px) from the same depth, darkening at most 40 %. Use it on medium and high; replace SAO in painted style (SAO stays for photo).
  3. **Painterly filter.** A small Kuwahara filter (radius 3 on high, 2 on medium) over the colour. It flattens texture noise into brush-like patches, which is the closest code-only match to the repaint.
  4. **Pixel crispness.** Render the main pass at `1 / pixelFactor` (default 1.5 on high, 1 on medium) and upscale with nearest filtering. `?px=1` disables.
- Painted chain: `render → outline+AO → kuwahara → bloom (night) → grade → output`. **No tilt-shift** in painted style.
- Low quality: no composer, as today; outlines and AO skipped, palette still applies.
- Keep `composerSamples: 0` (the ANGLE Metal black-frame rule in `quality.js`). The black-frame guard (`renderFrameGuard`) must still pass.
- Budget: painted high ≤ 6 ms extra GPU per frame at 1440×900 on the capture laptop. Log `[post] style=painted passes=… ms=…` once in dev.
- Tests: `postChainSpec(level, { style })` order for painted/photo × high/medium/low; tilt absent in painted.
- Commit `14e: outlines, AO, painterly post`.

## 4. Road markings and trees
Files: `web/src/scene/roads.js` (`buildRoadMeshes` :143, `pushRibbon` :96), `web/src/scene/trees3d.js` (`LEAF_COLORS` :17, `treeTint` :24).
- **Road markings** (one extra merged mesh, painted style only):
  - dashed white lane lines on roads with `lanes ≥ 2` (2 m dash, 4 m gap, 0.15 m wide)
  - a solid yellow double centre line on primary/secondary
  - zebra crosswalks where a footway crosses a road with `lanes ≥ 2` (white bars 0.5 m wide, 0.5 m apart, across the road width)
  - procedural from the ribbon stations; no new data. Hidden when the framed width is over 2 km.
- **Trees:**
  - Broadleaf crowns become 2–3 overlapping spheres (≤ 60 triangles per tree) so they read as round clusters.
  - Per-instance colour from a seeded palette (deep green, olive, yellow-green, and from mid-October to November a share of yellow `#d9b13b`, orange `#c8742f` and red `#a84232`, by sim date). Pure helper `treeColour(seed, dateISO)`, tested.
  - Street-tree density along roads that have none in the data: one tree per 9 m on both sidewalks of residential and larger roads, labelled 가정값 in the legend ("가로수 위치 일부는 규칙으로 채운 값"). Skip where a building footprint or another tree is within 3 m.
- Commit `14e: road markings + tree clusters`.

## 5. Night details (small)
Files: `web/src/render/facades.js` (`litFractionFor` :67, `eveningHomeFraction` :99).
- Window lights already exist. Make floors switch off deterministically through the night (by floor seed and minute) so a building never flickers when you scrub the timeline.
- Red aviation lights on roof tips of buildings ≥ 60 m: a small emissive point that blinks once per 1.5 s, procedural in t.
- Commit `14e: night details`.

## End
- Run `cd web && npm test 2>&1 | tail -6` (one failure in `share.test.js` comes from the engine stage on main; ignore it if it is the only one, and say so) and `npx vite build 2>&1 | tail -2`.
- Write `briefs/14e-RESULT.md`:
  - what changed, per part
  - the painted / photo switch and every new `?` flag
  - frame time painted vs photo (high, medium)
  - capture URLs: tour `songpa-jamsil` shot 0 (day), the same at 21:00, the sim 08:50 view, and `st-가천대` zoomed out to the clamp
- Commit.
