# Stage 11 result (Muse): agent placement, no truncation, share comparison, look table

Base `https://…/?mode=sim&scenario=demo-two-homes` + params below (`vite build` green,
JS 608/608, Python 168/168).

## 1 — Floating agent never covers the cards

- Root cause of "open on every sim URL": `FirstVisit` (`ui/main.jsx`) auto-opened the
  panel on every fresh profile. Removed — default is closed (only the "물어보기" button).
  It opens on click, on `?agent=1` (tour persona/agent steps), on nudge accept, and via
  `consultSend`; every path funnels through the store and persists per viewer
  (`loadAgentOpen`/`saveAgentOpen`, try/catch localStorage, boot reads it before the
  `?agent=1` override).
- `placeAgentPanel` (`ui/agent-float.js`) now returns `{mode, …}`: (a) `float` — the free
  bottom corner at zero overlap; (b) `drawer` on ≥1100 px when both corners are busy —
  the panel docks into `#panel-root`, a flex sibling of the canvas, so the canvas narrows
  and the right column shifts left with it (sim boot already refits on `#scene-wrap`
  resize); (c) `sheet` on <1100 px — a bottom sheet while the sim/tour bars ride above it
  and the cards cap their height. Obstacles are measured from the real DOM
  (`.ui-compare`, `.ui-simleft`, `.ui-simbar`, `.ui-tour`, `.ui-intro`, followed-resident
  central box when following). Placement re-runs on resize, tab change, card
  collapse/expand (`compareOpen`), and ResizeObserver size changes.
- Check: open any sim URL → only the button; open the panel with the compare card open →
  drawer, card fully visible left of it; `?tour=demo&step=9` → panel opens (agent step).

## 2 — Nothing truncated

- Agent header is one row: "물어보기" + model badge + 설정 menu + three Astryx `IconButton`s
  (`label` + `tooltip`: 다른 쪽으로 옮기기 / 작게 접기·펼치기 / 닫기). Provider switch and
  nudge setting moved into the 설정 `MoreMenu`; the long subtitle now lives only in the
  demo empty-state line. Provider state lifted to `ConsultPanel` (badge stays truthful).
- Compare tabs are two levels (`ui/compare-tabs.js`, pure): groups 비교 · 돈 · 안심 · 매물
  (비교 = A·B 비교 / 내 기준 / 삶의 질 / 기준, 돈 = 생활비 / 살 만한가, 안심 = 치안·교육 /
  전세 점검 / 지원 제도, 매물 = 내가 본 매물 / 공공 공고 — `listings-public` renders the
  매물 tab scrolled to the notices). Every `?tab=` id still resolves (`resolveTabId`).
  Prose references updated ("내 기준 탭"). `#ui-root` wraps Korean at spaces
  (`word-break: keep-all` + `overflow-wrap: anywhere`); no `text-overflow` in our CSS.
- Tests: `compare-tabs.test.js` (one-group coverage, member lists, old-id mapping, label
  length ≤7, CSS scan) + SSR cases (header row labels, group labels).

## 3 — Share card shows the comparison

- `resultCardData` rebuilt around twelve A-vs-B rows (`SHARE_ROW_IDS`): 출근 방법, 하루 출퇴근
  시간, 30일 동안 차·지하철을 탄 시간, 30일 동안 걸은 시간, 회사 도착할 때 피곤한 정도, 가장
  붐빈 구간, 전세로 살면 매달 집에 드는 돈, 월급에서 집에 나가는 비율, 집값과 생활비를 내고
  남는 돈, 보증금이 집값의 몇 %인지, 걸어서 10분 안 편의시설 수, 30일 동안 저녁에 집에 머문
  시간. 30-day sums prefer the engine compare metrics, else per-day × days marked as
  estimates. The numerically lower side gets a neutral 낮음 badge only.
