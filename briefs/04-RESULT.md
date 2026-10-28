# Stage 4 result — Muse judgment layer (Muse)

Date: 2026-10-28. Agent mode, single agent (no subagents —
`AGENTS.md` reserves product code, tests and pipeline scripts to
Muse). All code and tests below are my own. Nothing written by other
agents; nothing delegated.

Engine is now `sim-engine/4` (commute split, weekend plans). Old run
files are stale (regenerated below); bare `{id, chosen_key}` decision
files still replay.

## Part A — fixes from the stage 3 captures

1. **Commute split.** `commute_away_minutes` (fixed work block) is gone
   from daily/totals/compare, replaced by `commute_walk_minutes`
   [graph: station/school legs both ways] and `commute_ride_minutes`
   [scenario: 2 × `ride_minutes` per executed `station_ride` commute].
   Demo 30-day: walk A=1117.6 B=1452 (Δ+334.4, homes differ), ride
   2640 = 2640 (same assumption, honestly identical). The workday
   block itself still lives in the `aways` records.
2. **`?t=` pauses.** `shouldAutoplay()` (`web/src/sim.js`, tested):
   `?t=` pauses the clock (sim `HH:MM`, tour seconds), `?play=1`
   opts into playing, no `?t=` plays as before. Sim and tour play
   buttons reflect the initial state.
3. **Night rework.** Deep blue-violet sky (`0x23264d`), ground and
   buildings keep their hue at lower value overnight (material tints
   multiply the vertex colors — the old full-vertex warm wash is
   gone), moonlight + warm dusk (`duskFactor`, 17–20 h peaking
   18:30). Lit windows are warm quads (`web/src/windows.js`, tested)
   on façades of buildings with residents at home, 2 per resident
   from run occupancy. Jamsil: 706 buildings → 19,480 slots (11 ms
   plan); day 3 02:00 lights 42 buildings / 124 windows; day 19:00
   similar. No NaNs, day 0 windows, none lit.
4. **Household visibility.** Capsules ~4 m, per-member ground ring in
   the member color, HTML name tag ("구성원 1") projected each frame;
   rings/tags show out and at home, hide only while away out of area.
   Follow mode snaps (≤ 60 m glides) so the member stays in frame at
   60×.
5. **Tour occlusion.** Verified the test uses actual heights (same
   `max(2.5, height_m || 6)` clamp as the renderer) and the settled
   camera pose (same `tourOffset`/aspect/pitch as `poseFor`; `?shot=`
   snaps exactly). Root cause of stop 2: the 치과 POI sits **inside**
   the footprint of a 149 m tower, which the test excludes as "own
   building" — score 0, yet the host face fills the frame. Fix:
   `hostTowerIds()` (buildings ≥ 40 m containing a POI-stop anchor)
   plus residual `occludingIds()`, both faded to 0.22 alpha via a
   per-vertex `afade` attribute (Lambert `onBeforeCompile`,
   tour-only). The old candidate set also missed `[1,-1]`
   (asymmetric); candidates are now 8 compass + 8 half-winds, default
   first. Faded stops: jamsil 1 (1 occluder) + 2 (host `w1417693978`),
   pangyo stop 4 (2 hosts), seongsu stop 4 (1 host).

## Part B — judgment layer (`web/src/judge/`, Node-side)

Providers (`providers.js`, `fetch`, no SDK): `meta`
(`https://api.meta.ai/v1`, `muse-spark-1.3`, `MODEL_API_KEY`) and
`baseten` (`https://inference.baseten.co/v1`, TBC by the orchestrator,
`meta-models/muse-spark-open-1026`, `BASETEN_API_KEY`). One
`complete()` interface: `json_schema` structured output with a
JSON-only fallback, 60 s timeout, 3 retries with backoff on 429/5xx,
pool ≤ 4. Nothing logs or returns a key.

Only household branches are judged (background: rule). Kinds:
`shop_choice`, `park_or_home`, `station_route`, plus `weekend_plan`
(one per member per weekend day, replacing the scheduled
errands/clinic/park branches for the household): options are the
categories with a reachable round trip from home (graph minutes) plus
`home`; the plan (≤ 3, in order) executes as home-based legs with
real paths. Context per call: role + `preferences` (new scenario
field, Korean demo text, no health content), day/time, today's trips
so far, last 3 decisions with reasons, options with numbers. Guards
reject unknown keys, numbers not in the options, and
price/safety/crime/school/health topics → `rule_fallback` with the
rule's reason and cause.

