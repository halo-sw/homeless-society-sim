# Stage 31k — map tags still can't be clicked with a mouse: overlays steal the hit, and hover re-orders the DOM (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator after 31j
Real Chromium (Playwright), replay `seoul-couple` (KO) and `menlo-month` (EN), iPhone 13 viewport, 지도·후보 / Map & homes tab. For each `g[data-layer=home-pin]` we took its bounding-box centre and ran `document.elementFromPoint(cx, cy)`:

| Pin | Element on top | Comment |
|---|---|---|
| KO pins 1, 2, 4 | `DIV.ui-chatmap-side` | The 31d/31j right column box covers most of the map, not just its buttons. |
| KO pins 3, 5 | `DIV.ui-float.ui-chatmap-credit` | — |
| KO pin 6 | `DIV.ui-picks-tray` | Correct: the tray is above the map there. |
| EN pins 2, 5 | `SPAN.ui-pick-chip` | The tray, correct. |
| EN pins 1, 3, 6 | the tag itself (`self`) | — |

**Even when the tag itself is on top** (EN pin 1), a real `page.mouse.click(cx, cy)` does **not** open the pin card. Keyboard Enter does.

**Likely cause:**
- Moving the mouse onto a tag fires `onMouseEnter` → `onPinHover` → the parent's `setCardHi`.
- The re-render puts the highlighted pin last (`pillOrder` / `ordered` sort by `cardHi`), so React moves that `<g>` node in the DOM.
- When the node is moved between `mousedown` and `mouseup`, the browser fires `click` on the common ancestor (the svg), not on the tag.

**Check the cause:** log the event target or test with hover disabled before you rely on this explanation.

## Change (`web/src/ui/chatmap.jsx`, `web/src/ui/ui.css`)
1. **Overlays only catch clicks on their own controls.**
   - `.ui-chatmap-side` (and any wrapper column/row added in 31b/31h/31j, plus the filter-row wrapper) gets `pointer-events: none`.
   - Its interactive children (the buttons, the credit's links if any) get `pointer-events: auto`.
   - The credit box itself can stay `none` (it's text).
   - Make sure the wrapper boxes don't stretch over the map. Size them to their content, if that is simpler.
2. **Stable DOM order for tags.**
   - Render home tags in a fixed order (by pin rank / id), never re-sorted by `cardHi` or selection.
   - To draw the highlighted / selected tag on top, render a separate, `pointer-events: none` copy of just that tag (or its outline) in a top layer after all tags. SVG `<use href>` or a second render with `aria-hidden` and no handlers both work.
   - The real, focusable, clickable `<g>` never moves.
   - Do the same for any other list that re-sorts on hover (e.g. `ordered` used for dots/leaders): sorting by hover is no longer needed.
3. **Belt and braces:** open the card on the tag's own `onPointerUp` when the pointer went down on the same pin id and did not pass the drag threshold. Track `downPinId` from the tag's `onPointerDown`, and keep `onClick` for keyboard and assistive tech. Make sure it doesn't open twice: `setSelectedId` to the same id is idempotent, so that's fine.
4. **Nothing else changes visually.**

## Test — `web/tests/map-hit-31k.test.js`
- **SSR `ChatMap`** with 3 pins, rendered twice: once with `cardHi` = pin 3, once with `cardHi` null. The sequence of `data-layer="home-pin"` aria-labels in the HTML is identical in both renders. The highlighted render contains one extra top-layer element with `aria-hidden="true"` and no `role="button"`.
- **`ui.css`:**
  - `.ui-chatmap-side` has `pointer-events: none`;
  - a rule gives its buttons `pointer-events: auto`;
  - the same goes for the filter-row wrapper.
- **Source:** the tag `<g>` has an `onPointerUp` handler that checks the drag threshold.
- **Keep green:** `tests/map-click-31j.test.js`, `tests/map-markers-31f.test.js`, `tests/map-tags-31g.test.js`, `tests/map-controls-31h.test.js`, `tests/map-tray-31b.test.js`, and everything mentioning `ChatMap` or `chatmap`.

Run only (**run it before you finish**):
```
cd web && node --test tests/map-hit-31k.test.js tests/map-click-31j.test.js tests/map-markers-31f.test.js tests/map-tags-31g.test.js tests/map-controls-31h.test.js tests/map-tray-31b.test.js $(grep -lE "ChatMap|chatmap" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator re-runs the `elementFromPoint` + real mouse click check on every pin.

## Do not touch
Everything outside `chatmap.jsx`, the map rules in `ui.css` and the new test.

## Final message
Changed files, one line each. Whether the hover-reorder cause was confirmed. Nothing else.
