# Stage 31a — chat thread: one left edge, one spacing scale, only real buttons look like buttons, result card reads top-down (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md` (Astryx conventions: component props first, then tokens, no raw hex/px). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Real captures at 1440 × 900 and 390 × 844 (Korean and English, live and replay `?replay=seoul-couple`).

### Spacing
- **Five different left edges** in the chat column today:
  - composer x=8;
  - suggestion chips x=12;
  - plain assistant text x=28;
  - cards x=46, card content x=58.
- **Why the cards sit further right:** the card messages get `avatar={<span className="ui-mark" />}` (`web/src/ui/chat.jsx` ~971, ~998). That draws a grey 12 px dot left of every card and pushes the card 18 px right. The dot carries no meaning; on phones it reads like a radio button.
- **Inner padding varies:** cards use `<Card padding={3}>` (12 px). Rows inside use mixed gaps (2, 4, 6, 8 px).

### Things that look like buttons but are not
- **`ui-tag` pills** in 고객님 상황 (`ProfileCard`, chat.jsx ~166): "1인", "판교 출근", "전세 3억 이하" are beige rounded pills. They are not clickable, but they look exactly like the suggestion chips that are.
- **공식 / 추정 / 실측 / 가정값 tags** on the candidate rows and result rows are small bordered pills. They are status, not actions.

### Buttons that are hard to see or too many
- **Result card: 9 identical ghost buttons.** It has 7 × "장면 보기" (one per diary line, chat.jsx ~582) plus 2 × "3D로 보기 →" (~783). The row text wraps to two lines next to each of them, so times, text and buttons do not line up.
- **Candidate list header** (`CandidatesCard`, ~410–425):
  - the sort menu and "지도에서 보기" are ghost buttons that look like plain text and sit indented from the title;
  - with 0 homes they still show, next to "0 of 0 matching homes".
- **Hit targets:** "확인한 것 N가지" is 17 px tall. On phones the chips are 28 px tall.

### Hierarchy
- **Result card order is detail-first.** After the title it shows:
  1. Muse's diary summary;
  2. 7–8 diary lines with buttons;
  3. only then the A/B comparison (점수, 월 주거비, 출퇴근 편도), which is the part that answers the question;
  4. then 살아 보니, 어떻게 계산했나요, 자세히 보기.
- **Section labels look like body text.** "살아 본 일기" and "살아 보니" are plain 14 px / 400.
- **Too many type sizes in the thread:** 10, 11, 12, 13, 14, 15 and 16 px, in mixed weights. Card titles (Heading level 4) and the A/B home names are the same weight as the disclosure labels.

## The rules (apply them in the files listed under Change)

### Spacing (Astryx steps; 1 step = 4 px)
- **One left edge.** Plain assistant text, every card, the 확인한 출처 line, the suggestion chips and the composer all start at the same x. That is the message list's own padding: 16 px on desktop, and 16 px at ≤ 480 px too.
- **Remove the `ui-mark` avatar** from both `ChatMessage` calls, so cards take the full message width.
- **Cards:** `<Card>` uses the theme's padding (omit `padding`) or `padding={4}`, the same for every card in the thread. Inside a card:
  - sections are separated by `gap={3}`;
  - rows within a section by `gap={2}`;
  - a label and its value by `gap={1}`.

### Type: four levels in the thread, nothing else
| Level | Size / weight | Used for |
|---|---|---|
| Card title | 16 / 700 | — |
| Key number | 20 / 700, tabular | 점수, 월 주거비, 출퇴근 편도 values |
| Body | 14 / 400 | — |
| Body strong | 14 / 600 | Home names, section labels |
| Meta | 12 / 400, `--ds-ink-2` | — |

Use `Heading`/`Text` props where they give these; otherwise `--ds-t-*` / `--ds-w-*` tokens. No 10, 11, 13 or 15 px left in thread rules.

### Buttons: three looks only
| Look | Size | Where |
|---|---|---|
| **Primary** (filled) | — | At most one per card. |
| **Secondary** (outlined / sunken) | — | Suggestion chips, 담기, 더 보기, the profile missing-value asks (`CHIP_SHORT` buttons), the sort menu, 지도에서 보기. |
| **Row link** | Whole row clickable, hover background, a trailing `›` | Diary lines and 살아 보니 lines open their scene with one click on the row. Each row is a single `<button type="button">` (or `role="button"` + `tabIndex=0` + Enter/Space) with an `aria-label` naming the scene. |

- Minimum hit area: 32 px tall on desktop and 40 px at ≤ 480 px (use `min-height`, not bigger text).
- The "확인한 것 N가지" trigger and the details summaries get at least 32 px.

