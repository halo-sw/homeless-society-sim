# Stage 8b — sim mode crashes on load; add a browser smoke check (brief for Muse)

Agent mode, rules in `AGENTS.md`. Small fix stage after stage 8. Sandbox: no network, no keys.

Found by the orchestrator on the real GPU (Chromium ANGLE Metal) at commit 446ddc5 (end of stage 7), every sim-mode URL (`/?mode=sim&home=A`, `/?mode=sim&home=A&day=1&t=08:28&follow=1`, `&tab=criteria`) stops at "생활 시뮬레이션 불러오는 중… (홈 A)" with the page error:

    Cannot access 'ROLE_KO' before initialization

`web/src/main.js` declares `const ROLE_KO = {…}` (≈ line 1533) inside a scope where it is read before the declaration runs (temporal dead zone). Tour mode is fine. Node tests pass because nothing imports `main.js` in the sim path.

1. Fix the TDZ (move the constant to module scope or a shared module such as the Now-card text builder) and check `main.js` and the stage-7/8 UI code for any other use-before-declaration of the same kind.
2. Add a smoke check that would have caught it: a pure `node --test` that imports the sim entry modules and exercises the sim-load path with the real `data/build` run (skip with a clear message if absent), or a small script `web/scripts/smoke.mjs` that boots the sim state machine headlessly (no WebGL) through load → first frame → follow → day change. Run it in the test suite.
3. Re-verify stage 8 journey and fatigue UI still load in sim mode after the fix.

Output: append a short "8b" section to `briefs/08-RESULT.md` (cause, fix, the new check, test output).
