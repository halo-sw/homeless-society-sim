# Homeless Society Sim — live in a home for 30 days before you sign

[한국어 README](README.ko.md)

**Meta Global AI Developer Hackathon · Indie Developer track · "Build for Your World"**

**Democratising housing knowledge for Gen-Z.** For a first-job worker, a couple about to marry or a young family in Korea, a home is the biggest and riskiest decision they will make, and most of them make it with a listing, a price and advice from friends. Deposit fraud (전세사기) has hit young renters hardest: about 75 % of the victims are in their 20s and 30s (press report of March 2025 citing Ministry of Land data).

**Our answer: live in the home for 30 days before you sign.**

1. **Say it in your own words.** The customer describes their household, workplace, salary and cash in a chat. The consult agent (Muse Spark 1.3) turns that into a profile and marks every value it had to assume.
2. **Get real candidate homes.** Candidates come from real transactions in 11 areas of south-east Seoul and Gyeonggi (성동, 송파, 강남, 강동, 위례, 판교, 성남, 정자, 분당, 미금, 수지). Ride times come from the operator's schedule, and public rentals come from the LH · 마이홈 API.
3. **Watch a household live in home A and home B for 30 days.** It happens in a 3D model of the real neighbourhood: OpenStreetMap, the national building register and terrain, with 60 station areas built. Traffic, pedestrians and trains move procedurally. Muse makes the household's choices and gives a reason for each one, and the engine does all the counting. Runs are paired over 10 seeds, so the gap between the homes comes from the homes and not from chance.
4. **Compare with evidence.** The app compares commute time, fatigue (from measured subway congestion), money for 매매, 전세, 월세 and public rental (from real transactions), and official safety and education figures. It weighs them only by the customer's own priorities. Every number has a source or an "assumption" label. The app shows, explains and lets you decide. It never decides for you.

> Status (2026-10-30): work in progress (hackathon period 2026-10-27 → 11-04). The first commit is 2026-10-28, and nothing here predates the hackathon. Stage 15 (engine integrity) is on `main`, with 926 `node --test` and 244 `pytest` tests passing. In progress on branches: a painted near-isometric map look, and built-in verification that scores the agent's checklist and report against a ground-truth checklist. See [Known issues](#known-issues).

## What it does

![Following a resident: the Now card shows what they are doing, why, which criteria applied, and their fatigue (real GPU capture, 2026-10-29)](briefs/img/08c-follow.png)


