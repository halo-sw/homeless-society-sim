# Stage 23a — A small relay so the public site can use Muse chat and map tiles (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `relay-23`. Stop when this part is done.

## Why
The public site (GitHub Pages, `VITE_STATIC=1`) has no server, so Muse chat and the VWorld tiles are off. The user approved a relay: a single Vercel serverless function that keeps the keys in its own env, never in the browser. The orchestrator deploys it and sets the env. You only write the code and tests.

## Hard rules
- Keys (`MODEL_API_KEY`, `VWORLD_KEY`, `HOUSING_API_KEY`) are read from `env` only, server-side. They never appear in a response body, a header, an error message or a log line.
- Tiles are streamed and never stored. Every tile response has `Cache-Control: no-store`.
- The relay reads the public data over HTTP from the Pages site. It has no `data/raw` and no file system data.

## Change

### 1. `web/src/aerial/proxy.js` — shared tile helpers (server-only, keep the header comment)
Keep `parseAerialPath` and `upstreamUrl` working (tests use them). Add:
- `TILE_LAYERS = { Satellite: "jpeg", white: "png", Base: "png" }`.
- `parseTilePath(path)`: accepts `/api/tiles/{layer}/{z}/{y}/{x}.{ext}` where `ext` must equal `TILE_LAYERS[layer]`. Also accepts the old `/api/aerial/{z}/{y}/{x}.jpeg` as layer `Satellite`. Returns `{ layer, ext, z, y, x }` or null. Integers only, `z` 6–19, `x`/`y` within `0..2^z-1`. Strip the query first.
- `tileCenterLonLat(z, y, x)` → `[lon, lat]` of the tile centre (inverse Web Mercator).
- `TILE_BOUNDS = [126.6, 37.2, 127.4, 37.75]` (w, s, e, n). `tileInBounds(z, y, x)` is true when the tile centre is inside, or when `z < 11` (a low-zoom tile is bigger than the box).
- `upstreamTileUrl(key, layer, z, y, x)` → `https://api.vworld.kr/req/wmts/1.0.0/${key}/${layer}/${z}/${y}/${x}.${ext}`.
- `async serveTile({ path, env, fetchImpl, res })`: the one handler both the dev server and the relay use.
  - `path` ending in `/status` (`/api/aerial/status` or `/api/tiles/status`) → 200 JSON `{ "hasKey": Boolean(env.VWORLD_KEY) }`.
  - A bad path → 400 `bad tile`. A tile outside the bounds → 403 `{ "error": "out_of_area" }`. No key → 503 `{ "missing": "VWORLD_KEY" }`.
  - Otherwise fetch upstream with a 6 s abort. On success, 200 with `Content-Type` `image/jpeg` or `image/png` and `Cache-Control: no-store`, then the bytes. On any failure, 502 `{ "error": "upstream" }`, never the URL.
  - `res` is a Node `ServerResponse` (`statusCode`, `setHeader`, `end`).

### 2. `web/vite.config.js:239-298` — the dev middleware uses `serveTile`
Replace the body of `aerialApiPlugin` so that it mounts both `/api/aerial` and `/api/tiles` and calls `serveTile({ path: \`${mount}${req.url || ""}\`, env: process.env, fetchImpl: fetch, res })` for GET (405 otherwise). Keep the comment about key rules. Import `serveTile` from `./src/aerial/proxy.js` (the import line for `parseAerialPath`/`upstreamUrl` can go if unused).

