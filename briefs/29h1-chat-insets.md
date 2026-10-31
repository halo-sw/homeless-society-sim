# Stage 29h1 — Chat insets: user bubbles get their own padding, the header never hides the Muse status (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
The founder, on the live chat (2026-10-31): "인터페이스에 padding 간격이 안맞고". Measured by the orchestrator on localhost at 800 px and 1440 px:

1. **User bubble text touches the bubble edge.** The user's message bubble (filled, tinted background) computes `padding: 12px 0px`. Cause: `web/src/ui/ui.css:362-363` zeroes the horizontal padding of **every** `.astryx-chat-message-bubble` in the thread (31d did it for the assistant's ghost bubble so cards and the source line start at the list edge). The user bubble is the filled one, so its text now sits flush against its own tinted edge.
   ```css
   .ui-chat-thread .astryx-chat-message-bubble {
     padding-left: 0; padding-right: 0; }
   ```
   Astryx reflects the props as attributes: the bubble element carries `data-sender="user" | "assistant"` and `data-variant="filled" | "ghost"`.
2. **Header: the status text is cut under the summary button at 800–1100 px.** `Ithaca · Powered by Muse · ● Muse Spa` — the status word is clipped and the summary button starts on top of it. `.ui-bar-left` (`ui.css:79`) has `min-width: 0` so it shrinks, while the summary `Button` in `.ui-bar-center` (`ui.css:86-89`, rendered in `web/src/ui/topbar.jsx:199-205`) does not shrink (a broader button rule keeps buttons at `flex-shrink: 0`).

## Change — `web/src/ui/ui.css` only
1. Replace the rule at `ui.css:362-363` so only the assistant's ghost bubble loses its side padding:
   - `.ui-chat-thread .astryx-chat-message-bubble[data-variant="ghost"] { padding-left: 0; padding-right: 0; }`
   - `.ui-chat-thread .astryx-chat-message-bubble[data-sender="user"] { padding-left: var(--ds-s-16); padding-right: var(--ds-s-16); }`
   Keep the 31d comment above it, adding one line: user bubbles keep a 16 px inner inset.
2. Header (after `ui.css:90`): `.ui-bar-left { flex: none; }`, and the summary button in the centre shrinks and ends with an ellipsis instead of covering the left group: `.ui-bar-center > * { min-width: 0; max-width: 100%; flex-shrink: 1; }` plus `.ui-bar-center button, .ui-bar-center button > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }`. Put these **after** any broad `#ui-root button { flex-shrink: 0 }` rule is not required — use a selector at least as specific (`#ui-root .ui-bar-center button`) so it wins. The phone rule at `ui.css:1444` (centre hidden) stays.

## Test — new `web/tests/chat-insets-29h1.test.js`
Read `web/src/ui/ui.css` as text:
- No rule whose selector is exactly `.ui-chat-thread .astryx-chat-message-bubble` (without an attribute) sets `padding-left: 0`.
- A rule for `.ui-chat-thread .astryx-chat-message-bubble[data-variant="ghost"]` sets `padding-left: 0` and `padding-right: 0`.
- A rule for `.ui-chat-thread .astryx-chat-message-bubble[data-sender="user"]` sets `padding-left: var(--ds-s-16)` and `padding-right: var(--ds-s-16)`.
- `.ui-bar-left` has a rule with `flex: none`; a rule with `#ui-root .ui-bar-center button` sets `text-overflow: ellipsis` and `flex-shrink: 1`.

Run only:
```
cd web && node --test tests/chat-insets-29h1.test.js $(grep -ln "astryx-chat-message-bubble\|ui-bar-left\|ui-bar-center" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Update older pins only where they assert the exact selector `.ui-chat-thread .astryx-chat-message-bubble { padding-left: 0 … }` (31d) — they move to the ghost selector.

## Do not touch
Any `.jsx` or `.js` file except the new test; the composer rules (`ui.css:366-373`); card styles; `briefs/`.

## Final message
Changed files, one line each. Nothing else.
