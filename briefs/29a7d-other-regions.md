# Stage 29a7d — Merge `other_regions` too (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 2 tool calls. Stop when the named tests pass.

## Why
The orchestrator's 29a7c brief was wrong about the summary shape. The real `data/build/homes/summary.json` keeps Korean regions under `regions` and the US one under `other_regions`: `{"regions": {bundang…wirye}, "total": …, "other_regions": {"us-menlo": {"homes": 61, "country": "US", "currency": "USD"}}}` (written by `pipeline/homes_us.py:615`). `mergeHomesIndex` (`web/src/consult/server.js:126`) reads only `summary.regions`, so the live server still finds 0 homes for Meta HQ.

## Change
`mergeHomesIndex`: region ids = keys of `summary.regions` **and** `summary.other_regions` (deduped), same skip rule (only regions without homes in the index). Nothing else.

## Test — extend `web/tests/server-us-homes-29a7c.test.js`
The fake summary uses the real shape: `{ regions: { gangnam: {} }, other_regions: { "us-menlo": { homes: 2, country: "US" } } }` → the merged index has the US homes. Keep the existing cases.

Run only:
```
cd web && node --test tests/server-us-homes-29a7c.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Final message
Changed files, one line each. Nothing else.
