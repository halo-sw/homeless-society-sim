# Stage 32c2 — the list photo note: per language, correct Korean particle, US credit (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (real Chromium, 1440 px; KO `seoul-couple` replay, EN `menlo-month` replay)
`listPhotoNote` (`web/src/ui/candidate-card.jsx` ~341, from 32c) renders:
- **KO:** `사진은 우리 3D 모형예요(실제 매물 사진 아님) · 우리 자료로 만든 모형 (GIS건물통합정보·OSM)`.
  - The particle is wrong: after a syllable with a final consonant (모형, 사진, 모양) it must be `이에요`; after one without (지도) it is `예요`. Pick by the last syllable of the joined label list.
- **EN (Menlo list):** `사진은 우리 3D 모형예요(실제 매물 사진 아님) · Model built from our data (GIS building data · OSM)`.
  - The sentence stays Korean, because the DOM translator has no entry for the composed string.
  - The credit says GIS (Korean data) for a US list. `areaForList(candidates)` gives `country: undefined` for those candidates, so `area.country === "US"` is false.

The 거리 사진 tab, the photo and the credit line under it (`motov · Mapillary · CC BY-SA 4.0 · 2025`) work. Leave them.

## Change (`candidate-card.jsx`; `chat.jsx` only the one call at ~521)
1. **`listPhotoNote(kinds, area, lang = LANG)`** builds the string itself in both languages; the `Text` that shows it gets `data-no-i18n`.
   - **KO:** `사진은 {labels joined by ·}{이에요|예요}(실제 매물 사진 아님)`, then ` · ` and the credits. Labels as today (`단지 사진`, `우리 3D 모형`, `거리 사진`, `건물 모양`, `지도`). Add a tiny helper for the particle (Hangul syllable `(code − 0xAC00) % 28 !== 0` → `이에요`, else `예요`; non-Hangul last char → `예요`).
   - **EN:** `Pictures: {labels joined by " · "} (not actual listing photos)`, labels `complex photo`, `our 3D model`, `street photo`, `building shape`, `map`. Credits `Model built from our data (OSM)` / `Model built from our data (GIS building data · OSM)` and `Street photos: Mapillary (CC BY-SA 4.0)`.
   - No kinds: KO `사진은 실제 매물 사진이 아니에요`, EN `Pictures are not actual listing photos`.
2. **US detection:** the area counts as US when `area.country === "US"` **or** its `bbox` centre passes `isUsLonLat` (already imported from `../basemap.js`).
3. Nothing else changes.

## Test — extend `web/tests/street-32c.test.js` (new `describe("32c2 …")`)
- KO `["scene"]` → contains `우리 3D 모형이에요`, not `모형예요`.
- Export the particle helper and assert `particle("사진") === "이에요"`, `particle("모양") === "이에요"`, `particle("지도") === "예요"`.
- EN `["scene","street"]` with a Menlo bbox (`{ bbox: [-122.18,37.46,-122.15,37.48] }`, no country) → no Hangul, contains `our 3D model`, `street photo`, `(OSM)` and not `GIS`, contains `Mapillary`.
- KO with a Seoul bbox → contains `GIS건물통합정보`.
- SSR of the list (whatever fixture `results-list-29a2` uses): the note node carries `data-no-i18n`.
- **Keep green:** `tests/street-32c.test.js`, `tests/card-thumbs-32b.test.js`, `tests/results-list-29a2.test.js`, `tests/aerial-thumb-26n.test.js`.

Run only (**run it before you finish**):
```
cd web && node --test tests/street-32c.test.js tests/card-thumbs-32b.test.js tests/results-list-29a2.test.js tests/aerial-thumb-26n.test.js 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
The relay, the map, `landing-page.jsx`, `src/engine/**`, `src/consult/**`, `src/i18n/**`, `pipeline/**`, `data/`, `README*`, `.env*`.

## Final message
Changed files, one line each. Updated test files. Nothing else.
