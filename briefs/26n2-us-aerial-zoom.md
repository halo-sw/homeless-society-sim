# Stage 26n2 — US aerial thumbnails: USGS has no z17/z18 tiles (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
After 26n, the Korean candidate rows show the aerial crop with the pin, as intended. The US rows (Menlo Park) all fall back to "Loading 3D preview…".
- Checked live: `USGSImageryOnly/MapServer/tile/{z}/{y}/{x}` near (-122.1525, 37.4705) returns **200 at z16** and **404 at z17 and z18**.
- So every US tile errors, and `AerialThumb` falls back.

## Change — `src/aerial/thumb.js` (+ the callers in `src/ui/preview.jsx` / `src/ui/candidate-card.jsx` only if the zoom is chosen there)
- Add `aerialThumbZoom(lon, lat)` → `{ z, tilePx }`:
  - US (`isUsLonLat`): `{ z: 16, tilePx: 384 }`. That draws z16 tiles at 1.5× and shows about 120 m across in a 96 px thumb;
  - Korea: `{ z: 18, tilePx: 128 }` (unchanged).
- Use it for both the row thumb and the full-card hero instead of the hard-coded z18/128.
- Add a short comment that USGS imagery tiles stop at z16 in this area (checked 2026-10-31).

## Test — extend `web/tests/aerial-thumb-26n.test.js`
- `aerialThumbZoom(-122.148, 37.484)` → `{ z: 16, tilePx: 384 }`; `aerialThumbZoom(127.0276, 37.4979)` → `{ z: 18, tilePx: 128 }`.
- `aerialThumbTiles` with the US zoom and a 96×96 window still centres the home at (48, 48) ± 0.5, and every tile has z 16.
- `aerialThumbUrl` for a US tile at z16 → `…/USGSImageryOnly/MapServer/tile/16/…`.

Run only:
```
cd web && node --test tests/aerial-thumb-26n.test.js tests/us-26k.test.js tests/us-26i.test.js 2>&1 | tail -10
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
Everything except `src/aerial/thumb.js`, the zoom call sites in `src/ui/preview.jsx` / `src/ui/candidate-card.jsx`, and the test file. Another stage is editing `src/ui/ui.css`, `src/ui/chat.jsx`, `src/ui/topbar.jsx`, `src/ui/intake.jsx` and `src/i18n/translate.js` right now. Do not touch those.

## Final message
Changed files, one line each. Nothing else.
