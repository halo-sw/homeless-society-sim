# Stage 29a6e — The replay bar must not become the chat layout (brief for Muse)

Agent mode, rules in `AGENTS.md`. Branch `chat-27`. No sub-agents, no git, no full suite, no build. First edit within 2 tool calls. Stop when the named tests pass.

## Why
Orchestrator's capture of `?replay=seoul-couple&lang=ko` (1440×900, work panel closed): the replay bar is a 476 px grey block; its text span is 387 px tall; the two buttons stack in a column under it; the first messages are pushed out of view. Computed styles: `DIV.ds-replay-bar` → `display:flex; flex-direction:column; flex-grow:1` because it is now the **first child of `.ui-chat-thread`**, and `web/src/ui/ui.css:845-857` styles `.ui-chat-thread > :first-child` (meant for the Astryx chat layout: column, `flex: 1 1 auto`, overflow hidden) and `.ui-chat-thread > :first-child > :first-child` (meant for the message list: `flex: 1 1 auto; overflow-y: auto`). Those positional rules now hit the bar and its text, and miss the real chat layout.

Also in the English diary check line (`diaryCheckLine`, `web/src/ui/chat.jsx:~540-548`): `· 1번 고쳐 씀` shows as `dropped 1 time` / `Gochyeo Sseum`, and `· 2줄은 근거가 없어 뺐어요` as `2 line(s) with no evidence`.

## Change
1. `ui.css:845-857`: target the chat layout by class instead of position — `.ui-chat-thread > .astryx-chat-layout` (check the real class on the ChatLayout root: `grep -n "astryx-chat-layout" web/src/ui/ui.css`) and its message-list child, keeping the same declarations. Keep the `:first-child` selectors only if something else depends on them, combined with `:not(.ds-replay-bar)`.
2. `.ds-replay-bar`: add `flex: none; flex-direction: row;` (explicit), and its text child `flex: 1 1 auto; overflow: visible;` so it can never grow vertically.
3. en.js patterns for the diary check line pieces: `{0}번 고쳐 씀` → `rewritten {0}×`, `{0}줄은 근거가 없어 뺐어요` → `{0} line(s) dropped for lack of evidence`. Make sure the whole line `✓ 문장 6개 모두 기록과 대조 · 1번 고쳐 씀 · 2줄은 근거가 없어 뺐어요` translates to `✓ All 6 sentences checked against the record · rewritten 1× · 2 line(s) dropped for lack of evidence`.

## Test — extend `web/tests/replay-polish-29a6c.test.js`
- `ui.css` no longer has a bare `.ui-chat-thread > :first-child {` rule (either class-targeted or with `:not(.ds-replay-bar)`), and `.ds-replay-bar` declares `flex: none` and `flex-direction: row`.
- The en translation of the full diary check line above equals the expected English.

Run only:
```
cd web && node --test tests/replay-polish-29a6c.test.js $(grep -ln "first-child\|diaryCheckLine\|chat-layout-19" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
If an older CSS pin asserts the positional selector text, update only that pin.

## Final message
Changed files, one line each. Nothing else.
