# Stage 29a10 — Landing hero: eyebrow, one "try it" panel, nav that never breaks (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
The owner looked at the landing (`web/src/ui/landing-page.jsx`, styles in `web/src/ui/ui.css` under `.ds-lp-*`) and asked for three things:

1. **Eyebrow text.** The pill above the title (`ds-lp-heroeyebrow`, `landing-page.jsx:~175`) reads `Muse가 대신 확인하고 30일 살아 봐요`. It must read **`Pre-simulation by Muse Agent`** — the same English words in both languages (a product line, not translated).
2. **The block under the composer looks unfinished.** Today, from top to bottom (`landing-page.jsx:~185-220`): 3 starter chips, then 3 judge buttons (`ds-lp-judge`), then a 13 px note glued to the buttons with no gap, then a proof row of three `num · text` facts split by hairlines, then a second `Powered by Muse` (the nav already shows one), then the coverage line. Five loose rows with different alignments and gaps. On a 390 px phone the three judge buttons stack at three different widths, and each proof fact sits alone on its own line with large gaps.
3. **Korean nav words break letter by letter.** Between 481 and ~600 px wide, the nav links (`.ds-lp-links a`, `ui.css:~1259`) wrap one syllable per line (`데이터` → `데` / `이` / `터`, measured link height 67–90 px instead of 22). The rest of the landing has the same risk: Korean text has no `word-break: keep-all`.

## Change

### 1. Eyebrow — `landing-page.jsx` (`ds-lp-heroeyebrow`)
Text `Pre-simulation by Muse Agent`, with `data-no-i18n` on the text span so the English layer does not touch it. Keep the Muse logo before it. Remove the now-unused `"Muse가 대신 확인하고 30일 살아 봐요"` entry from `web/src/i18n/en.js:~187`.

### 2. One "try it" panel — `landing-page.jsx` (hero, after the starter chips) and `ui.css`
Replace the loose rows (judge buttons, replay note, proof row, hero `PoweredByMuse`) with one card, `<section className="ds-lp-try" aria-label="바로 해 보기">`:

- **Card**: `--ds-surface` background, `1px solid var(--ds-line)`, radius `var(--ds-r-card)`, `box-shadow: var(--ds-shadow-card)`, padding `var(--ds-s-24)`, `max-width: 720px` (same as the composer), `margin: var(--ds-s-32) auto 0`. Gap between its parts `var(--ds-s-16)` (flex column + `gap`, no per-element margins).
- **Label row**: `바로 해 보기` (12 px, weight 600, `--ds-ink-3`, letter-spacing 0.04em), left aligned.
- **Buttons** (`ds-lp-judge`, keep the class and the three links as they are): a 3-column grid, equal widths, `height: 44px`, `gap: var(--ds-s-8)`. Under each button a one-line caption (12 px, `--ds-ink-3`, centered): under `기록된 한 달 보기` → `키 없이 바로 재생`; under the two others → `Muse 실시간 · 하루 한도`. Wrap each button and its caption in `<div className="ds-lp-judgeitem">`. These captions replace the `ds-lp-replaynote` paragraph (delete it and its inline `fontSize: 13`).
- **Proof strip** (`ds-lp-proof`, keep `PROOFS`): separated from the buttons by a `1px solid var(--ds-line)` top border and `padding-top: var(--ds-s-16)`. A 3-column grid; each fact is a column with the number on top (`--ds-t-20`, bold, `--ds-ink-1`) and the label below (12 px, `--ds-ink-2`). Columns split by a 1 px `--ds-line` left border (not on the first). Drop the `·` between number and label.
- **Footer row**: `PoweredByMuse size="sm"` on the left and the coverage line (`COVERAGE_LINE`, 12 px, `--ds-ink-3`) on the right, `display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: var(--ds-s-8)`. Remove the separate hero `<PoweredByMuse size="md" />` and the separate `ds-lp-cover` paragraph below the card.
- **Phone (≤ 480 px)**: card padding `var(--ds-s-16)`; buttons become one column, each full width (`width: 100%`), caption under each; the proof strip stays 3 columns (labels may wrap to two lines, centered); footer stacks (credit above coverage line, both left aligned). Delete the old 480 px rules that turned `.ds-lp-judge` into a centered column and set `.ds-lp-proof { max-width: 300px }`.

### 3. Nav and Korean line breaks — `ui.css`
- `.ds-lp { word-break: keep-all; overflow-wrap: anywhere; }` (Korean breaks only between words everywhere on the landing; very long English tokens still wrap).
- `.ds-lp-links a { white-space: nowrap; }` and `.ds-lp-links { flex: none; }`.
- Move the rule that hides `.ds-lp-links` from `max-width: 480px` to a new `@media (max-width: 720px)` block (also `.ds-lp-nav-right { margin-left: auto; }` there). Keep hiding the credit text and the language toggle only at ≤ 480 px as today.

Do not use `13px`, `text-overflow` or `ellipsis` anywhere in `ui.css` (older tests forbid them). Use the existing tokens (`--ds-s-*`, `--ds-t-*`, `--ds-ink-*`, `--ds-line`, `--ds-surface`).

Add English strings to `web/src/i18n/en.js`: `바로 해 보기` → `Try it now`, `키 없이 바로 재생` → `Plays instantly, no key`, `Muse 실시간 · 하루 한도` → `Live Muse · daily limit`.

## Test — new `web/tests/landing-hero-29a10.test.js`
SSR `LandingPage` (same setup as `tests/landing-judge-30e.test.js`):
- contains `Pre-simulation by Muse Agent` and not `Muse가 대신 확인하고`;
- contains `ds-lp-try`, `바로 해 보기`, `키 없이 바로 재생`, `Muse 실시간 · 하루 한도` (twice);
- `ds-lp-judge` still holds exactly 3 `<a ` links (one `ds-lp-btn--primary`);
- no `ds-lp-replaynote`, no `13px`; `PoweredByMuse` markup (`ds-pbm`) appears once in the hero header;
- `ui.css`: `.ds-lp` rule has `word-break: keep-all`; `.ds-lp-links a` has `white-space: nowrap`; a `@media (max-width: 720px)` block contains `.ds-lp-links { display: none; }`; `.ds-lp-try` rule exists; no `13px`, no `ellipsis`.

Update older pins only where they assert what this stage removes: `tests/landing-judge-30e.test.js` (the `replay note stays 13px` case → assert the captions instead; the `ds-lp-judge` regex may need to allow the new inner `ds-lp-judgeitem` divs — match up to the closing of the judge block), `tests/landing-visual-28f.test.js:31` (eyebrow string → `Pre-simulation by Muse Agent`).

Run only:
```
cd web && node --test tests/landing-hero-29a10.test.js tests/landing-judge-30e.test.js tests/landing-visual-28f.test.js tests/powered-by-muse-28b.test.js tests/tokens-28c.test.js $(grep -ln "landing-page" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
`chat.jsx`, `topbar.jsx`, `landing.jsx`, map / 3D / engine files, `web/src/i18n/dom.js`, the sections below the hero.

## Final message
Changed files, one line each. Nothing else.
