# Stage 29a4b — Two leftovers from 29a4 (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 2 tool calls. Stop when the named tests pass.

## Why
The orchestrator's full suite after 29a4 has five new failures:
- `chatfirst-26t`, `compare-tabs`, `mobile-26m`, `phone-26p` ("still truncates nothing, anywhere" / "no ellipsis truncation in ui.css"): the new 29a4 rule in `web/src/ui/ui.css` (`grep -n "29a4: source chips" web/src/ui/ui.css`) writes `text-overflow: clip;`. These contract tests forbid any `text-overflow` in `ui.css`.
- `phone-26p` "26p SSR labels" pins the old source line `extra={workOpen && !phone ? narrowTabs : null}`; 29a4 moved the decision into `tabsMount` (`grep -n "tabsMount" web/src/ui/chat.jsx`).

## Change
1. `web/src/ui/ui.css`, the 29a4 cite block: delete `text-overflow: clip;` (keep `white-space: normal; overflow: visible;`). No other `text-overflow` anywhere in the file.
2. `web/tests/phone-26p.test.js:93-94`: replace that one pin with assertions on the new source: the `tabsMount` expression yields `"top"` only when `workOpen && !phone`, `"shell"` only when `workOpen && phone`, and the two mounts read `tabsMount === "top" ? narrowTabs` and `tabsMount === "shell" ? narrowTabs`. Do not change any other assertion in that file.

Run only:
```
cd web && node --test tests/chatfirst-26t.test.js tests/compare-tabs.test.js tests/mobile-26m.test.js tests/phone-26p.test.js tests/global-polish-29a4.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Final message
Changed files, one line each. Nothing else.
