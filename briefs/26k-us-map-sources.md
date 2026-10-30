# Stage 26k — US: keyless map tiles, US sources, small leftovers (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `us-web-26`. Stop when this part is done.

## Found by the orchestrator in Chrome (US flow, `?lang=en`)
1. **The US chat map shows "API KEY REQUIRED" watermarks on every tile.** CARTO now needs a key for `basemaps.cartocdn.com/light_all`. Replace it with the USGS National Map topo tiles, which are checked: light style, street names and building outlines, public domain, no key, CORS `*`.
   - URL: `https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}` (z/y/x order, JPEG).
   - Credit: `Map: USGS The National Map`.
2. **The map legend reads "● 후보 · ■ 회사 · ━ 지하철 · 숫자는 출근 편도(추정)"** (`src/ui/chatmap.jsx:527`). US has no subway line on the map. For a US map, drop `━ 지하철`.
3. **The "taken from your sentence" line says "monthly rent 5, 000 won or less" for a USD customer.**
   - `src/intake.js:205-219` (`intakeTookLine`) uses `fmtWon` for every amount. Use `fmtMoney(v, currency)` from `src/money/currency.js` with the profile currency.
   - The salary and take-home lines stay KRW-only: they are never filled for USD.
4. **US results show Korean source chips** under the candidate list and the result: "MOLIT Real Transaction Price…", "GIS Integrated Building Info".
   - Find where those chips are built: `src/sources.js` ids `rtms`, `gis-buildings`, `register-api`, `geofabrik`, and the chat code that attaches them.
   - For USD candidates or runs, use three new US source entries in `src/sources.js` instead:
     - `zillow-zori`: "Zillow Observed Rent Index (ZORI), ZIP 단위 월세 추정", url `https://www.zillow.com/research/data/`;
     - `osm-us`: "OpenStreetMap (미국 북캘리포니아 추출본, Geofabrik)", ODbL;
     - `usgs`: "USGS The National Map (지도·항공사진, 퍼블릭 도메인)".
   - Copy the shape of the existing entries.
   - The 3D view's footer credit (`src/ui/app.jsx:995-997`) for a US run reads: `© OpenStreetMap contributors (ODbL) · 지도·항공사진: USGS The National Map · 월세: Zillow ZORI (ZIP 추정, 참고용) · 나무·인물은 장식용 모의 표시`.
5. **Landing US example** (`src/ui/landing.jsx`, `us-meta`): change `$4,000` to `$5,000`. The lowest ZIP rent near Meta in the data is $4,219, so $4,000 returns zero homes.
6. **Zero US results:** when a USD search returns no homes and some US homes exist above the budget, the empty-state text adds one line: `이 지역 ZIP 대표 월세는 $4,219부터예요 (Zillow 추정).` Compute the minimum from the loaded US homes; do not hardcode it.

## Change
- **`src/basemap.js`:** provider `"usgs"` replaces `"carto"`. `basemapProvider` returns `"usgs"` inside `US_BBOX`. The tile URL builder gains the USGS form. Keep `carto` out of the code entirely: delete it, and update `tests/us-26e.test.js` expectations to USGS.
- **`src/ui/chatmap.jsx`:** credit and legend as above.
- `src/intake.js`, `src/sources.js`, the chip code, `src/ui/app.jsx`, `src/ui/landing.jsx`, and the empty-state code as above. Find the empty-state text "No homes match" in Korean: grep `맞는 집이 없어요` or similar.

## Test — `web/tests/us-26k.test.js`
- `basemapProvider(-122.15, 37.48)` → `usgs`; the tile URL for z16 y25402 x10528 → `https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/16/25402/10528`.
- No source file under `src/` contains `cartocdn` (read the files with fs and assert).
- `intakeTookLine` for a USD profile with monthlyMax 5000 → contains `$5,000`, no `원`.
- The sources helper for a USD candidate list returns ids `zillow-zori`, `osm-us`, `usgs` and not `rtms`.
- The landing `us-meta` prompt contains `$5,000`.
- Empty-state helper: US homes with rents [4219, 4261] and budget 4000 → the text contains `$4,219`.
- Keep green: `tests/us-26c.test.js`, `tests/us-26d.test.js`, `tests/us-26e.test.js` (updated), `tests/us-26i.test.js`, `tests/chatmap-18.test.js`, `tests/chatmap-19b.test.js`, and every `tests/landing*` / `tests/intake*` / `tests/sources*` file.

Run only:
```
cd web && node --test tests/us-26k.test.js tests/us-26c.test.js tests/us-26d.test.js tests/us-26e.test.js tests/us-26i.test.js tests/chatmap-18.test.js tests/chatmap-19b.test.js $(ls tests | grep -E '^(landing|intake|sources)' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**`, `pipeline/**`, anything under `data/`. No `text-overflow: ellipsis`.

## Final message
Changed files, one line each. Nothing else.
