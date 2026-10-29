# Stage 14d — Distance-based fares and transit sources (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Commit after each part.

Context: the user asked to reflect a list of transport data sources from another service. We use **only the original public sources**, never that service's numbers. Today the fare is one assumed number per trip (`transit_fare_won`, labelled 가정값):
- `web/src/money/timeline.js:62`
- `web/src/nowcard.js:403`
- `web/src/ui/money.jsx:233`
- `web/src/consult/tools-money.js:313`
- criterion `C-money-fare` in `web/src/engine/criteria.js:151`

## 1. Fare from the official distance rule
- New pure module `web/src/money/fare.js` with `fareForTrip({ legs, card: "transit_card", age: "adult" })`.
- 수도권 통합 거리비례 운임 (교통카드, 성인), 시행 2025-06-28:
  - base **1,550원** up to 10 km
  - 10–50 km: +100원 per started 5 km
  - over 50 km: +100원 per started 8 km
  - Single-use ticket +100원. Transfers inside the integrated system add no new base fare.
- Distance: sum the ride legs' km from the committed interstation table (`scenarios/transit/seoul-metro-interstation.csv`, 역간거리(km), via `web/src/transit/schedule.js`). When a leg lacks official distance (a line not in the table), use the straight-line distance × 1.2. Mark that trip's fare `distance: "추정"`.
- 신분당선 legs:
  - Add the 구간별 별도운임 from a config table `SHINBUNDANG_EXTRA`, keyed by segment (신사–강남, 강남–정자, 정자–광교).
  - Leave the values **null** with `status: "확인 필요"`. The orchestrator fills them from the operator's official fare page after checking.
  - While null, the fare shows "신분당선 별도운임 확인 중" and the trip's fare source stays 가정값. Never invent these numbers.
- Wire it so each commute trip's fare comes from `fareForTrip` (per member, per route), replacing the single `transit_fare_won` where the route is known. Keep `transit_fare_won` as the fallback, labelled 가정값.
- Money tab line: "출퇴근 44번 × 평균 1,650원 (거리비례, 2025-06-28 운임)".
- Source entry in `web/src/sources.js` + `ATTRIBUTION.md`: 국토교통부 수도권 전철 운임 조정 (2025-06-28 시행).
- Tests:
  - 9.9 km → 1,550
  - 10.1 → 1,650
  - 50 → 2,350
  - 58.1 → 2,450
  - transfer adds no base fare
  - 신분당선 null → status 확인 필요
- Commit `14d: distance-based fares`.

## 2. Hourly boarding counts for ambient crowds (if the file is present)
- If the orchestrator has placed `data/raw/korail/boarding_hourly.xlsx` (한국철도공사 광역철도 수송인원 및 승하차인원, data.go.kr 15154382, 이용허락 제한 없음), parse it in a pipeline step `korail_boarding`.
  - Output: per-station, per-hour boarding/alighting averages to `data/build/transit/korail_boarding.json`.
  - Use it to scale the 14b ambient pedestrians near Korail stations (e.g. 수인분당선), labelled 실측 (월평균).
- If the file is absent, skip this part and say so.
- Commit `14d: korail boarding counts`.

## 3. Sources panel honesty
- In the sources/credits page, add a "교통 자료" group listing what we actually use, each with dataset name, provider, date or version, and link:
  - interstation times/distances (서울교통공사)
  - congestion (서울교통공사)
  - fares (국토교통부)
  - Korail boarding (if used)
  - DEM (AWS Terrain Tiles/SRTM)
- Add a line under it: "수요·혼잡 추정은 실측과 가정값을 구분해 표시해요".
- Do not list sources we do not use (KTDB OD, 국가철도망 계획, KIGAM 지질도, LH 공공택지).
- Commit `14d: transit sources`.

## End
- Run the tests and the build.
- Write `briefs/14d-RESULT.md`, including the fare for the demo homes A/B commute (per trip, monthly).
- Commit.
