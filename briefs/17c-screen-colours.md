# Stage 17c — Make the screen match the tests (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Commit after each part (`git add -A web/src web/tests && git commit -m "17c: …"`). Small, targeted changes only; keep every existing test green. First edit within 6 tool calls.

Read once: the "17b" section of `briefs/17-RESULT.md`, `web/src/render/sky.js` (light rig + `exposure`), `web/src/render/post.js` (GradeShader), `web/src/render/look.js` (`PAINTED_LOOK`, `litLumaU8`, `PAINTED_NIGHT_GROUND`).

The orchestrator captured 17b on the laptop GPU (Chrome, 1440×900, 2026-10-30 04:52). Moment text and the day tour are fixed. The 17b pure tests pass, but two views still look wrong **on screen**. Measured pixel colours (5×5 average, sRGB 0–255, L = Rec.709 luma):

| View | Spot | Screen | Target |
|---|---|---|---|
| Sim `?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1` (painted, q=medium) | ground | (161,137,109) L 140 | beige `#cfc4ad` ≈ (207,196,173) |
| same | building roof | (131,117,97) L 118 | `#ddd8ce`, lighter than ground |
| same | road | (86,74,62) L 75 | dark asphalt grey `#5b5d60`, not brown |
| same, `&debug=albedo` | ground / building / road | (187,178,173) / (183,178,174) / (108,109,113) | — |
| Tour night `?area=songpa-jamsil&shot=0&q=high&time=21:00` | ground | (0,0,2) L 0 | navy `#1d2330` (29,35,48) |
| same | road | (3,1,0) L 1 | warm lit asphalt, lighter than ground |
| same | unlit wall | (32,30,28) | dark slate ≥ 15 levels above ground |

So: (a) in the sim, lighting + post turn a grey/beige albedo into one brown and darken it ~20 %; even the albedo has buildings ≈ ground (178 vs 179) and a grey, not beige, ground. (b) at night, the ground and roads end up black although 17b set navy ground, warm roads and a road emissive.

## 1. Sim regional view: find what makes it brown
- Trace one ground pixel at 08:50 through the real chain (sun colour/intensity at 08:50, hemisphere, exposure, fog colour/range at the sim camera distance, AO, grade warm highlights, output) and write down which step shifts it from grey/beige to (161,137,109). Fix that step for painted style; do not paper over it with a new multiplier.
- Albedo must also separate: sim ground beige `#cfc4ad`, building walls `#c9c4bb` with roofs `#ddd8ce` — roofs ≥ 15 levels lighter than ground in albedo. If the corridor/base ground is drawn from another source (base map, terrain tile, fallback plane), find it.
- On screen at 08:50 (painted): ground within ΔE 10 of `#cfc4ad`, roofs lighter than ground, roads neutral grey (|R − B| ≤ 10) and ≥ 25 levels darker than ground.
- Add a pure helper that resolves the full painted chain for a flat colour at a given time (light rig + exposure + fog at a distance + grade + sRGB output) and test the three targets above with it. The test must use the same functions the renderer uses, not a parallel model.
- Commit `17c: sim view colours through the real chain`.

## 2. Night: ground and roads are black on screen
- Same method: trace the night ground `#1d2330` and the road (`0x4a4136` + emissive `0x2a2118`) through the real 21:00 chain and find where they go to 0 (exposure at night, moon/hemi intensity ≈ 0, fog colour black, grade crushing shadows, or the material not being the one drawn).
- On screen at 21:00: ground ≈ `#1d2330` (each channel ±8), roads lighter and warmer than ground (≥ 10 levels), unlit walls ≥ 15 levels above ground. Lit windows unchanged.
- Test with the helper from part 1 at 21:00.
- Commit `17c: night ground and roads visible`.

## 3. Sim marker size
- In the sim view (camera ~700 m wide) the followed-person marker is a large white cone and sphere about 60 px tall that hides the road. Keep it legible but ≤ 28 px tall at that framing (scale by camera distance, clamp), with a 1 px dark outline so it reads on beige.
- Commit `17c: smaller sim marker`.

## End
- `cd web && npm test 2>&1 | tail -6` and `npx vite build 2>&1 | tail -2`.
- Append a "17c" section to `briefs/17-RESULT.md`: the step that caused each problem (found, not guessed), the before/after numbers from the helper, and the capture URLs.
- Commit.
