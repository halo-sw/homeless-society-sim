# Stage 26e — US: map background, aerial photos, landing example, Korea-only panels hidden (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `us-web-26`. Stop when this part is done.

## Why
Stages 26c and 26d let a customer search US homes near Meta HQ and run the 30-day sim with a bike commute. Four things still look Korean-only:
1. **The chat map has no background in the US.** The light map comes from VWorld through our relay (`/api/tiles/white/…`), which only serves Korea.
2. **The 3D view has no aerial photos in the US.** `drapeAerial` asks the relay's VWorld proxy, which refuses US tiles.
3. **The landing page has no US example**, and its coverage line lists only Korean areas.
4. **Korean-only steps and buttons show up for a USD customer:**
   - the six-step intake card (연봉 → … → 예산);
   - the chat chips "공공임대 찾기" and "도움 제도 보여줘";
   - the compare drawer's 전세·지원·안심 tabs.

Two public tile services are checked and send `Access-Control-Allow-Origin: *`. Neither needs a key. Browsers load them directly; no relay is needed:
- **US light map:** CARTO Positron, `https://{a|b|c|d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`. Credit: `© OpenStreetMap contributors © CARTO`.
- **US aerial:** USGS The National Map, `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}`. The order is z/y/x. It is public domain. Credit: `Imagery: USGS The National Map`.

## Change
1. **`src/basemap.js`**:
   - add `US_BBOX = [-125, 24, -66, 50]` and `isUsLonLat(lon, lat)`;
   - `basemapTileUrl(apiBase, z, y, x, { provider = "vworld" } = {})`. For `"carto"`, return the CARTO URL; the subdomain is `"abcd"[(x + y) % 4]`. The VWorld URL is unchanged;
   - `basemapProvider(lon, lat)` returns `"carto"` inside `US_BBOX`, else `"vworld"`;
   - `basemapApiBase()` stays as is. CARTO does not need it, so a US map has a background even on a static build without the relay.
2. **`src/ui/chatmap.jsx`**:
   - take the provider from the map's centre lon/lat;
   - use it for tile URLs and `basemapOn`. For CARTO, `basemapOn` does not depend on `apiBase`;
   - the credit line for CARTO reads `© OpenStreetMap contributors © CARTO`. The VWorld text is unchanged.
3. **`src/aerial/drape.js`**: when the area centre is inside `US_BBOX` (use `area.country === "US"` if present, else the centre):
   - fetch tiles from the USGS URL directly, not through `apiUrl`;
   - use the same mosaic and uv code; cap the zoom at 18;
   - work when `LIVE_API` is false too;
   - export `aerialCreditFor(area)`, which returns `Imagery: USGS The National Map` for US and `AERIAL_CREDIT` otherwise. Find where `AERIAL_CREDIT` is shown (grep `AERIAL_CREDIT` in `src/`) and use `aerialCreditFor(area)` there.
   - Korean areas are unchanged.
4. **`src/ui/landing.jsx`**:
   - add a fourth example `{ id: "us-meta", title: "Meta HQ, Menlo Park (US)", prompt: "I work at Meta HQ in Menlo Park, renting alone, up to $4,000 a month" }`;
   - render the coverage line as two lines: the Korean line as is, then `미국 1곳: Menlo Park · Meta HQ (자전거·도보, Zillow 월세 추정)`;
   - add one `SOURCES` line: `미국 월세: Zillow Observed Rent Index (ZIP 단위 추정, 매물 가격 아님) · 지도 © OpenStreetMap © CARTO · 항공사진 USGS`.
   - Check `tests/` for any test that pins the example count or `SOURCES` length, and update its expectation.
5. **`src/ui/chat.jsx`, USD only** (`profile.currency.value === "USD"`); KRW behaviour must be byte-identical:
   - do not start the six-step intake (~1015-1022). Run the search directly (`runSearch(prof, data, { sort: "commute" })`) and push the normal profile/answer message the non-intake path uses (read the surrounding code). If the gate needs `monthlyMax`, the existing one-question-at-a-time path asks it (26c question);
   - `CHAT_CHIPS` (~757): for USD, show `["Meta HQ까지 가까운 순", "월세 낮은 순"]` instead. They map to `runSearch` with sort `commute` / `monthly`. Check the sort keys `find_homes` accepts;
   - the text routes for 전세 점검 / 공공임대 / 도움 제도 (~1467-1479) reply one line for USD: `미국 자료에는 전세·공공임대·지원 제도 정보가 없어요.` Do not open those tabs.
6. **`src/ui/app.jsx` compare drawer (~860-886)**: when the run's homes are USD, hide the tabs `jeonse`, `support`, `safety` and `listings-public`. Detect it from the custom run's moneyDoc `currency`, or the run meta. Pick whichever is already available there and say which in a code comment. Also hide the Korean source line (RTMS / LH / 경찰청, ~961-973) and show `월세: Zillow ZORI (ZIP 추정) · 지도 © OpenStreetMap © CARTO · 항공사진 USGS` instead.

## Test — `web/tests/us-26e.test.js` (node --test, no network)
- `basemapProvider(-122.15, 37.48)` → `carto`; `basemapProvider(127.03, 37.5)` → `vworld`.
- `basemapTileUrl(null, 14, 6340, 2630, { provider: "carto" })` matches `^https://[abcd]\.basemaps\.cartocdn\.com/light_all/14/2630/6340\.png$`. The VWorld URL for the same tile is unchanged from today (compare to a call without options).
- `aerialCreditFor({ country: "US", center: [-122.15, 37.48] })` contains `USGS`; for a Korean area it equals `AERIAL_CREDIT`.
- The USGS tile URL builder (export it, e.g. `usgsTileUrl(z, y, x)`) → `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/17/50720/21062`.
- `EXAMPLE_PROMPTS` has an entry `us-meta` whose prompt `extract_profile` reads as currency USD and workplace `meta-hq` (import from `../src/profile.js`).
- `COMPARE_TABS` filtering helper (export one, e.g. `tabsForCurrency(tabs, "USD")`) drops `jeonse`, `support`, `safety`, `listings-public`; for `"KRW"` it returns the input unchanged.
- Keep green: `tests/us-26c.test.js`, `tests/us-26d.test.js`, `tests/compare-tabs.test.js`, `tests/chatmap-18.test.js`, `tests/chatmap-19b.test.js`, and any `tests/landing*.test.js` / `tests/basemap*.test.js` / `tests/aerial*.test.js` that exist.

Run only:
```
cd web && node --test tests/us-26e.test.js tests/us-26c.test.js tests/us-26d.test.js tests/compare-tabs.test.js tests/chatmap-18.test.js tests/chatmap-19b.test.js $(ls tests | grep -E '^(landing|basemap|aerial)' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/i18n/**`, `src/engine/**`, `relay/**`, `src/aerial/proxy.js`, `vite.config.js`, `pipeline/**`, anything under `data/`. No `text-overflow: ellipsis`.

## Final message
Changed files, one line each. Nothing else.
