# Stage 24d — English mode: units read as English, the language sticks (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found on the GPU (English flow, landing sentence → 6 candidates → pick 2 → result → 3D)
- Number + Korean unit pieces are romanized instead of translated:
  - "23점" → "23jeom", which should be "23 pts";
  - "1일차" → "1 Daycha", which should be "Day 1";
  - "176시간" → "176sigan", which should be "176 h";
  - "2015년" → "2015nyeon", which should be "2015";
  - "월 100만 7천 원"-style amounts → "₩1M7cheon won";
  - "11/2 (월)" → "11/2 (monthly)": `(월)` here is Monday.
- The landing page sends the sentence to `?chat=…` without `lang`, so the chat opens in Korean even though the user started in English. It only stays English after pressing the toggle, because that stores it.

## Change
1. **`web/src/i18n/lang.js`**: `currentLang()` stores the query value (`en`/`ko`) in `localStorage` (try/catch) whenever `?lang=` is present. In-app links then keep the language. Leave `detectLang` pure.
2. **`web/src/i18n/translate.js` `localizeNumbers`**: add these rules, applied with global regexes before the existing 분/일/개월 rules, so that `일차` wins over `일`:
   - `(\d+)일차` → `Day $1`;
   - `(\d+(?:\.\d+)?)\s*시간` → `$1 h`;
   - `(\d+)점` → `$1 pts` (only when not followed by Hangul, so `점심` is untouched: use `(?![가-힣])`);
   - `(\d{4})년` → `$1`, and other `(\d+)년` → `$1 yr`;
   - `(\d+)위` → `#$1`;
   - `(\d+)곳` → `$1 places`;
   - `(\d+)층` → `floor $1`;
   - `(\d+)호` → `No. $1`;
   - `(\d+)동(?![가-힣])` → `Bldg $1`;
   - `(\d+)회` → `$1 times`;
   - `(\d+)세(?![가-힣])` → `age $1`;
   - `(\d+)가지` → `$1`;
   - `(\d+)대(?![가-힣])` → `$1s` (an age band, e.g. `30대` → `30s`).
   - Money with 천: `(\d+)억\s*(\d[\d,]*)만\s*(\d+)천\s*원?`, `(\d[\d,]*)만\s*(\d+)천\s*원?`, `(\d+)천\s*만\s*원?` (= ×10M) and `(\d+)천\s*원` (= ×1,000) all become one `₩` amount. Format: `₩1.07M` style for ≥ 1M (up to 2 decimals, trailing zeros trimmed), `₩17,000` below 1M. Keep the existing 억/만 outputs unchanged for the cases already tested.
   - Weekday in parentheses: `\((월|화|수|목|금|토|일)\)` → `(Mon)` … `(Sun)`.
3. **`web/src/i18n/translate.js` `wordFallback`**: run `localizeNumbers` on each token too, so a token like `176시간` that survived the whole-string pass becomes `176 h`.

## Test — `web/tests/i18n-24d.test.js`
- `localizeNumbers`:
  - `23점` → `23 pts`;
  - `점심` unchanged;
  - `1일차 08:02` → `Day 1 08:02`;
  - `176시간` → `176 h`;
  - `2015년` → `2015`;
  - `3년` → `3 yr`;
  - `11/2 (월)` → `11/2 (Mon)`;
  - `1만 7천 원` → `₩17,000`;
  - `100만 7천 원` → `₩1.01M` (1,007,000 → two decimals);
  - `5천만 원` → `₩50M`;
  - `30대` → `30s`;
  - `101동` → `Bldg 101`.
- With the real table: `createTranslator({ ...await import("../src/i18n/en.js"), words: WORDS })`. The fallback output for `2일차 18:00 B 저녁에 집 A 176시간 vs B 177시간` contains `Day 2` and `176 h`, and no `sigan`.
- `currentLang` stores `?lang=en`: use a fake `window` with `location.search` and a `localStorage` stub, if the module allows injection. Otherwise test a small exported helper `persistLangParam(search, storage)`.
- Keep `tests/i18n-24a.test.js` and `tests/i18n-24c.test.js` green.

Run only:
```
cd web && node --test tests/i18n-24d.test.js tests/i18n-24a.test.js tests/i18n-24c.test.js 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`web/src/i18n/en.js`, `web/src/i18n/en-table.js`, `web/src/i18n/en-words.js` (content), and anything outside `web/src/i18n/` and `web/tests/`.

## Final message
Changed files, one line each. Nothing else.
