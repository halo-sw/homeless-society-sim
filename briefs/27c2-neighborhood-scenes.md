# Stage 27c2 — "이 동네 어때?" and "출근길 보여 줘" work from the conversation (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section: no git, no full suite, no build, no exploring). Branch `chat-27` (27a–27c1 are in). First edit within 3 tool calls. Read only the line ranges quoted here (use `grep -n` when numbers moved). When the named tests pass, stop.

## Why
`docs/product.md`: "이 동네 어때?" → Muse answers with real walking minutes and opens the 3D neighbourhood walk in the work panel; "출근길 보여 줘" / "그 장면 보기" → the 3D scene of that run opens in the panel. 27b2 stores Muse's `open_panel` for `tour | commute | result` as `store.pendingScene` (a `{ type: "scene", panel, home, day, time }` effect from `uiEffects`, `grep -n "export function uiEffects" web/src/ui/chat.jsx`) and does nothing else. 27c1 added `SceneFrame`, `handlers.onScene`, `tourUrl`, and `embed` on `simMomentUrl` / `momentRowUrl`. `find_places` (`web/src/consult/tools.js:600-640`) needs a scenario home, so Muse cannot answer about a candidate yet.

## Changes

### 1. Server tool `neighborhood` — `web/src/consult/tools.js`, `web/src/consult/agent.js`
- `createSession(opts)` (`tools.js:279`) keeps `context: opts.context || null`; `runTurn` (`agent.js`, the `createSession({ … })` call) passes `context`.
- New tool in `TOOL_DEFS` + `HANDLERS`: `neighborhood` — "후보 집 주변 생활 장소까지 실제 걷는 길로 몇 분인지." params `{ candidate_id: string }` required.
  - Find the candidate in `session.context.candidates` by `id`. It needs `scene`, `lon`, `lat`; if missing → `fail("이 집은 아직 3D 동네 자료가 없어요")`.
  - `const area = await needArea(session, cand.scene)`; `router = new Router(area.graph)`; `places = buildPlaces(area, router)`; `resolved = resolveHome(area, { label: "X", area: cand.scene, lon: cand.lon, lat: cand.lat }, router)` (`web/src/engine/scenario.js:497-545` handles lon/lat).
  - For each category in `["station", "supermarket", "convenience", "park", "clinic", "school"]`: `nearestReachable(router, resolved.nodeId, placesOfCategory(places, category), 1)` (same helpers as `find_places`, `tools.js:627-629`) → `{ category, category_ko, name, minutes: round1(lengthM / ADULT_MPS / 60), distance_m }`; skip categories with no hit.
  - Return `{ ok: true, candidate_id, name: cand.name, area: cand.scene, area_label: areaLabel(cand.scene), nearest: [...], speed_note: "minutes assume adult speed 1.3 m/s", source: "OSM 장소 + 보행 그래프" }`.
  - Korean category names: station 역, supermarket 마트, convenience 편의점, park 공원, clinic 병원·약국, school 학교.
- `summarizeToolCall` (`agent.js:84`): `neighborhood` → `동네: ` + the first three `nearest` as `{category_ko} {minutes}분`, `·`-joined.
- `TOOL_ACTION_KO` (`web/src/ui/agent-float.js:72`): `neighborhood: "동네 걸어 보기"`.
- System prompt (`agent.js`, the line starting `"화면은 보여 줄 것이 생겼거나"`): append `동네를 물으면 neighborhood로 걸어서 몇 분인지 확인해 답하고 open_panel(panel=tour, candidate_id)로 3D 동네를 연다. 출근길(commute)과 결과(result) 장면은 살아 보기가 끝난 뒤에만 연다.`

### 2. Context carries what the tool needs — `web/src/ui/chat.jsx` `askAgent`
The context `candidates` items built in `askAgent` (`grep -n "const liveCands"`) read fields that do not exist on Korean candidates (`c.price`, `c.commute_min`). Candidate objects (`web/src/homes.js:618-645`) have `id, name, kind, dong, lon, lat, scene, monthly_cost_won, commute_ko`. Build each item as `{ id, name, kind, dong, commute_ko, monthly_cost_won, scene, lon, lat }` (keep `price` only when present, for US homes). Also, picked homes are listed with their letter (`A`, `B`, `C` in pick order) as `picks: [{ label: "A", id }]` (keep `formatAgentContext` output readable: `찜: A=<id>, B=<id>`). Update `formatAgentContext` (`agent.js:187`) for the new `picks` shape, accepting the old string-array shape too.

