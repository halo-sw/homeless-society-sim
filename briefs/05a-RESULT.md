# Stage 5a result — Astryx UI + "시뮬레이션 상담" agent (Muse)

Date: 2026-10-28. Agent mode, single agent (no subagents —
`AGENTS.md` reserves product code, tests and pipeline scripts to
Muse). All code and tests below are my own. Nothing written by other
agents; nothing delegated.

Forbidden files untouched: `buildings.js`, `ground.js`, `trees.js`,
`lighting.js`, `palette.js` (no `render/` dir exists yet — 5b owns it).
`main.js` keeps every scene/render call; only the UI layer moved out to
`src/ui/` via the store bridge.

## Part A — UI on Astryx (React 19, light theme)

`vite.config.js` gains `@vitejs/plugin-react` (data + `/api/judge`
middleware unchanged). A React root (`#ui-root`, `Theme` +
`neutralTheme`, `mode="light"`) mounts over the canvas; `index.html`
keeps only canvas/tags/vignette/fade/loading. `style.css` keeps the
scene shell; `src/ui/ui.css` carries overlay positioning only (no
colours — those come from Astryx tokens; the swatch boxes reuse the 3D
legend palette passed through the store).

Components per overlay (`web/src/ui/app.jsx`, `consult.jsx`):

| overlay | Astryx components |
|---|---|
| top bar | Card, HStack, Heading, Badge (미니어처), SegmentedControl (지역/A·B/모드), ToggleButton (주거만 강조, 상담), Button (투어 재생) |
| sim clock bar | Card, VStack/HStack, Text (시계), Button (재생, A·B 비교), SegmentedControl (속도, 따라가기), Slider (일차, 시간) |
| 판단 기록 | Card, VStack, Text, Badge (규칙/Spark 1.3/Spark Open) |
| A·B 비교 | Card, MetadataList + MetadataListItem, Text, Badge (그래프/가정값), Banner (오류), Button (닫기) |
| caption cards | Card, Heading, Text, Badge, Button (Muse에게 묻기, dev), Badge live, Banner (라이브 오류) |
| legend | Card, Heading, Text rows + 3D 팔레트 swatch |
| attribution | Text supporting (OSM 링크 포함) |
| simulated-resident note | Text supporting (`시뮬레이션 주민 N명 … · 엔진 재생`) |
| 화면 이동 chip | Badge info |
| 상담 panel | Drawer (non-modal) + DrawerHeader + Layout/LayoutContent, ChatLayout/ChatMessageList/ChatMessage/ChatMessageBubble/ChatComposer/ChatToolCalls, Markdown, SegmentedControl (제공자), Badge, Banner, EmptyState, Text |

State bridge (`src/ui/store.js`, pure, tested): the scene publishes
`set()` (clock, area, mode, homes, caption, judge, judgeLog, compare,
legend, follow, viewChip, consultOpen, scenarioName…) and registers
scene functions (`registerActions`); the UI subscribes
(`useSyncExternalStore`) and calls `act()`. No React/JSX in
`main.js` — it only calls `mountUI()` once and talks to the store.

## Part B — "시뮬레이션 상담" agent

Server side only (`web/src/consult/`, dev middleware
`POST /api/consult`, same pattern as `/api/judge`; key from env,
503 without one). Provider via `judge/providers.js`
(`completeWithTools`, new): meta default `muse-spark-1.3`,
`reasoning_effort: "low"`, `max_tokens` 2000, baseten selectable;
OpenAI-style `tools`/`tool_calls`, `{role:"tool"}` replies.
Max 6 tool rounds per turn. Korean, short.

Tools (all numbers from data/engine; example I/O from real
`data/build`, demo scenario):

- `get_scenario()` → working scenario JSON.
- `update_scenario(patch)` → validates (schema + real area/complex +
  station spelling warnings); `station_ride` **requires** the
  customer's own `ride_minutes`, stamped
  `ride_minutes_source: "user_input"`. Missing → error:
  `…work.ride_minutes가 필요합니다 — 반드시 고객이 말한 숫자여야 합니다…`
- `list_areas()` → the four built areas (+ "전국 생성은 다음 단계").
- `list_complexes(area, query?)` → e.g. songpa-jamsil contains
  `레이크팰리스`.
- `find_places(area, category, home?)` → real POIs with graph
  minutes, e.g. `세븐일레븐 잠실 갤러리아점: 2.8분(217.8m, 그래프)`
  (adult 1.3 m/s noted).
- `list_stations(area)` → e.g. songpa-jamsil contains `잠실`.
- `run_simulation(home, decisions)` → engine in-process; both homes
  returns `compare()` + run ids (`run1`/`run2`, 545 ms for the demo
  30-day pair). `recorded` replays committed decisions when present
  (else rules + note); `muse` judges live (warns cost/time, cap 1 per
  conversation, enforced by scanning the passed history — stateless).
  Demo numbers match stage 4 exactly
  (walk A=1669.8 B=2282.6 Δ+612.8 [graph], …).
- `compare(run_a, run_b)` → metrics with units/sources.
- `get_day(run, day, member)` → e.g. B·3일차·h1 first trip
  `08:18→08:32 commute 레이크팰리스→잠실 13.6분(1057.89m)`.
- `explain_decision(run, decision_id)` → e.g.
  `h1:d2:0498:station_route:00 역 출구 → s0, 규칙`,
  options with graph numbers.
- `set_view({home, day, time, follow, mode})` → UI applies it and
  shows e.g. `화면 이동: B · 3일차 08:18` (same-home =
  in-place, else navigates).

