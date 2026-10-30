# Stage 28g — Landing finishing touches (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the parts of `web/src/ui/landing-page.jsx` and the landing block of `web/src/ui/ui.css` (`grep -n "28d landing\|28f" web/src/ui/ui.css`) that the items name. Stop when the named tests pass.

## Why
Orchestrator's screenshots of your 28f landing look good. Five small defects remain:
1. **Hero wash is a visible box.** At 1440 px the lighter radial wash behind the hero has hard vertical edges at about x = 340 and x = 1100 (it is painted on the 760 px hero column, not on the full-width band). Paint it on a full-width hero band instead (`radial-gradient(ellipse at 50% 30%, var(--ds-surface) 0%, var(--ds-page) 70%)` on the band that spans the viewport), so no edge is visible.
2. **Coverage line touches the next band.** The `다루는 지역 11곳 …` line sits on the boundary with the `기능` band. Give the hero band bottom padding `calc(var(--ds-s-48) * 2)` (64 px on phone), like the other sections.
3. **Comparison header.** In the Ithaca column header the Muse logo sits above the word `Ithaca`. Put them on one line: inline-flex, align center, gap `--ds-s-8`, logo 16 px.
4. **Phone nav.** At 390 px `시작하기` sits right next to the logo in the middle of the bar. The right group must be pushed to the right edge (`margin-left: auto` on the right group, or `justify-content: space-between` on the nav row).
5. **Proof facts wrap.** At 390 px the third fact wraps to a second line and keeps a leading divider (`│ 8/8 · …` starts with a stray hairline). On wrap, no item may start with a divider: use `gap` + a divider drawn only between items on the same line (simplest: drop the dividers at ≤ 480 px and use `gap: var(--ds-s-8) var(--ds-s-16)`, centred).

## Test — extend `web/tests/landing-visual-28f.test.js` (add one `it` block)
- CSS text: the hero radial gradient is on a selector that is not the 760 px hero column (assert the declaration containing `radial-gradient` is inside a rule whose selector contains `band` or the full-width hero wrapper class you use; name that class `ds-lp-heroband`, and assert `.ds-lp-heroband` exists with `radial-gradient`).
- CSS text: a 480 px block contains the nav right-group rule with `margin-left: auto` (or `justify-content: space-between` on `.ds-lp-nav-inner`).

Run only:
```
cd web && node --test tests/landing-visual-28f.test.js tests/landing-polish-28e.test.js tests/landing-page-28d.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
Anything outside `web/src/ui/landing-page.jsx`, `web/src/ui/ui.css`, and that test file.

## Final message
Changed files, one line each. Nothing else.
