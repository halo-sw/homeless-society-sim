# Stage 25a — The candidate map is a real map: streets underneath, zoom and drag (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `map-25`. Stop when this part is done.

## Why
The orchestrator ran the public site at 1520×784 with the sentence "강남역으로 출근해요. 혼자 살고 전세 3억 이하, 역 가까운 오피스텔이면 좋겠어요". The candidate map (`web/src/ui/chatmap.jsx`) shows a plain beige panel with only two subway lines and the price pills. There are no streets, no buildings, no blocks and no water, so nobody can tell where the homes are. It also cannot be zoomed or moved.

The fix has three parts:
- a light raster basemap under the existing layers: VWorld "white" tiles, served by our tile proxy at `/api/tiles/white/{z}/{y}/{x}.png`, which another run adds;
- wheel zoom, drag pan and buttons;
- the right credit.

## Change

### 1. New `web/src/basemap.js` (pure, plus one env read)
- `basemapApiBase()`:
  - returns `import.meta.env.VITE_API_BASE` (trailing `/` removed) when it is set;
  - else `""` when not a static build (`import.meta.env.VITE_STATIC !== "1"`, so the dev server serves `/api/tiles`);
  - else `null`, meaning no basemap.
  - Guard `import.meta.env` being undefined (node tests) and return `""` there.
- `basemapTileUrl(apiBase, z, y, x)` → `${apiBase}/api/tiles/white/${z}/${y}/${x}.png`.
- `pickBasemapZoom(metersPerPx, lat)` → the integer `z` where Web Mercator m/px (`156543.03 * cos(lat) / 2^z`) is closest to `metersPerPx` in log2. Clamp it to 7–19.
- `basemapTiles({ toLonLat, W, H, lat, metersPerPx, maxTiles = 80 })`:
  - lists the tiles covering the visible stage `[0, 0, W, H]`;
  - `toLonLat(x, y)` is the inverse of the current `toXY`;
  - pick `z` with `pickBasemapZoom`; if more than `maxTiles` tiles would be needed, lower `z` until it fits;
  - for each tile return `{ key: \`${z}/${y}/${x}\`, z, x, y, nw: [lon, lat], se: [lon, lat] }`, using `tileToLonLat` from `web/src/aerial/tiles.js`.
- `viewTransform({ zoom, panX, panY, cx, cy })` → `{ apply([x, y]) → [cx + (x - cx) * zoom + panX, cy + (y - cy) * zoom + panY], invert([x, y]) → ... }`.
- `zoomAt(state, factor, px, py, cx, cy)` → a new `{ zoom, panX, panY }`, with zoom clamped to 0.6–12, that keeps the stage point `(px, py)` fixed on screen.

### 2. `web/src/chatmap.js` — inverse of the fit
`fitMapView` (lines 116-176) also returns `toLonLat(x, y)`, the exact inverse of `toXY`. Use the same `view`, `iw`, `ih`, `padL`, `padT`, and `midLat` (divide x by `cos(midLat)` to undo `flatXY`). Also return `metersPerPx = (view[2] / cos(midLat)) * 111320 * cos(midLat) / iw`, which simplifies to `view[2] * 111320 / iw`.

### 3. `web/src/ui/chatmap.jsx` — basemap + zoom/pan
Lines are from the current file.
- **State:**
  - `const [vt, setVt] = useState({ zoom: 1, panX: 0, panY: 0 })`.
  - Reset it to `{ 1, 0, 0 }` when the focus set changes. Key it on a string of the focus lon/lats, in a `useEffect`.
- **Wrap the projection:** after `const { toXY } = fitMapView(...)` (line 69), build:
  - `T = viewTransform({ ...vt, cx: W / 2, cy: H / 2 })`;
  - `const toXYz = (lon, lat) => T.apply(toXY(lon, lat))`;
  - `const toLonLatZ = (x, y) => fit.toLonLat(...T.invert([x, y]))`.
  - Use `toXYz` everywhere `toXY` is used below, so the pills, station names and 동 labels are laid out in screen space after the zoom. Their sizes stay constant in px.
