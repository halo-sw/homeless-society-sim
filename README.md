# Homeless Society Sim — live in a home for 30 days before you sign

[한국어 README](README.ko.md)

**Meta Global AI Developer Hackathon · Indie Developer track · "Build for Your World"**

**Democratising housing knowledge for Gen-Z.** For a first-job worker, a couple about to marry, or a young family in Korea, a home is the biggest and riskiest decision they will make, and most of them make it with a listing, a price and advice from friends. A listing doesn't tell you what a month of your life would look like there: how long the walk to the station takes, how packed the 08:00 train is, how tired you are when you get home, how close the schools are, or how much money is left after housing costs. It also doesn't tell you whether a mortgage is really worth it compared with renting, whether a 전세 (lump-sum deposit lease) shows warning signs, or which public rentals and government support you could get at your salary.

Deposit fraud (전세사기) has hit young renters hardest: about 75 % of the victims are in their 20s and 30s (press report of March 2025 citing Ministry of Land data). We think people should be able to **live in a home as a simulation, run the numbers, check the warning signs and see the support they can get, before they sign**.

So we built a simulator that answers these questions with real public data. **One or two simulated people (or a family) live in home A and in home B for 30 days**, side by side, in a 3D model of the real neighbourhood. The app then compares time, money, daily convenience, education access and official safety statistics, weighted only by **the customer's own priorities**, and explains every number. It shows, explains and lets you decide. It never decides for you.

