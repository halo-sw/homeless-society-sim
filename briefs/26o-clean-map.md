# Stage 26o — a calmer chat map: muted basemap, our data on top (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (user request: "지도도 좀 더 깔끔한걸로")
Desktop captures at 1440×900 of the chat map with 6 candidates.

**Korea** (VWorld `white` tiles through the relay):
- The basemap brings its own colour: orange IC/JC badges, green parks, and red/pink/blue subway lines.
- Our own subway polylines (`m.lines`) are drawn on top, so most lines show twice in slightly different colours.
- VWorld's black station names (서현역, 야탑역) sit right next to our price pills and collide with them.

**US** (USGS Topo): pink highways, blue water and bold street names everywhere. Our 6 price pills are hard to pick out.

In both cases the map is louder than the data we put on it.

## Change — `src/ui/chatmap.jsx` (+ `src/chatmap.js` for constants)
1. **Muted basemap, same recipe for both providers.**
   - Wrap the tile `<image>` list (~line 258) in `<g filter="url(#basemap-mute)">`.
   - Define the filter in the existing `<defs>`: `feColorMatrix type="saturate" values={BASEMAP_MUTE.saturate}`, then `feComponentTransfer` with `feFuncR/G/B type="linear" slope={BASEMAP_MUTE.slope} intercept={1 - slope}`.
   - Export `BASEMAP_MUTE = { saturate: 0.12, slope: 0.72 }` from `src/chatmap.js`.
   - Use an SVG filter, not CSS `filter`: Safari ignores CSS filters on SVG children.
   - Drop the tile `opacity={0.92}`; the filter does the softening.
2. **Our layers stay in full colour on top:** subway lines (`m.lines`), stations, commute legs, work pin and price pills. Only change their weight:
   - subway line stroke `fs(3)` → `fs(2.5)`, casing `fs(5)` → `fs(4.5)`;
   - nothing else.
3. **When there is no basemap** (`!basemapOn`, static build), the hand-drawn ground/park/road layers are unchanged.
4. **Credit line** unchanged (VWorld / USGS).

## Test — `web/tests/chatmap-26o.test.js`
- `BASEMAP_MUTE.saturate` is in [0, 0.3] and `slope` is in [0.6, 0.85].
- SSR `renderToString` of the chat map with a KR doc and one pin, with the basemap on (reuse how `tests/chatmap-19b.test.js` or `tests/us-26e.test.js` render it; find one that sets `basemapOn`):
  - it contains `id="basemap-mute"`;
  - every tile `<image` is inside the `<g filter="url(#basemap-mute)">`;
  - the subway polylines are not inside that group.
- Keep green: `tests/chatmap-18.test.js`, `tests/chatmap-19b.test.js`, `tests/us-26e.test.js`, `tests/us-26k.test.js`, `tests/us-26l.test.js`, and every `tests/chatmap*` / `tests/basemap*` file.

Run only:
```
cd web && node --test tests/chatmap-26o.test.js tests/us-26e.test.js tests/us-26k.test.js tests/us-26l.test.js $(ls tests | grep -E '^(chatmap|basemap)' | grep -v 26o | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks the look and the pan speed in a real browser.

## Do not touch
`src/engine/**`, `src/i18n/**`, `pipeline/**`, `relay/**`, anything under `data/`, `src/ui/candidate-card.jsx`, `src/ui/preview.jsx` (another stage is editing them). No `text-overflow: ellipsis`.

## Final message
Changed files, one line each. Nothing else.
