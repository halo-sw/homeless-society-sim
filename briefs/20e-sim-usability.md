# Stage 20e — The 3D view is easy to follow (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17` (HEAD 40043b3, 20a–20d merged). First edit within 5 tool calls. Commit, then stop. The orchestrator checks on the GPU with real mouse input.

## Why
The user asked why the usability fixes for the 3D view never shipped. Stages 20a–20d fixed the picture (sharp edges, aerial photo, labels, evidence lines). Nobody fixed how a person *uses* the view. Found on the GPU at 1440×900 (`?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1`):

1. **You cannot zoom out or look around while following.** Follow mode sets `controls.enabled = false` every frame (`main.js` ~2721, 2732, 2760 and the street/hold branches). The mouse wheel and drag do nothing, so a viewer sees a 150 m patch and never learns where home, the station and work are.
2. **No route and no destination on screen.** During "출근 중 · 레이크팰리스 → 잠실 (걸어서 5분 남음)", no line shows the way to 잠실 station, and the destination pill from 20b (`paintLabels20b`, `hiState.destLabel`) is not visible. The viewer sees a red pin "나" walking somewhere unknown.
3. **The VWorld credit is not on screen.** It is a licence condition. `AttrLine` is rendered, but `.ui-sim13 .ui-attr { display: none; }` (`ui.css:720`) hides it. Also, the rendered text has no aerial credit even after `[aerial] ok 121 tiles z18`, so `store.set({ aerial: true })` (`main.js:443`) does not reach `AttrLine`. Find out why (wrong store, or the key is dropped) and fix it.
4. **The right panel puts the current scene third.** The order is 내 기준 점수 → 살아 보니 → 나 (지금). The 3D view shows *now*, so "나 · 5분 남음 · 이 장면이 결과에 들어가는 곳" must come first.
5. **Raw numbers in "지금 식구들 모습":** "약 8.6분", "약 17.4분", "피곤한 정도 0", "피곤한 정도 4.8". Minutes are decimals and the fatigue number has no scale.
6. **Labels slide under the top-left toolbar** (A·B / 집만 밝게 보기 / 범례). For example, "잠실주공아파트" sits half under it. The same happens near the timeline at the bottom.
7. **The timeline colour bar has no meaning attached.** Orange, purple, blue and yellow segments carry no label.

## Changes
1. **Follow keeps the user in control.**
   - While following, the wheel zooms and a drag orbits *around the followed target*. Keep a user offset: `followZoom` is a distance multiplier, clamped 0.5–6. `followYaw` is an added azimuth.
   - The follow pose functions keep choosing the target and the base pose. Apply the offset on top.
   - Do not set `controls.enabled = false` in follow branches. Instead, after the pose is applied, let `controls` handle input and read back the zoom and yaw into the offset. A small helper `applyFollowOffset(basePose, target, {zoom, yaw})` in `camera.js` is a pure function: test it.
   - Add two buttons to the top-left bar, after 범례:
     - "동네 전체" frames home, the current destination and the route (reuse `fitMapView`-like bounds logic, or `distanceForWidth`);
     - "따라가기" returns to follow with the offset reset.
   - The URL `follow=1` still starts in follow.
2. **Show where the trip goes.**
   - During a trip (walk, ride, errand), draw the remaining path on the ground from the marker to the destination:
     - 4 px screen width, colour `#2f6fed`, 85 % opacity, above the road ribbons;
     - use the trip's existing path geometry, the same source as the route line in `--- tour plan + route line ---` (~`main.js:795`).
   - The walked part is drawn grey at 40 %.
   - Make the destination pill from 20b show: check why `hiState.destLabel` is empty or why its pill is culled. The pill reads "{to.label} · {출근|장보기|병원|산책} 가는 곳".
   - For the commute, the destination of the walk leg is the station, e.g. "잠실역 · 지하철 타는 곳".
3. **Credit.**
   - In sim mode, show a single small line bottom-left, just above the timeline (11 px, `--ui-ink2`, white 80 % backdrop): "항공사진 © 국토교통부 공간정보 오픈플랫폼(VWorld) · © OpenStreetMap". It is shown only when `aerial` is true; the OSM part is always shown.
   - Keep the full `AttrLine` in the legend card.
   - Fix the store path so `state.aerial` is true in the UI after the drape.
4. **Right panel order in sim:**
   1. 나 (지금): status, big number, the evidence list "이 장면이 결과에 들어가는 곳", next step;
   2. 지금 식구들 모습;
   3. 오늘 (the trip list);
   4. 살아 보니;
   5. 내 기준 점수, last. It is the summary and already lives on the result page.
5. **Whole numbers.**
   - In "지금 식구들 모습", round minutes with `Math.round` (the "약" stays).
   - Show fatigue as "피곤한 정도 {Math.round(v)}/100".
   - Grep `app.jsx` and `nowcard.js` for other `분` built from unrounded values and fix them.
6. **Label safe zones.** `placeLabels(items, viewW, viewH, reserved = [])` takes reserved rects. Pass the toolbar rect and the timeline rect measured from the DOM. A label that intersects a reserved rect is skipped, unless it is an always-item. An always-item is nudged below or above the rect instead.
7. **Timeline meaning.**
   - Hovering a segment shows a tooltip such as "08:21–08:35 걷기 · 잠실까지".
   - Add a one-line legend under the bar, 11 px, with small swatches: 걷기 · 지하철 · 일 · 장보기 · 집. Use the existing `ActivityLegend` if it fits.
   - No `text-overflow: ellipsis` anywhere (`compare-tabs.test.js:62`).

## Tests — `web/tests/usability-20e.test.js`
- `applyFollowOffset`:
  - zoom 2 doubles the camera-to-target distance;
  - yaw 90° rotates the camera around the target, keeping the height;
  - zoom is clamped to 0.5–6.
- `placeLabels` with a reserved rect:
  - no placed non-always box intersects it;
  - an always-item that overlaps is moved out, not dropped.
- The family line helper (export it if needed): for a ride of 8.6 min and fatigue 4.8, the line contains "약 9분" and "피곤한 정도 5/100", and matches no `/\d+\.\d+분/`.
- A source pin:
  - `ui.css` no longer hides the sim credit line;
  - the sim credit element text includes "VWorld" when `state.aerial` is true (SSR render with a store fixture, as in `ui-render.test.js`).
- Sim panel order: in an SSR render of the sim panel, the index of "이 장면이 결과에 들어가는 곳" (or the 나 section) is before "살아 보니", and "내 기준 점수" comes last.
- Update older pins that fix the old panel order or `controls.enabled = false` in follow, and name them in the commit body.

Run:
```
cd web && node --test tests/usability-20e.test.js tests/labels-20b.test.js tests/evidence-20c.test.js tests/ui-render.test.js 2>&1 | tail -10 && npx vite build 2>&1 | tail -2
```

Commit `20e: follow lets you zoom and look around, route and destination on the ground, credit visible, now-first panel, whole numbers`. Then stop.
