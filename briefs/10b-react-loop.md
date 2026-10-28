# Stage 10b — the whole UI disappears: React "Maximum update depth exceeded" (brief for Muse)

Agent mode, rules in `AGENTS.md`. Small fix stage. Sandbox: no network, no keys.

Found by the orchestrator on the real GPU (Chromium ANGLE Metal) at 38efcf8 (after 9c): **every** sim URL (`/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1`, `&tab=money`, `&tab=listings&fill=example`, `&tab=money&share=1`, `&tour=demo&step=1`, `&tour=demo&step=9`) renders only the 3D canvas — no React UI at all — with:

    The result of getSnapshot should be cached to avoid an infinite loop
    Maximum update depth exceeded. This can happen when a component repeatedly calls setState …

and on the tour URLs additionally `Received NaN for the \`%s\` attribute … children`.

Likely cause: `web/src/ui/consult.jsx` `AgentNudge` (≈ line 372) passes a getSnapshot that builds a **new object on every call** (`{journey, judgeLog, money, home, on}`) to `useSyncExternalStore`. React requires referentially stable snapshots.

1. Fix it (subscribe to the whole state and derive with `useMemo`, or select primitives separately, or memoise the selector by input identity). Audit every `useSyncExternalStore` / store selector in `web/src/ui/` for the same issue.
2. Find and fix the NaN attribute on the tour (likely a Stepper/ProgressBar value or a `{n}` child computed from an undefined step/total).
3. Add a test that would have caught both: a pure check that every exported selector returns `===` results for two calls on the same state; and a React render smoke test with `react-dom/server` `renderToString` (no DOM needed) of `App` with a realistic store state for sim mode, money tab, listings tab, share open and tour step 1/9 — it must not throw and must not log React errors (capture `console.error`).
4. Then write the missing `briefs/09c-RESULT.md` (stage 9c finished its code but not the report). The orchestrator's regenerated run gives: walk A 1,669.8 min / B 2,282.6; commute walk A 1,117.6 / B 1,452; ride A 2,640 / B 0; fatigue on arrival at work A 25.3 / B 5.7; after coming home A 22.8 / B 5.8; 30-day average A 7.6 / B 1.7; peak boarding congestion A 93.2 % / B none; evening at home A 19,376 / B 20,575 min; errands A 33 / B 17; park visits A 10 / B 26. Add the 08:30 / 08:50 / 09:02 Now-card texts for 구성원 1 in A and B from the run (via the pure text builder), and capture URLs.

Run the full suites (`node --test`, `.venv/bin/pytest`, `vite build`). Output: a short "10b" section appended to `briefs/10-RESULT.md`.
