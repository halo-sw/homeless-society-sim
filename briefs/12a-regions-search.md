# Stage 12a — 11 areas, the customer's own numbers, and real candidate homes (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/11-RESULT.md`, `pipeline/areas.py`, `pipeline/complexes.py`, `pipeline/building_join.py`, `pipeline/safety.py`, `web/src/money/rtms.js`, `web/src/money/housing.js`, `web/src/consult/tools*.js`, `web/src/station-areas.js`. Sandbox: no network, no keys. Sub-agents allowed (Muse only).

## Why (user, 2026-10-29)
"It is still unclear how a user should use this. The service should pull the right data for the user, not show slices of a simulation. Today only values we chose (demo salaries, 잠실 vs 판교) are shown." The user also asked for these areas: **서울 성동, 송파, 강남, 강동, 위례, 판교, 성남, 정자, 분당, 미금, 수지**.

Stage 12a builds the data and the search. Stage 12b (next) builds the new entry and chat UI on top of it, so keep the APIs below stable and documented.

## Data the orchestrator downloaded (local, never committed)
- Buildings: `data/raw/buildings/seoul/` and `data/raw/buildings/gyeonggi/` cover all of Seoul and Gyeonggi (GIS건물통합정보 AL_D010, with PNU).
- Real transactions, 2025-10-28 → 2026-10-27, `data/raw/rtms/{apt|rowhouse|officetel}_{trade|rent}_{name}_2510-2610.csv`. The names are `songpa`, `seongdong`, `bundang` (existing) and new `gangnam`, `gangdong`, `sujeong` (성남 수정구, incl. 위례 north part), `jungwon` (성남 중원구), `suji` (용인 수지구), `hanam` (하남, incl. 위례 east part). Same column format as the existing files. If a new file is missing or empty, report it and continue.
- Public housing: only `data/raw/public_housing/snapshot_3districts.json` (송파·성동·분당, 2026-10-28). The provider's `/api/v1` returned 404 on 2026-10-29, so no new snapshot. Make the loader accept any `snapshot_*.json` and say per region whether public-rental data is present ("이 지역 공공임대 자료 없음" for 강남·강동·수지 etc.).
- Safety: the police CSV already has 서울 성동구 / 강남구 / 송파구 / 강동구 and 경기도 성남시 / 용인시 / 하남시 columns. 경기 figures are city-level, so say so.
- Photos: `scenarios/places/commons-photos.json`. These are freely licensed, geotagged Wikimedia Commons photos near the 11 areas, as a manifest: thumb URL, page URL, author, licence, lat/lon, categories. No image bytes are in the repo.

## Part A — areas
1. **Regions** (for search and statistics): 성동구, 송파구, 강남구, 강동구 (Seoul, OSM admin boundaries), 성남시 분당구 / 수정구 / 중원구, 용인시 수지구, and 위례 (the 위례동 parts of 송파구, 성남 수정구 and 하남시; use OSM `위례동` boundaries where present and note how 위례 was defined). Neighbourhood labels inside the regions: 판교, 정자, 분당 (서현·수내), 미금 (that is, named places / stations). Write `data/build/regions.json` with id, label, boundary, 시군구 codes, the RTMS file names and the safety column + level.
2. **Scenes** (3D): add 1.2 km station boxes (existing `bbox` kind) for every subway station inside those regions that has a residential complex within 600 m. Cap at 60, ordered by complex count, and log which ones were skipped. Include at least 왕십리, 강남, 삼성, 천호, 고덕, 남위례, 모란, 정자, 서현, 미금, 수지구청 and the existing four. Make the build incremental and resumable (`pipeline build --areas station:*`, skip boxes already built with the same inputs). Extract the region bbox from the PBF once, not per box. Report build time and size per box.
3. App: the area list comes from a built `data/build/areas-index.json` (id, label, center, bbox, station, size), not from a hard-coded array. The scene loads only the selected box.

