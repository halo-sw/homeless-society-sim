# Stage 20d — Real aerial photos on the ground and roofs (VWorld) (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. First edit within 5 tool calls. Commit, then stop. The orchestrator tests with the real key on the GPU. You never see the key.

## Why
The user chose the photoreal direction: the 3D neighbourhood should look like the real place. They are issuing a VWorld API key, which will live in `~/.config/homeless-society/secrets.env` as `VWORLD_KEY`. The orchestrator starts the dev server with that variable in `process.env`.

## Hard rules (security, licence)
- The key **never** reaches the browser, the bundle, a log line, a test fixture or git. Only the dev-server middleware reads `process.env.VWORLD_KEY`.
- Tiles are fetched live and **never written to disk**. No cache directory, and `Cache-Control: no-store` on our response. No pre-baking.
- Every view that shows the photo shows the credit "항공사진 © 국토교통부 공간정보 오픈플랫폼(VWorld)".

## 1. Dev-server tile proxy — `web/vite.config.js`
Add a plugin next to the `/api/consult` one (`vite.config.js:216-235`). It handles `GET /api/aerial/{z}/{y}/{x}.jpeg`.
- **Validation:** `z`, `y` and `x` are integers, and `z` is between 6 and 19. Otherwise return 400.
- **No key:** when `process.env.VWORLD_KEY` is missing, return 503 with JSON `{ "missing": "VWORLD_KEY" }`.
- **Fetch:** otherwise, `fetch(\`https://api.vworld.kr/req/wmts/1.0.0/${key}/Satellite/${z}/${y}/${x}.jpeg\`)` with a 6 s timeout.
- **Response:** stream the bytes back with `Content-Type: image/jpeg` and `Cache-Control: no-store`.
- **Errors:** on an upstream error, return 502 with `{ "error": "upstream" }`. Never echo the upstream URL or the key.
- **Status:** `GET /api/aerial/status` returns `{ "hasKey": boolean }`.
- Put the pure parts in `web/src/aerial/proxy.js`: `parseAerialPath(url)` → `{ z, y, x }` or null, and `upstreamUrl(key, z, y, x)`. The plugin uses them.

## 2. Tile maths and ground texture — `web/src/aerial/tiles.js` (pure) + `web/src/aerial/drape.js` (three.js)
- **Pure maths:**
  - `lonLatToTile(lon, lat, z)` → fractional `{ x, y }` (Web Mercator).
  - `tilesForBBox([w, s, e, n], z)` → the integer tile range.
  - `uvForLonLat(lon, lat, range, z)` → `[u, v]` in 0..1 over the stitched mosaic.
  - `pickZoom(bboxWidthM)`: z18 when the area is ≤ 1.5 km wide, z17 up to 4 km, else z16. Cap the mosaic at 4096 px per side.
- **`drapeAerial({ THREE, renderer, scene, area, origin, terrainMesh, buildingMeshes, look })`:**
  1. Fetch `/api/aerial/status`. When `hasKey` is false, return `{ ok: false }` and change nothing. The painted ground stays as it is.
  2. Fetch the tiles with a concurrency of 6 and draw them into one canvas.
     - Missing tiles are drawn as the painted ground colour.
     - Build a `CanvasTexture` with `colorSpace = SRGBColorSpace`, mipmaps on, and `anisotropy = renderer.capabilities.getMaxAnisotropy()`.
  3. **Ground.** Give the terrain mesh UVs from each vertex's lon/lat, via the inverse of the scene's `origin` projection (the same one used to place buildings). Set the texture as its `map`.
     - Hide the land-mask colours. The photo replaces them.
     - Keep the road ribbons, at 35 % opacity, so the roads still read under the route line.
  4. **Roofs.** For building top faces only (normal.y > 0.9), set planar UVs from the face's lon/lat and use the same texture. Walls keep their facades.
     - If the building geometry is merged so tops cannot be told apart, add one extra mesh of roof polygons (footprint at roof height + 0.05 m) with the photo, instead of editing the walls.
  5. Return `{ ok: true, tiles: n, zoom }`.
- **Painted style.** When `STYLE === "painted"`, apply the photo through the same grade. Lower saturation by 10 % so it sits with the painted buildings.
- **Credit line.** Show it in the sim legend and on the tour page footer.

## 3. Wire-up — `web/src/main.js`
After the terrain and buildings are built, call `drapeAerial(...)`.
- `?ground=paint` forces the old look.
- The default is aerial when the key exists.
- Log `[aerial] ok n tiles z…` or `[aerial] off (no key)`. Never log the URL.

## Tests — `web/tests/aerial-20d.test.js` (no network)
- `parseAerialPath`:
  - "/api/aerial/17/50510/111797.jpeg" → `{ z: 17, y: 50510, x: 111797 }`;
  - "/api/aerial/25/1/1.jpeg" → null;
  - "/api/aerial/../x" → null.
- `lonLatToTile(127.1115, 37.3947, 17)`: `x` is in the range of the standard formula (compute it in the test), and the round trip of the tile centre stays within 1e-6.
- `uvForLonLat` maps the bbox corners to (0, 0) / (1, 1) within one tile's margin.
- `pickZoom(1200) === 18` and `pickZoom(3000) === 17`.
- **Key safety:**
  - no file under `web/src/` contains "api.vworld.kr" except `web/src/aerial/proxy.js`;
  - `proxy.js` is never imported by any module under `web/src/` that the client bundle reaches (assert `main.js`, `ui/*.jsx` and `aerial/drape.js` do not import it);
  - `upstreamUrl("K", 1, 2, 3)` puts `K` only in the path.

Run:
```
cd web && node --test tests/aerial-20d.test.js 2>&1 | tail -10 && npx vite build 2>&1 | tail -2
```

Commit `20d: VWorld aerial photo on ground and roofs via a no-store dev proxy, credit shown, painted fallback without a key`. Then stop.
