# Stage 30d — CI builds and smoke-tests the Docker setup (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Why
Stage 30a added `Dockerfile`, `docker-compose.yml` and `relay/server.mjs`. The orchestrator's machine has no Docker runtime, so the image has never been built.

The same steps were run by hand without Docker, and they work:
- the vite build with `VITE_STATIC=1`, the runtime data and the scenarios, served by `serve-static.mjs` on 8080;
- `relay/server.mjs` with no keys, on 8787;
- the Meta HQ flow in rule mode.

GitHub's `ubuntu-latest` runners have Docker and Compose v2. CI should prove the real image works on every PR.

## Change: `.github/workflows/ci.yml`
Add a third job, `docker`, named "Docker compose smoke", that runs on `ubuntu-latest` alongside `web` and `pipeline`. Do not change the existing two jobs.
1. `actions/checkout@v4`.
2. `docker compose build`, with no `.env`, so keyless.
3. `docker compose up -d`.
4. Wait up to 60 s for both ports, with a curl retry loop.
5. Smoke checks; each failure fails the job:
   - `curl -fsS http://localhost:8080/` returns HTML containing `<div id=` or `<script` (check what `web/index.html` really contains, and assert on that);
   - `curl -fsS http://localhost:8080/data/areas-index.json` parses as JSON;
   - `curl -fsS http://localhost:8080/scenarios/demo-two-homes.json` parses as JSON;
   - `curl -fsS -H "Origin: http://localhost:8080" http://localhost:8787/api/model/status` returns JSON with `.meta.hasServerKey == false`. Use `jq`, which is present on ubuntu-latest, or `node -e`.
6. `docker compose logs` on failure (`if: failure()`), then `docker compose down` (`if: always()`).
7. The runtime-data download in the Dockerfile uses the public release URL with no token. Keep it that way.

The job must not need any secret, and must not print env.

## Test — extend `web/tests/docker-30a.test.js`
Text checks on `ci.yml`:
- it has a job with `docker compose build` and `docker compose up -d`;
- it curls `8080` and `/api/model/status` on `8787`;
- it has `docker compose down` under `if: always()`;
- the existing `web` and `pipeline` jobs are still present, unchanged: assert the `npm ci` / `pytest` lines.

Run only:
```
cd web && node --test tests/docker-30a.test.js 2>&1 | tail -10
```

## Do not touch
Everything except `.github/workflows/ci.yml` and `web/tests/docker-30a.test.js`. If you find a real bug in `Dockerfile` or `docker-compose.yml` while writing this, you may fix it; say so in the final message.

## Final message
Changed files, one line each. Nothing else.
