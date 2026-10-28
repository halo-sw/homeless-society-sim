# Scenario schema (`scenarios/*.json`)

Stage 3. A scenario fixes everything the life engine may not invent: who
lives in the household, the candidate homes, the simulated window, the
seed, and the assumed durations. The engine (`web/src/engine/`) reads a
scenario plus an `area.json` per home and simulates the same household
living in each home separately, with the same seed.

Example: `scenarios/demo-two-homes.json`. Run it with
`node web/scripts/simulate.mjs --scenario scenarios/demo-two-homes.json --home both --out data/build/sim/`.

## Top-level fields

| field | type | default | meaning |
|---|---|---|---|
| `name` | string | `"scenario"` | run/file label (no spaces recommended) |
| `start_date` | `YYYY-MM-DD` | `"2026-11-02"` (a Monday) | day 0; KST calendar |
| `days` | int 1..366 | `30` | simulated days |
| `seed` | int | `20261102` | master seed (see PRNG) |
| `background` | int ≥ 0 | `60` | simulated neighbours per run (시뮬레이션 주민) |
| `workday_minutes` | int | `540` | time away at work per workday — **scenario assumption** |
| `schoolday_minutes` | int | `360` | time away at school per schoolday — **scenario assumption** |
| `household.members[]` | array (≥ 1) | — | household members (below) |
| `homes[]` | array (≥ 1) | — | `{label, area, complex_name}`; labels unique |
| `money` | object | defaults below | salary/living-cost inputs (stage 6, below) — optional |
| `criteria_overrides` | object | `{}` | per-criterion value overrides, e.g. `{"C-shop-dwell": {"dwell_min": 25}}` (stage 7, below) — optional |

## Household members

| field | type | default | meaning |
|---|---|---|---|
| `id` | string | `m1`, `m2`, … | stable member id (run output key) |
| `label` | string | `구성원 N` | display label |
| `preferences` | short free text (≤ 500 chars) | `""` | user-written tastes for the judge's context (no personal or health data) |
| `role` | `adult` / `child` / `senior` | `adult` | walking speed: adult 1.3 m/s, child/senior 1.1 m/s |
| `workdays` | weekday list | Mon–Fri | commute days (`Mon`…`Sun`) |
| `work` | object | `{type: "none"}` | commute (below) |
| `schooldays` | weekday list | Mon–Fri | school days (used when `school` is true) |
| `school` | bool | `false` | children: walk to the nearest real school POI by graph |
| `errands_per_week` | `{supermarket: 0..7, convenience: 0..7}` | `{0, 0}` | shop visits per week |
| `park_walks_per_week` | int 0..7 | `0` | evening park-visit defaults per week |
| `clinic_visits_per_month` | int 0..31 | `0` | clinic-visit days per run |

`work` is one of:

- `{type: "station_ride", station_name, ride_minutes,
  ride_minutes_source: "user_assumption"}` — walk to a real station POI
  on the graph (verbatim `station_name` among `railway:station` /
  `railway:subway_station` / `public_transport:station`), then an assumed
  ride the user typed. `station_name` may be a string or a
  `{homeLabel: name}` map when the station differs per home. The UI must
  label the ride **가정값**. `needs_user_input: true` flags a placeholder
  the user has not confirmed yet. Never a looked-up transit time.
- `{type: "local_poi", name}` — walk to a real POI with the verbatim
  `name` (nearest by graph when several share it), work the assumed
  workday, walk back. `name` may also be a per-home map.
- `{type: "none"}` (or omitted) — no commute.

## Homes

`{label, area, complex_name}`: `area` is an `area.json` id under
`data/build/`; `complex_name` resolves **verbatim** against complex
names (first by id when duplicated — never invented). The household's
entrance is the graph node nearest to a building of that complex
(lowest anchor distance, ties on building id then node id).

## Background neighbours

`background` simulated residents are synthesised into residential
buildings of the area, weighted by `households`
(`register.api.households`, 세대수) when present, else floors ×
footprint area. Each gets a simple routine from the same rules
(commute to the nearest station / school / errands / park / clinic,
seeded). They are always labelled 시뮬레이션 주민, named
주민 01, 주민 02, … — never after real people. When a needed place is
unreachable they adapt silently (no `unavailable` record): only the
household's requests produce `unavailable`, so the signal stays about
the user's scenario.

## Clock

Discrete-event, minute resolution, KST. Weekends are Sat/Sun; workdays
and schooldays come from the member config. The engine uses no wall
clock and no `Math.random`.

## PRNG (documented algorithm)

One 32-bit stream per agent: `mulberry32(fnv1a32("${seed}:${key}"))`
— mulberry32 (public domain, Tommy Ettinger) seeded by the FNV-1a
32-bit hash of the master seed plus the agent key (`h1`, `b01`, …;
background synthesis draws from the `"background"` stream). Streams
are independent: adding an agent never shifts another's draws. Weekly
schedules and per-day departure jitters are drawn up front in a fixed
order, so stage-4 hook choices can never shift the random sequence. A
different seed changes routines (schedules, jitter, background homes)
but never the graph distances.

