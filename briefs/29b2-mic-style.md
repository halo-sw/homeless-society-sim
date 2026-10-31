# Stage 29b2 — Mic button looks like part of the composer (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here. Stop when the named tests pass.

## Why
29b works end to end (orchestrator drove it in Chrome: mic → recording → `Writing it down…` → transcript in the box). But `web/src/ui/voice-button.jsx` uses classes `ui-voice-mic`, `ui-voice-mic-rec`, `ui-voice-dot` that have **no rules** in `web/src/ui/ui.css`, so the browser default button shows: the `받아 적는 중…` text renders at 16 px next to the send button and the recording state is a bare `●0:03` glued to it. The dot also uses an inline `style` with a hard-coded `#d33` fallback.

## Change
### `web/src/ui/ui.css` (new block near the composer rules, `grep -n "ui-chat-empty-label" web/src/ui/ui.css` for a nearby spot)
- `.ui-voice-mic`: `display: inline-flex; align-items: center; justify-content: center; gap: var(--ds-s-4); height: 32px; min-width: 32px; padding: 0 var(--ds-s-8); margin-right: var(--ds-s-4); border: 0; border-radius: var(--ds-r-pill); background: transparent; color: var(--ds-ink-2); font-size: var(--ds-t-12); font-variant-numeric: tabular-nums; cursor: pointer; white-space: nowrap;`
- `.ui-voice-mic:hover:not(:disabled)`: `background: var(--ds-sunken); color: var(--ds-ink-1);` and `:focus-visible` an outline using the existing focus token if there is one (`grep -n "focus-visible" web/src/ui/ui.css | head -3`), else `outline: 2px solid var(--ds-ink-1); outline-offset: 2px`.
- `.ui-voice-mic:disabled`: `cursor: default; color: var(--ds-ink-3);` (the `받아 적는 중…` state stays 12 px).
- `.ui-voice-mic-rec`: `background: var(--ds-sunken); color: var(--ds-ink-1); padding: 0 var(--ds-s-12);`
- `.ui-voice-dot`: `width: 8px; height: 8px; border-radius: 50%; background: var(--ds-danger, var(--ds-error, #c8433a));` + a gentle opacity pulse `@keyframes ui-voice-pulse { 50% { opacity: .35 } }` 1.2 s infinite, turned off under `@media (prefers-reduced-motion: reduce)`. Check which danger/error token exists (`grep -n "\-\-ds-danger\|\-\-ds-error" web/src/ui/ui.css | head -3`) and use it.

### `web/src/ui/voice-button.jsx`
- The dot becomes an empty `<span className="ui-voice-dot" aria-hidden="true" />` (no `●` glyph, no inline style).

No `13px`, no `text-overflow`, no `ellipsis`.

## Test — append to `web/tests/voice-29b.test.js`
- `ui.css` has rules for `.ui-voice-mic` (with `height: 32px`), `.ui-voice-mic-rec`, `.ui-voice-dot`, and `ui-voice-pulse` appears inside a `prefers-reduced-motion` block.
- `voice-button.jsx` source has no `●` and no `#d33`.

Run only:
```
cd web && node --test tests/voice-29b.test.js tests/tokens-28c.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -8
```

## Do not touch
`chat.jsx`, server files, other CSS.

## Final message
Changed files, one line each. Nothing else.
