# Stage 29h4 — Header fix without ellipsis: keep the project's "never truncate in ui.css" rule (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here. Stop when the named tests pass.

## Why
29h1 added `text-overflow: ellipsis` to the header summary button. Thirteen older tests pin a project-wide rule that `web/src/ui/ui.css` never contains `ellipsis` / `text-overflow` (26t, 26w, 26p, 26z, 29a10, 30e, 31b, 31c, 31m, compare-tabs …). The rule stays; the header fix must not need it. The part that fixed the bug is `.ui-bar-left { flex: none; }` (the Muse status is no longer squeezed); the summary button already shortens itself inside `.ui-bar-center` (`overflow: hidden`, `ui.css:86-89`).

## Change
1. `web/src/ui/ui.css:91-99` (the 29h1 block): keep the comment (reword: "the left group keeps its width; the centre clips the summary button, which shortens itself"), keep `.ui-bar-left { flex: none; }` and `.ui-bar-center > * { min-width: 0; max-width: 100%; flex-shrink: 1; }`. Delete the two `#ui-root .ui-bar-center button …` rules entirely (no `text-overflow`, no `ellipsis` left anywhere in the file).
2. Restore the four pins 29h1–29h3 loosened to their original whole-file form:
   - `web/tests/mobile-26m.test.js:57-59` → `assert.ok(!css.includes("text-overflow"), "no truncation in ui.css");`
   - `web/tests/thread-edge-31d.test.js:56-59` → `assert.ok(!css.includes("ellipsis"), "no ellipsis in ui.css");`
   - `web/tests/list-tabs-31i.test.js:104-107` → `assert.ok(!css.includes("ellipsis"), "no ellipsis in ui.css");`
   - `web/tests/chat-shell-32a.test.js:~274` → `assert.ok(!uiCss.includes("ellipsis"), "no ellipsis");`
3. `web/tests/chat-insets-29h1.test.js`: replace the assertion about `#ui-root .ui-bar-center button` / `text-overflow: ellipsis` with: `ui.css` contains neither `ellipsis` nor `text-overflow`, and a `.ui-bar-center > *` rule sets `flex-shrink: 1`.

Run only:
```
cd web && node --test tests/chat-insets-29h1.test.js tests/mobile-26m.test.js tests/thread-edge-31d.test.js tests/list-tabs-31i.test.js tests/chat-shell-32a.test.js tests/chatfirst-26t.test.js tests/compare-tabs.test.js tests/first-screen-26w.test.js tests/landing-hero-29a10.test.js tests/landing-hero-31c.test.js tests/landing-judge-30e.test.js tests/map-phone-31m.test.js tests/map-tray-31b.test.js tests/phone-26p.test.js tests/phone-tray-26z2.test.js tests/tray-money-26z.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
Any `.jsx`/`.js` source file; any other CSS rule; `briefs/`.

## Final message
Changed files, one line each. Nothing else.
