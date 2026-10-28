# Stage 8c — follow mode crashes: `bboxToXY is not a function or its return value is not iterable` (brief for Muse)

Agent mode, rules in `AGENTS.md`. Tiny fix stage on branch `fix-8c` (a parallel stage 9a is editing `main` — keep the diff minimal and local). Sandbox: no network, no keys.

Found by the orchestrator on the real GPU (Chromium ANGLE Metal) at 7a90a4d (after 8b): every follow-mode sim URL (`/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1`, `t=08:50`, `t=09:02`, `/?mode=sim&home=A&day=1&t=19:18&follow=1`, `&tab=criteria`) throws on load:

    bboxToXY is not a function or its return value is not iterable

`web/src/frame.js` `bboxToXY` returns an object `{minX, minY, maxX, maxY}`, but stage-8 code in `web/src/main.js` (≈ lines 1565 and 1693, `areaForStation` and one more) destructures it as an array `const [x0, y0, x1, y1] = bboxToXY(...)`. Free camera, compare tab and intro load fine.

1. Fix both call sites to use the object fields. Audit `web/src` for any other array-destructuring of object-returning helpers (`bboxToXY`, and others in `frame.js`).
2. The 8b smoke test (`web/tests/sim-smoke.test.js`) did not reach this path. Make it cover it: extract the station-area lookup (and the other function) into a pure module the smoke test calls with the real `data/build` areas, and assert 잠실역 → songpa-jamsil (or songpa), 판교역 → pangyo.
3. Run the full test suite.

Output: append an "8c" section to `briefs/08-RESULT.md` (cause, fix, test output). Do not touch anything else.
