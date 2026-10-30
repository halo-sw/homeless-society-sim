# Stage 26c — US chat: Meta HQ workplace, dollars, US homes in the list (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `us-web-26`. Stop when this part is done.

## Why
The app now has one US area next to Meta HQ (1 Hacker Way, Menlo Park). The pipeline (stage 26b, another branch) writes `data/homes/us-menlo.json`. Its homes have the Korean slim-home shape plus these fields:
```json
{ "id": "us-home-0001", "name": "Live Oak Apartments", "kind": "아파트", "region": "us-menlo",
  "lon": -122.15, "lat": 37.47, "build_year": null, "scene": "us-menlo", "pnu": null,
  "match": "osm_name", "osm_name": "Live Oak Apartments",
  "station": { "station": "Menlo Park", "walk_minutes": 18.2 },
  "buckets": [ { "center_m2": null, "range_m2": null, "trade": null, "jeonse": null,
    "wolse": { "count": 1, "deposit": null,
      "monthly": { "count": 1, "median_won": 4261, "min_won": 4261, "max_won": 4261 } } } ],
  "currency": "USD", "country": "US",
  "price": { "source": "zillow_zori_zip", "zip": "94025", "zip_source": "osm_nearest", "month": "2026-09",
    "label": "Zillow ZORI (typical rent for this ZIP, all home types)" },
  "work_targets": { "meta-hq": { "walk_m": 2900, "walk_minutes": 37.2, "bike_m": 3100,
    "bike_minutes": 12.4, "bike_speed_kmh": 15, "bike_speed_source": "assumed" } } }
```
`station` may be null. `homes/summary.json` lists US homes under `other_regions`, never under `regions`, so Korean searches never load them.

The goal of this stage: a customer types, in English or Korean, "I work at Meta in Menlo Park, renting alone, up to $4,000 a month" (or "멘로파크 메타 본사 출근, 혼자, 월세 4,000달러 이하"). The chat then lists US homes with dollar rents and a commute to Meta HQ, and puts them on the map. The 30-day sim for US homes is the next stage; do not change `scenarioFromProfile`, `simReadyFor` or `src/engine/**` here.

Read first: `src/profile.js` (findMoney 133-163, findWorkplace 277-333, extract_profile 415-530, missingQuestions 547-580, runGate 586-596), `src/region-names.js`, `src/homes.js` (pickBucket 98-116, commuteSummary 159-223, sort ~380-410, find_homes ~480-600), `src/chat/engine.js` (24-91, 400-470), `src/ui/chat.jsx` (969-1000, 1580-1600, 1699-1710), `src/ui/candidate-card.jsx` (1-70, ~263), `src/chatmap.js` (330-340, 383-403), `src/ui/chatmap.jsx` (~126, ~395), `src/money/format.js`.

## Change
1. **New `src/places-us.js`** (no keys, client-safe):
   - `US_WORKPLACES = [{ id: "meta-hq", name: "Meta HQ (1 Hacker Way)", lon: -122.14823, lat: 37.48485, region: "us-menlo", aliases: ["meta hq", "meta", "facebook", "1 hacker way", "hacker way", "menlo park campus", "meta headquarters", "메타 본사", "메타", "페이스북"] }]`.
   - `findUsWorkplace(text)`: case-insensitive, word-bounded for Latin aliases, longest alias first. Returns `{ place, evidence }` or null.
   - `US_REGION_ID = "us-menlo"`.
