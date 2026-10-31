# Stage 26y3 — English note: no Korean for US places (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Live English Meta HQ run after 26y2: Muse now finds the 6 Menlo Park homes. Its replies add Korean transliterations to US names:
- "Meta HQ (메타 본사)";
- "Saved 10 Coleman Place (콜먼 플레이스) and Apartments on South Perimeter Road (사우스 페리미터 로드)".

**Cause:** `ENGLISH_NOTE` in `src/consult/agent.js` (~line 18) says "Write place and station names romanized with the Korean once in parentheses". That rule applies to every place, including US ones.

## Change — `src/consult/agent.js` `ENGLISH_NOTE` only
1. Limit the parentheses rule to Korean places: "Korean place and station names: romanized, with the Korean once in parentheses, e.g. Gangnam Stn (강남역)."
2. Add: "US places, streets and Meta HQ are already English: write them as they are, never with Korean."
3. Money: keep the won rule for Korean homes, and add "US rents in dollars as given, e.g. $4,261/mo."
4. Every other sentence stays word for word.

## Test — extend `web/tests/agent-menlo-26y2.test.js`
- `ENGLISH_NOTE`: export it if it is not exported, or read `agent.js` as text.
  - It contains "never with Korean" (or your exact wording for item 2, asserted literally).
  - It still contains `(강남역)` and `$4,261/mo`.
- Keep green: every `tests/agent*`, `tests/english*`, `tests/consult*` file.

Run only:
```
cd web && node --test $(ls tests | grep -E '^(agent|english|consult)' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
Anything except `src/consult/agent.js` and that test file.

## Final message
Changed files, one line each. Nothing else.