Judging is iterative (engine is sync, calls are async): simulate with
everything fixed so far, judge the earliest unfixed household shell
with its exact context, repeat — sequential, members in order.
Iterations run with background 0 (proven identical for household
shells, tested); the final run uses the full background. Every entry
carries provenance, so the judged run and its `--decisions` replay
are byte-identical (the CLI self-checks this and exits 1 on
mismatch).

Dry-run (`--dry-run`, no network): A **77 calls** (shop 17, park 44,
weekend 16), est. 28,687 in + 4,620 out tokens → **$0.055**; B
**121 calls** (+44 station_route), 42,852 + 7,260 → **$0.084**.
Both ≤ $1 with `meta`; baseten reports tokens only.

Live demo: `POST /api/judge` in `vite dev` only (key from env
server-side; 503 without one). The sim caption's "Muse에게 묻기"
button (rendered only with `import.meta.env.DEV`) shows a spinner,
then the reason + chosen option with a `live` badge and
provider/model name. The production bundle contains no keys, no
provider URLs, no judge code (verified by scan; only UI strings and
the DEV-gated fetch remain) — it reads committed decision files
(`?provider=meta|baseten`, extras apply on id+choice match).

Sim UI: follow caption shows the latest branch (options + minutes,
✓ choice, Korean reason, `Muse Spark 1.3` / `Muse Spark Open` / `규칙`
badge); the "판단 기록" panel lists today's household decisions;
compare adds model / fallback / rule counts from `compare()`.

Demo 30-day compare (household, rule run):

| metric | A | B | Δ (B−A) | unit | source |
|---|---|---|---|---|---|
| walk_minutes | 1669.8 | 2282.6 | +612.8 | 분 | graph |
| walk_distance_m | 130108.81 | 177649.36 | +47540.5 | m | graph |
| commute_walk_minutes | 1117.6 | 1452 | +334.4 | 분 | graph |
| commute_ride_minutes | 2640 | 2640 | 0 | 분 | scenario |
| errands_done | 33 | 17 | −16 | 회 | scenario |
| park_visits | 10 | 26 | +16 | 회 | scenario |
| home_evening_minutes | 19376 | 18930 | −446 | 분 | scenario |
| trips | 176 | 176 | 0 | 회 | graph |

(Rule weekend defaults differ by home: jamsil → convenience,
pangyo → park — nearest category each.)

## Commands run and observed output

1. `.venv/bin/pytest tests/ -q` → **138 passed** (~14 s, unchanged).
2. `cd web && node --test tests/*.test.js` → **135 passed** (was 93:
   +9 providers, +6 guards, +10 run, +3 middleware, +3 windows,
   +4 sim, +3 camera, +3 engine, +1 scenario).
3. `cd web && npm run build` → **✓ built** (~0.6 s).
4. `node web/scripts/simulate.mjs --scenario
   scenarios/demo-two-homes.json --home both` → A 285 ms / 3238
   trips / 1831 decisions, B 212 ms / 3426 / 1912 (table above).
5. `judge.mjs --dry-run` (both homes, both providers) → counts and
   $0.055 / $0.084 above; baseten tokens-only.
6. Fake-provider `judgeHome` on real jamsil data: 77 calls in 9.2 s
   engine time, replay sha equal, non-default `park+supermarket`
   plan executed as 4 Saturday trips, h1-before-h2 order held.
7. Headless scene checks: 19,480 window slots, 124 lit at 02:00,
   0 lit by day; day-3 log rows render; per-stop fade lists (see A5);
   branch minutes for URLs (B h1 `station_route` 08:18 day 3, A h1
   `shop_choice` 19:14 day 3, weekend plans Sat 10:00).
8. Middleware tests drive the real plugin (`vite.config.js`) with
   mock req/res: 405/400/503 paths and a stubbed-fetch live judgment.

## Orchestrator commands (live, needs network + keys)

