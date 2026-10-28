# Stage 9c result — per-home commute, the ride as a trip, calmer cards (Muse)

Date: 2026-10-29. Agent mode, single agent (no subagents — `AGENTS.md`
reserves product code, tests and pipeline scripts to Muse). All code
and tests below are my own. Commit `38efcf8` (the `fix-8c` merge was
already on main; no conflicts). Numbers below are the orchestrator's
regenerated run, verified identical in
`data/build/sim/demo-two-homes-compare.json` and `-money.json`.

## What changed

**Part A — the demo asks the real question.** Workplace is a place:
`work.place` (`직장 (가정: 판교역 인근)`, 신분당선 판교역 stop coords
127.111187, 37.394364 from OSM-derived `network.json`). Per home the
engine derives the commute (`web/src/engine/workplace.js`): walk when
the workplace is in the home's built area and reachable within
`C-walk-commute-max` (25 min), else walk → ride → destination walk.
Ride totals stay customer input per path (A 잠실→판교 30 min, B none);
the old bare `station_ride` form still works
(`engine-workplace.test.js`: rides from A, walks from B, per-path
minutes, walk-limit flip, determinism). Persona templates
(`dual-income-child`, `newlywed-couple`, `single-firstjob`) updated
the same way.

**Part B — the ride is a trip.** The engine emits `ride` aways with
start/end minutes, direction and per-leg congestion; `work` starts on
arrival at the workplace and is labelled by it
(`직장 (가정: 판교역 인근) 근무`) — never `방면`. Now card mid-ride
names the itinerary with minutes left plus per-leg congestion and
source badges. The journey camera keys off the clock
(`journeyCameraState({segments, minute})`), so static `?t=` loads,
slider drags and playback all engage inside the ride: cruise mid-ride,
street before, hold at the destination during work.

**Part C — calmer cards.** At most 3 criterion chips behind
`+N개 기준`, last 3 ticker rows behind an expander
(`chipDisplay`/`tickerDisplay`, pure, tested). The legend joins the
left column (`.ui-simleft`) — one scrolling stack, no overlap with the
판단 기록 card. Night: window emissive + bloom clamped so façades keep
their window grid; lamps stay small warm points
(`render-night.test.js`). The day's peak boarding
(`peak_congestion`: line/station/pct/source) rides beside every
fatigue readout, so 0 crowded minutes reads as a measurement.

Fares follow the same rule (`money/timeline.js`): one fare per commute
trip that touches a ride — walking members pay none. A 전세
−132,000원/월, B 0원.

## Before / after, A vs B (30 days, household)

"Before" = pre-9c behaviour (9c brief's pre-9c run; `*` = stage-10
recorded reply, pre-9c code). "After" = this run.

| 지표 | A 변경 전 | A 변경 후 | B 변경 전 | B 변경 후 |
|---|---|---|---|---|
| 출퇴근/일 | 집→잠실 도보 + 승차 30분×2 (목적지 도보 없음) | 도보 37.3 + 승차 88분/일 | 집→판교역 도보 + 승차 30분×2 (목적지 없음) | 도보 48.4분/일, 승차 0 |
| 30일 도보 합계 | 27시간 50분* | 1,669.8분 (합계 유지, 구성 변경) | 38시간 03분* | 2,282.6분 |
| 30일 출퇴근 도보 | — | 1,117.6분 | — | 1,452분 |
| 30일 승차 합계 | 양쪽 다 30분 승차 가정 | 2,640분 (30분×2×22일×2명) | 양쪽 다 30분 승차 가정 | 0분 |
| 회사 도착 피곤한 정도 | 25.3 | 25.3 | 23.2 | 5.7 |
| 퇴근 후 집 피곤한 정도 | — | 22.8 | — | 5.8 |
| 30일 평균 피곤한 정도 | 7.6* | 7.6 | 7.1* | 1.7 |
| 출근길 가장 붐비는 순간 | — | 93.2 % (2호선 잠실, 실측) | — | 없음 (승차 없음) |
| 만원 지하철 탄 시간 | — | 0분 (실측, 누락 아님) | — | 0분 |
| 저녁에 집에 머문 시간 | — | 19,376분 | — | 20,575분 |
| 장본 횟수 | — | 33 | — | 17 |
| 공원 산책 횟수 | — | 10 | — | 26 |
| 교통비 (전세) | 양쪽 다 부담 (station_ride 일괄) | −132,000원/월 | 양쪽 다 부담 | 0원 |
| 집값·생활비 내고 남는 돈 (전세) | 약 335만원* | 3,349,468원 | 약 393만원* | 4,061,468원 |

