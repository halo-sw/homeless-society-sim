# Stage 19c — Candidate cards a customer can scan (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Touch only:
- `web/src/ui/candidate-card.jsx`
- the `.ui-cand*` rules in `web/src/ui/ui.css` (around lines 462-499)
- the candidate loop in `CandidatesCard` in `web/src/ui/chat.jsx`
- a new test

First edit within 4 tool calls. Commit, then stop.

## 0. Two pins 19a broke (fix first, commit separately as `19a2: …`)
- `web/tests/compare-tabs.test.js:62` forbids `text-overflow: ellipsis` anywhere in `ui.css` (a standing product rule: labels are never cut). 19a added `.ui-pick-name { max-width:160px; overflow:hidden; text-overflow:ellipsis }` (`ui.css:590`). Make the tray name wrap instead (`max-width: 180px; overflow-wrap: anywhere; word-break: keep-all`), no ellipsis, no line clamp.
- `web/tests/chat-scroll-13e2.test.js` "stage never scrolls, drawer keeps its own scroll" looks for `.ui-chat-drawer`. Point it at `.ui-side-panel` (`ui.css:595`) with `overflow-y: auto`.
- Run `node --test tests/compare-tabs.test.js tests/chat-scroll-13e2.test.js tests/chat-layout-19a.test.js`.

**The same no-ellipsis rule applies to everything below:** wherever this brief says "ellipsis" or "one line", let the text wrap (`word-break: keep-all; overflow-wrap: anywhere`) instead.

## Why
In the 480 px chat column each candidate is a tall card (4:3 photo, then a 28 px price). Six candidates take six screens of scrolling. At 1440×900 the card reads:
```
전세 1억 7,700만 원 실거래 중간값
· 7건                                  ← the sub-label wraps under the price
오피스텔 · 30m² · 2003년 · 예산 안 ✓
시그마 3
야탑 도보 3.8분
판교까지 약 12.3분 (걷기 3.8분 · 지하철 8.5분) · 추정 (살아 보기 전)
3D 가능 · 실거래 7건                    ← "실거래 7건" twice
[담김 ✓ · 빼기] [전세 점검] [자세히]
[어떻게 계산했나요 ▽]
```
The order is price → facts → name, so the eye cannot find which home it is. Minutes have decimals. Numbers on the map pins (1–6) do not appear on the cards.

## New `CandidateCard` — two variants
Add a `variant` prop: `"row"` (default, used in the chat list) and `"full"` (used in 19a's `SidePanel` detail; pass `variant="full"` there).

### `row` — a list row, about 112 px tall
```
┌──────────┬──────────────────────────────────────────────┐
│          │ (2) 시그마 3                         [ 담기 ] │
│  thumb   │ 전세 1억 7,700만 원                            │
│  96×96   │ 오피스텔 · 30㎡ · 2003년 · 예산 안              │
│  r 10    │ 판교까지 약 12분 · 야탑역 걸어서 4분  [추정]      │
└──────────┴──────────────────────────────────────────────┘
```

**Number disc.** `(2)` is a 20 px disc with the map pin number (`index + 1`).
- When picked, it shows the pick letter (A, B, … in `picks` order) on the accent `#2f6fed` background.
- The card gets a 2 px accent outline. Remove the inline outline style at `chat.jsx:291-292`; `highlightId` adds the class `is-hi` instead (1 px accent outline plus a light `#eef3fe` background).

**Line 1.** The name is 15 px, weight 600, on one line with an ellipsis. The 담기 button sits on the right:
- `size="sm"`.
- `variant` is `"primary"` with label "담기" when not picked.
- `variant` is `"secondary"` with label "담음 ✓" when picked. Clicking it toggles.

**Line 2.** The price is 15 px, weight 600, from `tenurePriceLine(...).price`. Drop the sub-label in the row. The deal count moves to `full`, and its `title` tooltip keeps the range.

**Line 3.** Facts, 12 px, `--ui-ink2`. Write "예산 안" with no ✓ glyph.

**Line 4.** The commute, 12 px.
- Text: `${dest}까지 약 ${Math.round(total)}분 · ${station}역 걸어서 ${Math.round(walk)}분`. For walks under 1 minute, write "1분 이내".
- Then a small grey chip "추정" (11 px, `--ui-sunken` background, radius 6, padding 1px 6px) when the source is an estimate.
- Add `commuteRowLine(candidate, destName)` → `{ text, estimate: boolean }` in `candidate-card.jsx`. Keep `commuteShortLine` unchanged for other callers.

**The whole row is clickable.** It calls `onDetail(candidate)`, which opens the side panel (19a). The 담기 button calls `stopPropagation`. The row has `role="button"`, `tabIndex=0`, and Enter opens it.

**Thumbnail.** Same source priority as today: complex photo → `SceneThumb` → `MiniMap`. Size 96×96, `object-fit: cover`, radius 10.
- No photo strip, no credit line and no slide buttons in the row. Put the credit in the `img` `title`.

**`readinessNote`** (`chat.jsx:298-300`) becomes a line 5 in supporting text, prefixed "살아 보기 불가 · ", only when present.

### `full` — the detail panel
Today's card, reordered:
1. photo (16:9)
2. name (18 px / 600) with the dong under it
3. price (24 px / 600), with "실거래 중간값 · 7건" on its own line in 12 px `--ui-ink2`
4. facts
5. commute (the row text plus "걷기 4분 · 지하철 9분" in supporting)
6. the photo strip with credits
7. actions: 담기 / 담음 ✓ (primary or secondary), 전세 점검 (secondary)
8. "어떻게 계산했나요" as a `details.ui-section` disclosure

Drop the "자세히" button in `full`. Drop the duplicate "실거래 N건" badge.

## Chat list — `chat.jsx:280-303`
- Render rows with `variant="row"` in a `div.ui-cand-list` (flex column, gap 8).
- Above the list:
  - keep the "조건에 맞는 집 N곳 중 6곳 보여드려요" line;
  - shorten it to `조건에 맞는 집 ${n}곳 중 ${k}곳 · ${sort_note}`.
- Pass `pickLetter` to each row: `"A"`, `"B"` from the index in `picks`, else `null`.

## Tests — `web/tests/candidate-row-19c.test.js`
Render with the `readyCandidate` fixture pattern from `web/tests/chat-render-18c.test.js`.
- (a) A row renders the name before the price in document order, has no "실거래 중간값", and has no "." inside a minutes value (regex `/\d+\.\d+분/` must not match).
- (b) `commuteRowLine` for walk 3.8 + ride 8.5 gives "약 12분" and "걸어서 4분", with `estimate` true for an estimate ride.
- (c) A picked row shows letter "A" and "담음 ✓". An unpicked row shows its number and "담기".
- (d) `full` contains "실거래 중간값", "전세 점검" and "어떻게 계산했나요", and does not contain "자세히".
- (e) `CandidatesCard` with 6 candidates renders 6 `ui-cand-row` elements.

Run:
```
cd web && node --test tests/candidate-row-19c.test.js tests/chat-render-18c.test.js tests/landing-chat-12b.test.js tests/flow-18.test.js tests/chat-layout-19a.test.js 2>&1 | tail -12
```
Update older pins that expect "담김 ✓ · 빼기", "비교에 담기", decimal minutes or "추정 (살아 보기 전)" inside the row. Name each one in the commit body.

Commit `19c: candidate rows — name first, map number/letter, rounded minutes, full card in the side panel`. Then stop.
