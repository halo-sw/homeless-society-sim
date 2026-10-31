# Stage 31n — the map fits its homes into the space the chrome leaves free (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator after 31m
Real Chromium, iPhone 13, replay `menlo-month` (EN), 지도·후보 tab, two homes picked. Tags no longer overlap each other (31m works), but:
1. **The tray hides tags.** Tags for 4, 6 and A sit under the pick tray at the bottom; only 2 of 6 tags can be clicked.
2. **The title hides the work marker.** The marker `Meta HQ (1 Hacker Way)` is hidden behind the stage title `Meta HQ commute · 6 candidates`. Its box is placed first (rank 0) and the measured chrome is only added as obstacles after it.

**Cause:** `fitMapView(focus, W, H, MAP_FIT_MARGIN, CHATMAP_INSET)` (`web/src/ui/chatmap.jsx` ~282) uses a fixed `CHATMAP_INSET = { top: 56, right: 24, bottom: 96, left: 24 }`. On the phone, the real chrome is much larger:
- the filter row + title + legend reach ~150–230 px from the top;
- the tray covers ~160 px or more at the bottom;
- the control column takes ~64 px on the right.

The tray is also not an obstacle for the tag layout.

## Change (`web/src/ui/chatmap.jsx`, layout helpers in `web/src/chatmap.js` if needed)
1. **Measured inset.** Build the fit inset from the boxes 31m already measures (stage-relative):
   - **top:** bottom of the top-left stack (filter row / title / legend) + room for one tag above the topmost pin. Use the tallest tag height from `tagSizePx` + 8 px.
   - **bottom:** the part of the stage covered by the tray (read `--ui-chat-tray-h` from the chat root, or measure `.ui-picks-tray` against the stage rect) + 16 px. If the tray isn't over the map (desktop, tray outside the stage), use the 31m credit box's height + 16 px.
   - **right:** the control column's width + 16 px.
   - **left:** 16 px.
   - Keep `CHATMAP_INSET` as the SSR / first-render fallback.
   - Re-fit when the measured inset changes by more than 8 px. Use the ResizeObserver pattern; no loop: compare before setting state.
   - If the inset leaves less than 120 px of height or width, scale the top and bottom insets down proportionally so the map still shows the pins.
2. **The tray is an obstacle.** Add the tray's visible box over the stage to the layout obstacles.
3. **The work marker avoids the chrome too.**
   - Add the measured chrome obstacles before rank 0 is placed. Rank 0 takes the first free slot / spiral position, with its leader line when moved.
   - If nothing is free it is still placed (forced), as today.
4. **"후보 모두 보기"** (the fit button) resets to this same measured fit.

## Test — `web/tests/map-fit-31n.test.js`
- **Pure helper** (export it, e.g. `fitInsetFromChrome({ W, H, top, bottom, right, tagH })` → `{ top, right, bottom, left }`):
  - a phone-like case (W 390, H 700, top stack bottom 230, tray 160, right column 64, tagH 56) gives top ≥ 230 + 56, bottom ≥ 160, right ≥ 64;
  - a case where the sum would leave less than 120 px scales down to leave at least 120 px.
- **`layoutMapPills`:** a rank-0 item whose home slot hits an obstacle is placed elsewhere (box not intersecting the obstacle) with a leader.
- **`fitMapView` with the phone inset:** every input point maps inside `[left, W − right] × [top, H − bottom]`.
- **Keep green:** `tests/map-phone-31m.test.js`, `tests/map-hit-31k.test.js`, `tests/map-click-31j.test.js`, `tests/map-controls-31h.test.js`, `tests/map-tags-31g.test.js`, `tests/map-markers-31f.test.js`, `tests/map-tray-31b.test.js`, and everything mentioning `ChatMap`, `chatmap`, `fitMapView`, `layoutMapPills` or `CHATMAP_INSET`. Update pins on the old forced rank-0 slot, and name them.

Run only (**run it before you finish**):
```
cd web && node --test tests/map-fit-31n.test.js tests/map-phone-31m.test.js tests/map-hit-31k.test.js tests/map-click-31j.test.js tests/map-controls-31h.test.js tests/map-tags-31g.test.js tests/map-markers-31f.test.js tests/map-tray-31b.test.js $(grep -lE "ChatMap|chatmap|fitMapView|layoutMapPills|CHATMAP_INSET" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator re-checks in a real browser (phone + desktop, KO + EN, mouse clicks on every tag).

## Do not touch
`landing-page.jsx`, `CandidatesCard`, `map-filters.js`, the tray component in `chat.jsx` (read `--ui-chat-tray-h` only), `src/engine/**`, `src/i18n/**`, `src/consult/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Updated test files. Nothing else.
