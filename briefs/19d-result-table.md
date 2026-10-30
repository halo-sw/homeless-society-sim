# Stage 19d — The 30-day result as an A | B table (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Touch only these, plus a new test:
- `ResultSummary` and the done branch of `SimulationCard` in `web/src/ui/chat.jsx` (about lines 362-547);
- a new block of `.ui-result*` rules at the end of `web/src/ui/ui.css`.

First edit within 4 tool calls. Commit, then stop.

## Why
The result card is a wall of same-weight lines. At 1440×900 it reads:
```
30일 살아 보기 결과 예시
A 천사의도시II오피스텔 · B 시그마 3 — 같은 식구가 30일 산 결과예요. 어느 쪽이 나은지는 고객님이 정하세요.
내 기준 점수
A 천사의도시II오피스텔 44점
B 시그마 3 56점
아직 비중을 안 정해서 모두 보통으로 계산했어요
월 주거비 (보증금 기회비용·관리비·교통비)
A 월 주거비 월 66만 8,200 원 (전세)
어떻게 계산했나요?  ▾
B 월 주거비 월 64만 1,534 원 (전세)
어떻게 계산했나요?  ▾
출퇴근 편도 (문 앞→회사, 30일 살아 보기)
A 11분 · B 14분
B가 편도 평균 4분 더 걸려요
살아 보니
3일차 17:48 A — 장보기 A 7번 vs B 3번
…
[A 3D에서 보기] [B 3D에서 보기]
```
To compare, the eye has to jump between lines.

## Target
```
30일 살아 보기 결과                                  [예시]
같은 식구가 두 집에서 30일씩 살아 봤어요. 고르는 건 고객님 몫이에요.

               (A) 천사의도시Ⅱ…     (B) 시그마 3
내 기준 점수     44점  ▓▓▓▓░░        56점  ▓▓▓▓▓░
월 주거비        월 66만 8천 원        월 64만 2천 원
출퇴근 편도       11분                 14분
                B가 편도 평균 4분 더 걸려요
─────────────────────────────────────────────────
살아 보니
 3일차 17:48 (A) 장보기 7번 — B는 3번              [3D로 보기 →]
 1일차 07:49 (B) 가장 오래 걸린 날 출근 13분          [3D로 보기 →]
▸ 어떻게 계산했나요   ▸ 자세히 보기
```

### 1. Grid — `ResultSummary`
- `div.ui-result-grid` with `grid-template-columns: minmax(84px, auto) 1fr 1fr`, column gap 12, row gap 10, numerals `font-variant-numeric: tabular-nums`.

**Header row:**
- empty cell;
- for each home, a letter disc (20 px, ink background; same disc as 19c), then the name.
- Name: 13 px, weight 600, wrapping (`word-break: keep-all; overflow-wrap: anywhere`). **Never** `text-overflow: ellipsis` — `web/tests/compare-tabs.test.js:62` forbids it in `ui.css`.

**Row labels:** 12 px, `--ui-ink2`.

**Values:** 16 px, weight 600.

**Rows, in this order:**
1. **내 기준 점수.** "44점" plus a 48×4 px bar (filled to `score`%, `--ui-ink`) under it. Neutral colour for both homes; never green/red.
   - Under the grid row, span all 3 columns with `scored.caption` in 12 px supporting text.
   - When `!scored.ok`, the row is omitted.
2. **월 주거비.**
   - Value: `fmtWonShort(mh.monthly)` → "월 66만 8천 원" (round to thousands, 만/천 units). Add `fmtWonShort` to `web/src/money/format.js` with tests.
   - The full value stays in `title`.
   - When `mh.missing`, the cell reads "계산 전" in supporting text.
3. **출퇴근 편도.**
   - Value: `fmtMinutes(one_way[l])`.
   - Below it, span all 3 columns with the delta line in supporting text, as today.
   - Use the old member fallback (`commuteOneWayOf`) only when `one_way` is missing: one row per member.

**"어떻게 계산했나요".** One `details.ui-section` at the bottom of the card. It holds the two `HowCalculated` blocks for A and B, each headed by its letter disc.

### 2. Moments — `SimulationCard` done branch
- Merge the moment texts and the moment buttons into one list.
- Each row:
  - `when_ko` (12 px, `--ui-ink2`, tabular);
  - the letter disc;
  - `text_ko`;
  - a ghost `Button size="sm"` "3D로 보기 →", which opens the same `simMomentUrl` as the old buttons.
- Matching: a `moments[i]` with the same `label`. If there is no match, there is no button.
- Delete the old `HStack` of "A 3D에서 보기" buttons.
- Keep `data.extraLine`.

### 3. Header
- Title, with an "예시" chip when `example` (11 px, `--ui-sunken`).
- One subtitle line: "같은 식구가 두 집에서 30일씩 살아 봤어요. 고르는 건 고객님 몫이에요."
- Keep the "기록된 답변" chip when `data.recorded`.
- "자세히 보기" (the `CompareTabBody` disclosure) stays, after "어떻게 계산했나요".

### 4. Unchanged
No winner wording, no sorting, no highlight colour on the "better" home. The share card is separate and is not touched.

## Tests — `web/tests/result-table-19d.test.js`
Use the done-state fixture from `web/tests/chat-render-18c.test.js` (`doneCompare` and friends).
- (a) `fmtWonShort`:
  - 668200 → "월 66만 8천 원"
  - 641534 → "월 64만 2천 원"
  - 1200000 → "월 120만 원"
  - 0 → "월 0 원"
- (b) The rendered `SimulationCard` contains `ui-result-grid`, "내 기준 점수", "월 주거비" and "출퇴근 편도", each exactly once.
- (c) It contains "3D로 보기" once per moment that has a matching label, and no "3D에서 보기".
- (d) It contains no "더 나아요", "추천" or "승".
- (e) The scores render as "44점" and "56점" for the fixture (or whatever the fixture yields; assert both appear in A, B order).

Run:
```
cd web && node --test tests/result-table-19d.test.js tests/chat-render-18c.test.js tests/flow-18.test.js tests/result*.test.js 2>&1 | tail -12
```
Update older pins on the removed line formats and name them in the commit body.

Commit `19d: result card as an A|B table, moments with inline 3D links`. Then stop.