- **Builds the real neighbourhood in 3D** from OpenStreetMap and the national building register: footprints, heights, number of floors, residential complexes, roads, stations, parks and shops. Four areas are built today: 판교 Pangyo, 성수 Seongsu, 송파구 Songpa-gu and 잠실 Jamsil.
- **Simulates daily life for 30 days.** A household (2 adults, plus 60 simulated neighbours, all labelled as simulated) goes to work, shops, walks in the park and visits clinics on the real walking graph. The engine is deterministic: the same seed gives byte-identical output.
- **Muse makes the household's choices; the engine does the counting.** At each decision point (where to shop, what to do on the weekend, whether to stop on the way home) Muse Spark 1.3 picks from options the engine offers and gives a reason. In our run Muse made 198 decisions, 50 of them different from the rule-based default. Every number shown comes from the data or the engine. A guard rejects any model answer that contains a number not found in a tool result.
- **Shows what is happening and why, while it plays.** A "Now" card shows the current activity, its cause (a routine rule, a Muse decision with its reason, or customer input), the criteria that applied, and what comes next. The followed resident, their route and their destination are highlighted.
- **Uses explicit simulation criteria.** Every rule and assumed value the engine uses lives in one file, [`scenarios/criteria/kr-default.json`](scenarios/criteria/kr-default.json), rendered as [`docs/criteria.md`](docs/criteria.md). Each criterion has a source label: engine default, customer input, data, or assumption. Customers can change the editable ones and re-run.
- **Living costs that fit your salary.** Enter your salary and your cash. The app estimates take-home pay (or you type in the real figure), then computes monthly housing cost for 매매 (buying), 전세 (lump-sum deposit lease), 월세 (monthly rent) and public rental housing. Prices come from **real transactions** of the same complex and floor area over the last 12 months, with cancelled deals excluded. Spending in the 30-day simulation is tied to what the household actually does: a fare for each subway trip, a basket for each grocery run.
- **Recommends similar public rental housing.** It uses the public-housing API (LH · MyHome) and filters by housing-cost ratio, floor area and commute. Each candidate links to its official notice. One click adds it as home C and simulates it too.
- **A consult agent.** A Muse agent with 20+ tools sets up the scenario through conversation, runs the simulation, compares the results, explains decisions and criteria, and moves the 3D view to the moment it is talking about.
- **Personas and priorities (stage 9a).** Three household templates (1인 사회초년생, 예비·신혼부부, 맞벌이 + 초등학생 자녀) the consult agent offers first; the customer's own priority weights (education · our life · safety · money · convenience) with a side-by-side "내 기준으로 보기" view; official police occurrence counts and OSM-based education access — all shown, explained and never scored or ranked.
- **"Is it worth it?" over 5, 10 or 20 years (stage 9b).** Buying vs 전세 vs 월세 vs public rental: total cash out, interest, locked cash, opportunity cost at a rate the customer sets, a yearly loan schedule, rate stress (+1/+2 %p) and DSR. Price paths appear only as customer-chosen scenarios (default −2/0/+2 % a year), each labelled "가정 시나리오, 전망 아님". The app shows the break-even year per scenario and never says buy or don't buy.
- **전세 safety check (stage 9b).** The 전세-to-sale ratio of the same complex and area from real transactions (e.g. 레이크팰리스 59.97㎡: 37 %), building-register signals, an official six-step checklist (등기부등본, 전입·확정일자, 보증보험, 세금 체납… each linked to the official site) and a **mock deposit-loss simulation** (insured / auction / unrecovered paths with stated assumptions). It shows signals and next steps, never a "safe / unsafe" verdict, and it is not legal advice.
- **Support programmes at a glance (stage 9b, data verified 2026-10-29).** 버팀목 전세, 청년전용 버팀목, 신혼부부전용 전세, 디딤돌, 신생아 특례 디딤돌: income, asset, rate, loan limit and deposit/price caps from the official 주택도시기금 product pages, each with a source link and date. The table compares the customer's stated numbers condition by condition, with exceptions in plain words, and never says "eligible".
- **The commute the home really gives you (stage 9c).** The workplace is a place, and each home derives its own commute: from home A (잠실) the person walks to the station, rides 2호선 → 신분당선 and walks to work; from home B (판교) they walk. The ride is its own trip, with per-leg congestion and sources on the Now card.
- **Plain words everywhere (stage 10).** Labels say what the number means in everyday Korean: "월 주거비 (전세)" became "전세로 살면 매달 집에 드는 돈", "주거비 부담률" became "월급에서 집에 나가는 비율", "출근 도착 피로도" became "회사 도착할 때 피곤한 정도". Every figure has "어떻게 계산했나요?". Jargon appears only with a glossary tooltip, and a test scans the UI for banned bare jargon ([`docs/copy-guide.md`](docs/copy-guide.md)).
- **A floating AI agent (stage 10).** A "물어보기" button opens a floating Astryx chat panel (Popover, ChatLayout, ChatToolCalls, ChatSystemMessage, Citation, ChatComposer) with suggestion chips that follow the current screen ("이 출근길 왜 피곤해요?"). It knows what "this" refers to, shows each tool step and cites every source. Gentle nudges appear at notable moments, at most one a minute.
- **Check a real listing you found (stage 10).** Paste the text of a listing from any real-estate app. The agent extracts only values present in the text, matches the complex, and shows where the asking price sits among the last year of real transactions (e.g. 전세 9.8억: middle of 47 deals, range 7.61억–11.8억), the 전세-to-sale ratio and the checklist. One click lives in it for 30 days as home C. Private listing sites are never scraped. Public notices (LH, SH, youth housing) come from the official API with links to the originals.
- **A shareable result card and a 3-minute tour (stage 10).** "결과 공유" builds a PNG and a printable page comparing A and B in plain words, with source badges and assumption marks; nothing is uploaded. `?tour=demo` plays an 11-step guided tour for first-time users and for recording.
- **Follows the person across the region (stage 8).** When the followed member rides the subway, the camera rises over a lightweight corridor map (10,971 buildings in 65 lazily loaded tiles) and a train moves along the real line geometry from OpenStreetMap (2·8·9호선, 수인분당선, 신분당선). The customer's ride time is split by line distance, for example 잠실→판교 = 2호선 8.6 min + transfer 4 min + 신분당선 17.4 min.
- **A congestion-based fatigue index (stage 8).** Built from Seoul Metro's measured congestion per station, direction and 30-minute slot (e.g. 2호선 잠실 08:00 inner loop ≈ 93 %). Lines without data, such as 신분당선, are marked "no data" and use a stated assumption. Every weight is a public, editable criterion. It is a stated model, not a medical judgement.

