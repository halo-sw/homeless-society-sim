# Stage 32c — street-level photos from Mapillary through our relay (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Why
The customer chose a street-level photo as the second thumbnail kind, after our 3D miniature. Stage 32b built the slot (`StreetThumb`, `streetPhotoFor(candidate)` resolving to `null`).

Mapillary (Meta's open street-level imagery) has photos near many of our homes. All images are CC BY-SA 4.0, and attribution is required.

The orchestrator checked the live API with the project's client token:
- `GET https://graph.mapillary.com/images?fields=…&bbox=minLon,minLat,maxLon,maxLat&limit=N` with header `Authorization: OAuth <token>`.
- Fields that exist: `id`, `captured_at` (ms), `compass_angle`, `thumb_1024_url`, `thumb_256_url`, `creator` (`{ username, id }`), `computed_geometry` (GeoJSON point), `is_pano`.
- **Coverage:** 강남역 36 images, 성수 34, Menlo Park Hamilton Ave 30 and Meta HQ 23 within ±0.002°, Coleman Place 4 within ±0.0005°. Some spots have none (판교역, 삼전역).
- **Reliability is poor:** a ±0.002° box sometimes answers HTTP 500 after 7–9 s, and a small box can take 23 s.

## Change
### 0. First, a 32b leftover
`tests/*28c*` "one spacing scale" fails on a 32b rule in `ui.css`: `border-radius: 999px; padding: 0 6px; white-space: nowrap;` (the 추정 marker). Use scale tokens: `var(--ds-r-pill)` and `0 var(--ds-s-4)` or `--ds-s-8`, whichever is on the scale. Add `tests/*28c*` to your run.

### 1. Relay endpoint (`relay/handler.js` + the vite dev middleware in `web/vite.config.js`, the same way `/api/aerial` is mounted)
- `GET /api/street?lon=…&lat=…` → `{ photo: { id, thumb_url, captured_year, creator, page_url, lon, lat, compass } | null }`.
- **The token:**
  - read only from `process.env.MAPILLARY_TOKEN`;
  - never logged, never echoed in an error, never sent to the browser;
  - if it is missing, answer `{ photo: null, reason: "off" }` with status 200.
- **Search:**
  - first a ±0.0005° box (≈ 55 m), `limit=20`; if none, one ±0.0015° box, `limit=30`;
  - each upstream call has a 6 s timeout, and the total is capped at 9 s;
  - any upstream error or timeout → `{ photo: null, reason: "none" }`.
- **Pick:**
  - drop panoramas;
  - prefer images whose camera faces the home (|bearing from image to home − `compass_angle`| ≤ 60°);
  - then the newest `captured_at`;
  - then the nearest.
- **Caching:** an in-memory cache per rounded lon/lat (5 decimals) for 10 minutes, at most 500 entries. Nothing is written to disk. Response header `Cache-Control: private, max-age=600`.
- **Rate limit:** the relay's existing bucket helper, e.g. 60 requests / 10 min per client.
- **`page_url`:** `https://www.mapillary.com/app/?pKey={id}`. `thumb_url` = `thumb_1024_url` (the browser loads it directly from Mapillary's CDN; we never proxy or store image bytes).
- **Inputs:** validate lon/lat as finite and inside our two areas' bounds (KR or US bbox), or return 400.

### 2. Client (`web/src/ui/preview.jsx` / wherever 32b put `streetPhotoFor`)
- `streetPhotoFor(candidate)` calls `/api/street` through the same API base the basemap uses (`basemapApiBase()`; `null` → no street photos, e.g. the static site without a relay).
- **Cache:** memoised per candidate for the page session.
- **`StreetThumb`:**
  - shows a skeleton for at most 6 s, then falls through to the silhouette;
  - on success, the photo with `object-fit: cover`;
  - a corner credit: `© {creator} · Mapillary`, with the full credit `{creator} · Mapillary · CC BY-SA 4.0 · {year}` in `title`;
  - the opened card hero shows that full line as a link to `page_url`.
- **Order unchanged:** hero → 3D → street → silhouette → minimap.
- **Load only what's visible:** start the request only when the thumbnail is near the viewport (`IntersectionObserver`; SSR-safe), and at most 3 requests in flight.
- **Sources:** add Mapillary to the list footer credit when a photo shows, and to `web/src/sources.js` (name, license CC BY-SA 4.0, URL https://www.mapillary.com).

### 2b. The list note (`chat.jsx` ~522, this one line only)
- **Today it reads** `사진은 항공사진·3D 미리보기예요(실제 매물 사진 아님) · {aerialCreditFor(…)}`. Since 32b, row thumbnails are never aerial.
- **Build it from the kinds actually shown in the list**:
  - e.g. `사진은 우리 3D 모형·거리 사진·건물 모양이에요(실제 매물 사진 아님)`, listing only the kinds present, in that order;
  - followed by the credits of those kinds: `우리 자료로 만든 모형 (GIS건물통합정보·OSM)` or `(OSM)`, plus `거리 사진: Mapillary (CC BY-SA 4.0)` when a street photo shows.
- Put the builder in `candidate-card.jsx` (export `listPhotoNote(kinds, area)`) and call it from `chat.jsx`. Thumbnails report their resolved kind upward (a callback or a small store); keep it simple.
- Test it in `street-32c.test.js`:
  - `["scene"]` → no `항공`, no `거리 사진`;
  - `["scene","street"]` → has `Mapillary`.

### 3. Never
- Store or log coordinates of a viewer.
- Send anything but the home's lon/lat.
- Put the token in the client bundle (add a test that greps the built-source files for `MAPILLARY_TOKEN`; only `relay/handler.js` and `vite.config.js` may mention it).

New strings: list them (KO) in the final message.

## Test — `web/tests/street-32c.test.js` (and a relay unit test next to the existing relay tests if they live under `relay/` or `tests/`)
- **Relay with a mocked `fetchImpl`:**
  - no token → `{ photo: null, reason: "off" }`, and `fetchImpl` is never called;
  - upstream 500 on the small box and success on the big box → a photo;
  - picks the facing image over a newer non-facing one; drops a pano;
  - a timeout → `null`, within the cap;
  - the token never appears in the response body or headers;
  - bad lon/lat → 400;
  - the cache hit makes no second fetch.
- **Client:** `streetPhotoFor` with `basemapApiBase()` null → `null` without fetching.
- **Source scan:** `MAPILLARY_TOKEN` appears only in `relay/handler.js` and `web/vite.config.js` (and tests).
- **Keep green:** `tests/card-thumbs-32b.test.js` and every test mentioning `relay`, `aerial`, `serveTile`, `sources.js` or `StreetThumb`.

Run only (**run it before you finish**):
```
cd web && node --test tests/street-32c.test.js tests/card-thumbs-32b.test.js $(grep -lE "relay|serveTile|StreetThumb|sources\.js" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If relay tests live elsewhere, run those too and say so. If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`chat.jsx` (except the one list-note line in 2b), the map, `landing-page.jsx`, `src/engine/**`, `src/consult/**`, `src/i18n/**`, `pipeline/**`, `data/`, `README*`, `.env*`.

## Final message
Changed files, one line each. New strings. Updated test files. Nothing else.
