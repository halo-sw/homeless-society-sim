# Stage 31m — map polish: tags never overlap, measured chrome boxes, a one-line credit and a docked pin card on phones (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md` (tokens, no raw hex/px in new CSS, no `text-overflow: ellipsis`). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (real Chromium; iPhone 13 390 × 844 and 1440 × 900; replay `seoul-couple`, live 판교/강남)
1. **Tags overlap each other.** On the phone, around 강남, tags 3, 5 and 6 sit on top of each other.
   - Cause in `layoutMapPills` (`src/chatmap.js` ~718): when no free slot exists, a rank 0/1 item is forced into its default slot regardless of overlap. On the phone 6 full tags don't fit, but nothing smaller is tried before folding.
2. **The chrome boxes are guesses.** `chromeObstacles` in `src/ui/chatmap.jsx` (~305) uses `{ w: min(300, W/2), h: 140 }` and a 64 px right column.
   - On the desktop at 판교, the legend is wider than 300 px and a tag covers its end.
   - The credit box and an open pin card are not obstacles at all.
3. **Phone map credit.** It is a full-width box of two lines (`지도 © 국토교통부 공간정보 오픈플랫폼(VWorld) · © OpenStreetMap contributors`) and hides the lower tags.
4. **Phone pin card.** It floats in the middle of the map, over the legend (cut at `출근 시`) and over the 확대 button.

## Change
1. **Measured chrome boxes** (`chatmap.jsx`):
   - Replace the guessed `chromeObstacles` with boxes measured from the DOM, relative to the map stage: the filter row, the title, the legend, the right control column (its buttons, not the wrapper), the credit, and the open pin card. Use refs + `getBoundingClientRect()`.
   - Re-measure with the existing ResizeObserver pattern (~161) and when the pin card opens or closes. Pad each box by 4 px.
   - Keep the guessed boxes only as the SSR / first-render fallback.
2. **Tags never overlap** (`src/chatmap.js`, `layoutMapPills`). For each tag, in order:
   1. the full tag in a free slot, then the spiral;
   2. a **compact** form: header + price, no commute line (the item may carry `alt: { w, h }`; `tagSizePx` gives it with a `{ short: true }` option); the slots, then the spiral;
   3. otherwise fold it into a cluster, as rank 2 does today.
   - Picked A/B (rank 1) go through steps 1 and 2, and if still no room they are placed anyway on top (today's rule). The work marker (rank 0) is unchanged.
   - The laid item reports `short: true` when the compact form was used, and `ChatMap` renders that tag without its commute line. The aria-label keeps the commute.
   - Result: apart from forced A/B, no two laid boxes intersect each other or an obstacle.
3. **Phone credit (stage width ≤ 480 px):**
   - one line, bottom-left of the map, 16 px from the left edge, clear of the tray (keep the `--ui-chat-tray-h` offset);
   - width fits its content;
   - `--ds-t-12`, `--ds-ink-2`, the `.ui-float` surface with 2 px / 8 px padding.
   - **Short text:** `© VWorld · © OpenStreetMap` (USGS: `© USGS`; OSM only: `© OpenStreetMap`).
   - It is a `<button>` with `aria-expanded`: a tap shows the full credit text (today's string) above it, wrapping, and a second tap hides it.
   - Desktop keeps today's full text in the side column.
   - The short and full strings go in `data-no-i18n` nodes and are built for the current language: the EN full string is `Map © MOLIT Spatial Information Open Platform (VWorld) · © OpenStreetMap contributors`.
   - The credit box (short or opened) is an obstacle for tags.
4. **Phone pin card (≤ 480 px):**
   - docks at the bottom of the map stage, 16 px side gutters, sitting directly above the tray (`--ui-chat-tray-h`);
   - full width minus the gutters, above the tags;
   - while it is open, the credit and the control column are hidden (`hidden` attribute, not just opacity) so nothing sits under it; closing it brings them back.
   - Desktop keeps the floating card, but clamp its position so it never intersects the measured top-left stack or the right column (move it below the stack / left of the column).
5. Nothing else changes visually.

New strings: list every new KO/EN string in the final message. The orchestrator adds them to `src/i18n/en.js`; do not edit `src/i18n/**`.

## Test — `web/tests/map-phone-31m.test.js`
- **`layoutMapPills`:** 6 tag items, each 90 × 56 (alt 90 × 38), all anchored within 40 px of each other in a 390 × 500 stage, plus an obstacle box at the top-left. Check:
  - no two laid boxes (non-cluster) intersect;
  - none intersects the obstacle;
  - every input id is either laid or a member of a cluster;
  - at least one item is laid `short: true` before anything folds, when a short form fits.
- **Forced A/B:** two rank-1 items with no room are still laid.
- **`tagSizePx(pin, tenure, lang, { short: true })`:** shorter than the full tag when the pin has a commute.
- **SSR `ChatMap`:**
  - the credit renders a button with `aria-expanded="false"` holding the short text, and the full text is present for desktop;
  - with a selected pin, the pin card renders with a class marking it docked for phones (CSS decides when it applies).
- **CSS (`ui.css`):**
  - inside a `max-width: 480px` media query, the docked pin card rule uses `--ui-chat-tray-h`;
  - no `ellipsis`.
- **Keep green:**
  - `tests/map-hit-31k.test.js`, `tests/map-click-31j.test.js`, `tests/map-controls-31h.test.js`, `tests/map-tags-31g.test.js`, `tests/map-markers-31f.test.js`, `tests/map-tray-31b.test.js`;
  - everything mentioning `ChatMap`, `chatmap`, `layoutMapPills`, `tagSizePx` or `ui-chatmap-credit`.
  - Update pins on the old credit markup or the old forced-placement rule, and name them.

Run only (**run it before you finish**):
```
cd web && node --test tests/map-phone-31m.test.js tests/map-hit-31k.test.js tests/map-click-31j.test.js tests/map-controls-31h.test.js tests/map-tags-31g.test.js tests/map-markers-31f.test.js tests/map-tray-31b.test.js $(grep -lE "ChatMap|chatmap|layoutMapPills|tagSizePx|ui-chatmap-credit" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator re-checks in a real browser (phone + desktop, KO + EN, mouse clicks on every tag).

## Do not touch
`landing-page.jsx`, `CandidatesCard`, the filter logic (`map-filters.js`), `src/engine/**`, `src/i18n/**`, `src/consult/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. New strings (KO and EN). Updated test files. Nothing else.
