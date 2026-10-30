# Stage 24a — English UI, core (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `i18n-24`. Stop when this part is done.

## Why
The user asked for an English version of the whole app. About 2,500 Korean source lines are spread across 120 files: UI, engine sentences, evidence lines, 3D labels and map pills. Wrapping every string by hand would take many runs. Instead we translate the **rendered** UI.
- A hand-written phrase table (Korean → English) and pattern rules are applied to the DOM text, with a MutationObserver, when the language is English.
- Korean mode is untouched: no observer, no cost.
- The orchestrator writes the phrase table content later. You build the engine, the toggle and a small seed.

## Change

### 1. New `web/src/i18n/lang.js`
- `detectLang({ search = "", stored = null, navLang = "" })`. The `?lang=en|ko` query wins. Next, `stored` (`"en"`/`"ko"`). Otherwise `navLang` starting with `ko` gives `"ko"`, else `"en"`. Empty `navLang` gives `"ko"`.
- `currentLang()` calls `detectLang` with `window.location.search`, `localStorage.getItem("ithaca.lang")` and `navigator.language`. Wrap every storage access in try/catch, and fall back to `"ko"` when there is no `window`.
- `setLang(lang)` stores the value (try/catch), then reloads with the `lang` query param set and every other param kept: `location.assign(...)`.
- `export const LANG = currentLang()`.

### 2. New `web/src/i18n/romanize.js` (pure)
`romanize(text)` turns Hangul into Revised Romanization, syllable by syllable, with the usual initial/medial/final tables.
- Apply the simple assimilation rules:
  - final ㄴ + initial ㄹ, or ㄹ + ㄴ → `ll`;
  - final ㄱ before ㄴ/ㅁ → `ng`;
  - final ㅂ before ㄴ/ㅁ → `m`.
- Capitalise the first letter of each space-separated word.
- Non-Hangul characters pass through.
- `romanizeName(name)`:
  - a trailing `역` becomes ` Stn` (e.g. `잠실역` → `Jamsil Stn`);
  - trailing `동` → `-dong`, `구` → `-gu`, `시` → `-si`;
  - a word in the `NAMES` override map wins. Export `NAMES` with at least 강남 Gangnam, 잠실 Jamsil, 판교 Pangyo, 선릉 Seolleung, 성수 Seongsu, 송파 Songpa, 분당 Bundang, 수지 Suji, 위례 Wirye, 성남 Seongnam, 강동 Gangdong, 정자 Jeongja, 서현 Seohyeon, 삼성 Samseong, 역삼 Yeoksam, 신논현 Sinnonhyeon, 석촌 Seokchon, 문정 Munjeong, 가락 Garak, 오금 Ogeum, 건대입구 Konkuk Univ., 왕십리 Wangsimni, 서울숲 Seoul Forest, 뚝섬 Ttukseom, 미금 Migeum, 동천 Dongcheon, 수내 Sunae, 야탑 Yatap, 모란 Moran, 복정 Bokjeong, 장지 Jangji.

### 3. New `web/src/i18n/translate.js` (pure)
`createTranslator({ phrases = {}, patterns = [] })` returns `{ translate, missing }`.
- `translate(text)`:
  - Return `text` unchanged when it has no Hangul (`/[가-힣]/`).
  - Keep the leading and trailing whitespace and translate the trimmed core.
  - Order:
    1. a cache (`Map`, cleared above 5,000 entries);
    2. exact `phrases[core]`;
    3. `patterns`, in order. Each pattern is `{ ko: "{0}분 남음", en: "{0} min left" }`, compiled once to an anchored regex where `{n}` is `(.+?)`. Every capture that has Hangul is translated recursively; if it still has Hangul after that, it goes through `romanizeName`. The result is filled into `en`.
    4. `localizeNumbers(core)`, then steps 2–3 again on the result;
    5. a name-like fallback: when the core has ≤ 3 space-separated words, no sentence ending (`/(요|다|까|죠|니다)[.?!]?$/`), and no punctuation other than `·` `-` `(` `)`, return `romanizeName(core)`;
    6. otherwise return the original and add the core to `missing` (a `Set`, capped at 2,000).
- `localizeNumbers(s)` (export it):
  - `2억 6,000만 원` and `2억 6,000만` → `₩260M`; `3억` → `₩300M`; `1억 5,000` → `₩150M`; `4,000만 원` → `₩40M`; `500만` → `₩5M`. The rule: 억 is 100M; a number after 억 with or without 만 is ten-thousands.
  - `45분` → `45 min`; `30일` → `30 days`; `1일` → `1 day`; `12개월` → `12 months`; `7번` → `7 times`; `3개` → `3`; `2명` → `2 people`; `1명` → `1 person`; `59m²` unchanged.
  - Apply all of these with global regexes. Do not touch Hangul that is not part of a number + unit.

### 4. New `web/src/i18n/dom.js`
Translate the rendered DOM in place without fighting React.
- **Leaf rule:**
  - A "leaf" is an element whose child nodes are only text nodes (one or more).
  - For a leaf, keep a `WeakMap` `orig` (text node → its source text) and `written` (text node → the text we wrote).
  - On each pass:
    - for every text child whose current `nodeValue !== written.get(node)`, set `orig` to the current value: React or other code changed it;
    - join the `orig` values in order and translate the joined string;
    - if the result differs, write it all into the first text node and `""` into the others, and record `written`.
  - Text nodes whose parent has element children are translated one by one with the same orig/written bookkeeping.
