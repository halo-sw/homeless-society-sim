# Stage 26i — US 3D view: bike trips say bike, the home has its name (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `us-web-26`. Stop when this part is done.

## Found by the orchestrator in Chrome
Run: US chat → pick "10 Coleman Place" and "777 Hamilton Avenue · 5" → "Live it for 30 days" → "View in 3D" (`?mode=sim&home=A&custom=…`).

For home A the card said `bike 11 min · walk 37 min`. The engine (26d) made bike commute trips with `mode: "bike"`, and the work away carries `commute: "bike"`. The 3D view still treats them as walking:
1. **Right panel.** It shows "Commute · 10 Coleman Place → Meta HQ (1 Hacker Way) (12 min walk left)", then "Today Commute 12 min = Walking 12 min" with the badge **실측 / Measured**, then "on foot 12 min left". The timeline row reads "Meta HQ (1 Hacker Way) (12 min walking)". The legend and day strip colour it as 걷기.
   - A bike trip must read 자전거 / bike everywhere a walk trip reads 걷기 / 도보.
   - Its badge must be **가정값** (assumed): the time comes from the assumed 15 km/h speed (`C-bike-speed`), not a measurement.
2. **The home label over the building** reads `우리 집 · w112348084`, an OSM way id (`src/labels3d.js:167`, `title: \`우리 집 · ${name}\``). For US homes the complex name in the area is an OSM id. It must show the home's name from the run (`10 Coleman Place`).
   - Find where `name` comes from: probably `home.complex.name`, `run.meta.home`, or the area complex.
   - Prefer the run's home name when the area complex name looks like an OSM id (`/^[wnr]\d+$/`).
   - Korean labels are unchanged.

## Change
- **`src/timeline.js` `ACTIVITIES`:** add `bike: { label: "자전거", color: <a distinct colour, not used by other activities> }`. The function that maps a trip to an activity returns `bike` when `trip.mode === "bike"`. Read how activities are derived, e.g. `daySegments` and `outingStepsFor`.
- **Every place in `src/main.js`, `src/ui/*.jsx` and `src/*.js` that builds walk text for a trip** ("도보", "걷기", "분 걷는 중", "남음", the commute breakdown "출근 N분 = 도보 N분") uses 자전거 for `mode === "bike"` trips.
  - The badge for that breakdown is 가정값 when any part is a bike trip.
  - Grep for the strings; list the call sites in your final message.
- **Legend:** show the bike entry only when the run has a bike trip.
- **The 3D walker** for a bike trip can stay the same figure. Moving speed follows the trip minutes already.
- **`src/labels3d.js`:** the home label uses the run home name for OSM-id-looking names (see 2).

## Test — `web/tests/us-26i.test.js`
- `daySegments` (or the function you changed) for a day with a `mode: "bike"` commute trip gives a `bike` segment with label `자전거`. A trip without `mode` stays `walk`.
- The commute breakdown helper (find it; export it if it is inline) for a bike trip returns text with `자전거` and source `가정값`; for a walk trip it is unchanged.
- The home label helper: complex name `w112348084` with run home name `10 Coleman Place` → `우리 집 · 10 Coleman Place`; Korean `잠실 레이크팰리스` → unchanged.
- Keep green: every `tests/timeline*` and `tests/labels*` file, `tests/us-26d.test.js`.

Run only:
```
cd web && node --test tests/us-26i.test.js tests/us-26d.test.js $(ls tests | grep -E '^(timeline|labels)' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**`, `pipeline/**`, anything under `data/`. No `text-overflow: ellipsis`.

## Final message
Changed files, one line each, plus the list of call sites. Nothing else.
