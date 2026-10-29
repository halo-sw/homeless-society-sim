# Stage 12c — Run the simulation for real Korean persona profiles (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/12a-RESULT.md`, `briefs/12a2-RESULT.md` and `briefs/12b-RESULT.md` (if present). Also read `web/src/profile.js`, `web/src/homes.js`, `web/src/transit/schedule.js`, `web/src/sim.js` and `web/src/routines.js`. Sandbox: no network, no keys. Sub-agents allowed (Muse only). You run in a separate git worktree on branch `stage-12c` while stages 12b/13 change the UI on `main`. Do Parts A and B only: new files under `pipeline/`, `scripts/` or `web/scripts/`, `scenarios/personas/`, `tests/`, `web/tests/`, plus `briefs/12c-RESULT.md`. Do not edit UI files (`web/src/ui/*`, `web/src/main.js`). Part C is done later, on top of stage 13. `data/` is symlinked to the main checkout; write only under `data/build/personas/`.

## The user's request (2026-10-29)
"정확도를 입각하여 한국인 페르소나, 직업 특성들을 분석해서 시뮬레이션을 돌려줘", using NVIDIA Nemotron-Personas-Korea.

## Data (orchestrator downloaded)
- **Source:** `nvidia/Nemotron-Personas-Korea` (Hugging Face), CC BY 4.0. It has 1,000,000 synthetic personas, generated to match Korean official statistics (see `data/raw/personas/README.md` for the method and its limits). Raw parquet is in `data/raw/personas/` (never commit).
- **Extract** of people living in our regions: `data/build/personas/regions.jsonl` (68,311 rows; never commit). Each row has every dataset field plus `region`. Rows by region: songpa-gu 12,479, gangnam 10,345, gangdong 8,996, bundang 8,729, suji 6,816, hanam 6,195, seongdong 5,577, sujeong 4,920, jungwon 4,254.
- **Fields:** sex, age, marital_status, family_type (e.g. 혼자 거주, 배우자·자녀와 거주, 부모와 동거), housing_type (아파트, 다세대주택, 단독주택, 연립주택, 주택 이외의 거처, 비주거용 건물 내 주택), education_level, bachelors_field, occupation (KSCO-style names, "무직" for not working), district, province. Free texts: persona, professional_persona, family_persona, sports_persona, arts_persona, travel_persona, culinary_persona, cultural_background, skills_and_expertise(_list), hobbies_and_interests(_list), career_goals_and_ambitions.
- **Not in the data:** salary, cash, workplace location, working hours. Do not invent them silently. See below.

## Part A — what the data says (analysis, pure Python in `pipeline/personas.py`)
1. **Distribution per region:** age bands, family_type, housing_type, occupation groups, and the share working. Weight every persona equally; the dataset is already calibrated.
2. **Target groups** (the product's audience):
   - 사회초년생: 22–34, working, 미혼, 혼자 거주 or 부모와 동거.
   - 신혼·맞벌이: 25–39, 배우자와 거주.
   - 어린 자녀 가구: 배우자·자녀와 거주 or 한부모, adult aged 28–45.
   - 부모와 동거 중 독립 희망. Detect this only from explicit wording in family_persona / career_goals (e.g. "독립", "자기만의 공간"). List the exact phrases used and show 5 example matches.
   Report each group's size per region and its housing_type mix.
3. **Occupation → work pattern.** Map occupations to 5 patterns, with a reviewable table in `scenarios/personas/occupation-patterns.json` (occupation → pattern, reason):
   - 사무 9–6
   - 교대·야간 (경비, 간호, 철도 운송 …)
   - 이른 출근 현장 (건설, 하역, 청소)
   - 이동형 (영업, 배달, 운전)
   - 재택·자영 (소규모 상점 경영자, 온라인 판매 …)
   Each pattern sets departure / return windows and work days. These are **assumptions**: label them "가정 · 직업명 기준" everywhere, and keep them editable. Cover every occupation that appears ≥ 20 times in the extract; the rest go to "기타 → 사무 9–6 가정" with a count.
4. **Workplace.** Use a place named in professional_persona only when the sentence clearly says it is where they work, e.g. "판교의 IT 기업에서", "강남 테헤란로 사무실". Watch out for false hits: 성수기 ≠ 성수, 강남구에 거주 ≠ 강남 출근. Match with word boundaries and a work verb nearby, and report precision on 30 hand-checkable samples. Otherwise the workplace is unknown, and the simulation runs **three labelled what-ifs**: 강남역, 판교역, 잠실역. Show them as "직장 위치를 모를 때: 강남·판교·잠실 출근이라면". Never pick one silently.

## Part B — run the simulation for representative personas
1. **Sample 60 personas:** stratified by region × target group, seeded, working only, from the extract. Write the sampled rows (all fields; persona texts allowed under CC BY 4.0) to `scenarios/personas/sample-60.json`, with attribution fields (`source`, `licence`, `url`). This file is committed.
2. **Profile.** For each persona build a profile through `profile.js` with sources:
   - household from family_type: `derived`, with a note.
   - work pattern from Part A3: `derived`, "가정".
   - workplace from Part A4: `derived` or what-if.
   - tenure from housing_type + age. Mark it "아직 모름" unless the text says it (e.g. 전세 / 월세 in family_persona); never invent it.
   - salary, cash, budget: **missing** (no defaults; the money parts show "고객이 말해야 하는 값").
3. **Candidates.** Run `find_homes` with region = their own region plus regions within 30 min of the workplace by our ride times. With no budget, sort by commute and take 2 candidates of different kinds where possible: apartment vs villa / officetel, the kind that matches their housing_type vs one that doesn't. Then run the 30-day simulation for both (`scenarioFromProfile` with `{network, schedule}`), same seed rules as before.
4. **Outputs per persona:** commute minutes per day (walk + ride + transfers, with sources), early or late days by pattern, crowding minutes, evenings at home, fatigue. A one-line plain Korean summary, e.g. "교대 근무라 출퇴근이 혼잡 시간과 덜 겹쳐 B와 차이가 작아요". Write to `scenarios/personas/results-60.json` (committed; no raw dataset beyond the sampled rows).
5. **Aggregate:**
   - which target group and pattern gains most from being near a station
   - how much the workplace what-if changes the answer
   - where the data is thin (wirye homes, estimate-only ride legs)
   Write `briefs/12c-RESULT.md` with tables and plain-words findings. Don't overclaim: these are synthetic people and assumed schedules.

## Part C — use it in the product (small) — NOT in this run; for stage 13+ (leave notes in the RESULT)
- Add a "비슷한 사람들은 어땠을까" card the agent can show after a customer's own result. It shows 3 sampled personas in the same target group and region, each with their summary line, labelled "합성 인물 · NVIDIA Nemotron-Personas-Korea (CC BY 4.0)".
- Add 3 of them as **예시** profiles on the landing (one 사회초년생, one 신혼, one 자녀 가구), replacing any hand-written persona examples, and label them 예시.
- Add a Nemotron-Personas-Korea section to `ATTRIBUTION.md` with the licence and URL.

## Tests
- Distribution counts on a fixture.
- Target-group rules.
- Occupation-pattern coverage (every occupation with ≥ 20 rows mapped).
- Workplace extraction precision fixture (incl. 성수기, "강남구에 살며").
- No salary / cash default.
- Sample determinism.
- Results file schema.
- What-if labelling.
- Card render.

All existing tests green, `vite build` green, no keys or raw data in git or bundle (only `scenarios/personas/*.json` committed).
