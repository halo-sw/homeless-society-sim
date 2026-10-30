# Stage 27e1 — two last pins (brief for Muse)

Agent mode, rules in `AGENTS.md`. Branch `chat-27`. Two edits, run one command, stop.

1. `web/src/ui/chat.jsx:2209` — the empty screen's composer placeholder `예: 판교로 출근해요. 전세 2억 이하로 혼자 살 집 찾아 줘` shows a figure before the customer said anything (`web/tests/landing-chat-12b.test.js:173` "empty chat shows no figures" fails on `2억`). Change it to `예: 판교로 출근해요. 전세로 혼자 살 집 찾아 줘`. Keep `EMPTY_FIND_TEXT` (it fills only after a click).
2. `web/tests/ui-render.test.js:383` — `assert.ok(html.includes("출근지를 말하면 후보가 지도에 표시돼요"), "work area");` The work panel now opens only on request (27a). Replace with `assert.ok(!html.includes("출근지를 말하면 후보가 지도에 표시돼요"), "work panel closed until asked");`.

Run only:
```
cd web && node --test tests/landing-chat-12b.test.js tests/ui-render.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head
```
Expected: only `walked-hours B value` (pre-existing demo B data) fails.