### 2b. Pick and run in the same turn — `web/src/ui/chat.jsx`
In `askAgent`'s effect loop, `pick` calls `setPicks(eff.ids)` and `run` then calls `handleRun()`, which reads `stateRef.current.picks` (`grep -n "async function handleRun"`, the `.filter((c) => st.picks.includes(c.id))` line) — still the old picks in the same turn. Give `handleRun(idsOverride = null)` an optional ids list used instead of `st.picks` when given, and pass the ids of the last `pick` effect of the same turn. Also update `stateRef.current.picks` right after `setPicks` in that loop if `stateRef` mirrors state elsewhere in the file (follow the existing pattern).

### 3. Resolve the pending scene — `web/src/ui/chat.jsx`
- `uiEffects` passes `candidate_id` through on scene effects.
- Export a pure `sceneForEffect(eff, { picks, candidates, latestRun })`:
  - `candidate` = by `eff.candidate_id`, else by `eff.home` letter (A = `picks[0]`, B = `picks[1]`, C = `picks[2]`), else the first pick;
  - `tour` → candidate with `scene` → `{ url: tourUrl({ area: candidate.scene, embed: true }), title: \`${candidate.name} 동네\` }`; no candidate or no scene → `{ say: "이 집은 아직 3D 동네 자료가 없어요." }`;
  - `commute` / `result` → needs `latestRun` (`{ customId, moments }`): `home = eff.home || "A"`, the moment `m = latestRun.moments.find((x) => x.label === home)`; `day = eff.day || (m && m.day) || 1`, `t = eff.time || (m && m.t) || "08:30"`; → `{ url: simMomentUrl({ custom: latestRun.customId, home, day, t, follow: 1, embed: true }), title: commute ? \`${home} 출근길\` : \`${home} · ${day}일째 ${t}\` }`; no `latestRun` → `{ say: "먼저 두 집을 찜하고 살아 보기를 맡겨 주세요." }`.
- `latestRun`: the newest `kind: "simulation"` message with `data.status === "done"` and `data.customId` → `{ customId: data.customId, moments: data.moments || [] }`.
- Subscribe to `store.pendingScene` (the same `useSyncExternalStore` pattern as `compareOpen`, `grep -n "compareOpen = useSyncExternalStore"`); when set: compute `sceneForEffect`, then `handlers.onScene(result)` or push the `say` text as an assistant message; then `store.set({ pendingScene: null })`.

## Tests — new `web/tests/neighborhood-27c2.test.js`
- `neighborhood` via `callTool(createSession({ scenario: tinyScenario({ days: 2, background: 0 }), loadArea: async () => tinyArea(), context: { candidates: [{ id: "h1", name: "가나", scene: "tiny", lon: <a lon inside tinyArea>, lat: <lat> }] } }), "neighborhood", { candidate_id: "h1" })` (fixtures in `web/tests/engine-fixture.js`; take the lon/lat of a tinyArea graph node) → `ok: true`, `nearest` items have finite `minutes`. Unknown id or no `scene` → `ok: false`.
- `summarizeToolCall("neighborhood", …)` starts with `동네:`.
- `sceneForEffect`: tour with `candidate_id` → url has `area=` and `embed=1`; tour by `home: "B"` uses `picks[1]`; tour without scene → `say`; commute without `latestRun` → `say`; commute with `latestRun` → url has `custom=`, `embed=1`, title `A 출근길`.
- `formatAgentContext({ picks: [{ label: "A", id: "h1" }] })` contains `A=h1`; the old `picks: ["h1"]` still works.

Run only:
```
cd web && node --test tests/neighborhood-27c2.test.js tests/chat-muse-27b2.test.js tests/scene-panel-27c1.test.js tests/agent-stream-27b.test.js 2>&1 | tail -15
```