A's commute is unchanged in structure (still 잠실→판교), so A's
fatigue barely moves; B loses the phantom ride and its congestion
load, hence 23.2 → 5.7 on arrival and 7.1 → 1.7 on the 30-day average.
B's remaining-money gain (+약 13만원) is exactly the removed fares.

Day 1 for 구성원 1: both leave 08:21. A walks home→잠실 08:21→08:35,
rides 08:35→09:05 (2호선 잠실→강남 약 8.6분 + 환승 4분 + 신분당선
강남→판교 약 17.4분), works from 09:05. B walks home→직장
08:21→08:37 (16.3분, 25분 이내), works from 08:37. Back rides mirror
(18:05→18:35 A).

## Now-card texts, 구성원 1 (pure `nowCardFor`, day 1)

**A · 08:30** (state=trip)
`출근 중 · 레이크팰리스 → 잠실 (걸어서 5분 남음)` /
까닭: `월 근무일 · 07:30 기준+지터51분 → 08:21 출발 · 직장 (가정: 판교역 인근)까지 도보 연결 없음 → 잠실역 승차` /
다음: `08:35 지하철 이동` /
피곤: 0 (+4.8) `걸어서 13.6분 이동`

**A · 08:50** (state=ride)
`지하철 이동 중 · 2호선 잠실→강남 (약 8.6분) · 환승 · 신분당선 강남→판교 (약 17.4분) · 15분 남음` /
legs: `2호선 잠실→강남 8.6분 · 붐비는 정도 91.1% (실측)` +
`신분당선 강남→판교 17.4분 · 붐비는 정도 70% (가정값)` /
다음: `09:05 직장 (가정: 판교역 인근) 근무` /
피곤: 4.8 (+10.1) `신분당선 강남→판교 붐비는 정도 70%, 서서 감`

**A · 09:02** (state=ride) — same itinerary, `3분 남음`.

**B · 08:30** (state=trip)
`출근 중 · 백현마을 → 직장 (가정: 판교역 인근) (걸어서 7분 남음)` /
까닭: `… → 08:21 출발 · 직장 (가정: 판교역 인근)까지 도보 16.3분(25분 이내)` /
다음: `08:37 직장 (가정: 판교역 인근) 근무` /
피곤: 0 (+5.7) `걸어서 16.3분 이동`

**B · 08:50 / 09:02** (state=away)
`직장 (가정: 판교역 인근) 근무 중 · 17:37까지` /
다음: `17:37 출근 · 백현마을` /
피곤: 5.7 `근무 중 · 앉아서 회복`

## Capture URLs (dev server)

- `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1` (walk to 잠실)
- `…&t=08:50&follow=1` (ride: Now card + journey camera + legs)
- `…&t=09:02&follow=1` (ride, 3 min left)
- same three with `home=B` (walk; at work by 08:50)
- `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=19:18&follow=1` (night errand: tower glow check)
- `&tab=money` (fares A only), `&tour=demo&step=2` (ride step)

## Needs real GPU/browser

Journey cruise/descend framing on a static `?t=08:50` load, night
tower glow eyeball at 19:18, left-column stacking with a tall Now
card, chip/ticker expander visuals. Engine text, timing, camera phase
and fares are pinned by tests (below) — the GPU checks are visual.

## Verification

web: `engine-workplace.test.js` (derivation on fixture + real graph
and network), sim-smoke "rides the stage-9c commute" (leg chaining,
ride labels, camera state for static `t`, banner split sums to the 30
min input, Now card mid-ride, stage-8 fatigue on 9c legs),
`sim-nowcard` ride card + calm-card budgets, `journey-view`,
`money-timeline` (fares only on ride-touching trips),
`render-night` (emissive/bloom clamp), full `node --test` green;
`vite build` green.
