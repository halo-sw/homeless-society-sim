# Stage 19h — An invisible closed dialog eats clicks (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Small. First edit within 3 tool calls. Commit, then stop.

## 1. Closed share dialog blocks the chat
The orchestrator traced it on the laptop. At 1440×900, real mouse clicks on the candidate rows' 담기 buttons (x ≈ 414) do nothing. `document.elementFromPoint(414, 171)` returns a `DIALOG.astryx-dialog` rendered by `ShareDialog` (`chat.jsx:1598`; also `app.jsx:993`). The dialog's state:
- `open = false`
- computed `display: flex`
- `opacity: 0`
- `pointer-events: auto`
- rect x 400–1040, y 56–320

It is invisible but sits on top of the right part of the thread and the map. A synthetic `button.click()` works, which is why the 19g fix looked right in tests.

Fix both:
- In `web/src/ui/ui.css`, add a global rule: `dialog.astryx-dialog:not([open]) { display: none !important; pointer-events: none; }`.
- In `ShareDialog` (`web/src/ui/share.jsx:97`), after all hooks, return `null` when `!open`. Hooks must keep their order.

Test (`web/tests/dialog-19h.test.js`):
- `ui.css` contains the `:not([open])` rule;
- `renderToString(<ShareDialog/>)` with the store's share flag false returns `""`;
- with it true, it contains "결과 공유".

## 2. Region labels hidden by centred pills
`web/tests/chatmap-19b.test.js:106-115` fails: "region names as text". 19g centred the pills above their anchors, so the fixture's region-label spot now collides with a pill and the label is skipped. Before skipping, try the label at offsets (0, +28), (0, −28), (+60, 0) and (−60, 0) px. Skip only if all of them collide. Keep the test as is.

## 3. Gap above the composer
19g moved the 추천 질문 chips above the composer, but an empty ~80 px band remains between the chips and the composer. Remove it: the composer follows the chips with an 8 px gap. It probably comes from the old `.ui-chat-thread > :first-child > :last-child` flex rules (`ui.css` ~654-668), or a min-height on the composer wrapper.

## End
```
cd web && npm test 2>&1 | tail -6 && npx vite build 2>&1 | tail -2
```
The only allowed failures are the two known data-drift ones:
- `share-load` "walked-hours B value"
- `numbers-16b` "C01 is 16.5"

Commit `19h: closed dialogs never take clicks, region labels try offsets, no gap above the composer`.
