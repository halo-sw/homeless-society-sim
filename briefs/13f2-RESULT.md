# 13f2 RESULT — One answer first, evidence on tap

Branch `ui-13f`. The sim screen after 13f-1 still felt cluttered (GPU capture:
sim A, 08:50, 1440×900): five stacked drawer cards with each leg fact three
times, a three-row bottom bar, a double-labelled tour picker. Now the first
thing on screen answers "지금 이 사람은 어떤 상황인가?", everything else is
one tap away, and no feature was deleted — only hidden or moved.

## Before / After / Why (one row per changed component)

| Before | After | Why |
| --- | --- | --- |
| Drawer: five stacked cards; `NowCard` ~14 lines; "2호선 잠실→강남 9분 · 붐비는 정도 91.1%" and "신분당선 강남→판교 17분 · 70%" each three times (NowCard, JourneyCard, spark caption) | `SimDrawer` (`ui/app.jsx`): one hero + three folded sections, 360 wide, 16 padding, 1px dividers, no nested cards | One answer first, evidence on tap; each fact once (test: "잠실→강남" at most once outside 오늘) |
| NowCard header with five facts + two side-by-side badges | Hero: name + status chip (이동 중/집/직장…), one sentence ("신분당선 강남→판교 이동 중"), one 28 number ("15분 남음"), one congestion bar ("혼잡 70%" + one badge), one 12 tertiary next line ("다음: 09:05 직장 도착") | Squint test: the situation reads in 2 seconds |
| JourneyCard leg list duplicating NowCard | 오늘 (open): day's trips, one line per leg — time · mode icon · label · congestion dot · source badge at line end; current leg highlighted; prev/next trip + 지도 (자동/거리 보기/전체 경로) kept | Replaces JourneyCard and the duplicated leg lines; view buttons and footnotes (band key, corridor, congestion source) move here, not away |
| `CriterionChips` as large ghost buttons ("+8개 기준") | Small text tags (still open the criterion tab) with a "+8개" expander | Tags, not buttons; evidence stays one tap away |
| Fatigue block with leg-naming note + long caption | Note shortened to the posture half ("붐비는 정도 70%, 서서 감"); one caption "피곤한 정도는 가정 모델이에요"; peak line kept ("오늘 가장 붐비는 순간 · …", no `→`, so no duplicate) | The leg already shows in the hero and 오늘 |
| `JudgeLogCard` + `CompareCard` as separate floating cards | 비교·기록 (folded): ticker, 선택 기록, 30일 생활 비교 — all `bare`, no card chrome | Records live together; chat's `CompareCard` keeps its card |
| Bottom bar: 3 rows (controls, wrapping `RouteSteps`, day strip) | One row ≤64 (`ui-bar13f2-row`): play/pause icon, date-time, strip flex-1 with needle, 1×/10×/60×, ⋯ menu (A·B 비교, A·B 하루 같이 보기, 30일 보기, 따라가기) | One row inside the stage only |
| Route steps wrapping two lines under the bar | Steps live in 오늘; strip segments keep hover tooltips ("08:21–08:35 걷기 · …"); `timelineKeyHandler` (←/→/space) untouched | Never delete: move it; keyboard users keep prev/next |
| Activity legend under the bar | Legend opens from the map tool group's 범례 (`LegendCard` gains a 하루 색깔 section in sim mode) | Colours stay with the view |
| Washed-out grey sheet; bluish roads; barely visible route line | `render/look.js`: warmer/lighter ground (`regionalGround`, `terrainBase`), darker buildings (`corridorDarken` 0.82→0.74) with clearer roof lift (1.12→1.2), clear-blue water, warm asphalt roads apart from water | Contrast up a little, colours only |
| Route ahead/route done 1px lines | Unchanged from `look.js` (see note) | WebGL ignores `linewidth` on line materials; true 4px/2px needs fat lines in `main.js`/`journey-scene.js` — out of 13f-2 scope, propose for 14c with the glow/avatars |
| Tour picker: "지역:" + "지역 선택" (two labels) | One label "지역" + the select (accessible name kept via `isLabelHidden`) | One label |
| `ProfileCard`: full table first, then fill chips | Summary line of chips ("2인 · 강남 출근 · 전세 4억 이하 · 59㎡ 이상"), "모르는 값 N개 — 채우면 더 정확해요" + fill chips, full table in a 자세히 disclosure | Answer first; the table is evidence on tap |

Styles use only the 13f-1 `--ui-*` tokens (new `.ui-tag`, `.ui-dot-*`,
`.ui-fill-*`, `.ui-section`, `.ui-today-*`, `.ui-bar13f2-*` classes).

## Verification

- `cd web && npm test`: 927 pass / 1 fail / 0 skipped (928 total). The single
  failure is `share.test.js → matches the built money/compare docs` — the
  engine stage on main changed the money build; ignored per the brief.
- New tests: `web/tests/drawer-13f2.test.js` (hero at 08:50, leg-fact-once
  count, folded sections, `+8개` tags), `web/tests/timeline-13f2.test.js`
  (one row, hidden menu items, keyboard shortcuts); updated `ui-render`,
  `topbar-13f`, `landing-chat-12b`, `render-look` pins.
- `npx vite build`: fails environmentally (`EPERM` writing
  `web/node_modules/.vite-temp/…` under the sandbox — same as 13f-1). No code
  error: every touched JSX file renders in the SSR suite.

## Capture URLs

- Landing: `/`
- Chat newlywed example: `/?chat=맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상&example=newlywed-couple`
- Sim A 08:50: `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`
- Tour 잠실: `/?area=songpa-jamsil`
