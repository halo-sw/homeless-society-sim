# Stage 31l — after merging main: restore the landing eyebrow style, line the landing tests up with main's Try panel (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## What happened
- The orchestrator merged `origin/main` (stages 29a10, 29a10b, 29a11, done by another session) into `ithaca-17`.
- Main's landing hero is the newer, deployed design, and it wins:
  - the `Pre-simulation by Muse Agent` eyebrow;
  - one `ds-lp-try` panel "바로 해 보기" with **three** entries, each with a caption: 기록된 한 달 보기, Meta 본사 출근으로 해 보기, 서울로 해 보기;
  - proof rows;
  - a footer with PoweredByMuse + the coverage line.
- Our stage 31c had removed the eyebrow, the 서울로 entry and added a replay note. Those hero changes are dropped in favour of main.

## Change
1. **`web/src/ui/ui.css`.** The merge lost main's eyebrow rule (31c had deleted it), so the eyebrow now renders unstyled.
   - Put it back right after the `.ds-lp-hero { … }` rule, exactly as on main:
     ```css
     .ds-lp-heroeyebrow { display: inline-flex; align-items: center;
       gap: var(--ds-s-8); background: var(--ds-surface);
       border: 1px solid var(--ds-line); border-radius: var(--ds-r-pill);
       padding: var(--ds-s-4) var(--ds-s-12); font-size: var(--ds-t-14);
       color: var(--ds-ink-1); margin: 0 0 var(--ds-s-16); }
     ```
   - Remove the rules `.ds-lp-replaynote` and `.ds-lp-cover` if nothing in `web/src` uses those class names any more (check with grep first).
   - Nothing else in the CSS changes.
2. **Tests: make them describe main's landing.** Do not change the landing code.
   - **`web/tests/landing-hero-31c.test.js`:** rewrite the hero assertions:
     - the eyebrow is present with `Pre-simulation by Muse Agent`;
     - `ds-lp-try` holds the three entries in the order above, the first `ds-lp-btn--primary` and the other two secondary, each followed by a `ds-lp-judgecap`;
     - no `ds-lp-replaynote`.
     - **Keep** the chips test and the proof number/caption test (they still hold).
     - **CSS test:** `.ds-lp-heroeyebrow` rule exists; `.ds-lp-proof` is a grid with 3 columns (main uses `repeat(3, minmax(0, 1fr))`, so match `repeat\(3,`); no `13px`; no `ellipsis`.
     - Update the file's top comment.
   - **`web/tests/landing-judge-30e.test.js`:** the judge row has three links (the 31c "two links only" comment and assertions go back to three, in the order above).
   - **`web/tests/judge-path-29a6.test.js`** line ~57: `서울로 해 보기` **is** on the landing now. Assert it is present, inside `ds-lp-try`.
   - `web/tests/landing-hero-29a10.test.js` already matches main. Leave it as is; it must stay green.

Run only (**run it before you finish**):
```
cd web && node --test tests/landing-hero-31c.test.js tests/landing-judge-30e.test.js tests/judge-path-29a6.test.js tests/landing-hero-29a10.test.js tests/landing-visual-28f.test.js $(grep -lE "LandingPage|ds-lp-" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`landing-page.jsx`, the map, chat, `src/engine/**`, `src/i18n/**`, `src/consult/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Nothing else.