```bash
# Judge both homes with Muse Spark 1.3 (writes + self-checks replay):
MODEL_API_KEY=... node web/scripts/judge.mjs \
  --scenario scenarios/demo-two-homes.json --home both --provider meta
# Same with Muse Spark Open (confirm base URL/auth first):
BASETEN_API_KEY=... node web/scripts/judge.mjs \
  --scenario scenarios/demo-two-homes.json --home both --provider baseten
# Regenerate the served runs from the committed decisions (ONE file per
# home — never --home both with a single --decisions file):
node web/scripts/simulate.mjs --scenario scenarios/demo-two-homes.json \
  --home A --decisions scenarios/decisions/demo-two-homes-A-meta.json
node web/scripts/simulate.mjs --scenario scenarios/demo-two-homes.json \
  --home B --decisions scenarios/decisions/demo-two-homes-B-meta.json
# Live demo (dev only): MODEL_API_KEY=... npm run dev   (in web/)
```

Commit `scenarios/decisions/*.json` (they contain no keys); `data/`
stays gitignored as before.

## Capture URLs (serve `web/`, CLI runs first)

- `/?mode=sim&home=A&day=3&t=07:30&follow=1` (paused; ring + tag)
- `/?mode=sim&home=B&day=3&t=08:19&follow=1` (`station_route` caption)
- `/?mode=sim&home=A&day=3&t=19:15&follow=1` (`shop_choice` caption)
- `/?mode=sim&home=A&day=6&t=10:05&follow=1` (weekend plan running)
- `/?mode=sim&home=A&day=3&t=02:00` (night windows)
- `/?mode=sim&home=A&day=3&t=18:45` (dusk)
- `/?area=songpa-jamsil&shot=2` (host fade), `&shot=1` (occluder fade)
- Any sim URL → "A·B 비교" (metrics + 판단 주체 counts)

## Not verifiable without a browser / keys

- The actual look: night-sky/window balance (124 quads over the
  district is sparse by design), dusk tone, ring/tag scale vs
  buildings at 300 m, faded-tower readability, caption/log/compare
  overlap at 1280×860.
- The live button round-trip (`/api/judge` with a real key) and the
  judged-badge captions (no committed decision files exist yet —
  sandbox has no network/keys).
- `vite dev` boot: the sandbox forbids listening sockets (EPERM), so
  only the middleware's code path is tested, not a live server.
- Real provider behavior: `json_schema` acceptance, actual token
  counts/costs, baseten base URL/auth (TBC), retry storms.
- `?mode=sim` first-load timing and fps with 62 agents + 19 k window
  instances (instanced, one draw call).

## Stage 4b note — reasoning-model live-run fix (2026-10-28)

Live run (`--home both --provider meta`) fell back 198/198 as
`bad_json`: with `max_tokens: 400` the reasoning budget ate the whole
reply (`finish_reason: "length"`, `content: null`). Fix in
`web/src/judge/` + `web/scripts/judge.mjs`: `max_tokens` default 2000
(`--max-tokens`), `reasoning_effort` meta-default `"low"` (`--effort`,
baseten omits unless set); `finish_reason: "length"` or null content
now throws/falls back as `truncated` (not `bad_json`) with the spent
usage kept on the entry and counted in the totals; usage records
`reasoning_tokens` when reported; `costUsd` unchanged (reasoning rides
inside `completion_tokens`). Effort/max-tokens are logged in the usage
file and console line. Tests: `node --test` 140/140 (+5: overrides,
truncated ×2 paths, reasoning usage, cause list); `vite build` ✓. Not
committed. Follow-up: dry-run `COMPLETION_TOKENS_EST` (60) excludes
reasoning (~350/call at low), so `--dry-run` $ understates live cost.

## Known gaps

1. Weekend `clinic_days` landing on Sat/Sun are replaced by the
   weekend plan for the household (clinic stays plannable as a
   weekend category).
2. `ride_minutes: 30` is still a flagged placeholder
   (`needs_user_input`); ride totals move with the user's value.
3. Window glow is honest but sparse (2 per at-home resident); most
   towers stay dark with 62 agents in 700+ buildings.
4. `?shot=` still always pauses (capture behavior); only `?t=`
   honors `?play=1` in tour mode.
