# Stage 6 result — living-cost simulation, real prices, public rental, finer design (Muse)

Date: 2026-10-28. Agent mode, single agent (no subagents — `AGENTS.md`
reserves product code, tests and pipeline scripts to Muse). All code
and tests below are my own.

## What changed

**Part C — real prices + public rental (`web/src/money/`, `web/src/consult/tools-money.js`)**
- `rtms.js`: CSV loader (cp949 via `TextDecoder("euc-kr")` — 0 U+FFFD
  on all 18 files; disclaimer lines, quoted thousands separators,
  `건물명` rowhouse headers) + data.go.kr API backend behind the same
  interface (stub-tested; unregistered today). Cancelled deals excluded.
- `pnu.js`: 시군구+본번/부번 → PNU from our register data, complex match,
  loose 단지명 check. `prices.js`: median/p25–p75/count/period per
  complex ±5 ㎡, 전세/월세 split, source disclaimer.
- `housing.js`: snapshot normaliser + server-side API client (`HOUSING_API_KEY`,
  Bearer, never in bundle) + `recommendPublicRental` (burden ≤ threshold,
  ±10 ㎡, shortest graph commute; notices linked; eligibility disclaimer).
  PNU coverage matches the brief: 송파구 154, 판교 4, 성수 3 (+1 overlap).
- Agent tools: `set_money`, `estimate_net_pay`, `price_reference`,
  `living_cost`, `recommend_public_rental`, `add_home_c` (17 tools total).

**Part B — salary → living cost**
- `scenarios/assumptions/kr-payroll.json` + `payroll.js`: documented,
  replaceable table; every rate has `as_of`/`source` and all uncertain
  rates carry `needs_confirmation: true`. Typed real net always wins.
- `tenure.js`: 매매/전세/월세/공공임대 formulas + LTV/DSR + tax notes.
- `timeline.js`: deterministic 30-day events tied to trips (fare per
  station-commute leg, basket per outbound errand leg, fixed costs on due
  day, salary on payday) → daily balances, category totals, 부담률, 남는 돈.
- Scenario `money` block (`docs/scenario-schema.md`); demo scenario
  carries placeholder inputs (marked). `web/scripts/money.mjs` precomputes
  `<name>-money.json` for the UI (runs engine + RTMS + QoL axes).

**Part D — QoL card (`money/quality.js`, UI tab)**
- 시간/돈/생활편의 side by side with units + sources, no composite score;
  optional customer-set "내 기준" weights shown as their own. `places.js`
  gains `eateries` (restaurant/cafe/fast_food); station counts dedupe names.

**Part A — render**
- `q=high` black canvas: high-vs-medium deltas were SAO + MSAA(4) +
  pixelRatio 2; the MSAA HalfFloat-target × SAO readBuffer write-back is
  the prime suspect on ANGLE Metal → `composerSamples: 0` on high, plus a
  runtime black-frame guard (centre-pixel readback at frames 10/45,
  auto-drop high→medium) and a `?sao=0` escape hatch. Pure
  `postChainSpec` + `frameIsUniform` are unit-tested.
- Fog follows framing (`fogRangeFor`: near 1.5×, far 6× framed width,
  per-frame from camera distance); warmer midday sun, higher exposure,
  deeper shade, warm-highlight/neutral-shadow grade, deeper glass +
  balcony bands, darker asphalt vs pavement/grass.
- Night: every residential building lights (exact share where simulated
  residents live, run-wide share ±20 % hash fallback where real
  households exist; tour mode uses an evening estimate curve); lamp halo
  points + bloom; deep-blue night sky, brighter blue hour.

**Part A — UI (Astryx, light)**
- Consult Drawer → docked right panel (portal, shrinks canvas, no overlap;
  open on first visit, slim tab after). Removes the stuck Close tooltip
  and the showPopover error (no Drawer/Popover left).
- Sim bar bottom-left, caption bottom-centre, collapsible quiet legend,
  판단 기록 timeline, captioned title/meta/reason rows, consistent badges.
- Human formatting everywhere (`money/format.js`, UI + agent + fallbacks):
  165.4 km, 35시간 23분, 2억 4,999만 원, always with unit + source badge.
- Compare card tabs: A·B 비교 | 생활비 | 삶의 질 (`?tab=money`).
  생활비: tenure switch per home, stacked bars vs net, 30-day balance
  lines, 가정값 row, price rows, candidates + "C로 추가" (sends through
  the agent; C merges into the tab). Agent: 존댓말 prompt, forecast
  questions get the polite no-forecast + 12-month offer (no more broken
  "수치가 없습니다"); guards extended (forecast/loan/buy verdicts).

## Real outputs (demo couple — PLACEHOLDER inputs, not real data)

Inputs: m1 연봉 6,000만 → 추정 실수령 392.6만, m2 연봉 5,000만 →
329.6만 (가구 722.1만); 보유 현금 2억; A 59.97㎡ / B 84.82㎡; 금리 4 %
30년, 관리비 15만, 승차 1,500원, 장바구니 3만 (all 가정값).

