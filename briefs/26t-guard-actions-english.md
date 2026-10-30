# Stage 26t — chat-first polish: action turns, deterministic text in English, no cut chips (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no build. Branch `ithaca-17` (chat-27 merged, 26s done). Stop when this part is done.

## Found by the orchestrator (live run, `?lang=en`, desktop 1440×900, dev server with Muse)
Turns: "I work in Pangyo. Find me a jeonse home under 200M won to live alone" → "Save numbers 1 and 3" → "Live in both homes for 30 days".

1. **Action turn rejected by the guard.**
   - On "Save numbers 1 and 3", Muse saved A and B correctly (the pick tray shows both).
   - The reply was then replaced by the numbers-only fallback (`src/consult/guards.js` `numbersOnlyAnswer`): "도구 결과의 수치만 정리합니다 (가정값 포함): - 이번 대화의 도구 결과에 수치가 없어요…".
   - That text is wrong for a save turn. The likely cause: the guard counts the list indices "1" and "3" as numbers that are not in the tool results. Confirm by reading the guard's number check.
2. **Deterministic text shown in Korean in English mode.**
   - (a) The numbers-only fallback above.
   - (b) The diary summary fallback `src/consult/diary.js:121` (`${d.label}는 출근 편도 평균 …분`), shown after "Finished living there.": "A는 출근 편도 평균 11분, B는 출근 편도 평균 14분이었어요."
   - Both are wrapped in `data-no-i18n` (26s `fromModel`), so the phrase table never sees them.
3. **Cut labels at desktop width** (design-system button ellipsis):
   - suggestion chips under the thread: "Show the comm…", "How much a mon…", "Walk the neighborh…";
   - the "3D로 보기 / View in 3D" button in each 살아 보니 moment and diary row: "Vie…", "View in 3…".
4. **Money breaks inside the number** in the result grid: "monthly ₩835, / 000".
5. **`src/i18n/translate.js`:**
   - `wordFallback` splits on `,` inside digits: "₩835,000" → "₩835, 000";
   - `localizeNumbers("월 83만 5,000원")` → "monthly ₩0.8M 5, 000won". The 만 + comma-thousands form is not handled; it should give ₩835,000.

## Change
1. **Guard:**
   - list indices the customer used or the candidate list shows (`1번`, `#1`, `numbers 1 and 3`, `1번이랑 3번`) are allowed numbers when the turn's tools include a pick/save or the candidate list;
   - when a turn's tools are only actions (pick/save, open_panel, start_life_run) and the reply is still rejected, the fallback is a short deterministic confirmation of what was done, not the numbers-only text. Example: `A 천사의도시II오피스텔, B 시그마 3을 찜했어요. "두 집에서 살아 봐 줘"라고 말하면 30일을 살아 봐요.` Build it from the tool results.
2. **Deterministic text stays translatable:**
   - `fromModel` / `data-no-i18n` applies only to text the model wrote;
   - the numbers-only fallback, the action confirmation, the diary fallback summary and the "다 살아 봤어요…" lines are deterministic. Do not mark them;
   - when `lang === "en"`, the diary fallback summary is built in English directly: `A {name}: average one-way commute {v} min; B {name}: {v} min.` Reuse the lang plumbing from 26s.
3. **No cut labels, all widths:**
   - the suggestion chip row and `.ui-chat-chips` children get `flex: none` and the row scrolls sideways (`overflow-x: auto`). The 26m phone rule already does this; make it the base rule;
   - the moment/diary "3D로 보기" buttons get `flex: none`, and the text column takes the shrink (`flex: 1 1 0; min-width: 0`).
4. **Result grid values:** `.ui-result-value` gets `word-break: keep-all; overflow-wrap: normal`, so a number never breaks at its comma.
5. **translate.js:**
   - `wordFallback` keeps digit groups whole (`/\d,\d{3}/` is not a split point);
   - `localizeNumbers` handles `N만 M,MMM원` and `N만 M천 원` the same as today's `N만 원` forms (`83만 5,000원` → `₩835,000`).
   - Pin today's outputs for `전세 2억 원 이하`, `전세 1억 8,500만 원`, `월세 50만 원 이하` and `전세 4억 이하` before you edit; they must not change.

## Test — `web/tests/chatfirst-26t.test.js`
- Guard:
  - an English reply "Saved numbers 1 and 3: A …, B …." with a pick tool result passes;
  - an action-only turn whose reply is rejected yields the confirmation text (contains `찜했어요`), not `도구 결과의 수치만`.
- The diary fallback summary with `lang: "en"` → contains `average one-way commute` and no Hangul; with `ko` → unchanged.
- SSR: a numbers-only fallback message rendered in English mode has no `data-no-i18n`.
- CSS: `.ui-chat-chips > *` has `flex: none` outside any media query; `.ui-result-value` has `word-break: keep-all`; still no `text-overflow: ellipsis`.
- translate:
  - `localizeNumbers("월 83만 5,000원")` contains `₩835,000`;
  - the full translator on `"월 83만 5천 원"` contains `₩835,000` (no `, 000`);
  - the pinned strings above are unchanged.
- Keep green: `tests/english-muse-26s.test.js`, `tests/eok-space-26q.test.js`, `tests/phone-26p.test.js`, `tests/mobile-26m.test.js`, `tests/compare-tabs.test.js`, `tests/chat-scroll-13e2.test.js`, and every `tests/*guard*`, `tests/*diary*`, `tests/*consult*`, `tests/*agent*`, `tests/*i18n*`, `tests/*translate*` file.

Run:
```
cd web && node --test tests/chatfirst-26t.test.js tests/english-muse-26s.test.js tests/eok-space-26q.test.js tests/phone-26p.test.js tests/mobile-26m.test.js tests/compare-tabs.test.js tests/chat-scroll-13e2.test.js $(ls tests | grep -iE 'guard|diary|consult|agent|i18n|translate' | grep -v -e 26s -e 26t | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/en.js`, `src/i18n/en-table.js`, `src/i18n/en-words.js` (the orchestrator's), `pipeline/**`, `relay/**`, `data/`. No `text-overflow: ellipsis`. No keys.

## Final message
Changed files, one line each, and what the guard's number check was rejecting. Nothing else.
