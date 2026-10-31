# Stage 33a2 — a quiet "Muse" label on the working card, and no blank strip on the zoomed-out map (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md` (Astryx first, tokens, no `text-overflow: ellipsis`). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Your 33a work is in the tree, uncommitted; build on it. Stop when this part is done.

## Found by the orchestrator (real Chromium, `?chat=&lang=en`, live message `미금역 근처 전세 찾아 주고 동네를 보여 줘`)

1. **The `Muse` name above the working card is loud.**
   - At 1000 px it renders at ~16 px in `--ui-ink1`, indented 16 px from the card's left edge (label x 176, card x 160), and it touches the card's top border (no gap).
   - It reads like a heading, not a sender label.
2. **Blank strip on the right of the map at 1440 / 2000 px.**
   - With no candidates yet, the map frames the covered regions (`chatmap.jsx:350–358`). On a wide stage that view reaches east of 127.4°E.
   - At 1440 × 1040 the view is at z 11 and needs tile column x = 1749. The tile proxy refuses it: the browser got 4 × `403 /api/tiles/white/11/{792..795}/1749.png`.
   - The proxy clips z ≥ 11 tiles to `TILE_BOUNDS = [126.6, 37.2, 127.4, 37.75]` (`web/src/aerial/proxy.js:70–77`), on purpose, so it is not an open tile proxy. z < 11 tiles are always allowed.
   - The failed tiles are dropped (`failedRef`), so the stage shows the bare ground colour for that column: a pale strip ~140 px wide at 1440, wider at 2000.
   - Keep the server bounds as they are. Fix it in the client.

## Change
1. **Name label** (`chat.jsx` `BusyMsg`, and the same for any other `ChatMessageBubble` that has `name="Muse"`; `ui.css`):
   - 12 px, weight 500, `--ui-ink3`;
   - starts on the card's left edge (no indent);
   - 4 px gap between the label and the card.
   - Use the Astryx `name` prop's own slot if it can be styled; scope the rule under `.ui-chat`.
2. **Tile fallback** (`web/src/basemap.js`, `chatmap.jsx` tile layer):
   - VWorld only (USGS has no bounds; leave it unchanged).
   - Do not request a z ≥ 11 tile that `tileInBounds(z, y, x)` (import from `aerial/proxy.js`) rejects.
   - Under the normal tiles, draw a low-zoom underlay that covers the whole visible view: tiles at `min(z, 10)` for the same view bbox (deduped, keep the count small, e.g. ≤ 16), with the same mute filter and opacity as the normal tiles. In-bounds normal tiles draw on top, so the sharp tiles still win inside the box.
   - Out-of-bounds areas then show the blurrier z 10 map instead of a blank strip. No new 403s in the console.
   - `basemapOn` (`failCount * 2 < tiles.length`) must keep working: count only tiles that were actually requested.
   - Inside the box at normal zoom (one candidate area, e.g. Jamsil) nothing visible changes.

## Test — extend `web/tests/chat-surface-33a.test.js` (or a new `web/tests/tile-fallback-33a2.test.js` for item 2)
- **Name label:** a CSS/source pin that the `.ui-chat` name rule sets 12 px, `--ui-ink3`, and a 4 px gap.
- **Tiles (pure function, no DOM):**
  - with the 1440 case (z 11 view whose bbox reaches lon 127.55): the normal tile list holds no tile that `tileInBounds` rejects, and the underlay covers the whole view bbox at z ≤ 10;
  - with a view inside the box: every normal tile is in bounds; the underlay is still bounded (≤ 16 tiles);
  - USGS provider: no clipping.
- **Keep green:** every test mentioning `basemapTiles`, `basemapTileUrl`, `tileInBounds`, `TILE_BOUNDS`, `ChatMessageBubble` or `BusyMsg`.

Run only (**run it before you finish**):
```
cd web && node --test tests/chat-surface-33a.test.js $(ls tests/tile-fallback-33a2.test.js 2>/dev/null) $(grep -lE "basemapTiles|basemapTileUrl|tileInBounds|TILE_BOUNDS|ChatMessageBubble|BusyMsg" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator re-checks in a real browser.

## Do not touch
`web/src/aerial/proxy.js` bounds, `relay/**`, `vite.config.js`, `candidate-card.jsx`, `landing-page.jsx`, `src/engine/**`, `src/consult/**`, `src/i18n/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Updated test files. Nothing else.
