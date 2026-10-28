# Stage 9a — Mission, personas and priorities (education · life · safety) (brief for Muse)

Agent mode. **Read `AGENTS.md` first — the rules were revised on 2026-10-29 (mission, safety/education statistics, priorities, support programmes, 전세 risk).** Then `briefs/07-RESULT.md`, `briefs/08-RESULT.md`, `README.md`. Sub-agents allowed (Muse only). Sandbox: no network, no keys.

## The user's mission (verbatim intent)
"I and my Gen-Z peers will have to make a very careful decision when we buy a home. For every couple about to marry in Korea, for first-job workers and office workers, nothing needs more care than real estate. I wanted a service where an agent — one person or two — lives there as a simulation, so you can judge whether the living conditions are really fine. Worldwide, taking a mortgage needs a financial simulation: is it really worth it? People weigh education infrastructure, the couple's life, or safety differently — I want to simulate with all of these, evenly. 전세사기 has had many victims, mostly in their 20s–30s; I want a simulation, even a mock one, to warn people. And at the same salary there are public rentals and government benefits — I want to pull them from open APIs and make them intuitive. I want to **democratise real-estate knowledge**."

This stage: personas, priorities, safety and education. Stage 9b (next): worth-it finance, 전세 safety check, support programmes.

## Part A — personas and household size
1. Scenario templates in `scenarios/personas/`: **1인 사회초년생** (one adult, first job, small budget), **예비·신혼부부** (two adults, both working), **맞벌이 + 초등학생 자녀** (two adults + one child with a school route; the engine already supports `child` roles — verify school trips and the walking speed criterion). Each template documents its placeholder inputs (labelled 가정값).
2. The consult agent's first question becomes "어떤 상황이세요?" with these three plus 직접 입력; it then asks priorities (Part B). One adult must work end-to-end (1-person household: compare, money, Now card, fatigue).

## Part B — priorities ("내 기준")
1. Five priority groups the customer weights explicitly (0–5 each, no defaults beyond "모두 보통"): **교육**, **두 사람/나의 생활** (commute, evening time at home, fatigue, leisure trips), **치안**, **돈**, **생활 편의**. Each group maps to named metrics with units and sources (list them in `docs/criteria.md` and the 기준 tab).
2. Comparison view "내 기준으로 보기": per group, A vs B (and C) metrics side by side; the customer's weights shown as theirs ("고객님이 정한 비중"). If the customer asks for one number, show their weighted view with the formula visible; never a default ranking, never "추천 집".
3. The consult agent asks for weights in plain words ("아이 교육이 가장 중요하세요?") and cites which metrics each priority uses.

## Part C — safety (official statistics)
1. **경찰청 범죄 발생 지역별 통계** — `data/raw/safety/경찰청_범죄 발생 지역별 통계_20251231.csv` (cp949; rows = 범죄대분류, 범죄중분류; columns = 시군구 such as "서울 송파구", "서울 성동구", "경기도 성남시"; values = counts for the year ending 2025-12-31). Loader + per-area view: counts by 대분류 and selected 중분류, with source, period, unit and geographic level. **성남시 is city-level (판교/분당 not separable)** — say so on screen. Counts are where crimes were recorded, not a resident's risk — say so. Per-population rates only when a population table is present (`data/raw/safety/population*.csv`, optional; skip with a note if absent). No safety score, no ranking, no colour-coded "danger".
2. Do not commit the CSV (data/raw is ignored). Attribution: "경찰청 범죄 발생 지역별 통계 (2025년)" in `ATTRIBUTION.md` and on screen.

## Part D — education (data we have)
1. From OSM in each built area: schools by level (초·중·고), kindergartens / childcare, libraries, academies (`amenity=school|kindergarten|childcare|library`, `office|amenity=…` tagged academies / 학원 where present) — with **graph walking minutes** from each home (not straight-line), counts within 10 / 15 minutes, and the child's simulated school route (minutes, crossings of primary roads).
2. Flag completeness honestly: OSM coverage of 학원 is partial — "OSM 기준, 실제보다 적을 수 있음". School quality, test scores and 학군 rankings are out of scope (AGENTS).
3. Leave a documented adapter seam for official sources that need keys later (학교알리미 / NEIS 학교·학원 정보) with fixtures, not calls.

## Part E — the mission in the product
1. Intro card / landing copy: "부동산 결정, 혼자 알아보기 어렵죠. 살아 보고(시뮬레이션), 계산해 보고(돈), 위험 신호를 확인하고(전세), 받을 수 있는 지원을 보고(공공임대·지원 제도) 직접 결정하세요." Short, polite, no hype.
2. A small glossary the agent and UI share (`web/src/ui/glossary.js`, plain-Korean definitions): 전세, 월세, 매매, 전세가율, LTV, DSR, 확정일자, 전입신고, 전세보증보험, 공공임대, 주거비 부담률 — each with a source link where it is an official term. Terms in the UI show the definition on hover/tap.

## Tests
Persona templates validate and run (1-person and child cases, determinism), priority mapping (every metric has unit + source), weighted view maths with explicit weights only, crime CSV loader on the real file (cp949, 송파구/성동구/성남시 columns, totals per 대분류), no-score guard (UI/agent never emits a safety/school score or ranking — test with a fake provider), OSM education counts and graph minutes on built areas, glossary coverage. Existing tests stay green; `vite build` passes; bundle has no keys or raw data.

## Output
`briefs/09a-RESULT.md`: what changed, per-area safety table (with the caveats), education counts per home, the three persona runs (one-line summaries), capture URLs (persona pick in consult, 내 기준으로 보기, safety and education views), and what needs keys.
