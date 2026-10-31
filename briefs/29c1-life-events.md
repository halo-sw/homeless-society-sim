# Stage 29c1 — "Only living there tells you": seated commutes and late walks home (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
The pitch is "live 30 days there before you sign". The result card today shows commute averages, money and three moments. Two things a listing never tells you, and that the 30-day runs already record, are missing:

1. **Did you get a seat?** Every measured ride leg carries `leg.congestion` (`{ valuePct, hasData, source }`, see `crowdedCandidate` in `web/src/engine/moments.js:100-140` and `rideLegs` at `:84-99`). `SEATED_PCT` (34, from criterion `C-congestion.seated_pct`) is exported by `web/src/engine/journey.js:19` — at or below it the boarding car still has free seats.
2. **How often you walk home late, and how far.** Trips carry `day`, `depart_min`, `minutes`, `purpose`, `from.kind`, `to.kind`, `agent` (see `longestOut` in `moments.js:143-165` and `web/src/engine/routines.js:~220`). A trip with `to.kind === "home"` arriving at or after 22:00 (`depart_min + minutes >= 1320`) is a late walk home; its last walking part is the station→home (or stop→home) walk. If a trip has walk/ride parts, use the walking minutes of its last part; if not, use the trip's own minutes when the trip mode is walking. Read the trip object in `routines.js` around `:200-240` once to see which fields exist; do not guess field names.

## Change

### 1. Engine — new `web/src/engine/life-events.js` (pure, no I/O)
`export function lifeEvents(runA, runB, { labels = ["A", "B"] } = {})` → array of rows, household members only (reuse the household rule from `moments.js` — export `householdKeys` from there rather than copying it):

- **seated** — for each run: the household's commute-out ride legs (aways of kind `work`/`school`, outbound ride `det.rides.out` or `det.ride`, first leg = the boarding leg) whose congestion is measured (`hasData` and `source !== "가정값"` and finite `valuePct`). `measuredDays` = distinct (agent, day) with such a leg; `seatedDays` = those where the boarding leg `valuePct <= SEATED_PCT`. Row: `{ kind: "seated", a: { seated, measured }, b: { … }, source: "실측 혼잡도", evidence: { a: tripOrDecision, b: … } }` (evidence like `awayEvidence` — export that helper too). Omit the row when neither home has a measured day (e.g. Menlo Park, no subway).
- **late_home** — for each run: household trips with `to.kind === "home"` arriving ≥ 22:00. Row: `{ kind: "late_home", a: { count, avgWalkMin, latest: "HH:MM" }, b: { … }, source: "기록", evidence: { a: { type: "trip", id }, b: … } }` where `latest` is the latest arrival (format with `hhmm` from `../timeline.js`) and `avgWalkMin` the mean last-walk minutes (rounded, `null` when unknown). When a home has 0 late arrivals keep the row with `count: 0` (that *is* the difference); omit the row only when both are 0.
- `export function lifeEventLines(rows, labels)` → Korean one-liners for the card:
  - seated: `앉아서 간 출근: A 12/20일 · B 3/20일 (실측 혼잡도 34% 이하)`
  - late_home: `밤 10시 이후 귀가: A 4번(역에서 걸어 평균 9분, 가장 늦게 23:40) · B 0번` — drop the bracket part for a home with 0 arrivals or unknown walk minutes.

### 2. Result card — `web/src/ui/chat.jsx`
- Where the simulation payload is built (`grep -n "momentTexts = pickMoments" web/src/ui/chat.jsx`, ~`:1955-1981`): compute `lifeRows = lifeEvents(runs[labels[0]], runs[labels[1]], { labels })` inside a try/catch (empty on error) and add `lifeEvents: lifeRows` to the payload.
- In the result card (`grep -n "data.extraLine &&" web/src/ui/chat.jsx`, ~`:861`), above `자세히 보기`: when `data.lifeEvents` has rows, a small block — label `살아 봐야 아는 것` (12 px, weight 600, `--ds-ink-2`) and one `Text type="supporting"` line per row from `lifeEventLines`. Old saved transcripts without `lifeEvents` render as today.

### 3. English — `web/src/i18n/en.js`
`살아 봐야 아는 것` → `Only living there tells you`. The two line patterns must translate whole (the 29a6e diary-line pattern mechanism in `en.js` / `translate.js` — `grep -n "저녁에 집에 있던 시간" web/src/i18n/*.js` shows how a line with numbers was added): `앉아서 간 출근: A 12/20일 · B 3/20일 (실측 혼잡도 34% 이하)` → `Got a seat on the way to work: A 12/20 days · B 3/20 days (measured crowding ≤ 34%)`; `밤 10시 이후 귀가: A 4번(역에서 걸어 평균 9분, 가장 늦게 23:40) · B 0번` → `Home after 10 pm: A 4 times (avg 9 min walk from the station, latest 23:40) · B 0 times`.

## Test — new `web/tests/life-events-29c1.test.js`
Build two tiny synthetic runs (household `h1`, a few aways with `detail.rides.out.legs[0].congestion`, and a few trips) by hand:
- run A: 3 work days, boarding `valuePct` 20, 30, 80 (all `hasData: true`, source `실측`) → seated 2/3; run B: 2 days at 120, 140 → 0/2. Line contains `A 2/3일 · B 0/2일`.
- a leg with `source: "가정값"` is not counted.
- run A has trips home arriving 22:30 and 23:40 (`depart_min` + `minutes`), run B none → late_home row `a.count === 2`, `a.latest === "23:40"`, `b.count === 0`; line contains `A 2번` and `B 0번`.
- both runs without measured legs → no `seated` row; both without late trips → no `late_home` row.
- every row's evidence id exists in its run.
- SSR of the result card component with a payload containing `lifeEvents` → contains `살아 봐야 아는 것` and the seated line; without `lifeEvents` → no `살아 봐야 아는 것`.
- `translate`/the English layer turns the two sample lines into the English sentences above.

Run only:
```
cd web && node --test tests/life-events-29c1.test.js $(grep -ln "pickMoments\|moments.js\|ResultCard\|SimulationCard" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
`journey.js`, `simulate.js`, the diary generator and its guards, landing files, map / 3D files, `web/src/i18n/dom.js`, recordings.

## Final message
Changed files, one line each. Nothing else.