### Not clickable → must not look clickable
- `ui-tag` (profile facts) becomes one plain line of body text joined with ` · ` ("1인 · 판교 출근 · 전세 3억 원 이하"). No background, no border, no radius.
- 공식 / 추정 / 실측 / 가정값 / 내가 말한 값 become plain meta text with the existing coloured dot (`SourceDot` already has the dot). No pill border or background.
- Citation chips under 확인한 출처 **are** links. Keep them, styled as text links: underline on hover, no pill border.

## Change
1. **`web/src/ui/chat.jsx`**
   - Remove both `ui-mark` avatars.
   - **`ProfileCard`:** the tags become the single joined line.
   - **`CandidatesCard`:**
     - the title row is `집 후보 N곳` (card title) plus `2곳 중 N곳 담음` (meta);
     - the sort menu and 지도에서 보기 move to their own row under it, as secondary small buttons, left-aligned with the title;
     - both are hidden when `candidates.length === 0`.
   - **`ResultSummary` / the done `SimulationCard`, reordered top-down:**
     1. title row (unchanged text) + the one supporting sentence;
     2. the A/B compare grid (names, 내 기준 점수 with bar, 월 주거비, 출퇴근 편도, the A/B difference note). Values use the Key number level; the row labels use Meta;
     3. **살아 보니** (section label, Body strong), rows as row links;
     4. **살아 본 일기** (section label): Muse's summary line, then the first 3 lines as row links, then a secondary small button `일기 N줄 모두 보기` that reveals the rest in place, then the `✓ 문장 …` check line (Meta);
     5. 어떻게 계산했나요 and 자세히 보기 disclosures, unchanged.
   - **Row link layout** (one grid for both kinds): `[A/B disc 22px] [when, Meta, no wrap] [text, Body, wraps] [›]`. Text wraps under itself, never under the disc. Keep the existing `onScene` URL and title exactly.
   - Remove the "장면 보기" / "3D로 보기 →" buttons. Keep their Korean strings only as the row `aria-label` prefix: `장면 보기: {when} · {home}`.
2. **`web/src/ui/candidate-card.jsx`:** source tags as plain meta text plus dot. Card layout otherwise unchanged; the 담기 button stays secondary.
3. **`web/src/ui/consult.jsx`:** the citation row aligns to the same left edge; citations are text links.
4. **`web/src/ui/ui.css`:** only the thread rules: `.ui-chat*`, `.ui-tag*`, `.ui-result*`, `.ui-cite*`, `.ui-src*`, `.ui-cand*`, `.ui-section*`, `.ui-mark`.
   - Delete rules that become unused.
   - No raw hex; use tokens.
   - No `text-overflow: ellipsis`.
   - Do **not** touch `.ds-lp-*`, `.ui-picks*`, `.ui-stage*`, `.ui-chatmap*`, `.ui-legend*`, `.ui-side-panel`: other stages own them.

Keep every Korean string that still shows exactly as it is. New strings, list them in the final message:
- `일기 {n}줄 모두 보기`;
- the `장면 보기: …` aria prefix.

## Test — `web/tests/chat-hierarchy-31a.test.js`
- **Source:** chat.jsx has no `ui-mark` and no `label="장면 보기"` / `label="3D로 보기 →"` buttons.
- **SSR `ProfileCard`** with three said facts: no `ui-tag` element; one text node joined with ` · `.
- **SSR `CandidatesCard`:**
  - with 0 candidates, no sort menu and no 지도에서 보기;
  - with 2 candidates, both are present.
- **SSR the done `SimulationCard`** with a fixture holding diary lines (≥ 5), texts (2) and compare. Use an existing fixture if one exists (`grep -ln "SimulationCard\|ResultSummary" tests/*.test.js`).
  - **Order in the HTML:** compare grid (`내 기준 점수` or `월 주거비`) comes before `살아 보니`, which comes before `살아 본 일기`.
  - **Diary:** exactly 3 diary row links before the `일기 N줄 모두 보기` button.
  - **Row links:** each row link is a button with an `aria-label` starting `장면 보기:`.
- **CSS** (`ui.css` thread rules only): no `font-size` of 10, 11, 13 or 15 px; no `ellipsis`.
- **Keep green:** every test file that mentions `SimulationCard`, `ResultSummary`, `CandidatesCard`, `ProfileCard`, `diaryCheckLine`, `momentRowUrl`, `Citation` or `ui-result`. Update source-pin tests that pinned the removed buttons or the old order, and say which ones in the final message.

Run only:
```
cd web && node --test tests/chat-hierarchy-31a.test.js $(grep -lE "SimulationCard|ResultSummary|CandidatesCard|ProfileCard|diaryCheckLine|momentRowUrl|Citation|ui-result|ui-mark|장면 보기" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks it in a real browser at 1440 px and 390 px.

## Do not touch
`PicksTray` and everything below it in chat.jsx, `chatmap.jsx`, `app.jsx`, `landing-page.jsx`, `src/engine/**`, `src/i18n/**`, `src/consult/**`, `relay/**`, `pipeline/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Then new Korean strings, and test files you updated. Nothing else.
