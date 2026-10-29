# Stage 13d — The three things the user sees first (RESULT)

Commits (on top of `3cbd560`, brief `207afbb`):
- `7824576` 13d: nothing overlaps (3-col shell, drawer, compact timeline, credit link, token meter)
- `8b25217` 13d: guided intake + household (workplace/income, said-preserve)
- `4eec25c` 13d: candidate card hierarchy + photos (toggle pick, counter, orb stage)

Tests: 806/806 pass. `npx vite build` green.

## 1. Nothing overlaps — what is on screen now

Chat (`/?chat=…`) is a 3-column shell:
- Left conversation, 440 px, owns its scroll (transcript + composer + chips).
- Centre stage: top bar line "지금 보는 장면 · {area} · 지역 n곳", then the
  Seoul/Gyeonggi orb (`ui/orb.jsx`, three.js lazy) when region data is loaded,
  otherwise a simple region card (서울·경기 동남부 + area names). Never empty.
- Right drawer, 360 px, `data-open=false` closes to 0 (width 0, no border,
  no padding). Open when detail / 모델·가정·출처 panel / compare / picked homes.
  Under 1100 px the drawer becomes a bottom sheet; stage/thread toggle via 대화/화면.

Sim (`?mode=sim…`) is a grid (top / stage + drawer):
- Top bar (full width): home/area/mode selectors, playback, 집만 밝게 보기,
  대화, and a small "출처" button opening the SourcesDrawer in the drawer.
- Centre stage is transparent (3D shows through); the timeline docks at its
  bottom only.
- Right drawer (380 px, own scroll) stacks as sections: 지금 (NowCard),
  이동 중 (JourneyCard), 선택 기록 (JudgeLogCard), 범례 (LegendCard),
  30일 생활 비교 (CompareCard when open), 출처·라이선스 (when opened).
- Timeline is one compact row by default: controls (재생, label, speed,
  A·B 비교, A·B 하루 같이 보기) + route steps + day strip (+B when
  stripCompare). "30일 보기" toggles the activity legend + 30-day strip +
  follow controls (kept in DOM `hidden` so SSR/tests still see them).
- The long credit line is gone from the bottom of every screen. Per-number
  mini credits stay next to their numbers; full credits live in 출처·라이선스.
- No two absolute panels overlap: sim uses the grid; chat uses flex columns;
  only the centred Intro modal and AgentTourCard (both transient) float.
- Greeting: already single — `pushMsg` dedups by stable `id: "greeting"`
  and the boot effect is StrictMode-guarded. Verified, no change needed.