Behaviour: canned greeting asks setup Q1 (who lives); the system
prompt drives one-at-a-time setup (workdays, station, ride minutes
with the 가정값 notice, habits), then offers to run; what-if =
patch, re-run, before/after. Guards (`consult/guards.js`, reusing
4c rounding incl. negative-delta magnitudes): numbers must appear
in this conversation's tool results; price/investment/safety/crime/
school/health refused + redirected; real-life prediction claims
rejected; on failure retry once with a correction note, then the
tool numbers only. UI shows ChatToolCalls rows (name + short
result), provider Badge, per-conversation token/cost counter.
Conversations + scenario live in browser memory only; the server
keeps derived runs in a bounded in-memory cache (20, memory only —
no disk, no conversation storage). First-visit drawer auto-open uses
a `consult-seen` localStorage flag (not conversation content).

Production: the panel shows
"상담은 로컬 개발 서버에서 Muse 키로 동작합니다" plus the recorded
transcript `/scenarios/consult-demo.json`, or an EmptyState when
absent. The prod bundle contains no `/api/consult` at all
(tree-shaken), no keys, no provider URLs (test-enforced).

`consult-demo.json` format (for the orchestrator recording):

```json
{ "messages": [
  { "role": "user", "text": "…" },
  { "role": "assistant", "text": "…(markdown)",
    "toolCalls": [{ "name": "run_simulation", "summary": "both 실행(rules) → A→run1, B→run2", "ok": true, "ms": 545 }] }
] }
```

## Commands run and observed output

1. `cd web && node --test tests/*.test.js` → **193 passed**
   (was 146: +6 store, +7 consult guards, +19 consult tools,
   +6 agent loop, +4 middleware, +2 bundle, +3 providers).
2. `.venv/bin/pytest tests/ -q` → **138 passed** (unchanged).
3. `cd web && npm run build` → **✓ built** (~2.7 s; chunk-size
   warning only — 1.3 MB Astryx+three bundle, gzip 394 kB).
4. Bundle scan: no `MODEL_API_KEY`/`BASETEN_API_KEY`/`api.meta.ai`/
   `inference.baseten.co`; `/api/consult` absent, `/api/judge`
   remains as the pre-existing DEV-gated string.
5. Real-data smoke: `run_simulation(both, rules)` 545 ms, compare
   identical to stage 4; `find_places`/`get_day`/
   `explain_decision`/`set_view` outputs above.

## Orchestrator commands (live, needs network + keys)

```bash
# Dev server with the consult agent (port 5173):
cd web && MODEL_API_KEY=... npm run dev
# (baseten instead: BASETEN_API_KEY=... npm run dev, pick Spark Open in the panel)
# Production-shape check: npm run build, serve dist/ with
# data/build/sim at /data/sim/ and scenarios/ (incl. consult-demo.json) at /scenarios/
```

Three sample conversations (drawer "상담", first visit auto-opens):

1. **Setup → run.** "성인 둘이 살아" → workdays/station/ride
   minutes ("판교역 25분"처럼 숫자를 직접 말하게) → habits →
   "실행해줘" → A·B 비교 수치를 도구 결과 그대로 설명하는지,
   `set_view` 칩이 뜨는지 확인.
2. **Results questions.** "B에서 3일차 구성원 1의 하루를 보여줘"
   (get_day + 화면 이동 칩) → "아침 역 선택은 왜 그렇게 했어?"
   (explain_decision, 판단 주체 Badge 언급).
3. **What-if + muse.** "편의점을 주 3회로 바꾸면?" (patch →
   re-run → 전/후 비교) → "이번엔 Muse 판단으로 실행해줘"
   (비용/시간 경고 후 확인 → cap 1; 두 번째 muse 요구는
   정중히 거절되는지).

Capture URLs (serve `web/`, CLI runs first):

- `/?mode=sim&home=A&day=3&t=07:30&follow=1` (Astryx sim UI + 상담 drawer open by default on first visit)
- `/?mode=sim&home=B&day=3&t=08:19&follow=1` + 상담 panel after asking for B day 3 (view chip)
- `/?mode=sim&home=A&day=3&t=19:15&follow=1` (판단 기록 Card, provider Badge)
- Any sim URL → "A·B 비교" (MetadataList + 그래프/가정값 Badge)
- `/?area=songpa-jamsil&shot=2` (tour UI on Astryx)
- Prod build without `consult-demo.json` (EmptyState) and, after
  recording one, with the transcript

## Not verifiable without a browser / keys

- The actual look: Astryx light-theme density over the canvas,
  drawer/chat/composer layout at 1280×860, slider usability at
  60×, caption/log/compare overlap, Markdown rendering.
- The live consult round-trip (`/api/consult` with a real key):
  real `tool_calls` flow, Korean quality, guard false-positive
  rate, retry/fallback paths, token/cost totals, `muse` run
  duration + spend.
- `set_view` in-place vs navigate behaviour across homes/modes.
- `vite dev` boot (sandbox forbids listening sockets — only the
  middleware code path is tested, as in stage 4).
- Real baseten tool-call support (base URL/auth already TBC).
- `?mode=sim` first-load timing with the React bundle on top.

## Known gaps

1. ChatLayout height inside the drawer content is unproven —
   worst case the composer sits below the messages instead of
   docked (still usable); needs the browser check.
2. The `consult-seen` auto-open flag is per browser, not per
   scenario.
3. Middleware `muse` runs share the 60 s provider timeout per
   call; a full judged 30-day run streams many calls (same as
   `judge.mjs`, just interactive).
4. `ride_minutes_source: "user_input"` (brief 5a) vs the schema
   doc's `"user_assumption"` — the engine accepts both; the doc
   still shows the old value.