> Status: work in progress (hackathon period 2026-10-27 → 11-04). The first commit is 2026-10-28; nothing here predates the hackathon. See [Known issues](#known-issues).

## What it does

- **Builds the real neighbourhood in 3D** from OpenStreetMap and the national building register: footprints, heights, number of floors, residential complexes, roads, stations, parks and shops. Four areas are built today: 판교 Pangyo, 성수 Seongsu, 송파구 Songpa-gu and 잠실 Jamsil.
- **Simulates daily life for 30 days.** A household (2 adults, plus 60 simulated neighbours, all labelled as simulated) goes to work, shops, walks in the park and visits clinics on the real walking graph. The engine is deterministic: the same seed gives byte-identical output.
- **Muse makes the household's choices; the engine does the counting.** At each decision point (where to shop, what to do on the weekend, whether to stop on the way home) Muse Spark 1.3 picks from options the engine offers and gives a reason. In our run Muse made 198 decisions, 50 of them different from the rule-based default. Every number shown comes from the data or the engine. A guard rejects any model answer that contains a number not found in a tool result.
- **Shows what is happening and why, while it plays.** A "Now" card shows the current activity, its cause (a routine rule, a Muse decision with its reason, or customer input), the criteria that applied, and what comes next. The followed resident, their route and their destination are highlighted.
- **Uses explicit simulation criteria.** Every rule and assumed value the engine uses lives in one file, [`scenarios/criteria/kr-default.json`](scenarios/criteria/kr-default.json), rendered as [`docs/criteria.md`](docs/criteria.md). Each criterion has a source label: engine default, customer input, data, or assumption. Customers can change the editable ones and re-run.
- **Living costs that fit your salary.** Enter your salary and your cash. The app estimates take-home pay (or you type in the real figure), then computes monthly housing cost for 매매 (buying), 전세 (lump-sum deposit lease), 월세 (monthly rent) and public rental housing. Prices come from **real transactions** of the same complex and floor area over the last 12 months, with cancelled deals excluded. Spending in the 30-day simulation is tied to what the household actually does: a fare for each subway trip, a basket for each grocery run.
- **Recommends similar public rental housing.** It uses the public-housing API (LH · MyHome) and filters by housing-cost ratio, floor area and commute. Each candidate links to its official notice. One click adds it as home C and simulates it too.
- **A consult agent.** A Muse agent with 19 tools sets up the scenario through conversation, runs the simulation, compares the results, explains decisions and criteria, and moves the 3D view to the moment it is talking about.
- **Next (stages 9a–9b, in the queue):** personas (1인 사회초년생, 예비·신혼부부, a working couple with a school-age child); the customer's own priority weights (education · our life · safety · money · convenience); official crime statistics and OSM-based education access; a multi-year **"is it worth it?" simulation** of buying vs 전세 vs 월세 vs public rental (loan schedule, rate stress, customer-chosen price scenarios, never forecasts); a **전세 safety check** (전세-to-sale ratio from real transactions, register signals, an official checklist, and mock deposit-loss scenarios); and **support programmes at a glance** (public rental, policy loans, youth and newly-wed benefits, shown as condition-by-condition comparisons with official links, never as eligibility verdicts).
- **In progress (stage 8):** a journey view that follows the person across the region when they ride the subway, using real line geometry and a lightweight corridor map. It also adds a congestion-based **fatigue index** built from Seoul Metro's real congestion data. The index is a stated model, not a medical judgement.

### What it deliberately does not do

No price forecasts (price paths appear only as customer-chosen scenarios labelled as assumptions), no buy-or-don't-buy or sign-or-don't-sign advice, no eligibility verdicts for loans or support programmes, no "safe / unsafe" verdict on a specific property or landlord, no composite safety or school-quality score, no demographic profiling, no default "best home" ranking, and no straight-line commute claims. Safety and education figures are official statistics with source, period and geographic level. When a value is assumed, the app says so. Nothing here is legal or financial advice.

## Example output (demo couple; inputs are placeholders)

| | Home A · 잠실 레이크팰리스 59.97㎡ | Home B · 판교 백현마을 84.82㎡ |
|---|---|---|
| Real-transaction median (last 12 months) | buy 26.5억 / 전세 9.8억 / 월세 4억 + 200만 | buy 25.2억 / 전세 9.5억 / 월세 4.5억 + 200만 |
| Monthly housing cost (전세) | 260만 원 | 250만 원 |
| Housing-cost ratio | 36.0 % | 34.6 % |
| Left over per month | 334만 원 | 392만 원 |

Assumed inputs: gross salaries of 6,000만 and 5,000만 원, cash of 2억 원, and a loan rate. All are labelled as assumptions on screen.

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

Meta models: **Muse Spark 1.3** (household decisions, consult agent, and the coding agent that wrote the repo). Muse Spark Open runs are planned once inference credits arrive.

Tests: 330+ `node --test` tests and 130+ `pytest` tests.

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

Useful URLs: `/?mode=sim&home=A&day=1&t=08:28&follow=1` (follow a commute), `&tab=money` (living costs), `&tab=quality` (quality of life), `&tab=criteria` (criteria), and `/?area=seongsu&shot=3&time=18:30` (tour).

Raw and built data are never committed. The scripts above regenerate them. Real-transaction CSVs, the public-housing snapshot and the subway congestion file are fetched by the operator and stay local, as their terms require.

## Data sources

OpenStreetMap (ODbL, via Geofabrik) · GIS건물통합정보 and 건축물대장 (국토교통부 / VWorld / 건축HUB) · 국토교통부 실거래가 공개시스템 · 공공주택 데이터 API (LH · 마이홈) · 서울교통공사 지하철혼잡도정보 (공공누리 3유형). Full terms are in [`ATTRIBUTION.md`](ATTRIBUTION.md).

## Known issues

- Sim mode can stop at "불러오는 중…" because of a variable-initialisation-order bug found on 2026-10-29. A fix and a browser smoke check are queued (`briefs/08b-sim-crash-smoke.md`).
- `?q=high` renders black on Apple GPUs (ANGLE Metal). The app detects this and falls back to medium.
- The daytime look is still too hazy and low in contrast. Polishing it is next.
- The payroll rates in `scenarios/assumptions/kr-payroll.json` are marked `needs_confirmation`.
- Subway ride minutes are customer input (an assumption), not a timetable.

## Roadmap (until 11-04)

Stage 8 (journey view and fatigue) → 9a (personas, priorities, safety and education) → 9b (worth-it finance, 전세 safety check, support programmes) → one polished demo flow → a Spark 1.3 vs Spark Open comparison of the same 198 decisions → a small San Francisco / Menlo Park neighbourhood → a 3-minute video.