- Token meter: `formatUsage(usage)` sits in the chat TopNav, right side,
  small (`.ui-token`, tabular nums, "N 토큰 · $X.XXX" title "이번 대화 토큰
  사용량 (추정)"). Per-turn log + CSV stay in the 모델 panel. Nothing under
  the chips.

## 2. Guided intake + household — what is on screen now

After the first message, `structuredFlow` extracts the profile, then shows
one intake card (`IntakeFlowCard`) with, in order:
1. 연봉 (연봉/세후 월급 toggle + stepper, 만 원)
2. 지금 사는 곳 (free text, e.g. "성남 분당구")
3. 이사 희망 지역 (11 areas multi-select + "상관없음")
4. 평균 생활비 (월 stepper)
5. 통근 가능 범위 (최대 분 stepper + 수단 chips)
6. 원하는 가격 범위 (전세/월세/매매 + 상한 steppers + "아직 모름")

- One step visible at a time (`1/6 · {label}`), advancing on answer/skip.
- Values found in the first message are pre-filled and badged "내가 말한 값".
  Confirming with "다음" preserves the badge; editing clears it. Every step
  has "나중에" (skip); "다음" with no value does nothing.
- Below the step: HouseholdCard ("함께 사는 사람 n/4") with relation chips,
  age-band chips, commute stepper, workplace text (empty = 모름), optional
  monthly income stepper (0 = 모름), and "+ 함께 사는 사람". 5th member is
  refused with "함께 사는 사람은 4명까지 추가할 수 있어요". Added members
  show relation · age · commute · workplace/income with "빼기".
- Below household: the profile card (every value + source badge) and a
  "후보 찾기" button (re-runs `find_homes`). Answering a step merges into
  the profile as customer values and live re-searches (debounced) with a
  "조건 바뀜 · 후보 n곳 → m곳" toast.

## 3. Candidate card hierarchy + photos — what is on screen now

`CandidatesCard` runs `selectPhotosForList` once per list (shared used-set)
and renders `CandidateCard` per home, in this order:
1. Photo 4:3 with counter ("1/5", now also "1/1" for singles) + label chip
   (단지 사진 · 위키미디어 공용 / 가까운 역 사진 · {역} / 주변 사진 · …).
   Prev/next arrows only when >1. Credit line under the photo.
2. Price, largest (22 px, tabular): "전세 3억" + "실거래 중간값 · n건"
   (range on hover/tap title). Wolse shows deposit/monthly.
3. Facts row: kind · size · year · budget fit (예산 안 ✓ / 일부 ✓ / 밖).
4. Name + 동 + "{역} 도보 n분" (or 도보 미확인).
5. One commute line + source dot (공식/추정/내가 말한 값).
6. Badges: 3D 가능 / 지도 시뮬레이션, 실거래 n건, OSM 위치 (when match).
7. Actions: primary "살아 보기" (toggles pick for the A/B run; picked shows
   "담김 ✓ (빼기)"), ghost "전세 점검" (opens jeonse tab) and "자세히"
   (opens the right-drawer detail with the same card at full size).
8. "어떻게 계산했나요 ▽" collapsed; expands to the commute/method line.

Photos, per home: complex (`home:<id>` or same complex name + region) →
nearest-station (`station:<name>`, 역 suffix-insensitive) → street/park
within 700 m → fallback label "우리 3D 미리보기" or "위치 지도" (never an
unrelated photo). `photo-filter.js` drops people/portrait/event/food/
interior/logo-document/other-city (station concourse/platform allowed only
for kind=station with no people words). Each photo used at most once per
list. A home at the workplace station shows "직장역과 같은 역 · 지하철 안
타요" (from `homes.js` + `commuteShortLine`); "0분 (0km)" never prints.
Hovering a card highlights its orb dot (`home:<id>`); clicking an orb
region toasts "‘{region}’ 지역만 보기".

## Capture URLs (local dev, `cd web && npx vite dev`)

- Landing: `/`
- Intake step 1 (연봉, prefilled + "내가 말한 값"):
  `/?chat=판교로%20출근하는%20신입%2C%20연봉%204천%2C%20모은%20돈%205천%2C%20전세%202억%20이하&example=single-firstjob`
- Household (+ 함께 사는 사람, workplace/income): same URL, below the step card.
- Profile card + 후보 찾기: same URL, below household (and standalone above).
- Candidates list (photo → price → facts → commute → actions):
  same URL, below intake (auto-searched); or
  `/?chat=맞벌이%20예비부부%2C%20강남%20출근%2C%20전세%204억%20이하%2C%2059㎡%20이상&example=newlywed-couple`
- Sim view with drawer (timeline docked, 지금/선택기록/범례/비교 in drawer):
  `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`
- Detail drawer: candidates URL → "자세히" on any card.
- Sources: sim top bar "출처", or chat TopNav "출처·라이선스".
- 모델 panel (usage log + CSV): chat TopNav "모델".
- Narrow (drawer bottom sheet): any chat/sim URL at 800 px wide.

## What was not done

- Place picker (autocomplete) for 지금 사는 곳 / household workplace:
  free-text inputs; the engine resolves names as before.
- Detail drawer repeats the candidate card only — no price-history list,
  safety/education, public-rental or support links yet (those tabs open
  from the chat via 전세 점검 / 살 만한가 / 도움 제도).
- "주변 시설" station/bus-stop section with photos in the drawer (Part 5
  last line) — not wired.
- Skipped intake essentials as chips on the profile (`skippedChips` exists
  in `intake.js`, not rendered in `ProfileCard`).
- 3D preview from the candidate card was removed (it navigated to a
  chat URL whose `area` param was ignored — a broken reload). 3D viewing
  is via SimulationCard "3D에서 보기" moments after a run.
- Responsive widths (1440/1280/1100/800) covered by CSS only; the
  orchestrator verifies on the GPU. No overlap layout test in jsdom
  (computed-regions test not added).
- Out of 13d scope (full Part 3/4/7/8/9/10/11): assumption overrides in
  share link (?assume=), BYO-key proxy log test, usage CSV content test
  beyond existing, walk-graph coverage counts page, `explainLoadError`
  per-cause UI, Emil Before/After/Why tables, tour-mode caption/legend
  overlap polish.
