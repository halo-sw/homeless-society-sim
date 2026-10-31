# Stage 31d — chat thread follow-up: the left edge really is one edge, Korean never breaks mid-word, citations don't overlap, the last reply is never cut (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator after 31a
Measured in a real browser: replay `?replay=seoul-couple&lang=ko` at 1440 × 900, and `?replay=menlo-month&lang=en` at 390 × 844 (iPhone 13).

### 1. Three left edges, not one
Measured with `getBoundingClientRect` at 1440 × 900:

| Element | Box x | Content x | Why |
|---|---|---|---|
| Assistant bubbles (`.astryx-chat-message-bubble`, ghost) | 28 | **44** | The inner list wrapper has `padding: 8px 12px` (the `div` directly inside `.astryx-chat-message-list`), plus the bubble's own `padding: 0 16px`. The 31a rule on `.astryx-chat-message-list` does not reach it. |
| Cards inside bubbles | 44 | 60 | Same cause. |
| `.ui-chat-chips` | — | **16** | Correct. |
| `.astryx-chat-composer` | **8** | 20 | Its wrapper pads `0 8px 8px`. |
| User bubbles | — | — | Right-aligned at 461 + 16 = 477, while the chips' right edge is 473. |

**Target:** the content of assistant text, cards, the 확인한 출처 line, the chips, and the composer's outer box all start at x = 16 inside the thread. The right edges end 16 px from the thread's right border. User bubbles align to that right edge.
- Fix it in `ui.css` with selectors scoped under `.ui-chat-thread` that reach the actual padded elements (the list's inner wrapper, the ghost bubble's horizontal padding, the composer wrapper).
- Use tokens; no raw px.
- Do not change Astryx package files.

### 2. Korean breaks mid-word in the thread
- **Where:** "…B는 출근 편도 평 / 균 5분이었어요" (assistant bubble) and "…19:09에 출발했 / 다" (diary row text).
- **Cause:** `#ui-root` sets `word-break: keep-all`, but something on the bubble/text path overrides it. Check the computed style of the bubble text and the `.ui-result-text` / row-link text.
- **Fix:** `.ui-chat-thread` and everything inside it uses `word-break: keep-all; overflow-wrap: anywhere` (anywhere only for long unbroken strings). Set it on the bubble and row-link text selectors explicitly if the Astryx rule wins on specificity.

### 3. Citations overlap each other (English, 390 px)
- **Where:** under "Sources checked": "Zillow ZORI", "OpenStreetMap (Northern California extract, Geofabrik)", "USGS". The long one wraps to two lines and its lines are drawn over the line above. The text is clipped: the Citation keeps a fixed height or line-height while 31a set `white-space: normal`.
- **Fix:** `.ui-cites` citations get `height: auto`, normal line-height (`--ds-lh-tight` or body), and `align-items: flex-start`. A wrapped citation pushes the next one down. Each citation is its own line when the label wraps, and nothing overlaps.

### 4. The last reply is cut off
- **Where:**
  - KO live after "살아 봐 줘": the final assistant line ends "…5분으로 기록되었" at the bottom edge of the message list, with the rest below the fold;
  - EN replay (390 px): "Finished living there. A 10 Coleman Place: average one-way" is cut under the "Try it yourself" row.
- **Cause:** the list scrolls to the bottom when a message is added, but not when the last message grows afterwards (streaming text, cards finishing, the replay-done row appearing). See `scrollTop = list.scrollHeight` (~chat.jsx 307) and `chipsVisible`.
- **Fix:** while the reader is at the bottom (within the existing `chipsVisible` 160 px threshold), keep the list pinned to the bottom when its content height changes. Use a `ResizeObserver` on the list content, or re-run the existing scroll after each message update and after the replay-done row mounts.
  - If the reader has scrolled up, do not move them.
  - Respect `prefers-reduced-motion` the way the file already does.

### 5. A 31a leftover: "추정" counted twice
- **Failing test:** `tests/chatmap-18.test.js` "shows 추정 once on the pre-run commute line" (2 !== 1).
- **Cause:** 31a made `RowSourceTag` (`web/src/ui/candidate-card.jsx` ~257) render `<SourceDot>`. `SourceDot` puts the word both in a `title` attribute and as visible text.
- **Fix:** when the word is visible, the `title` is redundant. Remove the `title` from `SourceDot`; keep the dot `aria-hidden` and the visible text. Do not change the test.

### 6. A 31b leftover: the lifted map credit covers the zoom group
- **Where:** at 1440 × 900 with the pick tray showing, 31b lifts the map credit ("지도 © 국토교통부 … · © OpenStreetMap contributors" / "Map: USGS The National Map") above the tray. It now sits on top of the zoom group, and covers "맞추기" (KO and EN).
- **Fix:** put the zoom group and the credit in one right-side column (flex column, end-aligned, gap 8 px): zoom group on top, credit under it. The whole column sits 16 px above the tray when the tray shows, and 12 px above the bottom when it does not. Nothing in the column overlaps the tray or the other.
- This touches `chatmap.jsx` markup for the two pieces and the `.ui-chatmap-zoom` / credit / `.ui-float` rules in `ui.css` only.

## Files
- `web/src/ui/ui.css`, only the thread rules: `.ui-chat*`, `.ui-cite*`, `.ui-result*`, `.ui-row*` / whatever 31a named the row link.
- `web/src/ui/chat.jsx`: only the scroll-pinning code.
- `web/src/ui/consult.jsx`: only if the citation markup must change.
- `web/src/ui/candidate-card.jsx`: only `SourceDot` (item 5).
- `web/src/ui/chatmap.jsx` and the zoom/credit rules: only item 6.
- The new test.

## Test — `web/tests/thread-edge-31d.test.js`
- **`ui.css`:**
  - a `.ui-chat-thread`-scoped rule zeroes or sets to `--ds-s-16` the horizontal padding of the message list's inner wrapper and of ghost bubbles;
  - the composer wrapper rule uses `--ds-s-16`;
  - `.ui-chat-thread` (or its bubble/text selectors) sets `word-break: keep-all`;
  - the `.ui-cites` citation rule sets `height: auto`;
  - no `ellipsis`.
- **Exported scroll helper** (e.g. `shouldPinToBottom(prevAtBottom, scrollTop, scrollHeight, clientHeight)`, or reuse `chipsVisible`):
  - pinned when the reader was at the bottom and the content grew;
  - not pinned when the reader had scrolled up more than 160 px.
- **Keep green:** `tests/chat-hierarchy-31a.test.js`, `tests/map-tray-31b.test.js`, and every test file that mentions `chipsVisible`, `ui-cite`, `Citation`, `ui-chat-chips` or `scrollHeight`.

Run only:
```
cd web && node --test tests/thread-edge-31d.test.js tests/chat-hierarchy-31a.test.js tests/map-tray-31b.test.js tests/chatmap-18.test.js $(grep -lE "chipsVisible|ui-cite|Citation|ui-chat-chips|scrollHeight" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
**Run the tests before you finish.** If they still fail after 2 fix attempts, stop and print the last lines. The orchestrator measures the edges again in a real browser.

## Do not touch
`PicksTray`, `StageArea`, `.ui-picks*`, chatmap.jsx and map CSS beyond item 6, `landing-page.jsx`, `.ds-lp-*`, `src/engine/**`, `src/i18n/**`, `src/consult/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Nothing else.
