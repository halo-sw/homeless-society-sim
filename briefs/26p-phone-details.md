# Stage 26p — phone details left after 26m, plus one desktop cut (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Setup: Playwright iPhone 13 (390 × 844) on the dev server after 26m, Korean and US flows, plus one desktop capture at 1440 × 900.

1. **Header (chat screen, phones).** Two segmented controls collide.
   - The mode tabs (대화 / 보기 / 둘러보기) and the narrow pane toggle `.ui-chat-narrowtabs` (대화 / 화면, `src/ui/chat.jsx:1750`) sit side by side.
   - "둘러보기" is cut to "둘러보", and "Explore" to "Ex".
   - Both controls start with "대화", which reads as a duplicate.
2. **"추정" / "Estimate" tag** in the candidate row breaks one letter per line ("추 / 정"): `.ui-cand-est`, `src/ui/ui.css:562`.
3. **Pick button position jumps.** It is on the right for short names and on its own line for longer ones (노블리치1오피스텔, 744 Coleman Avenue). This comes from the 26m rule `.ui-cand-row-top { flex-wrap: wrap }`.
4. **Result card header** (`.ui-result-grid` ~ui.css:919, `chat.jsx:410`): names still break mid-word: "10 Colema / n Place", "777 Hamilto / n / Avenue / · 5", "분당오벨리 / 스크". The label column takes about 45 % of the width, and each name gets about 60 px.
5. **"살아 보니 / After living it" moments** (`.ui-moment`, ui.css:842). The text column is squeezed between the time, the A/B disc and "3D로 보기 →", so it reads "in the / evening" one word per line.
7. **Desktop too:** in the US candidate list at 1440 px, the Pick button of "Apartments on South Perimeter Road" shrinks to "P...". The two-line name pushes it.
6. **Desktop too:** the intake text step "2/6 · 지금 사는 곳" (`src/ui/intake.jsx` `TextStep`, an `HStack` of `input.ui-keyinput` + `Button "입력"`). The button shrinks to "입..." at 1440 px because the input takes all the width.

## Change
Items 1–5 go only under `@media (max-width: 480px)` (or the JS equivalent). Items 6 and 7 apply at all widths.

1. **Header:**
   - on phones, move `.ui-chat-narrowtabs` out of the top bar row onto its own full-width row directly under it (sticky with the header, 8 px side padding, the two items each 50 %);
   - rename its second item from `화면` to `지도·후보` (it shows the map and candidates);
   - the mode tabs then have room for their short labels. Check `src/ui/topbar.jsx` `extra` handling.
2. `.ui-cand-est { white-space: nowrap; }` (all widths; it is a 2-character tag).
3. **Candidate row top on phones:**
   - no wrap; the name gets `flex: 1 1 0; min-width: 0` with `word-break: keep-all; overflow-wrap: anywhere`, so a single long word may break only when it is wider than the column;
   - the Pick button stays at the right with `flex: none`.
4. **Result grid on phones:**
   - the label column is narrower, e.g. `grid-template-columns: minmax(64px, 0.7fr) 1fr 1fr`, and labels may wrap at spaces;
   - each header is a block: disc on top, name under it with `word-break: keep-all; overflow-wrap: anywhere`;
   - the money values must not overflow their column: allow `$4,261/mo` to shrink to `--ui-t16` on phones if needed.
5. **Moments on phones:**
   - each `.ui-moment` becomes two lines: line 1 has the time, the disc and, at the right, "3D로 보기 →"; line 2 has the text at full width;
   - use `flex-wrap: wrap` with the text `flex-basis: 100%; order: 3`, or a grid.
7. **Candidate row Pick button** (all widths): `.ui-cand-row-top > button` (or the class the design-system button carries there) gets `flex: none`, and `.ui-cand-row-name` gets `flex: 1 1 0; min-width: 0`.
6. **`TextStep`** (all widths): the input gets `flex: 1 1 auto; min-width: 0` and the button `flex: none`, so "입력" is never cut.

## Test — `web/tests/phone-26p.test.js`
- `ui.css`:
  - `.ui-cand-est` has `white-space: nowrap`;
  - the 480 px block names `.ui-chat-narrowtabs`, `.ui-result-grid` and `.ui-moment`;
  - there is still no `text-overflow: ellipsis`.
- SSR: the chat pane toggle has the labels `대화` and `지도·후보`.
- SSR of `TextStep` (or the intake step that uses it): the button element follows an input, and the CSS or inline style gives the button `flex: none` (assert on whichever you chose).
- Keep green: `tests/chat-scroll-13e2.test.js`, `tests/mobile-26m.test.js`, `tests/compare-tabs.test.js`, and every `tests/topbar*`, `tests/intake*`, `tests/result*` file that exists.

Run only:
```
cd web && node --test tests/phone-26p.test.js tests/chat-scroll-13e2.test.js tests/mobile-26m.test.js tests/compare-tabs.test.js $(ls tests | grep -E '^(topbar|intake|result)' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**` (the orchestrator adds `지도·후보` → `Map & homes`), `pipeline/**`, `data/`, `src/ui/chatmap.jsx`, `src/chatmap.js`, `src/ui/candidate-card.jsx`, `src/ui/preview.jsx`, `src/aerial/**` (other stages are editing them). Desktop must not change except items 6 and 7.

## Final message
Changed files, one line each. Nothing else.
