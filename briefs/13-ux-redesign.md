# Stage 13 — One clear flow, real-estate grade cards, editable conditions, model choice (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/12b-RESULT.md`, `briefs/12a-RESULT.md` and `briefs/12a2-RESULT.md`. Sub-agents allowed (Muse only). Sandbox: no network, no keys.

Attached are the user's screenshots, taken on 2026-10-29 during 12b:
- `briefs/img/13-user-1.png`: sim view. Panels overlap each other and the timeline, labels are cut, and the credits run across the bottom.
- `briefs/img/13-user-2.png`: chat. The greeting appears twice, the work area is empty, and the token counter is loose under the chips.
- `briefs/img/13-user-3.png`: candidate cards. No hierarchy, the same photos on every card, a photo of a person, "타는 시간 약 1분 이내 · 0분 (0km)" for a home at the workplace station, and an empty right side.

## The user's words (2026-10-29, translated)
"Everything is spinning on its own; rebuild all of it. The UX needs to change. Use emilkowalski/skills to raise usability decisively. Improve the overall interaction and UI design."
- **Start:** the agent first asks salary, current home, where they want to move, average monthly living cost, how far they can commute, and the price range for 월세 / 전세 / 매매. If more people live together, add people, up to 4 household members.
- **Judgement:** when deployed, let users paste a key or sign in to connect their own API and track usage. There must be a model selection section. Conditions are fixed today; let the user change them freely. If there is no listing photo, search for one, and drop the ones that are unrelated. For nearby infrastructure, show images of the relevant stations and stops where we have them. The side is empty; show a Seoul / Gyeonggi orb or something more interactive.
- **Simulation:** every home we collected must be simulatable. When check data fails to load, say exactly why. Don't dump the CC credits at the bottom; give them their own section. Build with Pretendard (downloaded).
- **Components:** study real-estate listing services and set the visual hierarchy of what matters.

## References on disk (offline)
- `docs/emil-skills/`: MIT, Emil Kowalski. Read `skills/emil-design-eng/SKILL.md` (core), `ui-cheatsheet.md`, `skills/animate/SKILL.md` + `RECIPES.md`, `skills/review-animations/STANDARDS.md`, `skills/animation-performance/SKILL.md`, `skills/apple-design/SKILL.md` and `skills/break-ui/CATALOG.md`. Apply them, and in the RESULT include the skill's required Before / After / Why table for the main components.
- `docs/astryx/`: layout and spacing guides (keep the 12b shell decisions unless they conflict below).
- `web/public/fonts/pretendard/`: Pretendard Variable 1.3.9 (`PretendardVariable.woff2` + css; SIL OFL, `LICENSE-OFL.txt`). Self-host it (`font-display: swap`, preload). `font-variant-numeric: tabular-nums` on every price, minute and count. Headings tracking about -0.02em.
- `scenarios/places/commons-named.json`: name-searched Commons photos (`kind: station | complex`, `target` = `station:<name>` or `home:<id>`). It may still be in progress when you start; if it is missing, code against the documented shape and test with a fixture.
- `scenarios/places/commons-photos.json`: geotagged photos (12a).

## 1 — Layout: nothing overlaps, ever
- **Shell:** top bar / left conversation / centre stage (map, 3D or orb) / right detail drawer.
  - Panels never overlap each other or the timeline. Each region owns its scroll.
  - Nothing is wider or taller than its region. Text never truncates mid-word.
- **Timeline:** docked at the bottom of the centre stage only, with one compact row: day strip + route steps. The 30-day strip opens on demand.
- **Explanations:** "지금" status, fatigue and the decision log move into the right drawer as tabs or sections, not floating cards.
- **Responsive:** check at 1440×900, 1280×800, 1100 and 800 wide. Under 1100 the drawer becomes a bottom sheet.
- Fix the duplicated greeting and put the token / cost meter into the model section (Part 4).

## 2 — Start: a guided intake, then free conversation
1. **Intake.** The landing composer stays. After the first message, the agent runs an intake as a short sequence of **inline answer cards inside the chat**. These are chips, steppers, range sliders and a place picker, not free text only. The order is:
   1. 연봉 (세후 월급 or 연봉)
   2. 지금 사는 곳
   3. 이사 희망 지역 (multi-select over the 11 areas + "상관없음")
   4. 평균 생활비 (월)
   5. 통근 가능 범위 (최대 분, 수단)
   6. 원하는 가격 범위: 월세 (보증금 · 월세) / 전세 / 매매 (min–max range sliders, with "아직 모름")
   Values found in the first message are pre-filled and marked "내가 말한 값". Every step can be skipped ("나중에"). Skipped essentials stay as chips on the profile.
