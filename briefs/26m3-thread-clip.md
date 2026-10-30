# Stage 26m3 — drop the redundant thread selector from the phone rule (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
`tests/chat-scroll-13e2.test.js:54` (`thread clips`) reads the **last** `.ui-chat-thread {` rule in `src/ui/ui.css`. That is now the 26m phone rule `.ui-chat, .ui-chat-main, .ui-chat-thread { overflow-x: hidden; }`.
- The base `.ui-chat-thread` rule already has `overflow: hidden`, which clips both axes on every width.
- So naming it again on phones does nothing.

## Change
In that phone rule, remove `.ui-chat-thread` from the selector list: `.ui-chat, .ui-chat-main { overflow-x: hidden; }`. Nothing else.

Run only:
```
cd web && node --test tests/chat-scroll-13e2.test.js tests/mobile-26m.test.js tests/compare-tabs.test.js 2>&1 | tail -8
```

## Final message
Changed files, one line each, and the pass/fail counts. Nothing else.
