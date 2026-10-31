# Stage 29c1d — After-dark commute line says "by bike" when it was a bike ride (brief for Muse)

Agent mode, rules in `AGENTS.md`. Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Stop when the named test passes.

## Why
Live English recording (Meta HQ, Menlo Park, 2026-10-31): the `dark_walk` row from `web/src/engine/life-events.js` came back as
`{ a: { count: 37, avgMin: 11, avgM: 2850, from: "Meta HQ (1 Hacker Way)", fromKind: "work" }, … }` and the card said
`Walked home from work after dark: A 37 times · avg 11 min (2.9 km) walking from work …`. 2.9 km in 11 minutes is a bike ride: the engine's bike commute trips carry `trip.mode === "bike"` (`web/src/engine/routines.js:~666-675`, set at `:196`). Walking trips have no `mode`.

## Change — `web/src/engine/life-events.js`, `web/src/i18n/en.js`
- Per side, record `mode`: `"bike"` when most of the counted trips have `trip.mode === "bike"`, else `"walk"`.
- Korean line for a bike side: `A 37번 · 직장에서 자전거로 평균 11분(2.9km)`; when **both** sides are bike, the line label is `해 진 뒤 자전거로 퇴근:` instead of `해 진 뒤 걸어서 퇴근:`; mixed sides keep `해 진 뒤 퇴근:` and each side says its own mode (`걸어서` / `자전거로`).
- English patterns: `Rode home from work after dark: A 37 times · avg 11 min (2.9 km) by bike from work · …`; mixed label `Came home from work after dark:`; the walking side stays as today.

## Test — append to `web/tests/life-events-29c1.test.js`
- Both sides with `mode: "bike"` trips (from `workplace:h1`) → line starts with `해 진 뒤 자전거로 퇴근:` and contains `직장에서 자전거로 평균`; never `걸어서`.
- A walking, B bike → label `해 진 뒤 퇴근:`; A part contains `걸어서`, B part `자전거로`.
- English translation of the both-bike line starts with `Rode home from work after dark:`.

Run only:
```
cd web && node --test tests/life-events-29c1.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -8
```

## Final message
Changed files, one line each. Nothing else.
