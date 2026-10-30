# Stage 26n — candidate thumbnails show the real place: a live aerial photo (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (user request)
The user sent a screenshot of the Korean candidate list and asked for real data in the thumbnails.
- Today most rows show the painted 3D block (`SceneThumb` in `src/ui/preview.jsx`), e.g. 천사의도시II오피스텔 as a beige box.
- It reads as a placeholder, not the real home.
- Only a few homes have a Wikimedia complex photo (`photos.slots` with `slot === "complex"`).

## Change
Every candidate gets a **live aerial photo crop centred on the home, with a pin**. Order of preference for the thumbnail:
1. complex photo (as today);
2. **aerial crop (new)**;
3. `SceneThumb` (as today);
4. `MiniMap`.

### 1. Pure helper — `src/aerial/thumb.js` (new)
`aerialThumbTiles({ lon, lat, z, widthPx, heightPx, tilePx })` → `{ z, tiles: [{ z, x, y, left, top }], size: tilePx }`.
- Use `lonLatToTile` from `src/aerial/tiles.js` and compute in fractional global pixels at zoom `z`.
- The home point sits exactly at the window centre (`widthPx/2, heightPx/2`).
- `left`/`top` are the CSS offsets of each tile inside the window. `tilePx` is the drawn tile size in CSS px: 128 draws z18 tiles at half size, so they stay sharp on retina.
- Return only tiles that intersect the window.

`aerialThumbUrl(apiBase, lon, lat, { z, y, x })`:
- US (`isUsLonLat` from `src/basemap.js`): `usgsTileUrl(z, y, x)` from `src/aerial/drape.js`. No relay is needed.
- Korea: `${apiBase}/api/tiles/Satellite/${z}/${y}/${x}.jpeg`. This is the existing relay route in `src/aerial/proxy.js`; the key stays server-side and the response is `no-store`.
- Korea with `apiBase === null` (static build with no relay): return `null`.

Defaults:
- row thumb: z18, tilePx 128, window 96×96. That is about 90 m across at Seoul's latitude, so it shows the building and its street.
- full card: z18, tilePx 128, window = the hero box (pass its measured width, height 180).

### 2. Component — `AerialThumb` in `src/ui/preview.jsx`
Props: `{ lon, lat, width, height, fallback }`.
- A `position: relative; overflow: hidden` box. The tiles are absolutely positioned `<img>`s with `loading="lazy" decoding="async" draggable={false} alt=""`.
- Do **not** set `referrerPolicy`: the relay accepts tile requests by Referer.
- A pin at the centre: a 10 px dark dot with a 2 px white ring and a soft shadow, plus a 1 px white outer ring so it shows on dark roofs.
- Small corner label `항공사진` (`--ui-t11` or the nearest token, white text on rgba(0,0,0,.45), radius 4). The `title` attribute is the credit: `aerialCreditFor({ country })` from `drape.js` (US → `USGS_CREDIT`, else `AERIAL_CREDIT`).
- If any tile `onError` fires, or `aerialThumbUrl` returns `null`, render `fallback` instead.
- No canvas and no caching code. The browser fetches the tiles; nothing is written anywhere.

### 3. Wire it — `src/ui/candidate-card.jsx`
- `RowThumb`: when there is no `hero`, render `<AerialThumb … fallback={today's SceneThumb/MiniMap branch} />`.
- `FullCard` hero: when there is no `hero`, render `AerialThumb` (height 180) with today's `SceneThumb` as its fallback. `showHero` becomes true whenever `lon`/`lat` are finite.
- Remove the old `ui-cand-thumb` 3D-only styling only if it now conflicts. The phone rule `.ui-cand-thumb { width: 64px; height: 64px }` (26m) must keep working, so `AerialThumb` fills its parent box: pass the size, or use 100 % and measure.

### 4. Credit under the list — `src/ui/chat.jsx` (~line 326, after `.ui-cand-list`)
When at least one candidate is shown, add one supporting line under the list: `aerialCreditFor(...)` for the list's country. The US uses `USGS_CREDIT`.
- Keep it next to, not inside, the "마음에 드는 집을 2곳 담으면 …" hint.
- The full card shows the same credit under its hero.

## Test — `web/tests/aerial-thumb-26n.test.js`
- `aerialThumbTiles` for Seoul (127.0276, 37.4979), z18, 96×96, tilePx 128:
  - every tile has z 18;
  - 1–4 tiles;
  - the home's pixel, computed back from any returned tile's `left/top` plus its fractional offset, lands at (48, 48) ± 0.5.
- The same check for a full card window of 400×180.
- `aerialThumbUrl`:
  - Korea with apiBase `"https://relay.example"` → `https://relay.example/api/tiles/Satellite/18/{y}/{x}.jpeg`;
  - Korea with `null` → `null`;
  - Menlo Park (-122.148, 37.484) → starts with `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/18/`.
- No file under `src/` contains `api.vworld.kr` except `src/aerial/proxy.js` (read the files with fs).
- SSR smoke: `renderToString(<CandidateCard …row…/>)` for a candidate with lon/lat and no photos contains `항공사진`.
- Keep green: `tests/compare-tabs.test.js`, `tests/mobile-26m.test.js`, `tests/us-26k.test.js`, `tests/us-26i.test.js`, and every `tests/candidate*`, `tests/preview*`, `tests/photos*`, `tests/aerial*` file that exists.

Run only:
```
cd web && node --test tests/aerial-thumb-26n.test.js tests/compare-tabs.test.js tests/mobile-26m.test.js tests/us-26k.test.js tests/us-26i.test.js $(ls tests | grep -E '^(candidate|preview|photos|aerial)' | grep -v 26n | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks the result in a real browser.

## Do not touch
`src/engine/**`, `src/i18n/**` (the orchestrator adds the English for `항공사진`), `pipeline/**`, `relay/**`, anything under `data/`. No `text-overflow: ellipsis`. Do not store or cache any tile.

## Final message
Changed files, one line each. Nothing else.
