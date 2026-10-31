# Stage 26z — tray run button never cut; money note never glued (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Desktop 1440 × 900, English, Meta HQ flow after a 30-day run:
1. **Tray run button cut.** The pick tray under the map shows "A 10 Coleman Place ×  B Apartments on South Perimeter Road ×  [Live it for 30 days in these hom…]".
   - The label ends in "…", so something clips it with an ellipsis, probably the design-system button. Our CSS must never cut text (`compare-tabs.test.js` pins that there is no `text-overflow: ellipsis` in `ui.css`).
   - The orchestrator shortened the English label to "Live 30 days in each". Long home names (B wraps to two lines) can still squeeze the button.
2. **Money note glued.** In the result grid, "Monthly housing cost" shows `$4,261/mo(ZIP estimate)`, with no space before "(".
   - `splitMoneyNote` (`src/ui/chat.jsx` ~221) splits the value into `main` and `note`. On desktop the two render inline with no gap.

## Change
1. **Tray** (find the component that renders `RUN_BUTTON_LABEL` and the A/B chips, `src/ui/chat.jsx` ~2590 or the tray component):
   - the run button is `flex: none`, keeps its full label on one line, and has `max-width: none; overflow: visible; text-overflow: clip` (override whatever clips it);
   - the A/B name chips take the remaining space: `flex: 1 1 0; min-width: 0`, names wrap at spaces (`overflow-wrap: anywhere; word-break: keep-all`);
   - at phone width, keep today's 26m/26p layout and check it still holds.
2. **Money note:** wherever `splitMoneyNote` output is rendered, the note is its own small line under the amount (`display: block`, `--ui-t12` or the existing note size) at **all** widths. Phones already show it that way.

## Test — `web/tests/tray-money-26z.test.js`
- `ui.css`: the tray run button rule has `flex: none` and does not set `text-overflow: ellipsis`. There is still no `ellipsis` anywhere in `ui.css`.
- SSR of the result money cell for `"$4,261/mo (ZIP 추정)"` (or the component that uses `splitMoneyNote`): the note is in its own element, and the CSS rule for that class sets `display: block` outside any media query.
- Keep green: `tests/compare-tabs.test.js`, `tests/mobile-26m.test.js`, `tests/phone-26p.test.js`, `tests/first-screen-26w.test.js`, and every `tests/result*` / `tests/tray*` file.

Run only:
```
cd web && node --test tests/tray-money-26z.test.js tests/compare-tabs.test.js tests/mobile-26m.test.js tests/phone-26p.test.js tests/first-screen-26w.test.js $(ls tests | grep -E '^(result|tray)' | grep -v 26z | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks the look in a real browser.

## Do not touch
`src/engine/**`, `src/i18n/**`, `src/consult/**`, `pipeline/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Nothing else.