### 3. `web/src/consult/server.js` — data can come over HTTP
`createConsultHandler({ dataDir, scenDir, rawDir = null, fetchImpl = null, readText = null })`.
- New option `readText(root, relPath)` where `root` is `"data"` or `"scen"`, returning the file text. When it is null, the default reads the file system exactly as now: `readFile(join(root === "data" ? dataDir : scenDir, relPath), "utf8")`.
- Route every data/scenario read through it: `loadAreaFs` (lines 39-51: `area.json` and each `$ref` as `${areaId}/${ref}`), `loadAreaMetaFs` (55-61), `loadRegionFs` (63-74), `loadSafetyFs` (76-78), `loadPersonaFs` (80-83), `loadDecisionsFs` (85-94), `loadPayroll` (~105), `loadHomes`, `loadPhotos`, `loadAreasIndex`, `loadStationBoxes`, `loadTransit`, `loadAssumption` (~160-205). Pass `readText` into those helpers instead of `dataDir`/`scenDir`. Use `/`-joined relative paths (`"region/network.json"`), not `join`, for the HTTP case.
- `rawDir` stays file-system only (RTMS and the housing snapshots). With `rawDir` null, nothing changes: RTMS says unavailable, housing uses the live API when `HOUSING_API_KEY` is set.
- Add `export function httpReadText(baseUrl, fetchImpl)`: returns `(root, rel) => fetch(\`${base}${root === "data" ? "data" : "scenarios"}/${rel}\`)` with `base` always ending in `/`. A non-2xx answer throws `Error("not found: " + rel)`.
- `readBody(req)` (lines 21-37): when the platform already parsed the body (`req.body` is a string, a Buffer or a plain object), resolve with that text (`JSON.stringify` for an object) and enforce the same size limit. Otherwise keep the stream code.
- The handler also takes `env = process.env` as an option and uses it where it now reads `process.env` (the key resolution at ~223 and `HOUSING_KEY_ENV` at ~152). Default behaviour is unchanged.

### 4. New `relay/handler.js` (repo root `relay/`, plain ESM JS)
`export function createRelay({ env, fetchImpl = fetch, now = () => Date.now() })` returns `async (req, res)`.
- Path: Vercel rewrites `/api/:path*` to `/api/relay?path=:path*`, so read `path` from the query when present, else use `req.url`'s pathname. Normalise to `/api/<path>`.
- **CORS:** allowed origins come from `env.ALLOWED_ORIGINS` (comma list), default `https://halo-sw.github.io,http://127.0.0.1:48741,http://localhost:5173`.
  - `OPTIONS` → 204 with `Access-Control-Allow-Origin` (the matched origin), `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: content-type, ` + the BYOK header name from `web/src/consult/byok.js` (`BYOK_HEADER`), and `Vary: Origin`.
  - A request with an `Origin` that is not allowed → 403 `{ "ok": false, "error": "origin" }`. A request without `Origin` (a tile `<img>` sends none for same-origin, but cross-origin `<img>` does send a Referer, not Origin) is allowed for GET tiles only, and only when `Referer` starts with an allowed origin or is missing.
- **Routes:**
  - `GET /api/tiles/...`, `GET /api/aerial/...` → `serveTile` from `web/src/aerial/proxy.js` with `env` and `fetchImpl`.
  - `GET /api/model/status` → `{ ok: true, meta: { hasServerKey }, baseten: { hasServerKey: false }, recorded: { hasServerKey: true }, relay: true }`. Booleans only.
  - `POST /api/consult` → `createConsultHandler({ dataDir: null, scenDir: null, rawDir: null, fetchImpl, env, readText: httpReadText(env.DATA_BASE_URL || "https://halo-sw.github.io/homeless-society-sim/", fetchImpl) })`. Create it once per relay, not per request.
    - Without the BYOK header, only `provider` `"meta"` (or missing) is allowed; anything else → 400 `{ ok: false, error: "provider" }`.
  - Anything else → 404.
- **Rate limits (in memory, per instance):**
  - Client key = the first IP in `x-forwarded-for`, else `req.socket?.remoteAddress`, else `"?"`.
  - Consult: 20 per 10 minutes and 100 per day per client, and 600 per day for the whole instance.
  - Tiles: 4000 per hour per client.
  - Over a limit → 429 `{ ok: false, error: "rate_limited", retryAfterSec }` with a `Retry-After` header.
  - Use `now()` so tests can move time.
