# Stage 7 result — "what and why", highlighting, explicit criteria, torn shadows (Muse)

Date: 2026-10-28. Agent mode, single agent (no subagents — `AGENTS.md`
reserves product code, tests and pipeline scripts to Muse). All code
and tests below are my own.

## What changed

**Part D — explicit criteria (`scenarios/criteria/kr-default.json`, `web/src/engine/criteria.js`)**
- 27 criteria in 5 groups (이동/일상/판단/측정/돈), each with id, Korean
  title, rule sentence, values with units, source, affects, editable.
  The engine imports this file directly and resolves every constant
  from it — no duplicated magic numbers (module constants alias the
  file; an import-time guard fails if file and engine drift).
- `criteria_overrides` in the scenario schema (validated: unknown
  ids/keys, fixed values, and non-numbers throw); precedence is
  overrides > native scenario fields > file defaults. Runs record
  provenance in `meta.criteria.overrides`; overridden values read as
  고객 입력. Engine version is now `sim-engine/5` (additive `cause` +
  `meta.criteria`; all stage-6 metrics reproduce exactly — see below).
- Consult: `list_criteria(group?)`, `explain_criterion(id)` (19 tools
  total), `update_scenario` accepts `criteria_overrides`, `get_day`
  returns causes, the prompt tells the agent to cite criterion ids.
  `living_cost` and `money.mjs` use criteria-resolved money values, so
  consult and CLI timelines agree.
- UI: a "기준" tab (values, source badges, "이 기준을 쓴 순간 보기" jumps
  to the first run event citing the id, editable values re-run through
  the consult what-if path). `docs/criteria.md` renders the list; a
  test pins that every id appears there.

**Part A — "지금 무엇을, 왜" (`routines.js`, `web/src/nowcard.js`, UI)**
- Every trip and stay carries `cause {type, criterion_ids,
  decision_id?, text}` built where it was scheduled. Commute/school =
  routine (with the station_route decision attached when it branched);
  destination/plan chosen by a branch = decision; household schedules
  from scenario inputs without a branch = input (background reads
  routine — its schedule was synthesised). Deterministic; replays
  reproduce byte-identical causes.
- Now card (sim mode, top-left, replaces the thin caption): 지금
  (activity + place + remaining), 왜 (cause verbatim + provider badge
  and reason for Muse judgments), 기준 (clickable chips → the
  criterion), 다음 (next activity, same-day or 내일), progress bar,
  and a 5-line event ticker (depart/arrive/decision/spending, spending
  joined from the money timeline by trip id). Free camera summarises
  each member in one row. Old runs show "이유 기록 없음 (이전 실행)".
- Intro card on entering sim mode (question, who incl. 시뮬레이션
  neighbours, period, measured, 가정값 assumptions, not-judged),
  dismissable, re-openable via "이 시뮬레이션은?". Suppressed for
  `?t=`/`?day=` captures and `?intro=0`.

**Part B — highlighting (`web/src/highlight.js`, `main.js`, UI)**
- Pure `highlightFor()` selector (tested) drives all of it: followed
  ring renders on top (depthTest off), other residents dimmed;
  remaining route bright in the member colour, travelled part faded;
  destination pin + ground marker; station rides a dashed stub labelled
  "지하철 탑승 (가정값 N분)"; home + destination buildings tinted
  (vertex-colour lerp over building ranges, exact restore); QoL hover
  marks the counted POIs (ids now ship in `money.json`, resolved
  through the convenience criterion); decision pulse + 판단 기록 "지금"
  flash + clickable decision/departure ticks under the time slider. No
  flashing; `prefers-reduced-motion` disables the pulse.

**Part C — torn shadows (`render/shadows.js`, `rig.js`, `fade.js`, `textures.js`)**
- Root causes (three compounding, all in code I could inspect):
  1. Ghost casters: `makeFadeable` alpha and the 주거만 강조 opacity
     only touched the colour pass — the shadow-depth pass ignored them,
     so faded/dimmed buildings cast full-strength shadows with no
     visible building above them (exactly the screenshot).
  2. Depth-range acne: near 1 / far ≈ 2200 m with a 480 m span on a
     2048 map, DoubleSide depth writing both faces, and a negligible
     bias at that range → the torn horizontal bands on the ground,
     worst at low sun over long grazing shadows.
  3. `normalBias 1.5` m lifted shadows off the buildings
     (peter-panning), and no texel snapping let the map swim.
