# Stage 23b — The public site talks to the relay (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `relay-23`. Stop when this part is done.

## Why
The relay from 23a is live at `https://ithaca-relay.vercel.app`, deployed by the orchestrator in the Seoul region. It serves `/api/consult`, `/api/model/status`, `/api/tiles/...`, `/api/aerial/...` and the two `status` routes. From the US region, VWorld answered 502 for every tile, so the function must run in `icn1`.

The browser still turns these features off on the public site because it checks `STATIC_SITE`. In this part, the browser uses the relay whenever `VITE_API_BASE` is set. `/api/judge` stays off on the public site: the relay does not serve it, and recorded or rule labels stand.

## Change
1. **`web/src/paths.js`**: add after `STATIC_SITE`:
   ```js
   // 23b: the relay origin for /api/* on the public site ("" = same origin).
   export const API_BASE = String((typeof import.meta !== "undefined" && import.meta.env
     && import.meta.env.VITE_API_BASE) || "").replace(/\/+$/, "");
   // Live /api routes exist on the dev server, or through the relay.
   export const LIVE_API = !STATIC_SITE || API_BASE !== "";
   export function apiUrlWith(base, p) { return `${base || ""}/${String(p || "").replace(/^\/+/, "")}`; }
   export function apiUrl(p) { return apiUrlWith(API_BASE, p); }
   ```
2. **`web/src/ui/consult-client.js:12-46`**:
   - import `LIVE_API, apiUrl`;
   - lines 15 and 42 check `!LIVE_API` instead of `STATIC_SITE`;
   - `fetch(apiUrl("/api/consult"), …)` and `fetch(apiUrl("/api/model/status"))`;
   - update the header comment (lines 1-10): on the public site the calls go to the relay, which keeps the keys;
   - the BYOK comment at line 17 says "to our proxy (dev server or relay) only";
   - on HTTP 429, throw an `Error` whose message is "잠시 쉬었다가 다시 물어봐 주세요 (요청이 많아요)". Set `err.httpStatus = 429`.
3. **`web/src/aerial/drape.js:12,63,67,105`**:
   - import `LIVE_API, apiUrl`;
   - `if (!LIVE_API) return { ok: false, reason: "static" };`;
   - `fetch(apiUrl("/api/aerial/status"))` and ``fetch(apiUrl(`/api/aerial/${zoom}/${ty}/${tx}.jpeg`))``;
   - update the 22a comment.
4. **`web/src/main.js:16,440`**:
   - import `LIVE_API`;
   - line 440 becomes `if (LIVE_API && PARAMS.get("ground") !== "paint") {`;
   - update the comment at 437-439 ("via the dev-server proxy or the relay").
   - Lines 1414 and 2398 stay on `STATIC_SITE`, because judging stays recorded or rule on the public site.
5. **`web/src/ui/chat.jsx:88,1349`**:
   - import `LIVE_API`;
   - line 1349 `if (!LIVE_API) {`.
   - `STATIC_OFF_LINE` (line 765) stays for builds without a relay.
6. **`web/src/basemap.js:14-22`**:
   - `basemapApiBase()` uses `API_BASE`/`LIVE_API` from `paths.js`: return `API_BASE` when `LIVE_API`, else `null`;
   - keep the node-test behaviour, where no `import.meta.env` gives `""`;
   - update its comment.
7. **`.github/workflows/pages.yml`**:
   - the build line passes `VITE_API_BASE=https://ithaca-relay.vercel.app` along with `PAGES_BASE` and `VITE_STATIC=1`;
   - update the header comment: model chat, aerial ground and map tiles go through the relay (keys live only in the relay's Vercel env), and `/api/judge` stays off.
8. **`relay/build.mjs`**:
   - add `regions: ["icn1"]` to the written `vercel.json`, with a comment: "VWorld refuses requests from outside Korea, so the function runs in Seoul";
   - in `relay/README.md`, document the region and that the relay is deployed by the orchestrator with `vercel deploy --prod` from `relay/dist`.
9. **`web/src/ui/model-panel.jsx`**: when `fetchModelStatus()` returns `relay: true`, show one line, "공개 사이트: 중계 서버가 키를 대신 들고 있어요 (브라우저엔 키가 없어요)". Find where the status is rendered: the file is 102 lines, so read it.

## Test — `web/tests/relay-client-23b.test.js`
- `apiUrlWith("https://r.example", "/api/consult")` → `https://r.example/api/consult`; `apiUrlWith("", "api/x")` → `/api/x`.
- Source pins:
  - `consult-client.js`, `drape.js` and `chat.jsx` no longer gate on `STATIC_SITE`: they use `LIVE_API`;
  - no `fetch("/api/` literal is left in `consult-client.js` or `drape.js`;
  - `main.js` still has `if (STATIC_SITE) return;` before `/api/judge`.
- `pages.yml` contains `VITE_API_BASE=https://ithaca-relay.vercel.app`.
- `relay/build.mjs` contains `icn1`.
- Key safety: the relay URL is public, but no file under `web/src` contains `api.vworld.kr` except `aerial/proxy.js`. That check already exists in `aerial-20d.test.js`; keep it green.
- Update older pins that expected `STATIC_SITE` in these exact places (e.g. the 22a pins in `web/tests/pages-22a*.test.js`) and name them in your final message.

Run only:
```
cd web && node --test tests/relay-client-23b.test.js tests/pages-22*.test.js tests/aerial-20d.test.js tests/basemap-25a.test.js 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`web/src/i18n/*`, `web/src/profile.js`, `web/src/consult/agent.js`, `web/src/consult/guards.js`. Another run edits them.

## Final message
Changed files, one line each. Nothing else.
