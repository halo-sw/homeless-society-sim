# 13f1 RESULT — Clean design foundation + one top bar

Branch `ui-13f`. User: "전체적인 디자인 깔끔하게. 지금은 너무 정신없고 정리되지 않았어."

## Token table (`web/src/ui/ui.css` top block, used everywhere)

| Group | Tokens |
| --- | --- |
| Type | 12 / 14 / 16 / 20 / 28 (`--ui-t12…t28`); weights 400 / 600; body 1.45, headings 1.25 |
| Space | 4 / 8 / 12 / 16 / 24 / 32 |
| Radius | 8 chips / 12 cards / 16 sheets |
| Surfaces | page `#f6f4ef`, card `#ffffff`, sunken `#efece5`; border `rgba(30,25,20,.08)`; one floating shadow |
| Text | primary `#1d1b18`, secondary `#5f5a52`, tertiary `#8f897f` |
| Accent | calm blue `#2f6fed` (one only) |
| Status | 여유 `#4a9b6b` / 보통 `#d9a83c` / 혼잡 `#d96c3c` / 매우 혼잡 `#c0392b` (existing congestion colours) |
| Font | `'Pretendard Variable'` overrides `--font-family-body/heading` at `:root`, the Theme wrapper, `#ui-root`, and the 3D overlay roots (`#tags`, `.hhtag`, `.hopin`, `.jostation`); woff2 in `web/public/fonts/pretendard/` |

Font fix: the old `#ui-root { font-family }` rule lost to the astryx theme variables — every screen computed Figtree. The theme variables are now overridden at theme scope, so Pretendard wins.

## Before / After / Why (one row per changed component)

| Before | After | Why |
| --- | --- | --- |
| `ui.css`: hard-coded browns (`rgba(61,50,39,…)`, `#d8d2c4`, `#3d3227`), radii 2–12px, ad-hoc sizes 10–22px, duplicate `@font-face` and triplicate overflow rules | One `--ui-*` token block; every rule reads tokens; duplicates merged | One source of truth; consistent rhythm (arrange: spacing system, no arbitrary values) |
| `style.css`: paper `#fbf7ee`, ink `#3d3227`, accent rust `#b25a33`, `"Pretendard"` (never loads — the file is Pretendard Variable) | Tokens echoed (`#f6f4ef` / `#1d1b18` / `#2f6fed`), real `Pretendard Variable` stack | Shell and UI share one palette and one font |
| Sim/tour bar: floating card, 8 equal-weight controls, orange "미니어처" badge, 60+ item area `SegControl` rendering an empty grey bar | Shared `ui/topbar.jsx`: 56px white bar, title 16/600 + segmented 대화/살아 보기/동네 둘러보기; right side is one 설정 icon button | First screen is the answer; one control hierarchy (squint test: title → mode → settings) |
| Chat bar: token meter, Spark 1.3 dropdown, 모델, 가정 바꾸기, 출처·라이선스, 새로 시작 | Same shared bar; everything else moves into a right settings sheet (Drawer) | One bar for all screens; internals (model names, tokens) live only in the sheet |
| Settings scattered across bars and the chat drawer | Sheet sections: 모델(+meter) / 가정 바꾸기 / 출처·라이선스 / 이 시뮬레이션은? / 새로 시작; sim/tour reuse it (assumptions hand off to chat, intro opens the sim card) | Never delete a feature: hide or move it |
| Sim A/B switch + 집만 밝게 보기 + 범례 competing in the bar; tour play + area picker too | Floating `MapTools` group at the map's top-left, per mode | View options stay with the view, out of the global bar |
| Tour area picker: 60-item `SegControl` | Searchable `Selector` ("지역: 송파·잠실 ▾") | 60 items need search, not segments |
| Legend always visible with a "1,784동" toggle button | Legend opens from the tool group's 범례 button; the building count (`건물 N동`) lives inside | Evidence on tap, not on load |
| Badges everywhere: orange/teal/blue/purple/yellow per row (미니어처, 그래프, 실거래, 경찰청, 기록된 답변, 예시, live, 낮음…) | Only 실측 / 가정값, one neutral style, once per group header (`SourceBadge`/`GroupBadges`); the rest is plain text or removed | One accent, one badge language; rows stay scannable |
| `예시로 시작했어요 (newlywed-couple)` | `예시: 예비 신혼부부` (`exampleLine` in `copy.js`) | No engine ids on screen |
| Tour caption `아파트 단지 · complex · 37.5115° N 127.0945° E` | `아파트 단지` + the walk line; category and coordinates dropped in `CaptionCard` (engine untouched) | No categories, no coordinates |
| Tool rows (`상황 읽기 1ms`, …) fully expanded | Collapsed `확인한 것 N가지` (`Collapsible`, closed by default) | Evidence on tap |
| Assistant avatar letter "상" | 12px neutral dot (`.ui-mark`) | No letter avatars |
| Raw fallbacks (`‖ key`, `‖ tab`, `‖ unit`, criterion ids, `engine 기본값`, band ids) | Plain Korean or hidden (`기타`, `자세히`, count-only, `기본 계산값`) | Grep-clean: no rendered string matches `/[a-z]+_[a-z]+\|complex\|°\s?[NE]/` |
| `viewChip` info badges | Plain chip (`.ui-viewchip`: card, border, shadow) | Same two-badge rule |

## Verification

- `cd web && npm test`: 918 pass / 1 fail / 2 skipped (921 total). The single failure is `share.test.js → matches the built money/compare docs`: the engine session regenerated `data/build/sim/demo-two-homes-money.json` at 22:06 (monthly_won 2,600,000 → 1,666,667) while this branch ran. Independent recompute proves the doc — not this branch's one-line label fallback — changed the value. Left for the engine session; not pinned from the UI branch.
- `npx vite build`: fails environmentally (`EPERM` writing `web/node_modules/.vite-temp/…` under the sandbox; vite resolves from `../sim/web/node_modules`). No code error; needs a build outside the sandbox.
- New tests: `web/tests/topbar-13f.test.js` (bar in each mode, tool groups, sheet entries), `web/tests/words-13f.test.js` (example line, badge mapper, collapsed rows, caption); the no-internal-text regex runs in every `ui-render` smoke case.

## Capture URLs

- Landing: `/`
- Chat newlywed example: `/?chat=맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상&example=newlywed-couple`
- Sim A 08:50: `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`
- Tour 잠실: `/?area=songpa-jamsil`