2. **`src/region-names.js`**: add `"us-menlo": ["menlo park", "멘로파크", "멘로 파크", "east palo alto", "이스트 팔로알토", "palo alto", "팔로알토", "belle haven", "meta", "메타", "facebook", "hacker way"]`. Make the matching used by `regionWordsIn` case-insensitive for Latin words. Check how it matches today; keep Korean behaviour identical.
3. **`src/profile.js`**:
   - **New profile field `currency`** (`field("KRW", "default")` in `emptyProfile`; add it to the field list at line ~40).
     - It becomes `"USD"` (source "customer") when the text names a US workplace or a us-menlo alias, or has a dollar amount.
     - Once USD it stays USD for later turns.
   - **Dollar amounts in `findMoney`:**
     - forms: `$4,000`, `$4000`, `$4k`, `$4.5k`, `4,000 dollars`, `4000 USD`, `US$4,000`, `4,000달러`, `4천 달러` (= 4000), `월 4000달러`;
     - each hit returns `{ won: <amount>, evidence, currency: "USD" }`. The key stays `won` for schema reuse; the unit is dollars;
     - a dollar amount is never multiplied as won, and a won amount never becomes USD.
   - **In `extract_profile`, when currency is USD:**
     - tenure defaults to `wolse` (note "미국 자료는 월세만 있어요") unless the text says buy/purchase/매매/전세. In that case set tenure `wolse` anyway, with that note, because US data has rent only;
     - the first dollar amount near "a month", "/mo", "per month", "monthly", "rent", "월", "월세", "한 달" goes to `monthlyMax`. With no such anchor, a single dollar amount also goes to `monthlyMax` (US data has monthly rent only);
     - `depositMax`, `priceMax`, `salaryAnnual` are not filled from dollar amounts. Leave them blank; do not convert.
   - **Workplace:** `findWorkplace` tries `findUsWorkplace(text)` first. On a hit:
     - the entry is `{ member: 0, text: <evidence>, resolved: { place: { id, name, lon, lat }, region: "us-menlo" } }`;
     - note: `직장: Meta HQ (1 Hacker Way)`.
   - `runGate` passes when `w.resolved.place` is set.
   - **`missingQuestions` for USD:**
     - no deposit question and no station question;
     - when `monthlyMax` is blank, ask: field `monthlyMax`, text `한 달 월세는 얼마까지 생각하세요? (예: $4,000 이하)`;
     - size: ask nothing (US rents have no size).
4. **`src/homes.js`**:
   - `pickBucket`: a bucket with `center_m2 === null` is always eligible, ignoring `sizeMin`.
   - **`commuteSummary`:** when `workplace.resolved.place` is set and `home.work_targets` has that place id:
     - add `work: { target: id, name: place.name, walk_minutes, bike_minutes, mode, minutes, source: "assumed_speed" }`;
     - `mode` is `"walk"` when `walk_minutes <= 25` (criteria `C-walk-commute-max`, 25 min), else `"bike"`; `minutes` is that mode's minutes;
     - `walk` keeps the station walk as today (`home.station`), and `ride` stays unknown;
     - with no work target for that place, add `work: null`.
   - **Commute filter and sort:** when `commute.work` exists, the `commuteMax` filter compares `commute.work.minutes`. The commute sort key uses `commute.work.minutes` (known before unknown). The Korean key is unchanged.
   - **Rows of a USD home** carry `currency: "USD"` and `price: home.price` through to the candidate object, next to the existing tenure rows.
5. **New `src/money/currency.js`:**
   - `fmtMoney(value, currency = "KRW", { monthly = false } = {})`. For KRW it returns `fmtWon(value, { monthly })` unchanged. For USD:
     - `$4,261` (rounded to whole dollars, en-US grouping);
     - with `monthly`, `월 $4,261`. Korean-first; the English layer turns 월 into "monthly" / "/mo";
     - null → `"—"`.
   - `currencyOf(candidateOrProfile)`: reads `.currency` (string, or profile field `.currency.value`). Default `"KRW"`.
