# Stage 22a — Public site on GitHub Pages (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. First edit within 5 tool calls. Commit, then stop. The orchestrator uploads the data, enables Pages and checks the live site on the GPU.

## Why
The user wants anyone to be able to use Ithaca from a link, and chose **GitHub Pages**. The site will be `https://halo-sw.github.io/homeless-society-sim/`.

Pages is static only, so:
- There are no `/api/*` routes. Model keys and the VWorld key must never reach the browser.
- The base path is `/homeless-society-sim/`, not `/`.
- `data/build` is never committed to git. The orchestrator packs the runtime data into a GitHub Release asset, `runtime-data.tgz`, which unpacks to `data/…` and `scenarios/…`. The Pages workflow downloads it.

## 1. Base-aware URLs
- Add `web/src/paths.js` with `assetUrl(p)`. It returns `${BASE}${p without its leading slash}`.
  - `BASE` is `import.meta.env.BASE_URL` when defined, else `"/"`, so node tests still work.
- Use it for **every** client fetch of `/data/…` and `/scenarios/…`. The call sites are in `src/load.js`, `src/main.js`, `src/sim-worker.js`, `src/chat/engine.js`, `src/ui/chat.jsx`, `src/ui/preview.jsx`, `src/sources.js` and `src/money/housing.js`. Grep for `"/data/`, `` `/data/ ``, `"/scenarios/` and `` `/scenarios/ ``.
  - Paths built without a leading slash (e.g. `` `data/build/region/safety.json` ``, `` `scenarios/transit/…` ``) must map to the same served layout: `data/…` is served at `{BASE}data/…`, mirroring `data/build/…`.
- Workers: the sim worker must get the base. Pass it in the init message, or use `import.meta.env.BASE_URL` inside the worker, since Vite injects it there too.
- Image and asset references in `index.html` and `public/` keep working under the base. Vite rewrites `index.html` when `base` is set.
- `vite.config.js`: `base: process.env.PAGES_BASE || "/"`.

## 2. Static mode
- `const STATIC_SITE = import.meta.env.VITE_STATIC === "1"` (export it from `paths.js`).
- When `STATIC_SITE` is true:
  - **Do not call** `/api/consult`, `/api/model/status`, `/api/judge` or `/api/aerial/*` at all.
  - `consult-client.js` returns "off" immediately. The chat's free-question box shows one quiet line: "공개 사이트에서는 Muse와 대화하기가 꺼져 있어요 (키 보호). 조건 읽기·후보·30일 살아 보기는 그대로 돼요." Keep the rest of the chat working; the rule-based extractor runs in the browser.
  - Judge decisions use the recorded `scenarios/decisions/*.json` when they exist (the demo scenarios), else the rule judge. Label them as today ("기록된 Muse 판단" / "규칙 판단"). Never claim a live model call.
  - `drapeAerial` is not called. The ground stays painted, and the aerial credit is not shown. The OSM credit stays.
- The 혼잡도 data **is** included on the public site. Its credit line stays as it is: "혼잡도: 서울교통공사 지하철혼잡도정보(2026-09-30 기준, 공공누리 3유형)". Also add "출처: 서울교통공사 · 공공누리 제3유형(출처표시·변경금지)" to the legend card's sources and the README data table, if one exists.

## 3. Pages workflow — `.github/workflows/pages.yml`
- Triggers: `workflow_dispatch`, plus `push` to `main`.
- Permissions: `pages: write`, `id-token: write`, `contents: read`.
- Steps:
  1. Checkout, then setup-node 22 and `npm ci` in `web`.
  2. Build: `PAGES_BASE=/homeless-society-sim/ VITE_STATIC=1 npx vite build`.
  3. Download the release asset with `gh release download data-v1 -p runtime-data.tgz` (`GH_TOKEN: ${{ github.token }}`). Extract it into `web/dist/`, which gives `web/dist/data/…` and `web/dist/scenarios/…`.
  4. Copy the committed `scenarios/**/*.json` and `scenarios/transit/seoul-metro-interstation.csv` into `web/dist/scenarios/`. These are in git, so the tarball does not need them.
  5. Add `web/dist/.nojekyll`.
  6. `actions/upload-pages-artifact@v3` with path `web/dist`, then `actions/deploy-pages@v4`.
- If the release asset is missing, fail with a clear message.

## 4. Runtime data list — `web/scripts/runtime-data-list.mjs`
A node script. Given a `data/build` directory, it prints the relative paths the site needs, one per line:
- for every area or box directory: `area.json` and `scene.json`, plus every `$ref` target inside them, recursively within those JSON files;
- all `.json` and `.csv` under `homes/`, `region/` (**including** `congestion.json`), `sim/` and `walkgraph/`;
- top-level `*.json`.

Never list `_cache/`, `personas/`, `*.pbf`, `osm.json`, `graph.json` or `report.json`, unless something in the list references them.

The orchestrator runs it locally to build the tarball. A pure, exported `runtimeDataList(dirReader)` makes it testable.

## Tests — `web/tests/pages-22a.test.js` (no network, no data/)
- `assetUrl("/data/x.json")` is `"/data/x.json"` with the default base. With a base of `/homeless-society-sim/` (inject it through an exported `assetUrlWith(base, p)`), it gives `"/homeless-society-sim/data/x.json"`.
- Source pins:
  - no file under `web/src/` calls `fetch("/data` or `` fetch(`/data `` directly; all go through `assetUrl`;
  - the `/api/` call sites are guarded by `STATIC_SITE`.
- `runtimeDataList` with a fake directory reader:
  - an `area.json` with a `$ref` to `area.buildings.json` lists both;
  - `_cache/a.pbf` and `personas/p.json` are not listed;
  - `region/congestion.json` is listed.
- `pages.yml` contains `deploy-pages`, `PAGES_BASE=/homeless-society-sim/`, `VITE_STATIC=1` and `runtime-data.tgz`.
- `vite.config.js` reads `PAGES_BASE`.

Run:
```
cd web && node --test tests/pages-22a.test.js 2>&1 | tail -8 && npm test 2>&1 | grep -E "^# (pass|fail)" && PAGES_BASE=/homeless-society-sim/ VITE_STATIC=1 npx vite build 2>&1 | tail -2
```

Commit `22a: GitHub Pages — base-aware data URLs, static mode without /api, Pages workflow from a release data asset`. Then stop.
