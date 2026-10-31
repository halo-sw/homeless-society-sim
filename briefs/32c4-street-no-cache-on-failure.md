# Stage 32c4 — the street route must not remember upstream failures as "no photo" (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (live relay https://ithaca-relay.vercel.app after deploy, and the public site)
- `GET /api/street?lon=-122.1540136&lat=37.47968` (777 Hamilton Avenue) answered a photo twice. A third call took 20 s, and the local dev route answered `{ photo: null, reason: "none" }` in 4 s for the same point.
- On the public site, the EN Menlo card had no 거리 사진 tab, while the KO card did.
- **Cause** (`relay/street.js` ~255–270): when a box fails (HTTP 500, timeout), `lookup` treats it like "no images". The handler then:
  - stores `{ photo: null, reason: "none" }` in the memory cache for 10 min;
  - sends it with `Cache-Control: private, max-age=600`.

  So one flaky Mapillary answer hides that home's photo for 10 minutes on the server and in the browser.

## Change (`relay/street.js`; the client in `web/src/ui/candidate-card.jsx` only for item 3)
1. **`lookup` tells the two outcomes apart:**
   - every box answered and none had a usable image → `null` (a real "none");
   - any box failed or timed out and no photo was found → a distinct result (e.g. throw, or return `{ failed: true }`).
2. **Handler:**
   - **real none:** `{ photo: null, reason: "none" }`, cached as today (memory 10 min + `Cache-Control: private, max-age=600`);
   - **failure:** `{ photo: null, reason: "unavailable" }` with `Cache-Control: no-store`, and **not** put in the memory cache;
   - **a photo:** as today.
3. **Client `streetPhotoFor`:**
   - on `reason: "unavailable"` (or a network error), do not memoise the `null` for the page session;
   - retry once after ~3 s;
   - then give up for this candidate on this page, so the thumbnail falls through to the silhouette as today.

   The 6 s skeleton limit stays; the retry must not hold the skeleton longer (if the retry later finds a photo, swapping it in is fine, or skip; keep it simple).
4. Nothing else changes: the token handling, the rate limit, the pick rules.

## Test — extend `web/tests/street-32c.test.js` (new `describe("32c4 …")`)
- **Relay with a mocked `fetchImpl`:**
  - both boxes answer HTTP 500 → `reason: "unavailable"`, header `Cache-Control: no-store`, and a second request calls `fetchImpl` again (no cache);
  - both boxes answer `{ data: [] }` → `reason: "none"`, cached (the second request makes no fetch);
  - small box 500 + big box `{ data: [] }` → `unavailable` (not cached).
- **Client:** a mocked fetch answering `unavailable` then a photo → `streetPhotoFor` is not stuck on `null` (a later call or the retry gets the photo).
- **Keep green:** `tests/street-32c.test.js`, `tests/card-thumbs-32b.test.js`.

Run only (**run it before you finish**):
```
cd web && node --test tests/street-32c.test.js tests/card-thumbs-32b.test.js $(grep -lE "relay|StreetThumb" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`chat.jsx`, the map, `landing-page.jsx`, `src/engine/**`, `src/consult/**`, `src/i18n/**`, `pipeline/**`, `data/`, `README*`, `.env*`, `Dockerfile`, `vite.config.js`.

## Final message
Changed files, one line each. Updated test files. Nothing else.
