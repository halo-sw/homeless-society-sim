# Stage 32a2 — fix the 32a shell in the browser: thread width, phone width, drawer chips, tray on the phone chat pane, banner in flow, badges, the map's empty card (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

Docs: `cd web && npx --no-install astryx hook useResizable --dense`, `npx --no-install astryx component ResizeHandle ChatComposerDrawer Badge Banner --dense`.

## Found by the orchestrator (real Chromium after a dev-server restart; replay `menlo-month` EN / `seoul-couple` KO; 390 (iPhone 13) / 1000 / 1440 / 1920 px)
1. **Thread width is stuck at the 320 px minimum** at 1000, 1440 and 1920, even in a fresh browser with empty storage. The map takes the rest.
   - `useResizable({ defaultSize: loadThreadWidth("chat") ?? "36%", … })` (`chat.jsx` ~1565) is called without a `containerRef`.
   - The docs say an exact `"N%"` resolves once against the viewport, or against a 1200 px temporary basis before layout, and that persisted sizes are saved.
2. **Phone (390 px):** the chat pane is 320 px wide with an empty column on the right. At ≤ 900 px the thread must be the full width; the resizable width must not apply there.
3. **Drawer chips are clipped.** In the composer drawer, `Show the commute` / `How much a m…` run off the right edge, with a 48 px left indent and a grey sheet with a "—" handle above the composer. The brief asked for chips that wrap. Our old `.ui-chat-chips` nowrap/overflow rules still apply inside the drawer.
4. **Phone chat pane shows the pick tray again** (`A 10 Coleman Place · B Apartments on South Perimeter Road — See the result`). Before 32a it showed only on the 지도·후보 pane (`tests/map-tray-31b`, `tests/*26z2*`).
5. **The replay `Banner` overlays the top of the thread** at 1440 (it covers the first messages). It must sit in the flow above the message list, full width of the thread column, and scroll away with nothing hidden under it.
6. **Source `Badge`s look like loose text.** `Sources checked  Zillow ZORI  OSM (US)` and `USGS` drop to a second line with an indent. They should read as small neutral badges, in one wrapping row that starts after the label, with an 8 px gap.
7. **Map empty card under the filter row.** Early in the replay, the 지도 stage shows the filter row and `Meta HQ commute · 6 candidates` over the old empty card (`…areas will show up here`), and the texts overlap. When the stage has candidates, the empty card must not render. When it has none, the filter row and legend are hidden (32a already does that part).
8. **Four tests fail after 32a.** Update them to the new structure and name each:
   - `chat-shell-32a.test.js` "keeps one 900 px breakpoint" (`.ui-chat-narrowtabs` not under the 900 px block);
   - the 26z2 tests "hides the tray at <=1099px unless the narrow pane is Map & homes" and "compact run row above the phone chips";
   - 29a6e "replay bar is not the chat layout" (`ds-replay-bar` class gone).

   The behaviour they describe (tray off the phone chat pane; compact run row above the chips; the replay notice not being the chat layout) must still hold. Re-point the pins at the new elements; do not delete the intent.

## Change (`web/src/ui/chat.jsx`, `web/src/ui/ui.css`; `consult.jsx` only for the badges)
1. **Thread width:**
   - `useResizable` with `containerRef` = the split container;
   - `defaultSize: percent(36, { min: pixel(380) })` (import from `@astryxdesign/core/Resizable/utils` or the root, as the docs say), `minSize: 320`, `maxSize: 720`.
   - Use the hook's own `autoSaveId: "ithaca-thread"` instead of the hand-rolled storage. Drop `loadThreadWidth` / `saveThreadWidth` if nothing else uses them.
   - Never save a size measured while narrow (≤ 900 px) or while the stage is closed.
2. **≤ 900 px:** the thread pane is 100% wide, no `ResizeHandle`, no width style.
3. **Drawer:** chips wrap (`flex-wrap: wrap`, gap 8 px) inside the drawer, no left indent, nothing clipped.
   - The drawer starts collapsed with its count summary (`이어서 해 볼 것 3`). It expands on click and collapses again after a chip is used.
   - Remove the old chip-row rules that fight it (nowrap, overflow-x, mask).
4. **Tray:** back to the 26z2 / 31b rule; on the phone chat pane it never renders (or is `hidden`).
5. **Banner:** in normal flow at the top of the thread column (not absolute or sticky over content), 16 px gutters like the messages.
6. **Badges:** label + badges in one wrapping row; neutral `Badge` size small; 8 px gap.
7. **Map empty card:** not rendered when the stage has candidates.

## Test — extend `web/tests/chat-shell-32a.test.js` (new `describe("32a2 …")`)
- **Source:** `useResizable` is called with `containerRef` and a `percent(` default, and `autoSaveId`.
- **CSS:**
  - inside the 900 px media block, the thread pane width is 100% and the resize handle is hidden;
  - the drawer chip container has `flex-wrap: wrap` and no `overflow-x`.
- **SSR:**
  - the narrow chat pane renders no `.ui-picks-tray`;
  - the replay `Banner` is rendered inside the thread column before the message list;
  - the stage with candidates renders no empty-card text.
- The four updated tests above pass.

Run only (**run it before you finish**):
```
cd web && node --test tests/chat-shell-32a.test.js tests/map-tray-31b.test.js tests/thread-edge-31d.test.js tests/chat-hierarchy-31a.test.js tests/voice-29b.test.js $(grep -lE "26z2|29a6e|liveRowLine|StageArea|ChatComposer|ui-chat-thread|ui-chat-main|replay" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator re-checks in a real browser at 390 / 1000 / 1440 / 1920 px.

## Do not touch
The map internals, `candidate-card.jsx`, `landing-page.jsx`, `voice-button.jsx`, `src/engine/**`, `src/consult/**`, `src/i18n/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Updated test files. Nothing else.
