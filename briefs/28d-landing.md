# Stage 28d — The landing page at `/` (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
User: "서비스 소개할 수 있는 랜딩페이지랑 같이 들어가 있으면 좋겠어. manus.im 같은 거 참고해서." You designed it in `docs/design.md` §4.1–4.2 (`grep -n "### 4.1" docs/design.md`, read through the end of §4.2) and §3.12 (PoweredByMuse). Build that page now. Tokens `--ds-*` are in `web/src/ui/ui.css` (28c). The app itself (chat) does not change in this stage.

## Corrections to §4.1 copy (use these instead of the doc where they differ)
- Notice bar: `지금은 서울 동남권과 분당·판교·수지 11곳에서 시작했어요` (the doc says only 분당·판교, wrong).
- FAQ 지원금 answer: `네 조건과` → `고객님 조건과`.
- Example prompts: do not use complex names (`분당오벨리스크`, `천사의도시`). Use the four `EXAMPLE_PROMPTS` already exported from `web/src/ui/landing.jsx:24-37` (title + prompt), each row with a `복사` button and a `물어보기` button (sends it).
- 2×2 use cases, 4th card: replace "부모님께 설명할 때" with `동네를 한눈에 — 역·마트까지 걸어서 몇 분인지 지도로 봐요`.
- Problem section: no illustrations. Two short text cards with one big number each, from the product: `30일` (`살아 봐야 아는 것: 출근 30번, 장보기, 밤 귀갓길`) and `11곳` (`다루는 지역 11곳, 실거래 25.10–26.10`).
- Product frame and use-case cards: images are added later by the orchestrator. Render each image slot as a `<figure className="ds-lp-shot">` with a fixed `aspect-ratio` (product 16/10, use cases 4/3), `--ds-sunken` background, `--ds-r-card` corners, and an `<img>` whose `src` is `assetUrl("landing/<name>.png")` — names: `product`, `uc-first-job`, `uc-couple`, `uc-night`, `uc-neighbourhood`. If the image fails to load (`onError`), hide the `<img>` and keep the empty frame (no broken-image icon).

## Change

### 1. Routing — `web/src/chat/urls.js:14-28`
```js
export function routeForSearch(search) {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(search || "");
  if (q.has("chat")) return "chat";
  if (q.get("mode") === "sim") return "sim"; // ?tour=demo rides along (?mode=sim&tour=demo)
  if (q.has("mode") || q.has("tour")) return "tour";
  if (q.has("area") || q.has("time") || q.has("lens") || q.has("shot")) return "tour";
  return "chat";
}
export function bootKindFor(route) {
  if (route === "sim") return "sim";
  if (route === "chat") return "chat";
  return "tour";
}
```
- `?chat` (any value, also empty) and `?app` (any value) → `"chat"`. No routing params (only `lang` or nothing) → `"landing"`. The rest unchanged.
- `bootKindFor("landing")` → `"landing"`.
- Add `export function appEntryUrl() { return appUrl("chat="); }` (same as `chatReopenUrl`; it is what every "시작하기" button opens).

### 2. Boot — `web/src/main.js` (`grep -n "function bootChat" web/src/main.js`, and the dispatcher `grep -n "const kind = bootKindFor" web/src/main.js`)
Add `bootLanding()` next to `bootChat()`: `mountUI(); registerCommonActions(); store.set({ mode: "landing", ready: true }); document.title = "Ithaca — 살아 보고 고르는 집"; remove #loading; clear #fade` — no 3D world, no area fetch. Dispatcher: `else if (kind === "landing") bootLanding();` before the tour fallback. The `loadAreasList().then(...)` wrapper may stay.

### 3. The page — new `web/src/ui/landing-page.jsx`, mounted for `mode === "landing"`
In `web/src/ui/app.jsx` (`grep -n 'state.mode === "landing"' web/src/ui/app.jsx`) render `<LandingPage />` instead of `<Landing />` (keep `landing.jsx` and its exports; `chat.jsx` imports `EXAMPLE_PROMPTS` and `COVERAGE_AREAS` from it).

