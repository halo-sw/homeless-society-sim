# Stage 11b — The ride view shows a map, and the share card shows numbers (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/11-RESULT.md`. Sandbox: no network, no keys.

The orchestrator recaptured on the real GPU at `6a40209`. Agent placement, the 4-group tabs, the one-row agent header and the night window grid are confirmed fixed. Two items are not. Attached: `briefs/img/11b-ride.png` (A 08:50, with `&look=fogRegionalNear:20,fogRegionalFar:80` — still grey, so fog is not the cause) and `briefs/img/11b-share.png`.

## 1 — The ride view is an empty grey plane
Measured with the network log on `?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`, 25 s after load: only **3 of 65** corridor tiles (`/data/region/corridor/c1/tiles/t_*.json`) were fetched. `TILE_CAP = 12`, `TILE_LOAD_PACE = 3` per clock tick, and on a static `?t=` load the clock does not tick, so loading stalls. Under the camera there is nothing but the clear colour, so the whole view is grey. The camera looks almost straight down, so even loaded tiles read as thin specks.
1. When a ride starts (or a static load lands inside one), load **every tile of the active corridor** in the background, independent of the clock (a loop with a small concurrency, e.g. 6 at a time). 65 tiles ≈ 11k buildings is within budget. Raise `TILE_CAP` to the corridor's tile count, and keep unloading when the corridor changes. Log the measured draw calls and triangles once.
2. Add a **base map** under the corridor so the view is never an empty plane: a land-coloured ground plane that covers the corridor bounds (manifest `bounds`), the tile water (Han river etc.) in blue, and major roads from the tile lines at a readable width. Use the `look` table for colours (`regionalGround`, `regionalWater`, `regionalRoad`).
3. Camera: oblique cruise (pitch about 50–60° from vertical, not top-down), with height scaled so that about 3–4 km of the corridor around the train is in frame, so buildings read as blocks. The line stays full-opacity on top. Station names show as labels along the line.
4. While tiles are still loading, show a small "지도 불러오는 중 12/65" chip, so a grey frame never looks like the final state.
5. Pure tests: tile load plan (all corridor tiles, concurrency, no clock dependency), camera pitch and height for the corridor scale, base-map bounds from the manifest.

## 2 — The share card shows "—" for every A/B cell
`share.jsx` reads `s.compare`, but the compare file is fetched only when the A·B 비교 tab opens. On `&tab=money&share=1` (and in the tour's share step) `s.compare` is null, so every row renders "—". When the share dialog opens, it must ensure the compare and money data are loaded (reuse the existing loaders, show a short loading state, then render). Same for the tour's share step. Test: open-share with an empty store triggers the loads, and with the demo fixtures every row has A and B values (no "—" where the data has a value).

## 3 — Small
- At 19:18 (follow) the "물어보기" button is missing at bottom-right (only "상세" shows). It must always be there when the panel is closed.

## Tests and output
All existing tests green (608 JS, 168 Python), new tests above, `vite build` green, no keys or raw data in git or bundle. Add a short `## Stage 11b` section to `briefs/11-RESULT.md`.
