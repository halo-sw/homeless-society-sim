# Stage 30e — landing: the three judge buttons render as buttons (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
On the public site today (1440 × 900, English), the hero row under the composer chips shows the three 29a6 entry buttons, "Watch a recorded month", "I work at Meta HQ" and "Try Seoul", wrongly:
- they are drawn inside a **full-width black bar** about 26 px tall;
- the labels overlap ("Watch a recorded month|I work at Meta HQ|Try Seoul" with no gaps);
- the secondary pills are clipped top and bottom.

**Cause:**
- The hero wrapper is `<div className="ds-lp-cta">` (`web/src/ui/landing-page.jsx` ~204).
- `.ds-lp-cta` is also the dark bottom call-to-action **section** (`landing-page.jsx` ~389; `web/src/ui/ui.css` ~1538: `background: var(--ds-action); color: var(--ds-surface)`). The hero row inherits that look.
- `.ds-lp-btn` (ui.css ~1518) has no height or padding unless `--sm` is added, and there is **no `.ds-lp-btn--primary` rule** at all.

## Change
1. **`landing-page.jsx` hero:** rename the wrapper to `ds-lp-judge`. Do not touch the bottom section's `ds-lp-cta`.
2. **`ui.css`:**
   - `.ds-lp-judge`: `display: flex; flex-wrap: wrap; justify-content: center; gap: var(--ds-s-8); margin-top: var(--ds-s-16)`.
   - `.ds-lp-btn` gets a default size: `height: 40px; padding: 0 var(--ds-s-16)`. Keep `--sm` as the override.
   - Add `.ds-lp-btn--primary`: `background: var(--ds-action); color: var(--ds-surface); border: 1px solid var(--ds-action)`.
   - Make sure links styled as `.ds-lp-btn` have no underline.
   - At ≤480 px the three buttons stack or wrap. Each keeps its full label on one line (`white-space: nowrap` stays). Nothing overflows the 16 px gutter; the longest label is "Watch a recorded month".
   - No `text-overflow: ellipsis`.
3. The replay note line under the buttons stays as is, 13 px, `--ds-ink-2`.

## Test — `web/tests/landing-judge-30e.test.js`
- SSR of the landing (`grep -ln "LandingPage" web/tests/*.test.js` shows how the other landing tests render it):
  - the three hero links sit inside `ds-lp-judge`, not `ds-lp-cta`;
  - `ds-lp-cta` appears exactly once, on the bottom section.
- `ui.css`:
  - has a `.ds-lp-btn--primary` rule with a background;
  - `.ds-lp-btn` sets a height;
  - `.ds-lp-judge` is flex with wrap;
  - there is no `ellipsis` anywhere.
- Keep green: every test file that mentions `LandingPage` or `landing`, plus `tests/judge-path-29a6.test.js`.

Run only:
```
cd web && node --test tests/landing-judge-30e.test.js tests/judge-path-29a6.test.js $(grep -lis "landing" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -12
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks it in a real browser at 1440 px and 390 px.

## Do not touch
Everything except `web/src/ui/landing-page.jsx`, `web/src/ui/ui.css` (only the `.ds-lp-*` rules) and the new test. In particular, do not touch `chat.jsx` or `powered-by-muse.jsx`: another stage is editing them now.

## Final message
Changed files, one line each. Nothing else.
