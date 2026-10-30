# Stage 22c — The chat's 30-day run works in a production build (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17` (HEAD 1d7b963). Small. First edit within 3 tool calls. Commit, then stop.

## Bug (found on the GPU in the static Pages build, served under /homeless-society-sim/)
The landing, the chat, the candidates and the map all work. Pressing "이 집들로 30일 살아 보기" shows "실행하지 못했어요".

The orchestrator hooked `window.Worker`. The worker was created from a `data:` URL holding the **raw** `sim-worker.js` source, base64-encoded. Its imports cannot resolve, so the worker fires `error` immediately.

Cause: `src/ui/chat.jsx:1259` does
```
createWorkerRunner(new URL("../sim-worker.js", import.meta.url))
```
and `createWorkerRunner` (`src/chat/engine.js:328-336`) later calls `new Worker(workerUrl, { type: "module" })`. Vite only bundles a worker when the code is literally `new Worker(new URL("…", import.meta.url), { type: "module" })`. Here the `new URL(...)` stands alone, so Vite treats it as a plain asset and inlines the source.

This breaks **every** production build, not just Pages. Dev mode hides it. `main.js:1301` already uses the correct literal form.

## Fix
- Change `createWorkerRunner` to accept a factory, `createWorkerRunner(makeWorker, opts)`, where `makeWorker()` returns a `Worker`.
- In `chat.jsx`, pass:
  ```
  () => new Worker(new URL("../sim-worker.js", import.meta.url), { type: "module" })
  ```
- Keep backward compatibility for tests that inject `runWorker`.
- Grep `src/` for other `new URL("…worker…", import.meta.url)` not inside `new Worker(…)` and fix them the same way.

## Tests — `web/tests/worker-22c.test.js`
- A source pin: `chat.jsx` contains `new Worker(new URL("../sim-worker.js", import.meta.url)`.
- A source pin: no `new URL(` pointing at a worker file appears outside a `new Worker(` call in `src/`.
- `createWorkerRunner` called with a fake factory (a fake Worker class with `postMessage` / `onmessage`) resolves with the posted runs.
- **Build check:** after `npx vite build`, `dist/assets` contains a bundled `sim-worker-*.js`, and no built JS file contains `data:text/javascript;base64` or `data:application/javascript;base64` for the worker. Do this inside the test only when `process.env.CHECK_BUILD === "1"`; otherwise skip it.

Run:
```
cd web && node --test tests/worker-22c.test.js tests/chat*.test.js 2>&1 | tail -6 && PAGES_BASE=/homeless-society-sim/ VITE_STATIC=1 npx vite build 2>&1 | tail -1 && grep -l "base64" dist/assets/*.js | head -3
```

Commit `22c: chat run worker is bundled in production builds (literal new Worker(new URL))`. Then stop.
