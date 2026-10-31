# Stage 29a7b — Meta HQ example that finds homes; US sources named right (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 2 tool calls. Stop when the named tests pass.

## Why
Orchestrator's live run of the 29a6 Meta HQ button (`I work at Meta HQ in Menlo Park. Two of us, rent up to $4,000 a month.`): 0 homes. The data is right — `data/build/homes/us-menlo.json` prices are Zillow ZORI typical rents per ZIP: 94025 $4,261 (44 homes), 94301 $4,219 (6), 94063 $4,678 (1), 94303 $5,522 (10). A $4,000 cap matches nothing, so the judge's first click shows an empty list.
Also, the US search result shows `Sources checked: MOLIT Real Transaction Price Disclosure System` — wrong for US homes (the source is Zillow ZORI + OpenStreetMap).

## Change
1. One shared constant for the example sentence, `I work at Meta HQ in Menlo Park. Two of us, rent up to $4,500 a month.` — export it once (e.g. from `web/src/places-us.js` as `META_HQ_EXAMPLE`) and use it in `web/src/ui/landing-page.jsx:18` (`META_HQ_PROMPT`) and `web/src/ui/chat.jsx` (`META_HQ_TEXT`, `grep -n "META_HQ_TEXT" web/src/ui/chat.jsx`). Update `web/tests/english-live-29a7.test.js` `EN_USER` and any 29a6 pin that has the $4,000 sentence.
2. Citations for US results: wherever the find-homes citation list is built (`grep -n "molit\|MOLIT" web/src/consult/tools-search.js web/src/ui/chat.jsx web/src/ui/consult.jsx`), a result whose homes are `country: "US"` cites the Zillow ZORI and OpenStreetMap entries from `web/src/sources.js` (add a `zillow-zori` entry with `short: "Zillow ZORI"` if missing), never MOLIT.

## Test — extend `web/tests/english-live-29a7.test.js`
- `META_HQ_EXAMPLE` contains `$4,500`; landing and chat sources use the constant (no `$4,000 a month` literal left in `web/src/ui`).
- The citation builder for a US home list returns ids including the Zillow entry and not the MOLIT one.

Run only:
```
cd web && node --test tests/english-live-29a7.test.js tests/judge-path-29a6.test.js tests/us-26c.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Final message
Changed files, one line each. Nothing else.
