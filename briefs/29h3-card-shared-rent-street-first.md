# Stage 29h3 — US candidate list: one ZIP rent stated once, the commute leads each card, the real street photo before the 3D model (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
The founder looked at the live Menlo Park list (Meta HQ, 2 people) and asked "검증된거 맞아?": all six cards say **Rent $4,261/mo** in the largest type, and every thumbnail is the same brown 3D block model. Both are true to the data, and both mislead:

1. **Rent.** US homes have no per-listing price. Each card shows the Zillow ZORI **typical rent of ZIP 94025** (`tenurePriceLine`, `web/src/ui/candidate-card.jsx:30-37`, basis "ZIP 94025 추정 (Zillow)"), so the biggest number on every card is the same number. It reads as six listings that each cost exactly $4,261. The budget fact ("$239 under budget", `budgetFactFor`, `:198-211`) is identical on every card too.
2. **Thumbnails.** `thumbKindFor` (`:417-423`) prefers the 3D scene over the street photo:
   ```js
   export function thumbKindFor(candidate, { hasHero = false, hasStreet = false, hasFootprint = false } = {}) {
     if (hasHero) return "hero";
     if (candidate && candidate.scene) return "scene";
     if (hasStreet) return "street";
     ...
   ```
   The street photo (Mapillary, through our relay, `streetPhotoFor`, fetched for every row at `:693-720`) does load for these homes, but never shows because every US candidate has a `scene`. `LIST_PHOTO_ORDER` (`:340`) follows the same order.

## Change

### 1. `web/src/ui/candidate-card.jsx`
- New pure export `sharedZipRent(candidates, tenure)` → `{ zip, amount, tenure, source, month, candidate }` when the list has ≥ 2 candidates, every one is USD (`currencyOf`), and all have the same `price.zip` and the same `median_won` for the chosen tenure entry (the same lookup `tenurePriceLine` uses); else `null`. `candidate` is the first one (for the budget fact).
- New pure export `sharedRentNote(shared, { budgetWon = null, tenure = null, lang = LANG } = {})` → one line, or `null` when `shared` is null:
  - ko: `ZIP 94025 대표 월세 월 $4,261 · 예산보다 $239 적어요 · 이 목록의 집 모두 같은 ZIP 값이에요 (Zillow ZORI, 2026-09)`
  - en: `Typical rent in ZIP 94025: $4,261/mo · $239 under budget · the same ZIP figure for every home here (Zillow ZORI, 2026-09)`
  - The budget part comes from `budgetFactFor(shared.candidate, tenurePriceLine(shared.candidate, tenure), budgetWon, tenure)`; translate its two US forms for en (`예산보다 X 적어요` → `X under budget`, `많아요` → `X over budget`); leave it out when null. Money via `fmtMoney(amount, "USD")`; source label/month the same way `usRangeTitle` (`:782-790`) builds them.
- `CandidateCard` gets a new prop `sharedRent = false`. In the row variant (`:724-773`) when `sharedRent` is true:
  - the big line (`.ui-cand-row-price`, `:767`) shows the commute instead: `row.text` plus `<RowEstimateTag row={row} />`, with `title={row.title}`;
  - the meta line keeps only `candidate.kind` (no ZIP basis, no budget fact);
  - the separate commute line (`.ui-cand-row-commute`, `:769-771`) is not rendered (it moved up).
  Otherwise the row renders exactly as today (Korean homes are untouched).
- `thumbKindFor`: order becomes hero → **street** → scene → silhouette → minimap. `LIST_PHOTO_ORDER` becomes `["hero", "street", "scene", "silhouette", "minimap"]`; update the comment above it and the `// 18:` comment at `:731-733` in one line each. The street fetch already runs for every row, so a row shows the 3D model until its street photo arrives, then the photo.

### 2. `web/src/ui/chat.jsx` — `CandidatesCard` only (`chat.jsx:~478-560`, `grep -n "export function CandidatesCard"`)
- `const shared = sharedZipRent(candidates, tenure);` (import it and `sharedRentNote` from `./candidate-card.jsx`).
- When `shared`, render right after the `조건에 맞는 집 …곳 중` supporting line: `<Text type="supporting" data-no-i18n><span data-no-i18n>{sharedRentNote(shared, { budgetWon, tenure, lang: currentLang() })}</span></Text>`.
- Pass `sharedRent={!!shared}` to each row `CandidateCard` (`chat.jsx:~532-538`).

## Test — new `web/tests/shared-rent-29h3.test.js`
- Six USD candidates built like the first six US candidates in `web/public/recorded/menlo-month.json` (load that file and take its candidates list; if they are not there, build fixtures with `currency: "USD"`, `price: { zip: "94025", source: "zillow_zori_zip", month: "2026-09" }`, `tenures: [{ tenure: "wolse", median_won: 4261, currency: "USD" }]`) → `sharedZipRent` returns `zip === "94025"`, `amount === 4261`.
- One candidate with a different `median_won` → `null`; a Korean candidate list → `null`; a single candidate → `null`.
- `sharedRentNote(shared, { budgetWon: 4500, tenure: "wolse", lang: "ko" })` contains `ZIP 94025`, `$4,261`, `예산보다 $239 적어요`, `Zillow ZORI`; with `lang: "en"` contains `Typical rent in ZIP 94025`, `$239 under budget`, and no Hangul.
- SSR (`react-dom/server` `renderToStaticMarkup`) of a row `CandidateCard` for one of those candidates with `sharedRent` → the `.ui-cand-row-price` element's text contains `분` or `min` and does not contain `$`; without `sharedRent` → it contains `$4,261` (unchanged).
- `thumbKindFor(usCandidateWithScene, { hasStreet: true })` → `"street"`; `{ hasHero: true, hasStreet: true }` → `"hero"`; no street → `"scene"`.

Run only:
```
cd web && node --test tests/shared-rent-29h3.test.js $(grep -ln "thumbKindFor\|LIST_PHOTO_ORDER\|listThumbKinds\|ui-cand-row-price\|CandidatesCard" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Update older pins only where they assert the old order (32b "US with scene goes 3D even when a street photo exists" → now street; 32c list-kind order with scene before street) or the price line for a USD row rendered with `sharedRent`.

## Also (one line, a pin left over from 29h1)
`web/tests/chat-shell-32a.test.js:274` asserts `!uiCss.includes("ellipsis")` anywhere; 29h1 added an ellipsis to the header summary button (`.ui-bar-center`). Scope that one assertion to `.ui-chat-thread` rules, the same way `web/tests/thread-edge-31d.test.js:56-59` already does. Include `tests/chat-shell-32a.test.js` in the run command.

## Do not touch
The full card (`FullCard`), the pin card, the map, the engine, `tenurePriceLine`'s output, relay, recordings, the next-step row and composer code added in 29h2, `briefs/`.

## Final message
Changed files, one line each. Nothing else.