- Header: persona (scenario-matched, else the household line), A/B headlines
  ("A 레이크팰리스 · 59.97㎡ (전세)"), 만든 날 (today) and 시뮬레이션 기간 2026-11-02부터 30일
  separately. Priorities render as small `ProgressBar`s — `PrioritiesTab` now publishes
  weight changes to `store.priorityWeights` (previously the dialog could only show the
  default line). PNG is the same layout at 1080 px wide (min 24 px type); print reuses the
  same preview. Demo spot values: 걸은 시간 A 27시간 50분 / B 38시간 3분, 전세 월 260만/250만,
  남는 돈 월 334만 9,468/406만 1,468, 붐빈 구간 "2호선 잠실 혼잡도 93.2%, 서서 감 (실측)".
- Tests: `share.test.js` rewritten (exact demo numbers, lower-side map, sources/가정값,
  fallbacks, bars, no-verdict scan incl. 좋음/나쁨/추천/우세) + a real-build case that skips
  when `data/build` is absent.

## 4 — Look table, less haze, calmer night

All constants in `render/look.js` (`DEFAULT_LOOK`), retunable live via
`?look=key:value,…` (e.g. `?look=fogRegionalFar:8,nightGain:0.7`). Consumers: rig (fog,
sun/hemi/exposure/rayleigh gains), `main.js` (regional fog, lit cap, night gain),
renderer/post (bloom threshold, grade saturation), journey layer (corridor darken, line
opacity).

Default look and why:

| key | default | why |
|---|---|---|
| fogStreetNear / Far | 2.5 / 6 (× framed width) | 1.5× read milky; framing stays crisp, skyline still melts |
| fogRegionalNear / Far | 2 / 6 (× camera–target dist) | was `dist*1.1…*3.2` off path size — nearly everything sat in fog; now keyed to the live camera distance with far ≥ 6× |
| sunGain / hemiGain | 1.05 / 0.75 | stronger sun-to-shadow ratio, less milky fill |
| exposureGain | 0.94 | day 1.12 → ~1.05, mid-greys toward 0.45–0.55 (AgX kept) |
| rayleighGain / gradeSaturation | 1.15 / 1.12 | sky + grade saturation up a touch |
| nightLitCap | 0.35 | ≤35% of windows lit — grid with dark gaps, capped over the residents-home fraction |
| nightGain | 0.85 | 9c's baked 1.15 still made white blocks; now a `uGain` uniform |
| bloomThreshold | 0.9 | above window brightness (~0.65) so only lamps (~1.4) bloom |
| corridorDarken / RoofLift / lineOpacity | 0.82 / 1.12 / 1 | darker tile base, lighter roof caps, full-opacity line |
| palette (static) | ROAD 0x959a9e, ROAD_MAJOR 0x878d90, GROUND_PLATE 0xd8cdb2, BASE_GROUND 0x969488 | one step darker; vertex-baked, not `?look=`-able |

Shadows untouched (stage 7 fix intact). Tests: `render-look.test.js` (parse/resolve, street
≥2.5×, regional far ≥6×, cap bounds, defaults snapshot); `render-stage6` fog and
`render-night` gain tests updated to the verified contract (lamps stay >1.5× windows).

## Capture URLs to check (same set as `10b-gpu-*.png`)

- Ride/regional: `&home=A&day=1&t=08:50&follow=1` — line, train, stations clear of haze.
- Walk/day: `&home=B&day=1&t=08:30&follow=1`, `&tab=money` (t=12:00), `&tab=listings&fill=example`.
- Share: `&tab=money&share=1` — comparison table, bars, PNG download.
- Night: `&home=A&day=1&t=19:18&follow=1` — window grid with dark gaps, lamps glowing.
- Agent: any URL (closed by default) → open with `&tab=money` (drawer, card clear);
  `&tour=demo&step=9` (agent step opens it); narrow window <1100 px (bottom sheet).
- Look tuning: append `&look=fogRegionalFar:8` etc. — no rebuild.

## What only the real GPU can confirm

Fog/haze balance and mid-grey exposure on ANGLE Metal, corridor-vs-line separation at
regional distance, the night window grid vs white blocks, bloom picking lamps only,
drawer/sheet layout at 1440×900 and narrow widths, Astryx Popover/Menu/ProgressBar
visuals, PNG legibility at phone size, and the print page. All of the above is
build-verified here (608 JS + 168 Python green, `vite build` green, no keys/raw data in
git or bundle) but not eyeballed on a real GPU.
