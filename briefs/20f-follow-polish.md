# Stage 20f — Follow-mode polish after the 20e GPU check (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17` (HEAD 69a1360). Small. First edit within 4 tool calls. Commit, then stop.

## Found on the GPU (1440×900, real mouse, `?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1`)
What works:
- the blue route;
- 동네 전체 and 따라가기;
- drag orbit;
- the credit line;
- the panel order;
- whole numbers.

Three things are still wrong:

1. **The wheel barely zooms while following.** Twenty wheel ticks down (`deltaY > 0`) moved the camera only a little. With `1.12` per tick, it should reach the 6× clamp. Likely causes:
   - OrbitControls' own dolly also runs, so the two fight each other;
   - the walking branch of the follow pose does not go through `setFollowPose` and so ignores `followZoom` (`main.js` ~2181-2200, wheel handler ~2251-2260).
   Fix it so that every follow branch (walk, ride cruise, boarding, hold) applies `followZoom` and `followYaw`. While following, set `controls.enableZoom = false` and `controls.enableRotate = false`, so only our handlers act. Restore both in free mode and in overview.
   Wheel down zooms **out**.
2. **The destination pill is drawn twice.** "잠실 · 출근 가는 곳" shows once as the old `destPin` (`.hopin`, `main.js:1564`) and once as the 20b label. Keep the 20b label and stop showing `destPin` while 20b labels are active.
3. **Wrong wording for the walk to the station.** The walk leg of a commute ends at "잠실", not "잠실역", so the `/역$/` test fails and it reads "출근 가는 곳". Decide by the trip, not by the name: if the commute walk is followed by a ride (`run.aways` for that agent and day starts within 30 min of `arrive_min`, or the trip's `to` is a station node), the text is "{label}역 · 지하철 타는 곳". Do not double the "역" if the label already ends with it. Use this in both `destPillText` and `destSuffixFor` (`main.js` ~2042-2066), and move both into a pure exported helper in `labels3d.js` so they can be tested.

## Tests — `web/tests/follow-20f.test.js`
- The pure destination helper:
  - a commute to "잠실" followed by a ride gives "잠실역 · 지하철 타는 곳";
  - "강남역" gives "강남역 · 지하철 타는 곳", not "역역";
  - an errand to "GS25" gives "GS25 · 장보기 가는 곳".
- A source pin: in `main.js`, every follow branch that sets the camera position goes through the offset. For example, assert there is no `camera.position.copy(pose.pos)` left inside the follow code, or test it whatever way fits the code.
- A source pin: `enableZoom = false` is set when following.

Run:
```
cd web && node --test tests/follow-20f.test.js tests/usability-20e.test.js tests/labels-20b.test.js 2>&1 | tail -8 && npx vite build 2>&1 | tail -2
```

Commit `20f: the wheel really zooms while following, one destination pill, walk-to-station reads 지하철 타는 곳`. Then stop.
