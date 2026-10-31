# Stage 30b — keyless mode says so (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Setup: the 30a Docker layout run locally (static build with `VITE_STATIC=1 VITE_API_BASE=http://localhost:8787`, and `relay/server.mjs` with **no keys**). English, 1440 × 900, "I work at Meta HQ in Menlo Park, renting alone, up to $5,000 a month".

- `GET /api/model/status` → `{"meta":{"hasServerKey":false},"baseten":{"hasServerKey":false},"recorded":{"hasServerKey":true},"relay":true}`.
- **The header badge still says "Connected · Muse Spark 1.3".**
  - `museStatusLabel(live)` / `museStatusShort(live)` (`src/ui/topbar.jsx` ~30) receive `live` from `LIVE_API` (`src/paths.js:10`), which only means "an API base exists".
  - The server's key status is never consulted.
- The chat still calls `POST /api/consult`, which answers 503 `{"error":"MODEL_API_KEY is not set on the dev server"}`.
  - The catch in `src/ui/chat.jsx` ~1897 then pushes "Muse 답이 늦어서 이번엔 규칙으로 답했어요. 다시 말하면 Muse가 이어받아요".
  - That reason is wrong: Muse was never slow. It is also repeated on every turn.
- The rule flow itself works: 6 Menlo Park homes, with map and cards.

## Change
1. **One status source.** Fetch `GET {API_BASE}/api/model/status` once per page load.
   - Reuse the fetch `model-panel.jsx` already does if it can be lifted, e.g. into `store`.
   - Define `museLive = LIVE_API && status.meta.hasServerKey === true`.
   - While the status is unknown, it is `null`.
2. **Header badge** (`topbar.jsx`):
   - `museLive === true` → today's "연결됨 · Muse Spark 1.3" / short "연결됨";
   - `false` → "규칙 모드" (unchanged string);
   - `null` → "연결 확인 중" (short form the same).
   - Keep both functions pure: they take the tri-state value instead of a boolean, and `true`/`false` behave exactly as today.
3. **Chat**:
   - when `museLive === false`, do not call `/api/consult`; go straight to the rule flow (`structuredFlow`);
   - push this system line **once per session** (not per turn): `"이 서버에는 Muse 키가 없어서 규칙으로 답해요. 숫자는 그대로 엔진이 계산해요"`;
   - if a consult call fails with HTTP 503 and the error text contains `is not set`, treat it the same way: the same one-time line, and set `museLive` to `false` for the session;
   - every other failure keeps today's two lines and the 27j counter.
4. **Strings:** use exactly the Korean strings above. The orchestrator adds the English rows to `src/i18n/en.js`. Do not edit `src/i18n/**`.

## Test — `web/tests/keyless-30b.test.js`
- `museStatusLabel(true|false|null)` → "연결됨 · Muse Spark 1.3" | "규칙 모드" | "연결 확인 중". Same for `museStatusShort`.
- The function or reducer that decides "call consult or not" (export it, e.g. `shouldCallMuse({ museLive })`) returns `false` for `false` and `true` for `true`.
  - For `null`, pick one behaviour and pin it. Calling is fine: a 503 then flips the session.
- The 503 "is not set" classifier (export it, e.g. `isNoKeyError(err)`) returns `true` for `{ httpStatus: 503, message: "MODEL_API_KEY is not set on the dev server" }` and `false` for a timeout / 500.
- The one-time line: simulate two keyless turns through the exported helper; the line is pushed once.
- Keep green: `tests/first-screen-26w.test.js`, `tests/phone-tray-26z2.test.js`, `tests/mobile-26m.test.js`, `tests/phone-26p.test.js`, and every `tests/chat*`, `tests/topbar*`, `tests/model*`, `tests/muse*`, `tests/relay*` file.

Run only:
```
cd web && node --test tests/keyless-30b.test.js tests/first-screen-26w.test.js tests/phone-tray-26z2.test.js tests/mobile-26m.test.js tests/phone-26p.test.js $(ls tests | grep -E '^(chat|topbar|model|muse|relay)' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks it in a real browser with and without keys.

## Do not touch
`src/engine/**`, `src/i18n/**`, `src/consult/**`, `pipeline/**`, `relay/**`, `data/`, `README*`, Docker files.

## Final message
Changed files, one line each. Nothing else.
