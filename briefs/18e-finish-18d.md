# Stage 18e — Finish 18d items 7–8 (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`.

The 18d run ran out of steps. Items 1–6 are committed (`cd1d991` … `5046017`). Items 7 (share card wording) and 8 (compare table layout) are **half done, uncommitted** in the working tree:
- changed files: `web/src/ui/app.jsx`, `chat.jsx`, `share.js`, `share.jsx`, `web/tests/share.test.js`
- 1 test fails: `share-load.test.js` "share rows with the demo fixtures (stage 11b)"

Steps:
1. Read `briefs/18d-walkthrough-fixes.md` items 7–8, then `git diff`. Finish both items from the current working tree; do not start over.
2. Make every test green. If the failing pin expects old internal wording that item 7 removes, update the pin and note it.
3. Commit `18d: share card in plain words + compare rows A|B with the plain line below`.
4. Append the "18d" section to `briefs/18-RESULT.md` covering items 1–8 (read `git log 2edeb0a..HEAD`). Run `cd web && npm test 2>&1 | tail -6` and `npx vite build 2>&1 | tail -2`. Commit.

First edit within 4 tool calls.
