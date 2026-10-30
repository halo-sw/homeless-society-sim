# Stage 13f-1 — Clean design foundation + one top bar (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** You work on branch `ui-13f` in this worktree. Another session changes the engine on `main` at the same time, so **touch only** these:
- `web/src/ui/` (except `orb.jsx` logic)
- `web/src/style.css`
- `web/src/render/look.js` (colours only)
- `web/tests/` for UI tests

Commit after each part: `git add -A web/src/ui web/src/style.css web/src/render/look.js web/tests && git commit -m "13f1: …"`. The first edit should land within 6 tool calls.

The user's words (2026-10-29): "전체적인 디자인 깔끔하게. 지금은 너무 정신없고 정리되지 않았어."

Design skills to use:
- Call `read_skill` for `taste`, `arrange` and `baseline-ui` before the first visual edit.
- Read `docs/emil-skills/skills/emil-design-eng/SKILL.md` and `docs/emil-skills/ui-cheatsheet.md` once.
- Apply them. In the RESULT, give the Before / After / Why table the Emil skill requires, one row per component you changed.

Product rules (shared with the engine session):
- The first screen is the answer; the rest is evidence on tap.
- Never delete a feature: hide it or move it.
- No model name, token counts or internal errors on screen outside the settings sheet.

## 1. Foundation tokens (one file, used everywhere)
- **Font is not applied today.** Measured on the GPU: every screen computes `Figtree`. The astryx theme sets `--font-family-body` / `--font-family-heading` to Figtree (`@astryxdesign/theme-neutral`), which beats our `#ui-root { font-family }` rule in `ui/ui.css:262-276`. Override both variables at the theme scope (`:root` and the Theme wrapper) with `'Pretendard Variable', -apple-system, 'Apple SD Gothic Neo', sans-serif`, and do the same for the 3D overlay roots. The woff2 is at `web/public/fonts/pretendard/`.
- Add a tokens block at the top of `ui/ui.css` (`--ui-*` variables) and use only these afterwards:
  - **Type:** 12 / 14 / 16 / 20 / 28 (28 is for one hero number per card). Weights 400 / 600 only. Line-heights 1.45 for body and 1.25 for headings.
  - **Space:** 4 / 8 / 12 / 16 / 24 / 32.
  - **Radius:** 8 (chips) / 12 (cards) / 16 (sheets).
  - **Surfaces:** page `#f6f4ef`, card `#ffffff`, sunken `#efece5`. One border `rgba(30,25,20,.08)`. One shadow for floating cards (`0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.06)`).
  - **Text:** primary `#1d1b18`, secondary `#5f5a52`, tertiary `#8f897f`.
  - **One accent** for actions and selection (choose one calm blue).
  - **Status:** 여유 / 보통 / 혼잡 / 매우 혼잡, reusing the existing congestion colours.
- Replace hard-coded colours, radii and shadows in `ui/ui.css` with the tokens. Remove duplicate or contradicting rules.
- **Badges:** keep only two source badges, 실측 and 가정값, with the same small style everywhere. They show once per group (section header or row group), never on every line. Other badge colours (orange "미니어처", teal …) become plain text or are removed.

## 2. One top bar for all screens
Today:
- The sim/tour bar (`ui/app.jsx:62-104`, `TopBar`) has 8 equal-weight controls.
- The chat bar (`ui/chat.jsx` ~1067-1113) has its own set: token meter, Spark 1.3 dropdown, 모델, 가정 바꾸기, 출처·라이선스, 새로 시작.

Make one shared `ui/topbar.jsx` used by both:
- **Left:** "주거 시뮬레이터" (16/600), then a segmented control with three items: **대화 | 살아 보기 | 동네 둘러보기**. It maps to the existing chat / sim / tour modes and actions.
- **Centre (optional):** the profile summary chip in chat (keep the existing one), nothing in sim or tour.
- **Right:** one icon button "설정" that opens a right sheet holding everything else:
  - model choice + token/cost meter (`model-panel.jsx`)
  - 가정 바꾸기 (`assumptions.jsx`)
  - 출처·라이선스 (`sources.jsx`)
  - 이 시뮬레이션은? (intro)
  - 새로 시작
- **Sim-only view options** go into a small floating tool group at the map's top-left: the A/B home switch and 집만 밝게 보기.
- **Tour-only options** in the same tool group:
  - The **area picker**. Today it is a `SegControl` with 60+ items (`app.jsx:77`), which renders as an empty grey bar across the whole top panel. Make it a searchable select ("지역: 잠실 ▾").
  - 재생/일시정지.
- Remove the "미니어처" badge.
- Height 56, white, bottom border, no floating card. The page content starts below it.
- Test: a render smoke test for the top bar in each mode (existing `react-dom/server` pattern in `web/tests/ui-render.test.js`).

## 3. Words on screen
Replace internal words everywhere in `web/src/ui` (and in `copy.js` / `glossary.js` where they come from):
- "예시로 시작했어요 (newlywed-couple)" → "예시: 예비 신혼부부"
- tour stop card "아파트 단지 · complex · 37.5115° N 127.0945° E" → "아파트 단지" plus one plain line; drop the coordinates
- tool rows ("상황 읽기 1ms") → collapsed by default into one line "확인한 것 3가지 ▸"
- the assistant avatar letter "상" → a small neutral mark
- "범례 1,784동" → the legend opens from the tool group; the building count moves into the legend
- Grep for snake_case or English ids rendered as text (`/>[a-z_]+</`, `label={"[a-z_-]+"}`) and fix them.
- Test: no rendered string in the smoke tests matches `/[a-z]+_[a-z]+|complex|°\s?[NE]/`.

## End
- Run `cd web && npm test 2>&1 | tail -6` and `npx vite build 2>&1 | tail -2`.
- Write `briefs/13f1-RESULT.md`:
  - the token table
  - the Before / After / Why table
  - capture URLs (landing, chat newlywed example, sim A 08:50, tour 잠실)
- Commit.
