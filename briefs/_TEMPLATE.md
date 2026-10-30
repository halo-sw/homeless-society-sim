# Stage NN — <one part> (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Stop when this part is done.

## Change
1. `web/src/<file>.js:<from>-<to>` — <what is wrong, one line>. Change to: <exact behaviour>.
   ```js
   // current code, pasted by the orchestrator with line numbers
   ```
2. …

## Test
- Add / update `web/tests/<file>.test.js`: <case> → <expected>.
- Run only: `node --test web/tests/<file>.test.js 2>&1 | tail -15`.
- If it still fails after 2 fix attempts, stop and print the last lines of the failure.

## Do not touch
<files another run is editing>

## Final message
Changed files, one line each. Nothing else (the orchestrator runs the suite, commits and writes the result note).