- **Attributes:** `placeholder`, `aria-label`, `title`, `alt`. Keep the original in a `data-i18n-src-<attr>` attribute only when you replace it. Translate when the value has Hangul.
- **Skip:**
  - `script`, `style`, `textarea`;
  - `input` values (user text) — but do translate their `placeholder`;
  - `[contenteditable]`;
  - any subtree under `[data-no-i18n]`.
- `translateTree(root, translator, state)`: walks the subtree.
- `startDomTranslation(root, translator)`:
  - runs `translateTree` once;
  - then a `MutationObserver` with `{ subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...] }` re-translates only the touched nodes or leaves;
  - also translates `document.title` when it changes (observe `<title>`).
  - Returns `stop()`.
- Write the core so it works on plain objects (`nodeType`, `nodeValue`, `childNodes`, `parentNode`, `tagName`, `getAttribute`/`setAttribute`, `hasAttribute`, `closest` optional). Tests can then use fakes; there is no jsdom.

### 5. New `web/src/i18n/en.js` — the seed table
`export const phrases = { … }; export const patterns = [ … ];`
Seed with every visible Korean string of `web/src/ui/landing.jsx` and `web/src/ui/topbar.jsx`. Read those two files: they are short. Also add the `#loading` text in `web/index.html` ("지역을 불러오는 중…" → "Loading the area…"). Use plain, friendly English with no marketing words. Keep `Ithaca` as is.

### 6. New `web/src/i18n/index.js`
- `initI18n()`: when `LANG === "en"`:
  - set `document.documentElement.lang = "en"`;
  - create the translator from `en.js`;
  - start DOM translation on `document.body`;
  - expose `window.__ithacaI18n = { missing: () => [...translator.missing] }` for the orchestrator's coverage crawl.
- Return quickly in Korean mode.
- Export `LANG` and `setLang` again.

### 7. Wire-up
- `web/src/ui/main.jsx:33-37`: call `initI18n()` at the top of `mountUI()`, before `createRoot`.
- **Toggle:** new `web/src/ui/lang-toggle.jsx`.
  - `LangToggle` is a small text button with `data-no-i18n`. Its label is `English` in Korean mode and `한국어` in English mode. `aria-label` is "Switch language / 언어 바꾸기". It calls `setLang`.
  - Style: 12 px, `--ui-ink2`, transparent background, 6 px 10 px padding, 999 px radius, hover background `--ui-line`. Add the CSS to `web/src/ui/ui.css`, with no `text-overflow: ellipsis`.
  - Render it:
    - in `topbar.jsx` inside the header (line ~130), just before the wrench button (~148);
    - in `landing.jsx` inside `.ui-landing-brand` (line ~97-100), after the tagline.

## Test — `web/tests/i18n-24a.test.js`
- `detectLang`:
  - `?lang=en` beats a stored `ko`;
  - stored `en` beats `navLang` `ko-KR`;
  - `navLang` `en-US` gives `en`;
  - `ko-KR` gives `ko`;
  - nothing gives `ko`.
- `romanize("잠실")` → `Jamsil`; `romanizeName("잠실역")` → `Jamsil Stn`; `romanize("선릉")` → `Seolleung` (assimilation); `romanizeName("역삼동")` → `Yeoksam-dong`.
- `localizeNumbers`:
  - `전세 2억 6,000만 원` → `전세 ₩260M`;
  - `3억` → `₩300M`;
  - `4,000만 원` → `₩40M`;
  - `걸어서 5분` → `걸어서 5 min`.
- `createTranslator`:
  - an exact phrase;
  - the pattern `{0} · 지하철 타는 곳` → `{0} · where you board` with `잠실역` gives `Jamsil Stn · where you board`;
  - a pattern capture that has its own phrase is translated, not romanized;
  - an untranslated sentence ending in 요 stays Korean and lands in `missing`;
  - text with no Hangul is returned as the same string.
- DOM core with fakes:
  - a leaf with text nodes `["5", "분 남음"]` and the pattern `{0}분 남음` → `{0} min left` gives first node `5 min left`, second `""`;
  - then set the second node's `nodeValue` to `"분 남음"` and the first to `"6"` (as React would), and translate again → `6 min left`;
  - a `placeholder` attribute is translated and an `input`'s `value` is not;
  - a node under `data-no-i18n` is untouched.
- A source pin: `main.jsx` calls `initI18n()` before `createRoot`. `topbar.jsx` and `landing.jsx` render `LangToggle`.
- A seed pin: every Korean string literal in `landing.jsx` (regex over the source for `"…"` or JSX text with Hangul) is a key in `phrases`, or is matched by a pattern.

Run only:
```
cd web && node --test tests/i18n-24a.test.js 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`web/src/paths.js`, `web/src/aerial/*`, `web/src/consult/*`, `web/vite.config.js`, `web/src/ui/chatmap.jsx`, `web/src/chatmap.js`. Other runs edit them.

## Final message
Changed files, one line each. Nothing else.
