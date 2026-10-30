# Stage 27j2 — Count replies with a ref, not the lagging stateRef (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section). Branch `chat-27`. First edit within 2 tool calls. Small run: edit, run the two files, stop.

27j's "rules path always answers" check in `send` (`grep -n "27j: the rules path always answers" web/src/ui/chat.jsx`) reads `stateRef.current.messages`, but `stateRef.current` is only reassigned on render (`grep -n "stateRef.current = {" web/src/ui/chat.jsx`) while `pushMsg` (`grep -n "const pushMsg"`) only calls `setMessages`. A synchronous rules branch (e.g. `공공임대` → `pushMsg(NO_KEY_NOTICE)` with no await) therefore looks unanswered, and the fallback line is added under a real answer.

Fix:
- Add `const replyCountRef = useRef(0);` next to the other refs. In `pushMsg`, when `msg.role !== "user"`, increment `replyCountRef.current`.
- In `send`, replace `const before = stateRef.current.messages.length;` with `const repliesBefore = replyCountRef.current;` (taken after the user message is pushed), and the answered loop with `const answered = replyCountRef.current > repliesBefore;`.
- Export a pure `answeredSince(countNow, countBefore)` → `countNow > countBefore` and use it there (for the test).

Test — append to `web/tests/muse-recovers-27j.test.js`: `answeredSince(3, 2) === true`, `answeredSince(2, 2) === false`; source check that `send` no longer reads `stateRef.current.messages.length` for this and `pushMsg` increments `replyCountRef`.

Run only:
```
cd web && node --test tests/muse-recovers-27j.test.js tests/chat-muse-27b2.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -8
```