| home · 점유 | 월 주거비 | 부담률 | 월 지출 | 남는 돈 |
|---|---|---|---|---|
| A 전세 | 260.0만 | 36.0% | 387.2만 (주거 260 + 장보기 99 + 관리 15 + 교통 13.2) | 334.9만 |
| A 월세 | 200.0만 | 27.7% | 327.2만 | 394.9만 |
| A 매매 | 1,169.7만 | 162.0% | 1,296.9만 | −574.7만 |
| B 전세 | 250.0만 | 34.6% | 329.2만 (주거 250 + 장보기 51 + 관리 15 + 교통 13.2) | 392.9만 |
| B 월세 | 200.0만 | 27.7% | 279.2만 | 442.9만 |
| B 매매 | 1,107.6만 | 153.4% | 1,186.8만 | −464.7만 |

Events tied to trips: 통근 88 legs (양쪽 동일), 장보기 A 33회 / B 17회.

Price references (parcel+name, 2025-10…2026-10):
- 레이크팰리스 59.97㎡: 매매 중간 26.5억 (26.0–27.0, 13건) · 전세
  9.8억 (47건) · 월세 4억/200만 (45건). 386/408 rows parcel-matched.
- 백현마을 84.82㎡: 매매 25.2억 (28건) · 전세 9.5억 (133건) · 월세
  4.5억/200만 (87건). 667/707 rows parcel-matched.

Top public rental (가구 722만, 60±10 ㎡, 잠실역, 30 % → 191 candidates):
1. 송파구 석촌호수로20길 28-1, 59.95㎡, 보 754만/월 23.7만,
   부담 3.3 %, 통근 11.1분(그래프) → `add_home_c` → C (songpa/서광아트빌).
2. 송파구 올림픽로 333, 51.9㎡, 보 7.0억/월 0 (분양형), 통근 12.1분.
3. 송파구 석촌호수로18길 8-16, 52.28㎡, 보 567만/월 35.3만,
   부담 4.9 %, 통근 13.6분. Notices: 0–1 linked each (address overlap).

QoL: A 통근 125.3분/일 (도보 37.3+승차 가정 88) · 저녁 재택 645.9분 ·
10분 편의 장보기 2/병원 1/식당 17/공원 0/역 0. B 통근 136.4분
(48.4+88) · 재택 631분 · 편의 공원 1, 나머지 0 (실측).

## Commands run and observed output

1. `cd web && node --test tests/*.test.js` → **286 passed** (was 232:
   +11 money suites ≈ 45 tests, +7 render-stage6, +2 guards, +1 scenario).
2. `.venv/bin/pytest tests/ -q` → **138 passed** (unchanged).
3. `node web/scripts/money.mjs --scenario scenarios/demo-two-homes.json --out data/build/sim/` → money.json ✓ (rows above).
4. `cd web && npm run build` → **✓ built** (~1.8 s, chunk-size warning only).
5. Bundle scan: no `*_API_KEY`, no provider/housing URLs, no `/api/consult`.
6. Real-tool probes: `price_reference` parcel+name medians ✓;
   `recommend_public_rental` 191 candidates, first call ~20 s
   (lazy per-area routers, session-cached after), `add_home_c` ✓.

## Orchestrator commands (live, needs network + keys)

```bash
cd web && MODEL_API_KEY=... npm run dev   # consult + money tools (port 5173)
# + HOUSING_API_KEY=... for live public-rental (else dev snapshot)
node web/scripts/simulate.mjs --scenario scenarios/demo-two-homes.json --home both --out data/build/sim/
node web/scripts/money.mjs --scenario scenarios/demo-two-homes.json --out data/build/sim/
```

Capture URLs (serve `web/`, CLIs first):
- `/?mode=sim&home=A&day=3&t=07:30&follow=1&tab=money` (생활비 tab)
- `/?mode=sim&home=A&day=3&t=07:30&follow=1&tab=quality` (삶의 질)
- `/?mode=sim&home=A&day=3&t=21:00` + `&q=high` (night lighting, black-frame check)
- `/?area=songpa-jamsil&shot=2&time=12:00&q=high` (high-daylight check)
- `/?area=songpa-jamsil&shot=2&time=18:30` (blue hour) and `&time=21:00` (tour night estimate)
- Consult: "잠실 집값이 오를까?" (polite refusal) → "59㎡ 실거래 보여줘"
  → "연봉 6천인데 전세 살면 생활비 어때?" → "공공임대 후보 찾아줘" → C로 추가

## What needs live keys / the real GPU

- The look: fog near/far feel at stops vs overview, grade warmth,
  facade contrast at 300 m, night window density vs lamp halos, bloom
  strength, high-vs-medium on the M4 (guard log line proves non-black).
- `?q=high` root cause is narrowed, not proven — if the guard fires,
  its console line says so and medium renders instead; `?sao=0`
  isolates SAO further. SwiftShader can't reproduce ANGLE Metal.
- Live consult round-trip (17 tools, Korean quality, `muse` cap,
  first-`recommend` ~20 s), baseten tool calls, `HOUSING_API_KEY` path
  (dev uses the gitignored snapshot), income never leaves the browser
  (verify in devtools).
- data.go.kr RTMS API backend (services unregistered — CSV only today).

## Known gaps

1. Youth complexes carry no unit prices → never recommended (honest skip).
2. First `recommend_public_rental` builds the songpa router (~20 s);
   later calls in the conversation reuse the session cache.
3. B 편의 counts are 0 within 10 min (real POI sparsity near the
   백현마을 entrance) — the tab shows honest zeros.
4. Panel tab (56 px) still shrinks the canvas; fully hiding it needs a
   scene action the brief didn't ask for.
