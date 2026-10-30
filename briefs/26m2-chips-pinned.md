# Stage 26m2 — keep the chips row pinned in the phone rule (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
After 26m, `tests/chat-scroll-13e2.test.js` fails: "message list scrolls, composer/chips/banner stay pinned" → `chips pinned`.
- The test reads the **last** `.ui-chat-chips {` rule in `src/ui/ui.css`. That is now the phone rule inside `@media (max-width: 480px)` (~line 995).
- The phone rule has no `flex: none`.

## Change
In the 26m phone rule `.ui-chat-chips { … }`, add `flex: none;` (the chips row must not grow or shrink in the column on phones either). Nothing else.

Run only:
```
cd web && node --test tests/chat-scroll-13e2.test.js tests/mobile-26m.test.js tests/compare-tabs.test.js 2>&1 | tail -8
```

## Final message
Changed files, one line each. Nothing else.
