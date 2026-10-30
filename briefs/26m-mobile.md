# Stage 26m — Phone layout (390 px): nothing cut off, 3D gets the screen (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Setup: Playwright iPhone 13 (390 × 844, touch) on the public site. Two flows: Korean example "1인 사회초년생" and US example "Meta HQ, Menlo Park". Steps: landing → chat → candidates → pick 2 → 30-day result → 3D.
- No horizontal overflow and no page errors.
- Many labels are cut with "…". The cause is the design-system button class (`astryx.css`, atomic class with `text-overflow: ellipsis`): buttons shrink inside tight flex rows.

1. **Header.**
   - Landing logo wraps: "Itha / ca", "Ithac / a".
   - In chat, the blue summary chip is clipped on the left ("eta H…", "판교 …").
   - In 3D, the mode tabs read "C… Previ… Expl…" and "대.. 살아... 동네 둘...".
2. **Candidate card.**
   - The Pick button shrinks to "P..", "Pi...", "담..".
   - The name column is so narrow that names break mid-word: "Colema / n Place", "Hamilto / n", "분당오벨리스 / 크"; "예산 / 안" also breaks.
3. **Chat chips row:** "매물 글 붙여 ...", "공공임대 ...", "도움 제도 보...".
4. **Bottom pick bar:** home B's name disappears ("B 분", or just "B"), and the run button reads "Live it for 30 da...", "이 집들로 30일...".
5. **Result card.**
   - A/B header names break mid-word ("10 Colema / n Place").
   - "$4,261 (ZIP estimate)/mo" wraps over 4 lines.
   - "3D로 ..." is cut.
6. **3D view.**
   - The control panel (A B · 집만 밝게 보기 · 범례 · 동네 전체 · 따라가기) wraps into two rows of about 110 px.
   - The timeline card is about 130 px, and its date "(Mon) 18:00 · Day 1/30" wraps over three lines and overlaps the legend row.
   - The 3D canvas visible between them is only about 150 px tall.
   - The speed control shows an empty pill.

## Change — only under `@media (max-width: 480px)` (or the JS equivalent where layout is computed); desktop and tablet stay byte-identical
1. **Never truncate a button label.**
   - Action buttons (Pick/담기, 3D로 보기 / View in 3D, run, chips, tabs) get `flex-shrink: 0`.
   - In `src/ui/ui.css`, override the design-system truncation for these buttons on phones: `text-overflow: clip; overflow: visible; white-space: nowrap` on the label element.
   - Do **not** write `text-overflow: ellipsis` anywhere (`tests/compare-tabs.test.js:62` checks ui.css).
2. **Header:**
   - the logo is `white-space: nowrap`;
   - the summary chip is hidden on phones (the same facts are in the "고객님 상황" card);
   - the mode tabs use short labels on phones: 대화 / 보기 / 둘러보기 and Chat / View / Explore. Check `src/ui/topbar.jsx` for where those labels come from.
3. **Candidate card:**
   - the thumbnail is 64 px;
   - the Pick button sits on its own line under the title on phones, or stays at the right with `flex-shrink: 0` while the title gets the rest. Pick whichever needs less change;
   - names use `word-break: keep-all; overflow-wrap: break-word`, so Korean and English words never split mid-word unless a single word is wider than the column.
4. **Chips row:** one horizontally scrollable row (`overflow-x: auto; flex-wrap: nowrap`), chips never shrink. The page itself must still not scroll sideways.
5. **Bottom pick bar:** on phones it becomes two rows:
   - row 1 is the picked homes A and B, each name allowed to wrap to two lines;
   - row 2 is the full-width run button with its full label.
6. **Result card:**
   - header names `word-break: keep-all`;
   - the money cell shows `$4,261/mo` on the first line and `(ZIP estimate)` small on a second line. For KRW, keep today's text and only apply `keep-all`. Find where the "(ZIP 추정)" text is joined; render it as a separate small span;
   - "3D로 보기" is never cut (rule 1).
7. **3D view on phones** (`src/ui/app.jsx` / `src/main.js` layout, `src/ui/timeline.jsx`):
   - controls collapse into one horizontally scrollable row of compact chips, no wrapping;
   - the timeline card shows the date on one line with a smaller font (`11/2 (월) 18:00 · 1일차/30`, nowrap);
   - the legend rows are hidden behind the existing "범례 / Legend" control;
   - the speed control shows its labels (1× 10× 60×);
   - the canvas area between the top controls and the timeline card is at least 55 % of the viewport height. The right panel content flows below it as today.

## Test — `web/tests/mobile-26m.test.js` (node --test, no browser)
- Read `src/ui/ui.css`:
  - it has a `@media (max-width: 480px)` block;
  - that block contains `flex-shrink: 0`, `word-break: keep-all` and `overflow-x: auto`;
  - the file still has no `text-overflow: ellipsis`.
- If you add JS helpers (e.g. short tab labels, `splitMoneyNote("$4,261 (ZIP estimate)/mo")` → `{ main: "$4,261/mo", note: "(ZIP estimate)" }`), test them.
- Keep green: `tests/compare-tabs.test.js`, every `tests/ui-*`, `tests/topbar*`, `tests/timeline*`, `tests/landing*` file that exists, `tests/us-26k.test.js`, `tests/us-26i.test.js`.

Run only:
```
cd web && node --test tests/mobile-26m.test.js tests/compare-tabs.test.js tests/us-26k.test.js tests/us-26i.test.js $(ls tests | grep -E '^(ui-|topbar|timeline|landing)' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks the result on a phone-sized browser.

## Do not touch
`src/engine/**`, `src/i18n/**`, `pipeline/**`, anything under `data/`. Desktop layout (> 480 px) must not change.

## Final message
Changed files, one line each. Nothing else.
