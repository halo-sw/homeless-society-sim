# Stage 29a11 — US answers cite US sources; replies never show internal home ids (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Orchestrator replayed `public/recorded/menlo-month.json` (`?replay=menlo-month&lang=en`) and listed every `Sources checked` row:
```
0 (text answer, turn 1)  MOLIT Real Transaction Price Disclosure System
1 (candidates card)      Zillow ZORI · OpenStreetMap (Northern California extract, Geofabrik) · USGS
2 (text answer, turn 2)  MOLIT Real Transaction Price Disclosure System · OSM · GIS integrated building data
3 (simulation card)      Zillow ZORI · OpenStreetMap (Northern California extract, Geofabrik) · USGS
```
Cards are right (26k `chipSourceIds`). Text answers are wrong: `AssistantMsg` (`web/src/ui/consult.jsx:82-104`) calls `CiteRows` with `msg.data.result.candidates`, but a text message has no `data` — the candidates live on the separate card. So `citationsFor` (`web/src/ui/agent-float.js:181`) falls back to the Korean table and a Menlo Park answer cites the Korean land ministry and Korean building data. The text message does carry its tool calls with arguments, e.g. `find_homes {profile:{currency:"USD", …}}`, `pick_homes {candidate_ids:["us-home-0027","us-home-0028"]}`, `build_scenario {home_ids:["us-home-0027",…]}`.

Also seen live once: Muse wrote a raw id (`us-home-0027`) in a reply. Korean ids look like `home-004607`.

And the US OSM chip has no short name, so it shows the long `OpenStreetMap (Northern California extract, Geofabrik)`.

## Change

### 1. US tool context — `web/src/ui/agent-float.js` (`citationsFor`, `:181`)
- New exported pure `isUsToolContext(toolCalls)`: true when any call's `args.profile.currency === "USD"`, or any id in `args.candidate_ids`, `args.home_ids` or `args.candidate_id` starts with `us-`.
- `citationsFor(toolNames, { candidates, toolCalls })`: when `isUsHomeList(candidates)` (existing) **or** `isUsToolContext(toolCalls)`, map each tool through a new `US_CITATIONS` table of `sources.js` ids, dedupe, keep order:
  - `find_homes`, `price_reference`, `living_cost`, `worth_it`, `check_listing` → `zillow-zori`
  - `find_homes`, `run_simulation`, `compare`, `get_day`, `build_scenario`, `find_places`, `list_stations`, `get_journey`, `get_education` → `osm-us`
  - `run_simulation`, `build_scenario`, `open_panel` with a map → nothing extra (keep it short)
  - Korea-only tools (`get_safety`, `jeonse_check`, `mock_deposit_loss`, `support_programs`, `recommend_public_rental`, `add_home_c`, `find_public_rentals`, `get_fatigue`, `list_complexes`) → nothing.
  The Korean path stays exactly as today when neither condition holds.
- `web/src/ui/consult.jsx`: `CiteRows` takes `toolCalls` and passes it through; `AssistantMsg` passes `toolCalls={msg.tool_calls || []}`. `CardMsg` in `web/src/ui/chat.jsx:~1041` also passes `toolCalls={msg.tool_calls || []}` (its `sourceIds` override still wins).

### 2. Short name — `web/src/sources.js` (`osm-us`, `:177`)
Add `short: "OSM (US)"`.

### 3. No internal ids in replies — `web/src/consult/agent.js`
- One line in `SYSTEM_PROMPT` (Korean like its neighbours): `도구가 쓰는 id(home-004607, us-home-0027 같은 것)는 답에 쓰지 않는다. 집은 이름으로 부른다.`
- New exported pure `replaceInternalIds(text, nameById, lang)`: replaces every `\b(?:us-)?home-\d{3,}\b` with `nameById[id]` when known, otherwise `이 집` (`lang !== "en"`) / `this home` (`lang === "en"`). Text without ids is returned unchanged.
- Apply it to the accepted final text in every final branch (the places that call `splitSuggestions`, `grep -n "splitSuggestions(" web/src/consult/agent.js`, today `:344`, `:368`, `:422`), after splitting. Build `nameById` from tool results seen in this turn: every `candidates` array in a tool result (`c.id` → `c.name || c.complex_name`). If the loop has no easy access to results, collect them where tool results are already stored for summaries (`summarizeToolCall`).

## Test — new `web/tests/us-citations-29a11.test.js`
- `isUsToolContext([{ name: "find_homes", args: { profile: { currency: "USD" } } }])` → true; with `currency: "KRW"` → false; `[{ name: "pick_homes", args: { candidate_ids: ["us-home-0027"] } }]` → true; `[]` → false.
- `citationsFor(["extract_profile","find_homes","open_panel"], { toolCalls: [{ name: "find_homes", args: { profile: { currency: "USD" } } }] })` titles include `Zillow Observed Rent Index (ZORI)` and the `osm-us` name, and none contains `국토교통부`.
- `citationsFor(["pick_homes","build_scenario"], { toolCalls: [{ name: "build_scenario", args: { home_ids: ["us-home-0027"] } }] })` has no `GIS건물통합정보` and no `국토교통부`.
- Korean unchanged: `citationsFor(["find_homes"], { toolCalls: [{ name: "find_homes", args: { profile: { currency: "KRW" } } }] })` → first title `국토교통부 실거래가 공개시스템`.
- SSR `AssistantMsg` with `{ role: "assistant", content: "Found homes", tool_calls: [{ id: "a", name: "find_homes", args: { profile: { currency: "USD" } } }] }` and `toolRows: {}` → contains `Zillow ZORI`, not `실거래가`.
- `replaceInternalIds("You picked us-home-0027 and us-home-0099.", { "us-home-0027": "10 Coleman Place" }, "en")` → `You picked 10 Coleman Place and this home.`; Korean `home-004607 좋아요` with empty map, `ko` → `이 집 좋아요`.
- `SYSTEM_PROMPT` contains `id(home-004607, us-home-0027`.
- `sourceById("osm-us").short === "OSM (US)"` (import from `agent-float.js`).

Run only:
```
cd web && node --test tests/us-citations-29a11.test.js $(grep -ln "citationsFor\|CiteRows\|AssistantMsg\|SYSTEM_PROMPT\|chipSourceIds" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Update older pins only where they assert the exact old US-less behaviour of text answers or the exact `SYSTEM_PROMPT` length/line count.

## Do not touch
Landing files, map / 3D / engine files, `web/src/i18n/dom.js`, recordings in `web/public/recorded/`.

## Final message
Changed files, one line each. Nothing else.