## Part B — a home index from real transactions
`pipeline` step `homes`: for every RTMS row in the region files, resolve the parcel (시군구 + 법정동 + 본번/부번 → PNU) to the GIS building footprints, and group by complex (단지명 + PNU) into `data/build/homes-index.json`. Each record has id, name, kind (아파트 / 연립·다세대 / 오피스텔), region, lon/lat (footprint centroid), build year, and per area bucket (±5 ㎡) the last 12 months of 매매 / 전세 / 월세 counts, median and range (cancelled deals excluded, as stage 6). It also has the nearest station with the walking minutes on the graph when the home is inside a built box (otherwise `null`, never a straight-line guess), the containing scene box id or `null`, and the number of photos within 700 m. Report: rows read, rows matched, matched %, unmatched examples.

## Part C — the customer's own profile (no demo values)
1. `web/src/profile.js`: a profile has household (members, ages or roles, children), workplace(s) (a place name resolved to a station or POI in our data, or "모름"), salary per member or take-home, cash, current debts, tenure wanted (전세 / 월세 / 매매 / 공공임대 / 아직 모름), budget (deposit max, monthly max, price max), size min, commute max minutes, priorities (stage 9a weights) and must-haves (e.g. 초등학교 도보 10분). Every field records where it came from: `{value, source: "customer" | "default" | "derived", note}`.
2. Tool `extract_profile(text, current)` for the agent: fills only values present in the text (same guard as `parse_listing`: every number must appear in the customer's words). It returns the missing fields that matter for the next step as short questions, at most 2 at a time, in plain words.
3. Defaults are allowed only for engine constants (walking speed etc.) and are labelled. Salaries, cash, budget and workplace are **never** defaulted. When missing, the UI asks.
4. A scenario is built from the profile + chosen homes (`scenarioFromProfile`). The demo scenario becomes one example profile, labelled "예시".

## Part D — find candidate homes
Tool `find_homes(profile, {sort, limit})` over `homes-index.json`:
- Filter by tenure + budget (median of the matching area bucket within budget; also show how many deals were within budget), size, kind, regions (if the customer named any), commute (station-to-workplace ride minutes from the stage 8 network + walk minutes where known; unknown walk → "도보 미확인", never guessed), must-haves where data exists (school / park / clinic within N minutes on the graph inside built boxes).
- Sorting is the customer's choice (commute, monthly cost, deals count, their first priority). The default is "출퇴근 짧은 순" and is shown as the sort. No score, no "추천 1위".
- Each result has the numbers, the source badges, `scene: box id | null` ("3D로 살아 보기" only when there is a scene) and up to 6 photos (Part E).
- Also `find_public_rentals(profile)` from the new snapshot (same rules as stage 6/10).
- The agent's flow: extract profile → ask for missing essentials → `find_homes` → show 3–6 candidates → the customer picks 2 (or 3) → `run_simulation` with `scenarioFromProfile` → results in plain words. Update the system prompt and the recorded replies (no-key mode) for this flow, with an example profile labelled 예시.

## Part E — photos for previews
`web/src/places/photos.js`: `photosNear(lon, lat, {radius: 700, limit: 6})` from `scenarios/places/commons-photos.json`. Prefer categories about streets, parks, stations, apartments and skylines, and drop portraits, events, food, interiors and logos by category and title keywords. Each photo carries an attribution line ("사진: <author>, <licence>, Wikimedia Commons") and a link. The UI must say "주변 사진 · 이 매물 사진이 아니에요". Also expose `sceneThumbnail(boxId)` (render the box once offscreen at 640×400 and cache it as a data URL in memory) so every candidate with a scene has at least our own 3D preview.

## Tests
Region definitions, PNU join on fixture rows (incl. 산 번지, 부번 0), area bucket medians on real CSVs (skip when absent), `extract_profile` guard (no number not in the text; Korean money words like 4천, 2억 5천, 월 80), missing-field questions, `find_homes` filters, sorting and no-score contract, commute unknown handling, photo filtering, attribution present, `scenarioFromProfile` determinism. All existing tests green (636 JS, 168 Python), `vite build`, no keys or raw data in git or bundle.

## Output
`briefs/12a-RESULT.md`: regions and boxes built (with skipped ones), home-index match rates per region, an example `extract_profile` → `find_homes` run for "판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하" (it will likely find officetels and villas rather than apartments; report honestly), photos per region, the commands the orchestrator must run (`pipeline build …`), and what 12b can rely on (API list).
