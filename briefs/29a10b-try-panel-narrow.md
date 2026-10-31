# Stage 29a10b — Try panel at narrow widths (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here. Stop when the named tests pass.

## Why
29a10 added the hero "Try it now" panel (`web/src/ui/ui.css:1439-1460`, `:1538-1540`, phone rules `:1597-1600`). Screenshots by the orchestrator:
- **560 px wide**: the three judge buttons get different widths (`Meta 본사 출근으로 해 보기` is wide, `기록된 한 달 보기` narrow) because `grid-template-columns: repeat(3, 1fr)` lets a long label grow its track (`1fr` = `minmax(auto, 1fr)`).
- **390 px, English**: the proof strip's numbers wrap (`14` / `seconds` on two lines at 20 px bold) and `Diary sentences checked against the record` runs to five lines in a ~100 px column.

## Change — `web/src/ui/ui.css` only
1. `.ds-lp-judge` and `.ds-lp-proof`: `grid-template-columns: repeat(3, minmax(0, 1fr))`. Button labels: `white-space: nowrap`.
2. New `@media (max-width: 720px)` rules: `.ds-lp-judge { grid-template-columns: 1fr; }` (stacked full-width buttons with their captions, as on phones today). Move the stacked-button rule there from the 480 px block.
3. Phone proof strip (`@media (max-width: 480px)`): one fact per row instead of three columns — `.ds-lp-proof { grid-template-columns: 1fr; }`; each `.ds-lp-prooffact` becomes a row: `flex-direction: row; align-items: baseline; justify-content: flex-start; gap: var(--ds-s-12); padding: var(--ds-s-8) 0; text-align: left;` with the number `min-width: 96px; white-space: nowrap; font-size: var(--ds-t-16)`. Row dividers: `.ds-lp-prooffact + .ds-lp-prooffact { border-left: 0; border-top: 1px solid var(--ds-line); }`.

No `13px`, no `text-overflow`, no `ellipsis`.

## Test — append to `web/tests/landing-hero-29a10.test.js`
- `.ds-lp-judge` and `.ds-lp-proof` rules contain `minmax(0, 1fr)`;
- a `@media (max-width: 720px)` block contains `.ds-lp-judge { grid-template-columns: 1fr; }`;
- the last `@media (max-width: 480px)` block that mentions `.ds-lp-prooffact` contains `border-top: 1px solid var(--ds-line)`.

Run only:
```
cd web && node --test tests/landing-hero-29a10.test.js tests/landing-judge-30e.test.js tests/tokens-28c.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -8
```

## Do not touch
Any `.jsx` file, other CSS sections.

## Final message
Changed files, one line each. Nothing else.
