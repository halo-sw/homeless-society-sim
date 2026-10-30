# Stage 29a7c — The server finds US homes too (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 2 tool calls. Stop when the named tests pass.

## Why
Live Muse, English, `I work at Meta HQ in Menlo Park. Two of us, rent up to $4,500 a month.` → `0 of 0 matching homes`. The orchestrator ran `find_homes` from `web/src/homes.js` in node on `data/build/homes/us-menlo.json` with the same extracted profile: **50 homes**. The server never sees them: `loadHomes` in `web/src/consult/server.js:~194-200` reads only `homes-index.json`, which has the nine Korean regions and no `us-menlo` (counted by the orchestrator). The browser path loads per-region files through `homes/summary.json` (`web/src/chat/engine.js:59-92`, `loadHomesIndex`), which includes `us-menlo`, so the rules path works and the live path does not.

## Change
`web/src/consult/server.js` `loadHomes`: after reading `homes-index.json`, also read `homes/summary.json` and, for every region in the summary that has no homes in the index (today `us-menlo`), read `homes/<id>.json` and append its `homes`. Use the same `read("data", …)` helper so the relay's HTTP reader (`readText` over `DATA_BASE_URL`, `relay/handler.js`) gets the same files. A missing summary or region file narrows coverage, never throws. Cache as today.

## Test — new `web/tests/server-us-homes-29a7c.test.js`
Build the server's `loadHomes` with a fake `read` that serves: an index with one Korean home, a summary with `{ regions: { gangnam: {}, "us-menlo": {} } }`, and `homes/us-menlo.json` with two US homes → the loaded index has 3 homes, the US ones with `region: "us-menlo"`. With the summary missing → the index alone, no throw. (Find how existing tests construct the consult server with a fake reader: `grep -ln "createConsultHandler\|read(\"data\"" web/tests/*.test.js`; if `loadHomes` is not reachable, export a pure `mergeHomesIndex(index, summary, readRegion)` and test that.)

Run only:
```
cd web && node --test tests/server-us-homes-29a7c.test.js tests/english-live-29a7.test.js tests/relay-23a.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Final message
Changed files, one line each. Nothing else.
