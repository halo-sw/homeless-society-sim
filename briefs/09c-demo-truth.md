# Stage 9c — Make the demo tell the truth: per-home commute, the ride as a visible trip, and calmer cards (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/08-RESULT.md` (incl. 8b, 8c), `briefs/09a-RESULT.md`, `briefs/09b-RESULT.md`. Sandbox: no network, no keys.

**Merge first:** branch `fix-8c` (8c: `web/src/station-areas.js`, two `bboxToXY` call sites in `main.js`, smoke test) was merged into `main` by the orchestrator before this run. If `git status` shows conflict markers, resolve them keeping both 8c's fix and 9a/9b's changes, then run the full suite.

Attached captures (real GPU, at 8c): `briefs/img/08c-follow.png` (follow 구성원 1 from home A at 08:30 / 08:50 / 09:02 / 19:18) and `briefs/img/08b-free-compare.png` (free camera, compare tab, intro).

## Part A — the demo scenario must reflect the real question
Today `scenarios/demo-two-homes.json` gives every member `work: station_ride` from the **home's** station with a 30-minute ride in both homes (B = 판교 also rides 30 minutes to nowhere). With work near 판교역 this hides the difference the product exists to show (B walks 38 h vs A 27 h in 30 days; fatigue A 25.3 vs B 23.2).
1. Workplace is a **place**: `work.place` (name, lon/lat or a POI/station id) — for the demo, an office near 판교역 (use a real OSM POI or the station itself; label it "직장 (가정: 판교역 인근)"). Per home, the engine derives the commute: if the workplace is inside the home's built area and reachable on the walking graph within a criterion limit (e.g. ≤ 25 min, `C-walk-commute-max`), walk; otherwise walk to the home station → ride the station path (stage 8 network, split minutes) → walk from the destination station to the workplace (graph minutes when the destination is a built area).
2. The ride total stays customer input (가정값), but per path: A = 잠실→판교 (input, e.g. 30 min); B = no ride. Keep the old `station_ride` form working for other scenarios.
3. Update the persona templates (9a) the same way. Re-run and report A vs B: commute minutes/day, walking, fatigue, money (fares only where rides happen).

## Part B — the ride is a trip, not "work"
At 08:50 the Now card says "잠실 방면 근무 중 · 18:35까지" and the camera stays in 잠실: the engine marks the member as at work from the moment they reach the home station, and the journey view never appears on a static `?t=` load.
1. Engine: the ride is its own leg with start/end minutes (walk → ride → walk), cause and congestion per leg; "근무" starts on arrival at the workplace. Label work by the workplace ("판교역 인근 직장 근무"), never "<home station> 방면 근무".
2. Now card during the ride: "지하철 이동 중 · 2호선 잠실→강남 (약 9분) · 환승 · 신분당선 강남→판교" with minutes left, congestion % and source badge per leg.
3. Journey camera must engage on **any** clock position inside the ride (static load, slider drag, playback), not only when playback crosses the departure. Add a pure test: for `t` inside the ride the camera state is cruise; before → street; after → descended at the destination.

## Part C — calmer, clearer cards
1. Criteria chips: show at most 3 most relevant; the rest behind "+7개 기준". Same for the event ticker (last 3 visible, expandable).
2. 판단 기록 card overlaps the legend (bottom-left) — lay out the left column so cards never overlap (stack with max-heights and internal scroll, or collapse the legend when the Now card is tall).
3. Night at 19:18 (`errand` capture): lit towers are blown out into white blocks and the scene is hazy. Clamp window emissive + bloom so façades keep their window grid; keep lamps as small warm points.
4. Show 2호선 crowding as a number everywhere fatigue is shown ("혼잡도 93 %, 서서 감"), because 0 minutes over 100 % is a true measurement, not a missing value.

## Tests
Per-home commute derivation (A rides, B walks) on the real graph and network; ride leg timing and labels; camera state for static `t` inside/outside the ride; chips/ticker truncation; demo re-run determinism; all existing tests green; `vite build`.

## Output
`briefs/09c-RESULT.md`: before/after A vs B table (commute, walking, fatigue, fares), the 08:30/08:50/09:02 Now-card texts for 구성원 1 in A and B, capture URLs, what needs the real GPU.