Sections in this order, all copy from §4.1 + the corrections above:
1. Nav (sticky, 64px, hairline bottom): `Ithaca` left; anchors `기능 · 살아 보기 · 데이터 · 질문` (scroll to sections); right: `PoweredByMuse` (sm, no status), `LangToggle`, black pill `시작하기` → `appEntryUrl()`. At ≤ 480 px hide the anchors.
2. Notice bar (one line, `--ds-sunken`, 12px).
3. Hero (centred, max 760px, padding-top 96px desktop / 48px phone): serif heading (`--ds-font-display`, `--ds-t-40`, 28px on phone), lede (16px, `--ds-ink-2`), the same `ChatComposer` the app uses (`@astryxdesign/core/Chat`, placeholder `판교 출근인데 전세 2억 이하로 혼자 살 집 찾아 줘`); on submit `window.location.href = chatUrl(text)` (`web/src/chat/urls.js`). Three chips under it (`출근지로 집 찾기` puts `판교로 출근해요. 전세로 혼자 살 집 찾아 줘` into the composer; `본 매물 붙여 넣기` → `appEntryUrl()`; `예시로 써 보기` → `chatUrl(EXAMPLE_PROMPTS[0].prompt)`). Then `PoweredByMuse` md (no status), then the coverage line (12px, `--ds-ink-3`).
4. Product frame (`id="features"`, max 1080px): `ds-lp-shot` `product`, then the three columns.
5. Comparison table (3 columns, Ithaca column shaded `--ds-sunken`, hairlines only).
6. Problem: heading + two number cards.
7. Use cases 2×2 (`id="living"`): image slot + title + one line; click → `chatUrl(<prompt>)` with prompts: first job → `EXAMPLE_PROMPTS[0].prompt`, couple → `EXAMPLE_PROMPTS[1].prompt`, night → `판교 출근 집 두 곳에서 30일 살아 보고 밤 10시 이후 귀가를 보여 줘`, neighbourhood → `미금역 근처 전세 찾아 주고 동네를 보여 줘`.
8. How it works: 4 numbered steps in a row (stack on phone).
9. Example prompts list (`복사` uses `navigator.clipboard.writeText` in a try/catch; on success the button reads `복사했어요` for 1.5 s).
10. FAQ (`id="faq"`): `<details>` accordion, six Q&A.
11. Data sources (`id="data"`): the four names, plus the `SOURCES` lines from `landing.jsx:52-60` in a `<details>` "자세히".
12. Final CTA: serif heading `먼저 한 문장만 물어보세요.` + black pill `대화로 시작하기` → `appEntryUrl()`.
13. Footer: `Ithaca` · `PoweredByMuse` (sm) · `MIT` · link `GitHub` (`https://github.com/halo-sw/homeless-society-sim`).

Layout rules: the page scrolls (the landing root is `position: absolute; inset: 0; overflow-y: auto; pointer-events: auto` inside `#ui-root`); section spacing `--ds-s-48` × 2 desktop, `--ds-s-48` phone; side gutter 24px desktop / 16px phone; content max 1080px except hero 760px; no horizontal scroll at 390 px. Hairline borders, no shadows except the composer. Black (`--ds-action`) is the only strong colour; Noto Serif KR only for hero heading, section headings and the final CTA.

### 4. Font — `web/index.html`
Load Noto Serif KR 600/700 from Google Fonts with `display=swap` (`<link rel="preconnect">` + stylesheet). Fallback stack already in `--ds-font-display`.

### 5. CSS — `web/src/ui/ui.css`
One `/* 28d landing */` block, all classes prefixed `ds-lp-`, values only from `--ds-*` tokens.

### 6. English — `web/src/i18n/en.js`
Add every new visible Korean string of `landing-page.jsx` to the seed phrase table (plain, friendly English, same meaning; `Powered by Muse` stays). Follow how the table lists `landing.jsx` strings today (`grep -n "// landing.jsx" web/src/i18n/en.js`).

## Tests — new `web/tests/landing-page-28d.test.js`
- `routeForSearch("")` → `"landing"`; `"?lang=en"` → `"landing"`; `"?chat="` → `"chat"`; `"?chat=hi"` → `"chat"`; `"?app=1"` → `"chat"`; `"?mode=sim"` → `"sim"`; `"?tour=demo"` → `"tour"`; `bootKindFor("landing")` → `"landing"`; `appEntryUrl()` ends with `?chat=`.
- SSR render `LandingPage` (`renderToStaticMarkup`, pattern in `web/tests/chat-first-27a.test.js:19-30`): contains `어떤 집을 고민 중이세요?`, `Powered by`, `muse-logo.png`, `다루는 지역 11곳`, `먼저 한 문장만 물어보세요.`, `서울 동남권`, all four `EXAMPLE_PROMPTS[i].prompt`, the ids `features`, `living`, `faq`, `data`; contains none of `추천`, `우승`, `네가`, `네 조건`, `분당오벨리스크`.
- Source checks: `web/index.html` contains `Noto+Serif+KR`; `en.js` contains `먼저 한 문장만 물어보세요.`; `main.js` contains `bootLanding`.
- Update old pins that assumed `/` opens the chat (`grep -rln 'routeForSearch("")\|routeForSearch(.\x27\x27' web/tests`, and `web/tests/landing-chat-12b.test.js`, `web/tests/chat-first-27a.test.js`): change only the expected route for an empty search to `"landing"`.

Run only:
```
cd web && node --test tests/landing-page-28d.test.js tests/landing-chat-12b.test.js tests/chat-first-27a.test.js tests/powered-by-muse-28b.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
`web/src/ui/chat.jsx`, `web/src/ui/landing.jsx` (exports stay), map / 3D / engine files.

## Final message
Changed files, one line each. Nothing else.