## Routines (rule defaults)

Per agent-day, chained on the running minute clock (no overlaps):

1. Morning commute on workdays (depart 07:30 + 0–59 min jitter):
   home → station/POI → assumed away → home. School for children with
   `school` on schooldays (depart 08:00 + jitter): home → nearest
   school → assumed schoolday → home.
2. Errands on scheduled days (10:00 anchor, or 30 min after the last
   return): home → shop (15 min dwell) → home, per category.
3. Clinic on scheduled days: home → nearest clinic/pharmacy/doctors/
   dentist (30 min dwell) → home.
4. Evening park-or-home branch (16:00 anchor, or 30 min after the last
   return): a `park_or_home` decision every weekday for members with
   `park_walks_per_week > 0`; the rule default is "park" on the
   scheduled park days, else "stay home". A chosen park visit is
   home → park (30 min) → home.
5. Household weekends (Sat/Sun) replace steps 2–4 with one
   `weekend_plan`: up to 3 activities from the categories reachable
   in the area, in order, executed as home-based legs with real
   paths. Background neighbours keep steps 2–4 every day.

Dwells (15/30/30 min), gaps (30 min) and anchors are routine defaults
(source: scenario). Trip minutes and distances always come from the
walk graph (shortest path, `length_m`); speeds above. Trips store the
full path node ids.

## Branch points (for stage 4)

Decision record:
`{id, agent, day, minute, kind, options, default_key, chosen_key,
chosen_by, ...extras}` with
`options: [{key, label, minutes, distance_m, poi_id?}]`.
`id` is `${agent}:d${day}:${minute}:${kind}:${seq}` (deterministic).
Kinds:

- `shop_choice` — which supermarket/convenience: the 2–3 nearest
  reachable shops of the category by graph time (one shop: no branch).
- `park_or_home` — park walk or stay home (options carry the graph
  time/distance to the park; `home` is 0/0).
- `station_route` — which station entrance: the two nearest reachable
  same-name station POIs when the second is within 20 % of the first's
  graph time (equal times: no branch, stable first).
- `weekend_plan` — household weekends: options are the reachable
  categories (`park`, `supermarket`, `convenience`, `clinic`, each with
  the graph time/distance to its nearest round trip) plus `home`
  (stay home, 0/0). The choice is an ordered plan of up to 3
  categories (`chosen_key` joins them with `+`, `"home"` for staying
  home; the record also carries `plan: [...]`). No reachable
  category: no branch. The rule default is the fastest category alone.

