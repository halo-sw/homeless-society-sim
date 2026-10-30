# Stage 19g — Fixes from the orchestrator's walkthrough of 19a–19f (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17` (19a–19f are merged). Do not explore beyond the lines named. First edit within 4 tool calls. Commit after items 1–3 and again after 4–8. Then stop.

The orchestrator walked it at 2026-10-30 ~16:10 at 1440×900: landing → 1인 example → 담기 ×2 → tray run → result → demo sim. Layout, rows, result table and landing now read well. The remaining issues:

## 1. The row's 담기 button does nothing with a real mouse click (blocking)
- `candidate-card.jsx:173` wraps the button in `<span className="ui-cand-row-btn" onClick={(e) => e.stopPropagation()}>`. Inside the `role="button"` row (`:160-162`), a real pointer click on the astryx `Button` never toggles. A synthetic `button.click()` does toggle. The same button in the side panel (no wrapper) works.
- Fix: delete the wrapper span. In the row's `onClick` (and `onKeyDown`), return early when the event came from inside a button: `if (e.target && e.target.closest && e.target.closest("button")) return;`.
- Test (`web/tests/walk-19g.test.js`):
  - the rendered row has no `ui-cand-row-btn`;
  - the exported row click handler ignores a fake event whose `target.closest("button")` is truthy, and calls `onDetail` otherwise. Export the handler factory as `rowClickHandler(onDetail, candidate)`.

## 2. Price pills float to the right of their pins
Every pill sits right of its anchor dot, with its tail pointing at empty space, even isolated ones (pins 1 and 3). A grey shadow wedge shows under each tail.
- In `ChatMap` (`chatmap.jsx`), the **first** placement must be centred above the anchor: the tail tip exactly at the anchor point and the pill box above it. Only colliding pills move, through the existing collision pass; the moved ones draw the muted leader from the tail to the anchor.
- Apply the drop shadow to the pill group once (a `<filter>` in `<defs>` or a CSS `filter` on the group), not to the leader or a separate tail path. No grey wedge.
- Test: for an isolated pin, the pill centre x equals the anchor x (±0.5) and the tail tip y equals the anchor y (±0.5). For the 5/6 near-duplicate pair, one stays centred and the other moves with a leader.

## 3. The 회사 pill hides the 판교 station label
Skip the station-name label for the workplace station, since the pill already names it. Keep its dot.

## 4. Tray, panel, legend
- The tray's run button renders grey (`chat.jsx:1683`, no `variant`). Make it `variant="primary"`.
- When `SidePanel` is open, it covers the right end of the tray, including the run button. While the panel is open, set the tray's `right` to `calc(380px + 24px)`, via a `data-panel="open"` attribute on `.ui-chat-main` and a CSS rule. Test the attribute in render.
- The tray covers the map legend (`chatmap.jsx:298`, bottom-left). Move the legend to the **top-right** (top 12, right 12). Keep the attribution at the bottom-right.

## 5. Chips above the composer
19a item 5 was not done: the 추천 질문 chips still sit under the composer. Render them directly above the composer, as one scrollable row.

## 6. Landing legibility
Over the now-visible city:
- the brand tagline (`ui.css:248-250`) is hard to read;
- the footer coverage line (`ui.css:279-280`) is hard to read.

Give each a soft backdrop: `background: color-mix(in srgb, var(--ui-page) 85%, transparent); border-radius: 999px; padding: 4px 12px`. Make the footer text `--ui-ink2`.

## 7. Old pins that contradict 19e/19f (update the pins, not the product)
- `web/tests/painted-17c.test.js:192-199` "clamps instead of vanishing or enlarging" asserts the old `MARKER_MIN_SCALE` floor. 19e removed that floor on purpose (the floor made close markers huge). Rewrite it to the new contract:
  - far → 1;
  - close → the projected size ≤ `maxPx`;
  - bad inputs → finite and in (0, 1].
- `web/tests/ithaca-name-17.test.js:57-59` expects the old brand line "Ithaca · The Pre-living Agent…". 19f shows "Ithaca" + tagline. Assert "Ithaca", the heading and the tagline instead.
- `web/tests/ithaca-name-17.test.js:78-82` reads one `--ui-page N%`. With 19f's radial veil, assert that the **first** (centre) stop is ≥ 85 % (it is 96 %), so the copy keeps AA.

## 8. A big white disc in the demo sim
`?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`: a white disc with a dark ring, about 45 px across, near the top of the view (screen ≈ 493, 151) while the train pin is mid-screen. Find which mesh it is. Candidates:
- the journey station `dotHull`/`dotMesh` (`journey-scene.js`): is `updateMarkerScale` skipped in this phase?
- `destMark` (`main.js:1521`)
- a home marker

Make it obey the same ≤ 14 px ceiling, or hide it in this phase. Add a pin test for the phase list that calls `updateMarkerScale`.

## End
```
cd web && npm test 2>&1 | tail -6 && npx vite build 2>&1 | tail -2
```
The only failures allowed are the two known data-drift ones:
- `share-load` "walked-hours B value"
- `numbers-16b` "demo-two-homes-B C01 is 16.5"

Commit `19g: walkthrough fixes — row pick click, centred pills, tray/panel/legend, chips, landing legibility, pins`.