- Fixes: faded fragments discard in a matching `customDepthMaterial`;
  dimmed meshes stop casting while dimmed; the frustum fit follows the
  framed area (90–240 m half-extent), near/far hug the scene depth
  along the light (data-driven max height), the target snaps to the
  texel grid in light space, normalBias scales with texel size
  (≈ 0.1–0.35 m, was 1.5), bias −0.0002, `shadowSide: BackSide` on
  facades/roofs. VSM/CSM were considered and not adopted: PCFSoft plus
  the tight fit addresses every cause with far less risk (no VSM light
  leaking, no CSM seam work). Pure maths tests cover the fit.

Two honest deviations from the brief's examples: the engine departs on
a 07:30 anchor + jitter, not backwards from a 09:00 arrival — the
criterion and the Now text document the real rule ("07:30 기준+지터51분
→ 08:21 출발"); inventing arrival planning would also break committed
decision replays (ids embed minutes). Lunch has no trip in the engine —
C-lunch documents the scope exclusion instead of inventing one.

## Real outputs (demo couple)

Cause coverage on the real runs: A 3238 trips + 1619 stays, B 3426 +
1713 — zero without cause (routine 1614/1708, decision 1622/1716,
input 2/2). Stage-6 metrics reproduce exactly (commute walk
1117.6/1452 분, errands 33/17, evening 19376/18930 분, 전세 260/250만).

구성원 1 · day 0 (Mon) · home A:

| time | what | cause |
|---|---|---|
| 08:21→08:35 | 출근 레이크팰리스 → 잠실 | routine · 월 근무일 · 07:30 기준+지터51분 → 08:21 출발 (C-commute-depart, C-walk-speed, C-walk-route, C-work-days, C-ride-minutes) |
| 08:35→18:35 | 잠실 방면 근무 | same routine cause |
| 18:35→18:47 | 퇴근 잠실 → 레이크팰리스 | same routine cause |
| 19:17→19:20 | 장보기 → 세븐일레븐 잠실 갤러리아점 | decision h1:d0:1157:shop_choice:00 · 판단 → 세븐일레븐 선택 (고객 입력 주 2회) — Muse 판단: "퇴근길 시장 구경을 즐겨 저녁 산책 겸 들르기 좋다" (committed file) |
| 19:20→19:35 | 세븐일레븐 장보기 | same decision cause |

구성원 1 · day 0 · home B: same shape, 08:21→08:37 백현마을 → 판교
(routine + station_route h1:d0:0501 attached), 19:24→19:36 장보기 →
7-Eleven (decision h1:d0:1164:shop_choice:01, Muse: "아침 산책과 퇴근길
시장 구경을 즐기기에 좋다").

Criteria summary (27): 이동 7 (C-walk-speed, C-walk-route,
C-commute-depart, C-work-days, C-work-hours, C-ride-minutes,
C-station-route), 일상 11 (C-lunch, C-grocery-freq, C-shop-dwell,
C-park-habit, C-park-dwell, C-clinic-freq, C-clinic-dwell,
C-daily-rhythm, C-weekend-plan, C-neighbour, C-sim-window), 판단 2
(C-decide-kinds, C-ask-muse), 측정 4 (C-measure-walk,
C-measure-commute, C-measure-evening, C-convenience-radius), 돈 4
(C-money-fare, C-money-basket, C-money-fixed, C-burden-rule).

Override end-to-end on real data (3-day check): dwell 42 분 and fare
2000 원 applied, `meta.criteria.overrides` recorded, money timeline
events carry −2000 원 per leg.

## Commands run and observed output

1. `cd web && node --test tests/*.test.js` → **334 passed** (was 286:
   +engine-criteria 16, +engine-cause 6, +consult-criteria 5, +nowcard 9,
   +highlight 7, +shadows 5; the tool-list test now pins 19 tools).
2. `.venv/bin/pytest tests/ -q` → **138 passed** (unchanged).
3. `node web/scripts/simulate.mjs --scenario scenarios/demo-two-homes.json --home both` → A/B + compare ✓; same input twice → identical sha256.
4. `node web/scripts/money.mjs --scenario scenarios/demo-two-homes.json` → money.json ✓ (stage-6 numbers + spending_events 123/107, poi_ids, criteria block).
5. `cd web && npm run build` → **✓ built** (~2.2 s, chunk-size warning only).
6. Bundle scan: no `*_API_KEY`/`Bearer`/provider or housing URLs; only
   pre-existing same-origin `/api/judge` (dev-gated) and the `baseten`
   provider id/label strings.

## Orchestrator commands (live, needs network + keys)

```bash
cd web && MODEL_API_KEY=... npm run dev   # consult + criteria tools (port 5173)
node web/scripts/simulate.mjs --scenario scenarios/demo-two-homes.json --home both --out data/build/sim/
node web/scripts/money.mjs --scenario scenarios/demo-two-homes.json --out data/build/sim/
```

Capture URLs (serve `web/`, CLIs first):
- `/?mode=sim&home=A&day=1&t=08:28&follow=1` — Now card mid-commute
  (08:21→08:35 trip): 지금/왜/기준 chips/다음 + route + dest pin.
- `/?mode=sim&home=A&day=1&t=19:18&follow=1` — errand trip with the
  committed Muse decision (h1:d0:1157, "퇴근길 시장 구경을…"): provider
  badge + reason in the Now card, tick + 판단 기록 flash at 19:17.
- `/?mode=sim&home=B&day=1&t=12:00&follow=1` — ride-away stub
  ("지하철 탑승 (가정값 30분)") while h1 works.
- `/?mode=sim&home=A&day=1&t=08:28` — 자유 시점: household rows, no
  follow dimming, home tint only.
- `/?mode=sim&home=A&day=1&t=08:28&follow=1&tab=criteria` — 기준 tab;
  hover 장보기 in 삶의 질 (home A, 17 eateries + 2 grocery) for POI
  markers.
- `/?mode=sim&home=A` — intro card opens (no `?t=`).
- Shadow-tear repro: `/?area=songpa-jamsil&shot=2&time=08:00` (and
  `shot=1`) — POI stops embedded in host towers (w1417693978 /
  w1417693980) that the occlusion logic fades; pre-fix they cast full
  ghost shadows, torn into bands by the old frustum at low sun. Also
  pangyo `shot=4` and seongsu `shot=4`, and sim + 주거만 강조 (dim
  path). Post-fix these should read clean with shadows attached to
  visible buildings.

## What needs live keys / the real GPU

- The shadow fix is reasoned from the code and pure maths, not proven
  on ANGLE Metal: verify the repro URLs above show attached, untorn
  shadows, faded towers cast nothing, and no swimming while the camera
  drifts. SwiftShader cannot reproduce the banding.
- Highlight look at miniature scale: ring/route/pin readability,
  tint subtlety vs the facade grade, pulse calmness, QoL marker
  density (A eateries), tick alignment under the slider.
- Now/intro/기준 layout on a real viewport (the 330 px left stack,
  intro centring, criteria tab length).
- Live consult round-trip for `list_criteria` / `explain_criterion` /
  overrides → re-run, and the 기준 tab "상담으로 다시 실행" path (dev
  server + keys; production shows the panel with an error, same as any
  consult what-if).
- Perf spot-check: per-minute highlight refresh at 60×, tint rebuild
  on destination change.

## Known gaps

1. B's 10-minute convenience is still ~empty (real POI sparsity) —
   the hover highlight has almost nothing to show there; use A.
2. 기준 tab re-runs go through the consult agent (needs dev + keys);
   there is no one-click local re-run.
3. The Now card shows the run's recorded causes; a live `decisions=muse`
   re-run in consult produces new reasons only for new branches.
