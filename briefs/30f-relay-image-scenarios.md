# Stage 30f — the relay image includes `scenarios/` (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by CI
PR #1, job "Docker compose smoke": the `relay` container exits at startup.

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/srv/scenarios/criteria/kr-default.json' imported from /srv/web/src/engine/criteria.js
```

The `relay` stage of the root `Dockerfile` copies only `relay/` and `web/src/`, but `web/src/**` imports JSON from `scenarios/` (for example `engine/criteria.js` imports `../../../scenarios/criteria/kr-default.json`).

The orchestrator checked the fix by hand: a folder with `relay/`, `web/src/` and `scenarios/` (no `node_modules`) runs `node relay/server.mjs` and answers `/api/model/status`.

## Change
1. `Dockerfile` `relay` stage: add `COPY scenarios/ ./scenarios/`.
2. Find every other relative import from `web/src/**` or `relay/**` that leaves those two folders, e.g. `grep -rn "from \"\.\./\.\./\.\./" web/src relay` and JSON `with { type: "json" }` imports. Copy whatever else the relay needs, and nothing more.
3. If any of those imports is a bare package specifier that the relay path reaches (not only `node:` builtins), copy `web/package.json` + `web/package-lock.json` and run `npm ci --omit=dev` in the relay stage. Otherwise leave it without `node_modules`.

## Test: extend `web/tests/docker-30a.test.js`
- The `relay` stage copies `scenarios/`.
- **Image-layout test:** copy `relay/`, `web/src/` and `scenarios/` into a temp dir (`fs.cpSync`), then from that dir dynamic-import `relay/server.mjs`. Call `startRelayServer({ port: 0, env: { ALLOWED_ORIGINS: "http://x" } })` and `GET /api/model/status` with `Origin: http://x` → 200 and `meta.hasServerKey === false`. Close it.
  - If binding is blocked in the sandbox, use `createRelayServer` and `server.emit("request", …)` the way the existing test does.
  - This test must fail without the `scenarios/` copy, and pass with it.

Run only:
```
cd web && node --test tests/docker-30a.test.js 2>&1 | tail -10
```

## Do not touch
Everything except `Dockerfile` and `web/tests/docker-30a.test.js`.

## Final message
Changed files, one line each. Nothing else.
