# Stage 30a — `docker compose up` and a root `npm test` (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite. Branch `ithaca-17`. Stop when this part is done.

## Why
Reviewers look for a root `package.json`, a `Dockerfile` and a `docker-compose.yml`. Today the JS code lives in `web/` and the relay in `relay/`, and the root has neither file. Goal: from a fresh clone, `docker compose up` runs the same app as the public site. `npm test` at the root runs the JS tests.

## What exists (read these first)
- `.github/workflows/pages.yml` builds the public site:
  1. `npm ci` in `web/`.
  2. `PAGES_BASE=/ithaca/ VITE_STATIC=1 VITE_API_BASE=https://ithaca-relay.vercel.app npx vite build`.
  3. Download the release asset `runtime-data.tgz` (release `data-v1` on `halo-sw/ithaca`) and untar it into `web/dist`.
  4. Copy the committed `scenarios/**/*.json` and `scenarios/transit/seoul-metro-interstation.csv` into `web/dist/scenarios/`.
- `relay/handler.js`: `createRelay({ env })` returns a Node `(req, res)` handler.
  - It serves `/api/consult`, `/api/model/status`, `/api/tiles/...` and `/api/aerial/...`.
  - It reads public data over HTTP from `env.DATA_BASE_URL`, defaulting to `https://halo-sw.github.io/ithaca/`.
  - It reads keys from env: `MODEL_API_KEY`, `VWORLD_KEY`, `HOUSING_API_KEY`, `ALLOWED_ORIGINS`.
  - `relay/api-entry.js` wraps it for Vercel.
- The release asset URL is `https://github.com/halo-sw/ithaca/releases/download/data-v1/runtime-data.tgz` (public, no token).
- The orchestrator writes `.env.example` at the root, listing key names only. Do not create or edit it. Compose should read `.env` only if it exists (`env_file` with `required: false`, or `environment:` entries with `${VAR:-}`).

## Change
1. **`relay/server.mjs`**: a plain `node:http` server around `createRelay({ env: process.env })`.
   - Port from `PORT`, default 8787, listening on `0.0.0.0`.
   - No new dependencies.
   - It never prints env values. Startup prints only which key names are present, as booleans.
2. **`Dockerfile`** (root), multi-stage:
   - **`web-build`** (node:22-slim):
     - copy `web/` and `scenarios/`;
     - `npm ci`;
     - `vite build` with `PAGES_BASE=/`, `VITE_STATIC=1`, and `VITE_API_BASE` from a build arg (default `http://localhost:8787`);
     - download and untar `runtime-data.tgz` into `dist` (curl or node fetch);
     - copy the scenario files exactly as pages.yml does.
   - **`web`** (small final stage): serve `dist` as static files on port 8080, e.g. `nginx:alpine` or `node:22-slim` running a tiny static server file you write (`web/scripts/serve-static.mjs`, no new dependencies).
   - **`relay`**: node:22-slim with `web/node_modules` available if the handler needs them (check its imports). `CMD node relay/server.mjs`, port 8787.
   - Add a `.dockerignore`: `node_modules`, `web/dist`, `relay/dist`, `data/raw`, `data/build`, `.venv`, `.env`, `.git`, `**/__pycache__`.
3. **`docker-compose.yml`** (root): services `web` (8080) and `relay` (8787).
   - The relay gets `ALLOWED_ORIGINS=http://localhost:8080`, plus the keys from `.env` when present.
   - With no `.env`, both services start: the chat runs in rule mode and the map falls back as the public site does.
4. **Root `package.json`**:
   - `"private": true`, `"workspaces": ["web"]`;
   - scripts:
     - `"test": "npm --workspace web test"`;
     - `"test:py": "python -m pytest -q"`;
     - `"dev": "npm --workspace web run dev"`;
     - `"build": "npm --workspace web run build"`;
     - `"relay": "node relay/server.mjs"`.
   - Make sure this does not break CI: `.github/workflows/ci.yml` runs `npm ci` inside `web/` with `cache-dependency-path: web/package-lock.json`.
   - If a root workspace would force a root lockfile and change how `web/` installs, **do not use `workspaces`**. Use plain scripts with `npm --prefix web …` instead, and say which one you chose in the final message.

## Test: `web/tests/docker-30a.test.js` (text checks only, no Docker in the sandbox)
- The root `Dockerfile` has `FROM node:22`, a `vite build`, `runtime-data.tgz`, and `EXPOSE 8080`/`8787` (or the compose ports).
- `docker-compose.yml` has services `web` and `relay`. No literal key value: no line matches `KEY=\S{8,}` other than a `${…}` reference.
- `.dockerignore` lists `data/raw`, `data/build` and `.env`.
- The root `package.json` `test` script reaches `web`'s tests.
- `relay/server.mjs`: start it on port 0 in-process (export a `startRelayServer({ port, env })` so the test can call it). `GET /api/model/status` returns 200 JSON with `meta.hasServerKey === false` when the env is empty. Close it.
- Keep green: `tests/relay*.test.js` and every `tests/*23*` relay test you find.

Run only:
```
cd web && node --test tests/docker-30a.test.js $(ls tests | grep -iE 'relay' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator runs `docker compose build` and `up` outside the sandbox.

## Do not touch
`web/src/**`, `pipeline/**`, `data/`, `README*`, `.env.example`, `.github/**`, `relay/handler.js` (read only).

## Final message
Changed files, one line each, plus "workspaces" or "--prefix" for item 4. Nothing else.