### What it deliberately does not do

No price forecasts (price paths appear only as customer-chosen scenarios labelled as assumptions), no buy-or-don't-buy or sign-or-don't-sign advice, no eligibility verdicts for loans or support programmes, no "safe / unsafe" verdict on a specific property or landlord, no composite safety or school-quality score, no demographic profiling, no default "best home" ranking, and no straight-line commute claims. Safety and education figures are official statistics with source, period and geographic level. When a value is assumed, the app says so. Nothing here is legal or financial advice.

## Example output (demo couple; inputs are placeholders)

![08:50 on day 1. Left: from home A the person is on 2호선 (91 % crowded, measured) heading to 신분당선. Right: from home B they are walking to work (real GPU capture, 2026-10-29)](briefs/img/10-commute-ab.png)

| | Home A · 잠실 레이크팰리스 59.97㎡ | Home B · 판교 백현마을 84.82㎡ |
|---|---|---|
| Real-transaction median (last 12 months) | buy 26.5억 / 전세 9.8억 / 월세 4억 + 200만 | buy 25.2억 / 전세 9.5억 / 월세 4.5억 + 200만 |
| 전세로 살면 매달 집에 드는 돈 | 260만 원 | 250만 원 |
| 월급에서 집에 나가는 비율 | 36 % | 35 % |
| 보증금이 집값의 몇 %인지 (전세가율) | 37 % | 37.7 % |
| How they get to work (workplace near 판교역, assumed) | walk → 2호선 → 신분당선 → walk | walk |
| Time on trains in 30 days | 44 h | 0 |
| Time walked in 30 days | 27.8 h | 38.0 h |
| How tired on arrival at work (stated model, 0–100) | 25.3 | 5.7 |
| Most crowded leg | 2호선 93 % (measured) | — |
| Evenings at home in 30 days (18–24 h) | 323 h | 343 h |
| Park visits / errands in 30 days | 10 / 33 | 26 / 17 |

Assumed inputs: gross salaries of 6,000만 and 5,000만 원, cash of 2억 원, a loan rate, and a 30-minute 잠실→판교 ride. All are labelled as assumptions on screen. The table shows differences; which matters more is the customer's call.

## How it is built

Every line of product code, every test and every pipeline script in this repository was written by **Muse** (`muse-spark-1.3`, Muse Code agent mode). A human and an orchestrating assistant wrote the stage briefs, downloaded data, ran tests and captured screenshots on a real GPU. The full brief → result trail is in [`briefs/`](briefs/), and the rules are in [`AGENTS.md`](AGENTS.md).

