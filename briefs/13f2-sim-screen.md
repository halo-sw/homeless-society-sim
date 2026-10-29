# Stage 13f-2 — The sim screen: one answer first, evidence on tap (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ui-13f`. Touch only:
- `web/src/ui/`
- `web/src/render/look.js` (colours)
- `web/tests/`

Read `briefs/13f1-RESULT.md` first and use its `--ui-*` tokens only. Call `read_skill` for `arrange` and `taste` once. Commit after each part (`git add -A web/src/ui web/src/render/look.js web/tests && git commit -m "13f2: …"`). The first edit should land within 6 tool calls.

The GPU capture after 13f-1 (sim A, 08:50, 1440×900) still feels cluttered:
- **Right drawer:** five stacked cards.
  - NowCard (`ui/app.jsx:323`) has ~14 lines.
  - The facts "2호선 잠실→강남 9분 · 붐비는 정도 91.1%" and "신분당선 강남→판교 17분 · 70%" appear **three times**: NowCard, JourneyCard (`app.jsx:254`) and the FatigueSpark caption.
  - Criterion chips (`CriterionChips`, `app.jsx:184`) render as large text buttons.
- **Bottom bar** (`TimelineBar`, `ui/timeline.jsx:237`): three rows.
  - Row 1: controls, speed, A·B 비교, A·B 하루 같이 보기, 30일 보기.
  - Row 2: route steps that wrap onto two lines (`RouteSteps`, `timeline.jsx:50`).
  - Row 3: the day strip.
- **Tour picker** (`ui/topbar.jsx:178-179`): it shows both "지역:" and "지역 선택" (two labels). Keep one.

Rules:
- The first thing on screen answers "지금 이 사람은 어떤 상황인가?".
- Everything else is one tap away.
- Never delete a feature: hide it or move it.

## 1. Drawer = one hero + three folded sections
- **Hero** (always visible, top of the drawer):
  - member name + status chip (이동 중 / 집 / 직장 …)
  - one sentence: "신분당선 강남→판교 이동 중"
  - one big number (28): "15분 남음"
  - one congestion bar for the current leg (status colour + "혼잡 70% · 가정값" in 12)
  - the next event in one line (12, tertiary): "다음: 09:05 직장 도착"
- **Sections** (accordion, all closed by default except 오늘):
  1. **오늘** — the day's trips as a compact vertical list, one line per leg (time · mode icon · from→to · minutes · congestion dot). The current leg is highlighted. This replaces JourneyCard and the duplicated leg lines.
  2. **왜 이렇게 판단했나** — criteria (as small text tags, not buttons; "+8개" expands), the judge log (`JudgeLogCard`), and the fatigue sparkline with its one caption ("피곤한 정도는 가정 모델이에요").
  3. **비교·기록** — CompareCard and the 선택 기록.
- Each fact appears **once** in the whole drawer.
- Source badges (실측 / 가정값) sit at the end of the line they qualify, in the small style from 13f-1. Never two badges side by side in a header.
- Width 360. Padding 16. Card-less sections separated by 1 px dividers. No nested cards.
- Test: render the drawer at the 08:50 state and assert "잠실→강남" appears at most once outside the 오늘 list.
- Commit `13f2: drawer hero + sections`.

## 2. Bottom bar = one row
- One row, height ≤ 64, inside the stage only:
  - play/pause icon
  - date-time "11/2(월) 08:50 · 1일차"
  - the day strip (flex 1) with the current-time needle
  - speed (1× / 10× / 60×) as a compact segmented control
  - a "⋯" menu holding A·B 비교, A·B 하루 같이 보기, 30일 보기
- Route steps (`RouteSteps`) move out of the bar.
  - The 오늘 list in the drawer shows them.
  - Hovering the day strip shows a tooltip with that leg ("08:21 레이크팰리스 → 잠실 · 걸어서 14분").
  - Keep the prev/next keyboard shortcuts (`timelineKeyHandler`).
- The activity legend (colours) opens from the map tool group's 범례, not under the bar.
- Commit `13f2: one-row timeline`.

## 3. Map readability (colours only, in `render/look.js`)
- The sim map reads as a washed-out grey sheet. Raise the contrast a little:
  - ground a touch warmer and lighter than the buildings
  - buildings one step darker with clearer roof/wall shading
  - water a clear blue
  - roads warm asphalt grey, clearly apart from water (today roads read bluish)
- The route line is barely visible: give the current member's route ahead 4 px in the accent colour and the done part 2 px at 40 % opacity. Stage 14c will add glow and avatars later; keep this simple.
- Commit `13f2: map contrast + route weight`.

## 4. Small fixes
- Tour picker: one label ("지역") + the select.
- Chat profile card (`ui/chat.jsx` ProfileCard ~104):
  - Show the customer-said values as one summary line of chips ("2인 · 강남 출근 · 전세 4억 이하 · 59㎡ 이상").
  - Then a single line "모르는 값 5개 — 채우면 더 정확해요" with the existing fill chips.
  - The full table moves into a "자세히" disclosure.
- Commit `13f2: tour picker + profile summary`.

## End
- Run `cd web && npm test 2>&1 | tail -6` (one failure in `share.test.js` comes from the engine stage on main changing the money build. Ignore it if it is the only one, and say so) and `npx vite build 2>&1 | tail -2`.
- Write `briefs/13f2-RESULT.md` with the Before / After / Why table and the capture URLs.
- Commit.