6. **Display, USD only (KRW output must stay byte-identical):**
   - `candidate-card.jsx` price line:
     - `월세 월 $4,261 · ZIP 94025 추정 (Zillow)`;
     - the range title: one price, so `ZIP 94025 대표 월세 (Zillow ZORI, 2026-09)`;
     - hide the "전세 점검" button for USD candidates;
     - deals count: show nothing (no transaction count).
   - **Commute lines** (`commuteShortLine`, `commuteRowLine`): when `c.work` exists, return `Meta HQ (1 Hacker Way)까지 자전거 12분 · 걷기 37분 · 추정 (속도 가정)`. List the mode used first. Rounded minutes in the row line; one decimal is fine in the short line. Return `{ text, source: "estimate" }` or `{ text, estimate: true }` to match each function's shape.
   - **Map** (`chatmap.js`, `ui/chatmap.jsx`):
     - `shortPinPrice` USD → `$4,261`; check how pins get their tenure row and pass the currency along;
     - `buildChatMap` gains an optional `workPlace: { name, lon, lat }`, and `workPin = workPlace || (stop-based pin as today)`. In `chat.jsx` pass `workPlace` from `profile.workplaces[0].resolved.place` when present;
     - the pin label `회사 · <name>` works as is.
   - **`chat/engine.js`:** `profileSummary` and `fieldRows` use `fmtMoney(v, profile currency)` for money fields. The chip reads `Meta HQ (1 Hacker Way) 출근`; use the place name when there is no station.
   - **`chat.jsx` `destName` (~1584):** falls back to `resolved.place.name`.
7. **Data loading (`src/ui/chat.jsx` `structuredFlow` ~987 and every other `ensureData(...)` caller that picks regions):**
   - when the named regions include `us-menlo`, or the current profile's currency is USD, load exactly `["us-menlo"]`;
   - Korean flows load exactly as today. A Korean search must never load `us-menlo`, and a US search never loads Korean regions.

## Test — `web/tests/us-26c.test.js` (node --test, no network)
- `extract_profile("I work at Meta in Menlo Park, renting alone, up to $4,000 a month")`:
  - currency `USD`; tenure `wolse`; monthlyMax `4000`; members 1;
  - workplace `resolved.place.id === "meta-hq"`;
  - `runGate(...).ok === true`.
- `extract_profile("멘로파크 메타 본사 출근, 혼자, 월세 4,000달러 이하")`: the same values.
- Money:
  - `$4.5k/mo` → 4500 USD;
  - `4천 달러` → 4000;
  - "전세 3억 이하" stays KRW 300000000 with currency `KRW`;
  - "$4,000" never yields 4000 won with currency KRW.
- `missingQuestions` for a USD profile with no monthlyMax asks `monthlyMax`, with no deposit or station questions.
- `find_homes` with a fixture index of 3 US homes (rents 3800, 4261, 5522; bike minutes 20, 8, 12; one with `station: null`), a USD profile, monthlyMax 4500 and sort by commute:
  - returns 2 homes (5522 dropped), ordered by `work.minutes`;
  - each row has `currency: "USD"` and `commute.work.mode`.
- `commuteSummary` mode: walk 22 min → `walk`; walk 37 → `bike` with the bike minutes.
- `fmtMoney(4261, "USD")` → `$4,261`; with `{ monthly: true }` → `월 $4,261`; `fmtMoney(300000000, "KRW")` equals `fmtWon(300000000)`.
- `shortPinPrice` for a USD row → `$4,261`.
- `buildChatMap({... workPlace: {name:"Meta HQ (1 Hacker Way)", lon:-122.14823, lat:37.48485}})` → `workPin` at that lon/lat with no network.
- `regionsForNames(["Menlo Park"])` → `["us-menlo"]`; `regionsForNames(["강남"])` → `["gangnam"]`.
- Keep green: `tests/profile.test.js`, `tests/profile-english-24b.test.js`, `tests/find-homes.test.js`, `tests/chatmap-18.test.js`, `tests/chatmap-19b.test.js`.

Run only:
```
cd web && node --test tests/us-26c.test.js tests/profile.test.js tests/profile-english-24b.test.js tests/find-homes.test.js tests/chatmap-18.test.js tests/chatmap-19b.test.js 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `scenarioFromProfile` / `simReadyFor`, `src/i18n/**` (the orchestrator adds English strings), `pipeline/**`, anything under `data/`. No `text-overflow: ellipsis` anywhere.

## Final message
Changed files, one line each. Nothing else.
