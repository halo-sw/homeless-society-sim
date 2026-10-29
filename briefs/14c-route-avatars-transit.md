# Stage 14c — Route highlight, avatar movers, "이동 중" fallback (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Commit after each part. Read `briefs/14b-RESULT.md` first; build on its `web/src/motion/` modules. Existing route code: `main.js` `routeAhead` / `routeDone` (around line 1118), the journey layer (`depthTest:false`), and the drawer's "이동 중" card.

User request (2026-10-29): show the household's trip on the map as a highlighted route with avatar characters moving along it. When a leg cannot be drawn (subway underground, no train generated), switch to an "이동 중…" state instead of the person vanishing.

## 1. Route highlight
- For each household member's current trip:
  - Draw the full route draped on the terrain (`heightAt`): walk legs as a dashed ribbon, ride legs in the line's colour.
  - Draw the done part dimmed and the part ahead bright.
  - Animate a soft travelling glow along the part ahead (shader, procedural in t).
- Walk legs follow the walk graph polyline, not straight lines. Ride legs follow the line geometry between stations.
- Two members on screen: each gets their member colour and an outline so overlapping routes stay readable.
- Keep the current timeline steps in sync: hovering a step in the bottom bar highlights that leg on the map.
- Test: leg split at t (done vs ahead lengths) as a pure helper.
- Commit `14c: route highlight`.

## 2. Avatar movers
- Replace the household capsules with avatar characters, built in code: a stylised head + body with the member colour, ≤ 400 triangles, one InstancedMesh or a few meshes.
  - A simple procedural walk cycle (bob + arm/leg swing from arc-length phase).
  - Facing the direction of travel.
  - A name chip above ("구성원 1").
- Make the avatar a pluggable asset: `web/src/render/avatar.js` exports `createAvatar({ color, label })`. A later glTF character (the user may supply avatar art) must drop in by changing only this file. If the orchestrator later adds files under `web/public/avatars/`, load the first `.glb` there when present; otherwise use the code-built one.
- Ambient pedestrians from 14b stay simple capsules, so the household avatars stand out.
- Commit `14c: avatar movers`.

## 3. "이동 중" fallback when a leg can't be drawn
- When the current leg is a ride with no visible train (underground segment, no generated train, or missing line geometry), the avatar is not shown on the map. Instead:
  - Show a floating transit chip pinned at the boarding station, moving to the alighting station along a straight dashed arc above ground. The chip reads: line badge + "잠실 → 강남 이동 중 · 4분 남음", with a progress bar.
  - The route's ride segment pulses.
  - On arrival, the avatar reappears at the exit and the chip fades.
- Same for any leg with missing geometry: walk legs without a graph path show "걸어서 이동 중 · 3분 남음" between the two points.
- Never show the avatar teleporting, frozen at a station, or missing without a chip.
- The camera follow mode (`follow=1`) follows the chip during that leg.
- Tests: the state machine "visible / chip / arrived" for underground, missing-geometry and normal legs, at given t values.
- Commit `14c: 이동 중 fallback`.

## End
- Run `cd web && npm test 2>&1 | tail -6` and `npx vite build 2>&1 | tail -2`.
- Write `briefs/14c-RESULT.md` with capture URLs:
  - 08:40 walking to 잠실
  - 08:50 underground ride (chip)
  - 09:00 arrival
  - a two-member moment
- Commit.

## 4. Two visual fixes from the GPU capture of 14 (do these first, small)
- **Zooming out shows the void.**
  - On `/?area=st-가천대&shot=0`, about 14 wheel steps out shows the hexagonal edge of the sky/ground disc with black outside.
  - Clamp the orbit distance so the camera never leaves the dome (max ≈ 0.8 × dome radius).
  - Extend the ground disc colour to the horizon with fog, so no black ever shows.
- **Roads read as water.**
  - On `/?area=st-잠실&shot=0`, road ribbons are pale blue-grey, the same family as the water mask.
  - Move road colours in the look table to warm neutral greys (asphalt), clearly apart from water blue. Footways get a lighter warm grey and cycleways a muted red-brown.
- Commit `14c: zoom clamp + road colours`.