- Every JSON response sets `Content-Type: application/json` and the CORS origin header when the origin is allowed.

### 5. New `relay/api-entry.js`
```js
import { createRelay } from "./handler.js";
const relay = createRelay({ env: process.env });
export default function handler(req, res) { return relay(req, res); }
```

### 6. New `relay/build.mjs`
Bundle with esbuild into a deployable folder. Load esbuild through `createRequire(new URL("../web/package.json", import.meta.url))("esbuild")`.
- Bundle `relay/api-entry.js` to `relay/dist/api/relay.js`: `bundle: true, platform: "node", format: "esm", target: "node20"`, with a banner that defines `require` via `createRequire(import.meta.url)` for CJS deps.
- Write `relay/dist/package.json` `{ "type": "module", "private": true }`.
- Write `relay/dist/vercel.json`:
  ```json
  { "rewrites": [{ "source": "/api/:path*", "destination": "/api/relay?path=:path*" }],
    "functions": { "api/relay.js": { "maxDuration": 60 } } }
  ```
- Write `relay/dist/index.html` with one line: "Ithaca relay — API only."
- Add `relay/dist/` and `relay/.vercel/` to the root `.gitignore`.

### 7. `relay/README.md` (short)
What it serves, the env names (no values): `MODEL_API_KEY`, `VWORLD_KEY`, `HOUSING_API_KEY`, `ALLOWED_ORIGINS`, `DATA_BASE_URL`. Build with `node relay/build.mjs`, then deploy `relay/dist`. Include the limits.

## Test — `web/tests/relay-23a.test.js` (no network; fake fetch, fake req/res)
- `parseTilePath`:
  - `/api/tiles/white/16/25392/55894.png` → layer `white`;
  - `/api/tiles/white/16/1/1.jpeg` → null (wrong ext);
  - `/api/tiles/Evil/16/1/1.png` → null;
  - `/api/aerial/17/50510/111797.jpeg` → layer `Satellite`;
  - z 20 → null.
- `tileInBounds`: a Gangnam tile (`lonLatToTile(127.0276, 37.4979, 16)` floored) is true; a Busan tile (129.07, 35.18) is false.
- `serveTile` with a fake fetch:
  - 200, `image/png`, `no-store`;
  - the fake fetch saw the key in its URL, and no response header or body contains the key;
  - upstream failure → 502 whose body does not contain the key;
  - no key → 503.
- `createRelay`:
  - `OPTIONS` from `https://halo-sw.github.io` → 204 with allow-origin;
  - `POST /api/consult` from `https://evil.example` → 403;
  - `GET /api/model/status` → booleans only, no key text in the body;
  - 21 consult calls in 10 min from one IP → the 21st is 429 with `Retry-After`. Use a consult handler stub: export a `consultFactory` option on `createRelay` for tests.
  - `provider: "baseten"` without the BYOK header → 400.
- `httpReadText("https://x.test/base", fake)("data", "homes-index.json")` requests `https://x.test/base/data/homes-index.json`. `("scen", "personas/a.json")` requests `…/base/scenarios/personas/a.json`.
- `readBody` with `{ body: { a: 1 } }` resolves `'{"a":1}'`.
- Keep `web/tests/aerial-20d.test.js` green. Its key-safety checks scan `web/src/` for "api.vworld.kr" outside `proxy.js`. `relay/` is outside `web/src`, so it is fine. Add one assertion that no file under `web/src/ui/` and not `web/src/main.js` imports `proxy.js`.

Run only:
```
cd web && node --test tests/relay-23a.test.js tests/aerial-20d.test.js tests/consult*.test.js 2>&1 | tail -15
```
If a test still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`web/src/paths.js`, `web/src/ui/*`, `web/src/aerial/drape.js`, `web/src/main.js`, `.github/workflows/*`. Another run edits them.

## Final message
Changed files, one line each. Nothing else.
