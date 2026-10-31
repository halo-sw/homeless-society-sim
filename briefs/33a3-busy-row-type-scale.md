# Stage 33a3 — working-card rows on the type scale (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Your 33a / 33a2 work is in the tree, uncommitted. Stop when this part is done.

## Found by the orchestrator (full suite after 33a2)
The 33a brief asked for 13 px working-card rows. That was the orchestrator's mistake: the type scale bans 13 px. Three tests fail on it:
- `tests/landing-hero-31c.test.js` (`ui.css must not contain 13px`);
- `tests/tokens-28c.test.js` (`no font-size 13px`);
- the `31l landing hero order` test that pins the same rule.

The rule is `.ui-busy-row-text { font-size: 13px; … }` in `web/src/ui/ui.css` (33a), and the 33a comment above it says 13px too.

## Change
- `.ui-busy-row-text`: use the scale's supporting size (12 px, or the token other supporting rows in `ui.css` use), still `--ui-ink2`, rows 4 px apart.
- The comment no longer says 13px. No other `13px` anywhere in `ui.css`.
- Update the 33a test pin (`tests/chat-surface-33a.test.js`) to the new size.

Run only (**run it before you finish**):
```
cd web && node --test tests/chat-surface-33a.test.js tests/tile-fallback-33a2.test.js tests/landing-hero-31c.test.js tests/tokens-28c.test.js $(grep -l "31l" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
Everything outside `web/src/ui/ui.css` and `tests/chat-surface-33a.test.js`.

## Final message
Changed files, one line each. Nothing else.
