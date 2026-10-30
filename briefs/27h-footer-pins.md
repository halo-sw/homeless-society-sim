# Stage 27h — Update three pins for the chat-first card footer (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section). Branch `chat-27`. First edit within 2 tool calls. Small run: edit, run the three files, stop. Tests only; do not change `web/src`.

27f changed the candidate card footer (`web/src/ui/chat.jsx`, `grep -n "말해 보세요" web/src/ui/chat.jsx`) to the chat-first lines (`docs/product.md`):
- under 2 picks: `마음에 드는 집을 2곳 담고 "살아 봐 줘"라고 말해 보세요`
- 2+ picks: `"두 집에서 살아 봐 줘"라고 말하면 30일을 살아 봐요`

The rule these pins guard stays: **the list itself has no run button** (the one run button is the picks tray). Only the "points at the tray" wording changed. Update:

1. `web/tests/chat-layout-19a.test.js:67-79` — rename to `(d) candidates list: no run button, footer says what to say`. Assert the label `RUN_BUTTON_LABEL` does **not** appear in the html (count 0) and the html contains `살아 봐 줘`. Drop the `‘…’` and `지도 아래` asserts.
2. `web/tests/flow-18.test.js:67-84` — rename to `chat card has no run button; the wrapper renders the one run button`. In the chat card: `RUN_BUTTON_LABEL` count 0 and contains `살아 봐 줘`. Keep the drawer asserts below unchanged.
3. `web/tests/landing-chat-12b.test.js:133-150` — rename to `no run button in the list; the footer says what to say`. With no picks: no `RUN_BUTTON_LABEL`, contains `마음에 드는 집을 2곳 담고`. With 2 picks: `RUN_BUTTON_LABEL` count 0, contains `두 집에서 살아 봐 줘`. Update the comments to match.

Run only:
```
cd web && node --test tests/chat-layout-19a.test.js tests/flow-18.test.js tests/landing-chat-12b.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -8
```
Expected: all pass.