Option numbers come from the graph. `decide(record)` returns a key —
or, for `weekend_plan`, a key array — or an object
`{chosen_key | plan, chosen_by?, ...extras}` with judge provenance
(`reason_ko`, `reason_en`, `provider`, `model`, `usage`,
`latency_ms`, `fallback_cause`). `chosen_by` is `rule`, `hook`,
`model` (a Meta model chose), `rule_fallback` (the judge rejected the
model's output and used the rule) or `replay`. The default rule picks
the fastest option (stable tie-break on the key) for
`shop_choice`/`station_route`/`weekend_plan`, and the scheduled day
for `park_or_home`. Given a decisions file (e.g. a judged run's
`decisions`, or bare `[{id, chosen_key}]`), the run restores the
stored choices with their provenance (`"hook"` marks become
`"replay"`) and makes zero hook calls (unknown ids throw) — a judged
run and its replay are byte-identical.

## Unavailable (never invented)

When a needed category has no POI reachable in the area, the activity
is skipped and recorded as
`{agent, day, activity, category, detail?}` with `category` in
`station | poi | school | supermarket | convenience | park | clinic`
(`detail` carries the requested name for `station`/`poi`).
Household members only (see background note above).

## Outputs

`simulate(area, scenario, homeLabel, {decide?, decisions?})` returns
the run: `meta` (no timestamps), `agents`, `trips` (agent, day,
depart/arrive minute, from/to home-or-POI, `distance_m`, `minutes`,
path node ids), `aways` (kind `work | school | errand | clinic | park`
with assumed durations), `decisions`, `unavailable`, `daily` (per-day
per-member: minutes walking, commute walk minutes [graph], commute
ride minutes [assumption], errands done, time at home 18:00–24:00),
and `totals` (per-member + household 30-day sums). `compare(runA,
runB)` returns household 30-day numbers with units and sources
(`graph` = walk-graph only, `scenario` = involves an assumption) —
never scores, rankings, prices or safety claims — plus `judgment`
(household decisions by `chosen_by` per home: model vs fallback vs
rule).

## Judge layer (stage 4, `web/src/judge/`)

Only household branches reach a Meta model; background neighbours stay
rule-based. Providers are OpenAI-compatible chat completions over
`fetch` (no SDK): `meta` (`muse-spark-1.3`) and `baseten`
(`muse-spark-open-1026`; base URL/auth to be confirmed by the
orchestrator). Each call gets the member profile (role, preferences),
day/time, today's trips so far, the last 3 decisions with reasons, and
the options with graph numbers; the model returns a key (or weekend
plan) with short Korean/English reasons. Guards reject unknown keys,
numbers not in the options, and price/safety/crime/school/health
topics — falling back to the rule as `rule_fallback`, logged with the
rule's reason. Keys live in the environment server-side only and never
reach the browser or any written file.

`node web/scripts/judge.mjs --scenario <json> --home A|B|both
--provider meta|baseten [--dry-run]` judges every household branch
(sequential, deterministic order) and writes
`scenarios/decisions/<name>-<home>-<provider>.json` plus a usage file;
`simulate.mjs --decisions <file>` replays it with zero provider calls,
byte-identical. `--dry-run` prints call counts and token/cost
estimates without network. In `vite dev` only, `POST /api/judge`
judges one decision live for the "Muse에게 묻기" button; the
production build uses committed decision files.

## Determinism

Canonical JSON: sorted keys at every depth, integers as-is,
non-integers rounded to 3 decimals (`web/src/engine/canonical.js`).
Two runs with the same inputs are byte-identical (sha256); see the
engine tests (`web/tests/engine-*.test.js`).

## Money block (stage 6, optional)

Salary → monthly living-cost inputs. The engine ignores this block;
the money modules (`web/src/money/`), the consult tools
(`set_money`, `estimate_net_pay`, `price_reference`, `living_cost`,
`recommend_public_rental`, `add_home_c`) and the `money.mjs` CLI read
it. Income lives in browser memory only — never stored server-side.

| field | type | default | meaning |
|---|---|---|---|
| `money.members` | `{memberId: {annual_salary_won?, monthly_net_won?}}` | `{}` | per-member gross salary and/or the customer's real monthly net (the typed net always wins; else the payroll table estimates it — 추정) |
| `money.cash_won` | won ≥ 0 | `0` | household own funds (보유 현금) |
| `money.tenure` | `{homeLabel: 매매/전세/월세/공공임대}` | all `전세` | tenure per home |
| `money.area_m2` | `{homeLabel: ㎡}` | median of matched rows | target exclusive area per home (price bucket centre ±5 ㎡) |
| `money.assumptions` | object | below | spending assumptions, all labelled 가정값 and editable |
| `money.burden_threshold_pct` | 0..100 | `30` | 주거비 부담률 rule-of-thumb line (editable) |
| `money.home_c` | object | `null` | public-rental candidate added as home C (`add_home_c` writes it) |

Assumption defaults: `loan_rate_pct` 4.0, `loan_years` 30,
`maintenance_won_month` 150000, `transit_fare_won` 1500, `basket_won`
30000, `other_fixed_won_month` 0, `pay_day_of_month` 25,
`fixed_due_day_1based` 1.

Net pay uses the replaceable rule table
`scenarios/assumptions/kr-payroll.json` (social insurance rates +
simplified income-tax brackets, with `as_of`/`source`; uncertain rates
carry `needs_confirmation: true`). Housing cost per tenure: 월세 =
deposit from cash + monthly rent; 전세 = shortfall × rate / 12
(interest-only); 매매 = amortised payment on (price − cash) + a note
that taxes/fees are excluded; 공공임대 = API deposit + monthly rent.
The money timeline (`moneyTimeline`) emits deterministic spending
events tied to simulated trips (fare per station-commute leg, basket
per outbound errand leg, fixed costs on the due day, salary on
payday). The app never judges loan eligibility (LTV·DSR), move-in
eligibility, or buy/don't-buy — the UI and agent disclaimers say so.

Precompute the UI payload with
`node web/scripts/money.mjs --scenario scenarios/<name>.json --out data/build/sim/`
(writes `<name>-money.json`: net pay, per-home price references, per
tenure timelines, QoL time/convenience axes).

## Criteria overrides (stage 7, optional)

Every rule the engine uses lives in `scenarios/criteria/kr-default.json`
(`docs/criteria.md` renders it). A scenario may re-set numeric values per
criterion:

```json
"criteria_overrides": {
  "C-shop-dwell": { "dwell_min": 25 },
  "C-money-fare": { "fare_won": 2000 }
}
```

Only `overridable` values accept overrides (unknown ids, unknown keys and
non-numbers throw); the run records them in `meta.criteria.overrides` and
the UI reads them as 고객 입력. Precedence: overrides > the scenario's own
native field (`workday_minutes`, `money.assumptions`, …) > the file default.
The parsed scenario also carries `_explicit` (which native fields the file
set) so criterion source badges stay honest across consult re-parses.
