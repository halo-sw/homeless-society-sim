# Stage 7 — "What and why" while it plays, highlighting, explicit simulation criteria, and the torn shadows (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/06-RESULT.md`, `web/src/ui/app.jsx`, `web/src/main.js`, `web/src/render/rig.js`, `web/src/engine/` (routines, decisions), `docs/scenario-schema.md`. Sub-agents allowed (Muse only). Sandbox: no network, no keys.

Attached:
- `briefs/img/06-user-shadow-tear.png` — **the user's own screenshot** (Mac, Chrome, real GPU): building shadows on the ground are torn into horizontal stripes and float with no building visible above them.
- `briefs/img/06-gpu-grid.png` — current captures (real GPU): 생활비 tab, 삶의 질 tab, 잠실 high→medium, night, 성수 blue hour, 판교 noon.

User feedback (verbatim intent):
1. "While the simulation plays, it never says **what** is being done and **why**. Fix that."
2. "The shadows come out torn like this." (screenshot)
3. "I want **highlighting** in the simulation."
4. "I want **more detailed criteria** for the simulation."

## Part A — "지금 무엇을, 왜" (always visible while playing)
1. **Now card** (replaces the thin caption in sim mode; Astryx Card, top-left under the bar). For the followed member, one line each:
   - **지금**: activity verb + place, e.g. "출근 중 · 백현마을 → 판교역 (도보 8분 남음)", "장보기 · 이마트 성수점 (25분 머묾)", "집 · 저녁 시간".
   - **왜**: the cause in plain Korean, from the engine, not invented: the routine rule that scheduled it ("평일 근무일 · 09:00 도착 목표 → 08:04 출발"), or the decision that chose it ("Muse 판단: '퇴근길 시장 구경을 즐겨 저녁 산책 겸 들르기 좋다'" with provider badge), or the scenario input ("고객 입력: 주 2회 장보기").
   - **기준**: chip(s) naming the criterion ids used (Part D), clickable → opens that criterion.
   - **다음**: next planned activity and time ("12:00 점심 · 회사 근처").
   - A small progress bar for the current trip / stay.
   Engine: every trip and stay must carry a `cause` object `{type: "routine"|"decision"|"input", criterion_ids: [...], decision_id?, text}` produced where the trip is scheduled (routines.js / decisions.js). Deterministic; recorded runs keep it. Older runs without it show "이유 기록 없음 (이전 실행)".
2. **Intro / purpose card** on entering sim mode (dismissable, re-openable from a "이 시뮬레이션은?" button): the question being answered ("같은 가구가 A와 B에 살면 30일 동안 시간·돈·생활이 어떻게 다른가"), who (household members and roles, simulated neighbours count, labelled 시뮬레이션), period, what is measured, what is assumed (with 가정값 badges), what is not judged (price forecast, loans, eligibility).
3. **Event ticker**: when the clock passes an event of the followed member (depart, arrive, decision, spending from the stage-6 money timeline), show a short toast-like line in the Now card history ("08:04 출발 · 교통비 1,500원"). Last 5 kept, compact.
4. When following "자유 시점" (no member), the Now card summarises the household: each member's current activity in one row.

## Part B — highlighting (3D scene)
1. **Followed resident**: a clear marker (ring on the ground + slight glow/outline, colour per member), always visible through buildings (render on top, small size). Other residents dimmed (lower opacity/saturation) while following.
2. **Route**: the current trip's remaining path as a bright line ahead of the resident, the travelled part faded behind; destination marker with a label pin ("판교역", "이마트"). Station-ride legs drawn as a dashed line labelled "지하철 탑승 (가정값 35분)" or hidden with a note when off-area.
3. **Places**: home building and the current destination building highlighted (rim/tint), so the user sees where they live and where they go. In 생활 편의 (quality tab) hovering a category highlights the counted POIs within 10 walking minutes.
4. **Decision moments**: when a decision fires, a short pulse at the resident and the 판단 기록 row lights up; the time slider shows tick marks for the followed member's decisions and departures (click → jump).
5. Keep it calm: no flashing; respect `prefers-reduced-motion` (no pulse, static markers).

## Part C — torn shadows (real GPU bug, see screenshot)
The screenshot shows striped, broken shadows of buildings that are not visible (probably faded by the camera occlusion fade or culled), on a large flat ground. Investigate and fix all causes, with notes in the result:
- Faded/hidden buildings must not cast shadows (or must cast consistent ones): check `makeFadeable` / occlusion fade and the `주거만 강조` dim path — transparent or faded meshes still render into the shadow map; if fading uses discard/dither, the depth pass must match or skip.
- Shadow acne / banding: `render/rig.js` uses `bias -0.0004`, `normalBias 1.5`, `mapSize 2048` over `shadowSpan` up to 240+ m and `far = dist*2+600`. Tighten the shadow camera to the framed area (fit near/far to the scene bounds), use texel snapping to avoid swimming, tune bias/normalBias for metres scale, and consider `VSMShadowMap` or `CSM` on high. DoubleSide facade materials can cause acne — set `shadowSide` appropriately.
- Buildings must sit on their shadows (no peter-panning gaps at the base).
- Add a pure test for the shadow-frustum fit maths, and a headless capture check if feasible.

## Part D — explicit simulation criteria ("시뮬레이션 기준")
1. Create `scenarios/criteria/kr-default.json`: every rule the engine uses, each with `id` (e.g. `C-commute-depart`), Korean `title`, `rule` (plain sentence), `values` (with units), `source` (`engine 기본값` / `고객 입력` / `데이터: OSM` / `데이터: 실거래가` / `가정값`), `affects` (which metrics), and `editable` (bool). Cover at least: walking speed and graph routing, departure time from target arrival and buffer, workdays and work hours, station ride minutes, lunch, grocery / convenience frequency and dwell, park/walk habits, clinic visits, weekend plan options, neighbour behaviour, decision kinds and their option sets, when Muse is asked vs rules, what counts as 걷는 시간 / 출퇴근 도보 / 저녁 재택, money events (fare per trip, basket per errand, fixed costs, payday), the 10-minute convenience radius, the 30 % housing-cost rule of thumb.
2. The engine reads its constants from this file (no duplicated magic numbers; tests assert every constant used comes from criteria). Scenario can override per criterion; overrides show 고객 입력.
3. UI: a "기준" tab in the compare card (next to A·B 비교 / 생활비 / 삶의 질) listing criteria grouped (이동, 일상, 판단, 측정, 돈), each with values, source badge, and "이 기준을 쓴 순간 보기" (jumps to the first event using it). Editable ones can be changed and re-run (same as consult what-if).
4. Consult agent: tools `list_criteria(group?)`, `explain_criterion(id)`, and `update_scenario` accepts criterion overrides. The agent cites criterion ids when explaining why.
5. `docs/criteria.md`: the same list rendered for the README / judges.

## Tests
Cause attached to every trip/stay on a real run (no trip without cause), determinism unchanged with seed, criteria file schema and "no magic numbers" check, Now-card text builder (pure) for commute / errand / decision / home / old-run cases, highlight state selector (pure: which ids are highlighted for a given clock and follow), shadow frustum fit maths, criteria tools in the consult agent with a fake provider. `vite build` passes; bundle has no keys. Existing tests stay green.

## Output
`briefs/07-RESULT.md`: what changed, the root cause(s) of the torn shadows, real outputs (a sample of causes for one day of 구성원 1 in A and B), the criteria list summary, capture URLs (sim following a member at 08:04 commute, an errand with a Muse decision, 자유 시점, 기준 tab, a scene where the shadow tear appeared — say which camera/time reproduces it), and what needs the real GPU.
