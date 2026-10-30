# Stage 22b — In-app links keep the Pages base path (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17` (HEAD 9cd0223). Small. First edit within 4 tool calls. Commit, then stop.

## Bug
The orchestrator served the 22a static build under `/homeless-society-sim/` locally, exactly as Pages will. The landing page loads. But submitting a sentence navigates to `http://host/?chat=…`: the base is dropped and the visitor lands on a directory listing (a 404 on Pages).

Root-absolute app URLs found:
- `src/chat/urls.js:39`, `:45` and `:62`;
- `src/ui/demotour.js:64` and `:72`;
- `src/ui/topbar.jsx:54-55`;
- `src/ui/chat.jsx:1647` (`"/"`);
- `src/ui/app.jsx:993` (`"/"`).

`location.pathname`-based URLs (`main.js`) already work.

## Fix
- Add `appUrl(query = "")` to `src/paths.js`. It returns `BASE` when the query is empty, else `` `${BASE}?${query}` ``. Add `appUrlWith(base, query)` for tests.
- Use it at every site above and anywhere else a `"/?…"` or a bare `"/"` app link is built: share links, moment links, "3D로 보기", 처음으로, the tour, topbar tabs. Grep `src/` for `` `/? ``, `"/?`, `'/?`, `= "/"` and `href="/`.
- Share and copy-link features must produce the full public URL: `location.origin + appUrl(…)`.

## Tests — `web/tests/pages-22b.test.js`
- `appUrlWith("/homeless-society-sim/", "chat=x")` is `"/homeless-society-sim/?chat=x"`. With an empty query it is `"/homeless-society-sim/"`.
- The `chat/urls.js` builders give base-relative output when the base is injected. If they read `BASE` at import time, export a variant that takes a base.
- A source pin: no file under `web/src/` (excluding tests) contains `` `/? ``, `"/?` or `window.location.href = "/"`.
- Run the old URL tests (`tests/*url*.test.js`, the `demotour` tests, the 19i moment link tests) and update their expected strings only where the base is now in front. With the default base `/`, the strings stay the same, so most should pass unchanged.

Run:
```
cd web && node --test tests/pages-22b.test.js tests/pages-22a.test.js 2>&1 | tail -6 && npm test 2>&1 | grep -E "^# (pass|fail)" && PAGES_BASE=/homeless-society-sim/ VITE_STATIC=1 npx vite build 2>&1 | tail -1
```

Commit `22b: every in-app link keeps the Pages base`. Then stop.