| Layer | Where | Notes |
|---|---|---|
| Data pipeline (Python) | `pipeline/` | OSM extract, building join with the national register, walking graph, complexes, validation; stage 8 adds the subway network, corridor tiles and congestion |
| Life engine (JS, pure) | `web/src/engine/` | Routines, decisions, trips with causes, money timeline, criteria loader; deterministic |
| Muse judgement layer | `web/src/judge/` | Decision prompts, number guards, recorded decisions for exact replay |
| Consult agent | `web/src/consult/` | OpenAI-style tool calls to the Meta API, server-side only (keys never reach the browser) |
| Money and prices | `web/src/money/` | Payroll table, tenure formulas, real-transaction CSV loader, public-rental adapter |
| 3D scene | `web/src/render/`, `web/src/main.js` | three.js 0.170: PBR facades from data, sky and sun for Seoul, night lights driven by the residents who are at home |
| UI | `web/src/ui/` | React 19 + **Astryx** (Meta's design system) |

Meta models: **Muse Spark 1.3** (household decisions, consult agent, and the coding agent that wrote the repo) and **Muse Spark Open** (`meta-models/muse-spark-open-1026` on Baseten, an open-weight model). The provider is one switch (`--provider meta|baseten`).

**Spark 1.3 vs Spark Open on the same household (2026-10-29, `reasoning_effort` low, files in [`scenarios/decisions/compare-1029/`](scenarios/decisions/compare-1029/)):**

| | Spark 1.3 | Spark Open |
|---|---|---|
| Decisions (A + B) | 154, all answered, 0 guard fallbacks | 154, all answered, 0 guard fallbacks |
| Same choice where both met the same decision point | 120 of 139 (86 %) | |
| Different from the rule default (of 154) | 75 | 72 |
| Average latency per call | 3.7 s | 2.7 s |
| Output tokens (A + B) | 140k | 96k |

Where they differ it is mostly which shop to stop at after work (15 of 19). Without a reasoning limit Spark Open spent its whole 2,000-token budget thinking on 116 of 154 calls; with `reasoning_effort: low` it answered every one.

Tests: 926 `node --test` tests (including a headless sim-mode smoke test, a server-render smoke test of the whole React UI and a plain-words scan) and 244 `pytest` tests (2026-10-30).

## Run it

Requirements: Node 20+, Python 3.12, about 6 GB of disk for raw data.

```bash
# 1. Python pipeline
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
# put south-korea-latest.osm.pbf (Geofabrik) in data/raw/ and the
# GIS건물통합정보 shapefiles in data/raw/buildings/<region>/  (see ATTRIBUTION.md)
.venv/bin/python -m pipeline build --all
.venv/bin/python -m pipeline.validate --all

# 2. Simulation runs
cd web && npm install && cd ..
node web/scripts/simulate.mjs --scenario scenarios/demo-two-homes.json --home both --out data/build/sim/
node web/scripts/money.mjs   --scenario scenarios/demo-two-homes.json --out data/build/sim/

# 3. App (the consult agent and live decisions need a Meta API key in the server environment)
cd web && MODEL_API_KEY=... npm run dev
```

Useful URLs (add to `/?mode=sim&scenario=demo-two-homes`): `&tour=demo` (3-minute guided tour), `&home=A&day=1&t=08:50&follow=1` (follow the commute), `&tab=money` (living costs), `&tab=listings` (check a listing; `&fill=example` for a labelled example), `&tab=money&share=1` (result card), `&tab=criteria` (criteria). `/?area=seongsu&shot=3&time=18:30` is a scenic tour.

Raw and built data are never committed. The scripts above regenerate them. Real-transaction CSVs, the public-housing snapshot and the subway congestion file are fetched by the operator and stay local, as their terms require.

## Data sources

OpenStreetMap (ODbL, via Geofabrik) · GIS건물통합정보 and 건축물대장 (국토교통부 / VWorld / 건축HUB) · 국토교통부 실거래가 공개시스템 · 공공주택 데이터 API (LH · 마이홈) · 서울교통공사 지하철혼잡도정보 (공공누리 3유형) · 경찰청 범죄 발생 지역별 통계 (2025, stage 9a) · 주택도시기금 product pages (nhuf.molit.go.kr, checked 2026-10-29) · official 전세 checklist sites (인터넷등기소, 정부24, HUG 안심전세포털, 국세청). Full terms are in [`ATTRIBUTION.md`](ATTRIBUTION.md).

## Known issues

- Stage 11 and 11b (2026-10-29, checked on the real GPU) fixed the floating panel overlap, truncated labels, the empty share card, the grey ride view (all 65 corridor tiles now load, with a base map) and the blown-out night towers. The "물어보기" button can still disappear at night while following a person.
- `?q=high` renders black on Apple GPUs (ANGLE Metal); the app detects this and falls back to medium.
- The payroll rates in `scenarios/assumptions/kr-payroll.json` and the ownership costs (취득세, 중개수수료, 재산세…) are marked `needs_confirmation` and are listed as "아직 계산에 넣지 않은 것" until filled from official pages.
- Subway ride minutes are customer input (an assumption), not a timetable. 신분당선 has no public congestion data, so it uses a stated 70 % assumption.
- 성남시 crime statistics are city-level, while Seoul's are district-level; the app shows the level next to every figure.
- Public-housing notices have no deadline field in the API, so the app lists "recent notices" and links to the original.

## Progress log

| Stage | What Muse built | Brief → result |
|---|---|---|
| 1–2 | Data pipeline, 3D scene, building-register lookups | [`briefs/01…02b`](briefs/) |
| 3 | Deterministic 30-day life engine | [`03-RESULT`](briefs/03-RESULT.md) |
| 4 | Muse judgement layer (198 real decisions, number guards) | [`04-RESULT`](briefs/04-RESULT.md) |
| 5 | Astryx UI, consult agent, PBR rendering | [`05a`](briefs/05a-RESULT.md), [`05b`](briefs/05b-RESULT.md) |
| 6 | Salary-based living costs, real transactions, public rental | [`06-RESULT`](briefs/06-RESULT.md) |
| 7 | Now card, causes, highlighting, criteria, shadow fix | [`07-RESULT`](briefs/07-RESULT.md) |
| 8 | Journey view, corridor map, congestion fatigue (+8b/8c fixes) | [`08-RESULT`](briefs/08-RESULT.md) |
| 9a | Personas, customer priorities, official safety and education figures | [`09a-RESULT`](briefs/09a-RESULT.md) |
| 9b | Worth-it finance, 전세 safety check, mock deposit loss, support programmes | [`09b-RESULT`](briefs/09b-RESULT.md) |
| 9c | Per-home commute, the ride as a trip, calmer cards | [`09c-RESULT`](briefs/09c-RESULT.md) |
| 10 | Plain words, floating Astryx agent, listing check, public notices, share card, demo tour | [`10-RESULT`](briefs/10-RESULT.md) |
| 10b | Fix: React snapshot loop, tour NaN, render smoke test | [`10-RESULT`](briefs/10-RESULT.md#stage-10b--whole-ui-react-loop--tour-nan-muse) |
| 11–11b | Agent panel placement, full labels, share card with A/B numbers, look table, ride base map | [`11-RESULT`](briefs/11-RESULT.md) |
| 12a–12a2 | 11 areas, customer numbers, real candidate homes, schedule ride times on 9 lines | [`12a`](briefs/12a-RESULT.md), [`12a2`](briefs/12a2-RESULT.md) |
| 12b | Question-first entry, conversation, home previews, day timeline | [`12b-RESULT`](briefs/12b-RESULT.md) |
| 13d–13e | Layout without overlaps, guided intake, candidate cards, Seoul/Gyeonggi orb | [`13d`](briefs/13d-RESULT.md), [`13e`](briefs/13e-RESULT.md) |
| 14–14b | Terrain (DEM), road ribbons, OSM trees for 60 station areas; procedural vehicles, pedestrians and trains | [`14`](briefs/14-RESULT.md), [`14b`](briefs/14b-RESULT.md) |
| 15 | Engine integrity: paired runs over 10 seeds, household costs, walking commutes counted, distance fares, same-size comparison, loan cap | [`15 brief`](briefs/15-engine-integrity.md) |

## Roadmap (until 11-04)

Next: merge the painted map look and the redesigned sim screen, built-in verification (the agent's checklist and report are scored against a ground-truth checklist, retried up to 3 times, then handed to the user), English UI → feature freeze → a 3-minute video.