- **Basemap layer:**
  - `const apiBase = basemapApiBase()`. When it is not null, compute `basemapTiles({ toLonLat: toLonLatZ, W, H, lat: midLat, metersPerPx: fit.metersPerPx / vt.zoom })`.
  - Render each tile as an SVG `<image href=… x y width height preserveAspectRatio="none">`: project `nw` and `se` with `toXYz`. Put the layer right after the ground `<rect>` (line ~164), at `opacity={0.92}`.
  - Track failures with `onError` in a `useRef(new Set())` of keys plus a `useState` counter. A failed tile is not rendered again.
  - `basemapOn` is `apiBase !== null` and fewer than half of the tiles failed. While it is on, skip the vector parks, water and road layers (lines 164-205). Subway lines, stations and pills stay.
  - Add `pointerEvents="none"` on the images.
- **Gestures on the svg:**
  - Wheel: `preventDefault` through a native non-passive listener added in a `useEffect` on `mountRef`. Use `factor = Math.exp(-deltaY * (deltaMode === 1 ? 0.05 : 0.0015))` and call `zoomAt` around the cursor (stage px from `getBoundingClientRect`).
  - Drag with the left button: pointer down, then move, which pans. Use `setPointerCapture`. A drag that moves more than 4 px must not trigger the pin click: keep a `dragged` ref and check it in the existing `onPinClick` handler.
  - Double-click zooms in ×2 at the cursor.
  - Cursor is `grab` / `grabbing`.
- **Buttons:** bottom-right, stacked, 32×32, white, radius 8, with the same shadow as the pills.
  - `+` (aria-label "확대");
  - `−` ("축소");
  - a fit button with the text "맞추기" (aria-label "후보 모두 보기"), which resets `vt`.
  - Place them above the credit line and clear of the picks tray: `bottom: 104px; right: 12px`.
- **Credit (line ~419):** when `basemapOn`, the text is "지도 © 국토교통부 공간정보 오픈플랫폼(VWorld) · © OpenStreetMap contributors"; otherwise keep the current text. Use a white 80 % backdrop and 2 px 6 px padding so it reads over the tiles.
- **Header comment:** update the one at lines 1-8: the map is no longer static; it zooms and pans and has a VWorld basemap when the tile proxy is available.

### 4. CSS (`web/src/ui/ui.css`)
`.ui-chatmap-zoom` button group styles. Use `touch-action: none` on `.ui-chatmap svg` so drag works on touch. No `text-overflow: ellipsis`.

## Test — `web/tests/basemap-25a.test.js`
- `fitMapView(...).toLonLat` inverts `toXY` within 1e-9 for three points.
- `pickBasemapZoom`:
  - at lat 37.5, 1.19 m/px gives 17;
  - 9.5 m/px gives 14;
  - 0.01 m/px clamps to 19.
- `basemapTiles` for a 1.2 km wide view at 1000×700 around Gangnam (127.0276, 37.4979):
  - every tile key is unique;
  - the union of the tile rectangles, projected, covers the four stage corners;
  - the count is ≤ 80.
- `zoomAt` keeps the cursor point fixed: apply the transform before and after, and the lon/lat under `(px, py)` is unchanged within 1e-6 px. Zoom is clamped to 0.6–12.
- `basemapTileUrl("https://r.example", 16, 25392, 55894)` → `https://r.example/api/tiles/white/16/25392/55894.png`; `basemapTileUrl("", …)` starts with `/api/tiles/`.
- Source pins in `chatmap.jsx`:
  - the credit includes "VWorld" behind `basemapOn`;
  - the wheel listener is added with `{ passive: false }`;
  - the buttons have aria-labels "확대", "축소" and "후보 모두 보기".
- Keep `web/tests/chatmap*.test.js` green, and update a pin only if it fixed the old static wording. Name it in your final message.

Run only:
```
cd web && node --test tests/basemap-25a.test.js tests/chatmap*.test.js 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`web/src/paths.js`, `web/src/aerial/proxy.js`, `web/vite.config.js`, `web/src/consult/*`, `web/src/ui/main.jsx`, `web/src/ui/topbar.jsx`, `web/src/ui/landing.jsx`. Other runs edit them.

## Final message
Changed files, one line each. Nothing else.
