# Stage 29a2 — Candidate list that informs (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Outside review of the candidate list (English UI, `맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상`) plus the orchestrator's reproduction after 29a1b:
- **Commute line broken by the 29a1 pattern.** English rows read `about 9 walk to 11 min · Yangjae Stn min to Gangnam Estimate`. Korean source: `강남까지 약 11분 · 양재역 걸어서 9분` (`commuteRowLine`, `web/src/ui/candidate-card.jsx:85-112`). The pattern `{0}까지 약 {1}분` (`web/src/i18n/en-table.js:1324`) matches across the `·`, so `{1}` swallows `11분 · 양재역 걸어서 9`.
- **"Within budget" on every card** carries no information (`factsFor`, `candidate-card.jsx:139-150`). Show the difference to the budget instead.
- **Every `Pick` is a black filled button** (`candidate-card.jsx:265-268`, `:368-371`): six equal black buttons scatter attention, and nothing says how many are picked.
- **Commute wording differs per card** ("Same station as workplace · no subway ride", "about … · … walk …", an `Estimate` badge on only some). One shape is needed: total minutes first, detail after.
- **"Not the real look" / aerial notices repeat on every card** (`Aerial photo` label per thumb + a credit line); thumbnails of the painted 3D look alike.
- **Units**: condition says `59㎡`, the review saw `m²` and `㎡` mixed. Use `㎡` everywhere in both languages.
- **`6 of 177`**: no way to see more.
- The rules-path system line `Muse 답이 늦어서 이번엔 규칙으로 답했어요. 다시 말하면 Muse가 이어받아요` (27j, `grep -n "Muse가 이어받아요" web/src/ui/chat.jsx`) and `Muse 연결이 계속 안 돼서 규칙으로 이어 갈게요` stay Korean in English mode (missing from the phrase table).

## Change

### 1. Commute line — `candidate-card.jsx:85-112` and `en-table.js:1324`
- Korean row shape: `총 {total}분 · {station}역 걸어서 {w}분 + 지하철 {ride}분` when both are known; `총 {w}분 · {station}역 걸어서` when same station / walk only; `도보 미확인` otherwise. Keep the `estimate` flag; the source tag (`추정`/`공식`/`내가 말한 값`) is shown on **every** row the same way (small `SourceTag`, the same component the row already uses for `추정`), not only on some.
- English: add exact patterns for the new shapes (`Total {0} min · {1} Stn walk {2} min + subway {3} min` …). Make the old `{0}까지 약 {1}분` pattern safe: its `{1}` must match digits only (follow how en-table marks numeric slots; `grep -n "\\\\d" web/src/i18n/translate.js` for the matcher). Keep `commuteShortLine` consistent.

### 2. Budget difference instead of "Within budget" — `factsFor` (`candidate-card.jsx:139-150`)
When the profile has a budget for the shown tenure and the row price is a median: `예산보다 {diff} 적어요` / `예산보다 {diff} 많아요` with `diff` in 억/만 Korean money (`fmtWon`, e.g. `1억 1,220만`), English `₩112.2M under budget` / `over budget`. Fall back to the current wording only when there is no budget. Thread the budget from the profile into `CandidateCard` (find where `CandidateCard` is rendered in `chat.jsx`, pass `budgetWon`).

### 3. Pick buttons and a counter
- `Pick`/`담기` default: `variant="secondary"` (outlined); picked: `variant="primary"` with `담음 ✓`. Give each an `aria-label` that names the home (`${name} 담기` / `Pick ${gloss or name}`).
- In the list header (the `집 후보 n곳` row), add a counter `2곳 중 {n}곳 담음` (`{n} of 2 picked`), from the picks length.

### 4. Notices once
- Remove the per-thumb `항공사진` label and the per-card notice; keep **one** line at the top of the list: `사진은 항공사진·3D 미리보기예요(실제 매물 사진 아님) · 항공사진 © 국토교통부 공간정보 오픈플랫폼(VWorld)` (move the existing credit line there). Thumbnails keep an `alt` with the home name only.

### 5. Units and more
- Replace `m²` with `㎡` in displayed strings (`grep -rn "m²" web/src --include=*.js --include=*.jsx` excluding tests).
- Under the list, when `total > shown`: a ghost button `다른 후보 6곳 더 보기` (`Show 6 more`) that sends the chat message `다른 후보 더 보여 줘` through the same path as a suggestion chip. Find the `조건에 맞는 집 {total}곳 중 {n}곳` line (`grep -n "중 \${" web/src/ui/chat.jsx web/src/ui/candidate-card.jsx`).

### 6. Rules-path lines in English — `web/src/i18n/en.js`
Add both 27j system lines and the four `localNoAnswerLine` answers (`chat.jsx`, `grep -n "export function localNoAnswerLine" -A8`) to the seed phrase table.

## Test — new `web/tests/results-list-29a2.test.js`
- `commuteRowLine` for a fixture with walk 9 (양재) + ride 11 → Korean `총 20분 · 양재역 걸어서 9분 + 지하철 11분`; the English translation contains `Total 20 min` and `Yangjae` and not `9 walk to`.
- The old pattern with input `강남까지 약 11분 · 양재역 걸어서 9분` never yields `walk to 11`.
- `factsFor`/rendered card with budget 4억 and median 2억 8,780만 → contains `예산보다 1억 1,220만 적어요`; without budget → `예산 안`.
- SSR render of a 3-row list: one notice line, no per-row `항공사진`, Pick buttons have `aria-label`, counter `2곳 중 0곳 담음`.
- en.js contains `Muse가 이어받아요`.

Run only:
```
cd web && node --test tests/results-list-29a2.test.js tests/english-trust-29a1.test.js tests/walkthrough-27f.test.js tests/chat-layout-19a.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
If an older test pins a removed string (`예산 안` on every row, `항공사진` per row, the old commute wording), update only that pin (`grep -rln "항공사진\|예산 안\|까지 약" web/tests`).

## Do not touch
Landing files, map / 3D / engine files, `web/src/i18n/dom.js`.

## Final message
Changed files, one line each. Nothing else.
