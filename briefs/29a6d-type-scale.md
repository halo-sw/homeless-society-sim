# Stage 29a6d — Replay bar uses the type scale (brief for Muse)

Agent mode, rules in `AGENTS.md`. Branch `chat-27`. No sub-agents, no git, no full suite. First edit within 2 tool calls. Stop when the named tests pass.

## Why
`tests/tokens-28c.test.js` "no font-size 13px" fails: the 29a6c rule `.ds-replay-bar > :first-child` in `web/src/ui/ui.css` sets `font-size: 13px` (the orchestrator's 29a6c brief wrongly said 13 px). The scale has `--ds-t-12` and `--ds-t-14` only.

## Change
In that rule use `font-size: var(--ds-t-12)`. Grep `web/src/ui/ui.css` for any other `13px` added by 29a6c and use `--ds-t-12` there too. Nothing else.

Run only:
```
cd web && node --test tests/tokens-28c.test.js tests/replay-polish-29a6c.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -8
```

## Final message
Changed files, one line each. Nothing else.
