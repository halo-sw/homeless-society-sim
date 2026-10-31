# Stage 32c3 — the Docker build fails on the street import in `vite.config.js` (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (CI, PR #5, job "Docker compose smoke")
```
vite.config.js:11:36: ERROR: Could not resolve "../relay/street.js"
failed to load config from /app/web/vite.config.js
```
- The `web-build` stage in `Dockerfile` copies only `web/` and `scenarios/`, never `relay/`. The static import `import { createStreetHandler } from "../relay/street.js";` (line 11) makes `vite build` fail to load the config.
- The street route is dev-only (`streetApiPlugin`, `configureServer`). A production build never needs it.

## Change (`web/vite.config.js` only)
- Drop the top-level import.
- Inside `streetApiPlugin().configureServer`, load it lazily: `const { createStreetHandler } = await import("../relay/street.js");` (make `configureServer` async, or create the handler on the first request), so `vite build` never resolves `relay/`.
- Behaviour in dev stays the same: token from `process.env.MAPILLARY_TOKEN` only, same responses.
- Do not touch `Dockerfile`, `relay/**` or anything else.

## Test — extend `web/tests/street-32c.test.js` (new `describe("32c3 …")`)
- **Source:** `vite.config.js` has no top-level `import … from "../relay/` (a regex on lines starting with `import`), and it still references `../relay/street.js` through a dynamic `import(`.
- **Keep green:** `tests/street-32c.test.js` and every test that reads `vite.config.js`.

Run only (**run it before you finish**):
```
cd web && node --test tests/street-32c.test.js $(grep -l "vite.config" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Final message
Changed files, one line each. Updated test files. Nothing else.
