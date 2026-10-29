# Stage 14f — Make the painted look actually show (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ui-13f`. Commit after each part (`git add -A web/src web/tests && git commit -m "14f: …"`). Touch only `web/src/render/`, `web/src/scene/`, `web/src/camera.js`, the fog/camera/light lines of `web/src/main.js`, and `web/tests/`. First edit within 6 tool calls.

Read once: `briefs/14e-RESULT.md`, `web/src/render/painted.js`, `web/src/render/look.js:140-170`, `web/src/camera.js:60-90`.

The orchestrator captured 14e on the laptop GPU (Chrome, 1440×900, 2026-10-30 04:06–04:08). The console confirms the chain runs (`[post] style=painted passes=render+outline+kuwahara+bloom+grade+output`, `[render] initial quality=high style=painted`). On screen, though, the frames look almost like the photo style:

| Seen on screen | Expected |
|---|---|
| Everything in a strong **blue cast**: building shadows are large translucent blue shapes; roads read light blue-grey, not dark asphalt; tall towers are pale blue | warm neutral shadows, dark asphalt `#5b5d60`, warm walls `#c9c4bb` |
| **No visible outlines, no AO, no brush finish**, at q=high and q=medium, tour and sim | 1 px edges ~35 % darker on every silhouette and roof edge; contact darkening at building bases |
| Tour `?area=songpa-jamsil&shot=0`: towers fill the frame, about 150–250 m wide | a neighbourhood view: many buildings, streets and trees in one frame |
| Sim 08:50 regional view: flat beige ground, grey blocks, no green or water | parks, river and roads readable at a glance |

## 1. Fog from the camera distance, not the framed width
- `streetFogRange(framedWidthM)` uses `4×` / `9×` the framed width. With the painted 10° FOV the camera sits about `3.6×` the framed width away, so fog starts just behind the target and tints the whole frame.
- Painted: `near = camDist + 2 × framedWidth`, `far = camDist + 6 × framedWidth` (pure helper `paintedFogRange(camDist, framedWidth)`, tested). Photo unchanged.
- Commit `14f: painted fog from camera distance`.

## 2. No blue cast
- Find what tints shadows and roads blue in painted style (hemisphere/ambient sky colour, environment map, shadow colour, or the grade). In painted style:
  - ambient/hemisphere sky colour warm neutral (e.g. `#f2ece0` sky, `#b9ad98` ground), not blue
  - shadow strength ≤ 45 % and warm grey, never blue
  - the road, wall and roof colours on screen within ΔE 10 of the `PAINTED_LOOK` targets in direct sun at 14:00
- Test (pure): resolve the painted light rig at 14:00 and assert sky/ambient colours have B − R ≤ 10.
- Add `?debug=albedo` (painted only): renders the scene unlit with the palette colours, so the orchestrator can tell palette from lighting on the next capture.
- Commit `14f: warm painted lighting`.

## 3. Outlines and AO must be visible
- They run but show nothing. Add `?debug=depth` and `?debug=outline` (painted only) that output the linear depth and the outline mask full-screen, so the next capture proves each step.
- Likely causes to check: the packed depth prepass reading the wrong target or near/far, the Laplacian threshold too high for a 10° FOV (depth differences are tiny relative to distance at a long camera distance — normalise by distance), or the pass writing to a target that is not the one shown.
- Acceptance: at framed widths 300 m–1.5 km, every building silhouette gets a 1 px edge 30–40 % darker than its pixel; bases get a soft contact shadow. Test the edge maths as a pure function (a step in linear depth at 1,000 m camera distance must exceed the threshold).
- The Kuwahara radius should be visible on facades at q=high (window grids soften into patches); if it is not, check it reads the post-AO colour.
- Commit `14f: visible outlines and AO`.

## 4. Painted tour framing
- Painted tour shots frame at least **450 m** wide (shots that focus one POI too), default view **700 m**, so a frame shows a neighbourhood like the HypeSeoul reference, not one tower. The zoom clamp from 14e stays.
- Sim regional view (journey): corridor tiles get the painted palette (walls/roofs split, parks `#8a9a5b`, water `#3f6f8f` from the base map if present), and outlines apply there too.
- Commit `14f: neighbourhood framing`.

## End
- `cd web && npm test 2>&1 | tail -6` (the `share.test.js` stage-15 failure may remain).
- Append a "14f" section to `briefs/14e-RESULT.md`: what caused the blue cast and the invisible outlines (found, not guessed), and the debug URLs.
- Commit.