2. **Household.** "+ 함께 사는 사람" adds **up to 4 members**. Each has relation, age band, workplace (place picker or 모름), income (optional), and commute tolerance. Members feed `scenarioFromProfile` (the existing multi-member engine).
3. After the intake, show the profile summary card. "후보 찾기" runs `find_homes`. Free conversation continues at any point.

## 3 — Conditions the user can change
- **Profile card:** every value is editable in place (stepper / slider / chips). Changing one re-runs the search live with a debounce. Show "조건 바뀜 · 후보 n곳 → m곳" as a toast (sonner-style, see `skills/ask-sonner`).
- **"가정 바꾸기" panel:** the engine constants from `scenarios/criteria/kr-default.json` that a person can reason about (걷는 속도, 환승 시간 4분, 출근 시각, 근무일, 장보기 빈도, 관리비 가정 …), each with its current value, source, a reset button and plain-word help. Changes apply to the next simulation run and are recorded in the share link.
- The sort for candidates (출퇴근 / 월 비용 / 거래 수 / 첫 우선순위) stays the customer's choice, never a score.

## 4 — Model section (judgement)
- A **모델** panel, reachable from the top bar, with one row per provider:
  - Muse Spark 1.3 (Meta)
  - Muse Spark Open (Baseten)
  - 기록된 답변 (키 없이)
- Each row shows its status: connected / no key / error, with the exact reason (HTTP status, provider message, timeout).
- **Bring your own key.**
  - Paste a key for Meta or Baseten. It is kept in `sessionStorage` only ("이 탭을 닫으면 지워져요"), with "키 지우기".
  - It is sent per request to our same-origin proxy in a header. The proxy forwards it and never logs, stores or echoes it.
  - Add a test that the proxy's logs and errors never contain the key.
  - Server-side keys (env) remain the default in local dev.
- **Login.** Show a "로그인으로 연결" option only for a provider that documents an OAuth flow for third-party apps. Neither does today, so do not show a fake button. Say this in the RESULT so the orchestrator can tell the user.
- **Usage tracking.**
  - Per-turn model, tokens in / out / reasoning, latency and estimated cost (price table in one file, labelled "추정").
  - Session totals, and "사용 기록 내보내기" (CSV, local download).
- The per-turn model badge stays on each agent message.

## 5 — Photos and infrastructure images
For each candidate card, choose photos in this order:
1. Complex photos from `commons-named.json` (`home:<id>`, or the same complex name in the same region), labelled "단지 사진 · 위키미디어 공용".
2. Nearest-station photos (`station:<name>` for the home's station), labelled "가까운 역 사진 · <역명>".
3. Geotagged street / park photos within 700 m, labelled "주변 사진 · 이 매물 사진이 아니에요".
4. If none of these exist, show our own 3D thumbnail or a small map. **No unrelated photo** fills the slot.

Filtering:
- Drop photos whose title, description or categories suggest people, portraits, events, food, interiors (except station concourse / platform when kind = station and no people keywords), logos, documents, or other cities.
- Keep a keyword list in one file, with tests.

Each photo is used **at most once per candidate list**, so two cards never show the same photo. Keep one credit line per photo, compact (author · licence ↗).

Infrastructure: in the detail drawer, a "주변 시설" section lists the station(s) and the bus stops we have (graph walk minutes), each with a photo when we have one.

## 6 — Real-estate grade candidate card (visual hierarchy)
Study the common hierarchy of Korean and global listing services. Price first, then key facts, place, then the decisive extra. The extra is **our** decisive extra: the commute and the 30-day life.

1. **Photo**, 4:3, with a counter "1/5" and its label chip.
2. **Price** in the customer's tenure, the largest text: "전세 3억" + "실거래 중간값 · 1건". Show the range on hover or tap.
3. **Facts row:** 아파트 · 60㎡ · 2000년 · 예산 안 ✓.
4. **Name** + 동 + "강남역 도보 4분".
5. **Commute line:** "강남까지 약 12분 (걷기 4 · 지하철 8)" with a source dot (공식 / 추정 / 내가 말한 값).
   - A home at the workplace station says "직장역과 같은 역 · 지하철 안 타요". Never print "0분 (0km)".
6. **Badges:** 3D 가능 / 지도 시뮬레이션, 실거래 n건, OSM 위치 (when match = osm_name).
7. **Actions:**
   - primary "살아 보기" (picks it for the A/B run)
   - secondary text buttons "전세 점검" and "자세히"
   - method details ("어떻게 계산했나요") collapsed.

The detail drawer repeats this at full size, with the price history list, safety, public rental and support links.

## 7 — The stage when nothing is picked: a Seoul / Gyeonggi orb
- Replace the empty right side with an interactive **orb or tilted 3D map** of 서울·경기 south-east. It shows:
  - the 9 regions as extruded, softly lit shapes from `data/build/regions.json`
  - our stations as points
  - candidate homes as small dots, coloured by tenure fit
- Drag to rotate, scroll to zoom, hover a region for: homes count, median 전세 for 60㎡, photos count, public rental yes/no. Click to filter the search to that region.
- After a search, the found candidates light up, and hovering a card highlights its dot.
- Idle motion is slow, stops on interaction, and respects reduced motion. Use the existing three.js; keep it ≤ 2 ms per frame on the capture machine (log draw calls once).

## 8 — Every collected home can be simulated
Today only homes inside a built 3D box can be simulated. Make the simulation run for any home in the index:
- **Walk graph.** Build a light **walk graph per region** (pipeline step `walkgraph`: OSM footways, streets and crossings, no buildings) from the existing region extracts. Use it for any home outside the boxes.
- **Search.** `find_homes` walk minutes then come from that graph too ("도보 미확인" only when the graph can't reach a station).
- **Map simulation.** Homes without a box run in a **2D map simulation**: the same engine and day strip, rendered on a flat map, with the route drawn on the walk graph and the subway line. The card badge says "지도 시뮬레이션"; homes with a box say "3D 가능".
- Report how many homes are now simulatable: 3D, map, and none (with the reason).

## 9 — Errors say exactly why
Replace generic "불러오지 못했어요" everywhere: 전세 점검, money, safety, public rental, support, photos, model calls. Use one `explainLoadError()` that names:
- which data was needed
- what happened: file not built (with the pipeline command), HTTP status, provider endpoint changed (e.g. the public-housing API `/api/v1` returns 404 since 2026-10-29), key missing, region not covered, parse error
- what still works
- what the user can do

Plain Korean, one or two lines, plus a "자세히" with the technical detail. Tests cover each cause.

## 10 — Credits get their own section
- Remove the long credit line from the bottom of the screen and keep one small "출처·라이선스" link in the top bar menu and the footer.
- Add a **출처·라이선스** page or drawer, generated from one data file (`web/src/sources.js`). Per source: name, what we use it for in this app, licence, date or version, link, and what you must not do (e.g. 공공누리 3유형 변경 금지).
- Cover OSM, GIS 건물, 실거래, 공공임대, 서울교통공사 혼잡도 + 운행시간, Wikimedia Commons (per photo credit stays on the photo), Pretendard (OFL), Emil skills (MIT, docs only), NVIDIA Nemotron-Personas-Korea (CC BY 4.0) and Astryx.
- Per-feature mini credits ("실거래: 국토교통부") stay next to the number they explain.

## 11 — Interaction quality (Emil skills)
- Buttons `:active` scale 0.97. No `transition: all`. Ease-out under 300 ms for entering UI. Popovers scale from their trigger. Skeletons instead of spinners for cards. Toasts for background results.
- Stagger the candidate cards at ≤ 40 ms each, once. Number changes animate with tabular nums. Reduced motion is respected.
- Run the `break-ui` catalogue on the new screens: long names, zero results, 1 result, 300 results, missing price, missing photo, slow model, model error, narrow width. Fix what breaks.
- In the RESULT, include the Before / After / Why table per the skill's required format.

## Tests
Intake order + skip + prefill sources; household up to 4 (5th refused with a message); live re-search on edit; assumption override recorded in the share link; BYO key never logged (proxy test); usage CSV; photo selection order, de-dup across a list, people / irrelevant filter; same-station commute copy; orb data builder (pure); walk graph + map-sim coverage counts; `explainLoadError` per cause; sources page complete (every source in `ATTRIBUTION.md` appears); no overlap at 1440 / 1280 / 1100 / 800 (layout test on computed regions in a DOM test, as far as jsdom allows; the orchestrator verifies on the GPU). All existing tests green, `vite build` green, no keys or raw data in git or bundle.

## Output
`briefs/13-RESULT.md` with:
- the screen flow
- capture URLs: landing, intake steps, household, profile edit, candidates, detail drawer, model panel, orb, map sim, 3D sim A 08:50, error examples, sources page, narrow
- coverage numbers
- the Before / After / Why tables
- anything the orchestrator must download or build
