# Stage 13e2 — Seven fixes, with exact locations (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.**

The previous run read 24 files and edited none. **The orchestrator has already located every fix below. Do not explore. Open only the files and lines named here, then edit.** The first edit should land within your first 8 tool calls.

Tests: `web/tests/*.test.js` run with `node --test` (no jsdom). For layout, follow the CSS-text check pattern in `web/tests/compare-tabs.test.js` (it reads `ui.css` with readFileSync and asserts on the rules).

## 1. Chat columns scroll on their own
- Cause: `ui/chat.jsx:1067` wraps the chat in astryx `AppShell`, whose `.astryx-layout-content` becomes the only scroller (measured scrollHeight 5429 / clientHeight 852). The `height: 100%` rules on `.ui-chat-thread` / `.ui-chat-stage` / `.ui-chat-drawer` (`ui/ui.css:186-200`, `:478-493`) then resolve against an auto-height parent.
- Fix, in `ui/ui.css` only:
  - `.ui-chat [class*="astryx-layout-content"]` → `overflow: hidden; display: flex; flex-direction: column; min-height: 0; height: 100%`.
  - Make every wrapper between it and `.ui-chat-main` a flex column with `min-height: 0`, so `.ui-chat-main` gets a definite height.
  - Inside `.ui-chat-thread`, the message list scrolls (`overflow-y: auto`) and the composer, chips and error banner stay pinned.
  - The stage never scrolls. The drawer keeps its own `overflow-y: auto`.
- Test: CSS-text assertions on these rules.
- Commit `13e2: chat columns scroll on their own`.

## 2. Orb fills the stage, light background, thin slabs, labels
Files: `ui/orb.jsx` (208 lines), `orb.js` (107), `ui/ui.css:457-460` and `:478-482`.
- `ui.css:481` and `orb.jsx:38`: the stage background `#101318` and the scene background `0x101318` → the app's light surface (`#f4f1ea` or the nearest look-table surface).
- `.ui-orb` `min-height: 320px` → fill the parent (`position: absolute; inset: 0`).
- Resize the renderer from the container with a `ResizeObserver`. Fit the camera to the shapes' bounds with 8 % margin, centred.
- Extrusion depth ≤ 2 % of the map width. Use a calm, desaturated palette. Add a 1 px darker outline.
- Region labels (성동 · 송파 · 강남 · 강동 · 위례 · 분당 · 수정 · 중원 · 수지) as HTML labels at the projected centroid, clipped to the container.
- Keep the existing hover tooltip, the click-to-filter and the candidate dots.
- Test: a pure function in `orb.js` for camera fit and label centroids.
- Commit `13e2: orb fills the stage`.

## 3. Profile card source labels
- `chat/engine.js:347-352`: `sourceKo` falls back to "내가 말한 값". Change it to return `""` for an unknown or empty source, and add `asked: "물어볼 값"`.
- `chat/engine.js:353` (`fieldRows`): when `f.value` is null, empty or an empty array → `text: "아직 몰라요"`, `source: "asked"`, `note: ""`. Do not default the source to `"customer"`.
- `profile.js:51` (`blank()`) and `:568-574`: blank fields get source `"asked"` and no note (drop "아직 묻지 않음" / "예시: 아직 묻지 않음").
- `profile.js:295`: note → `"세전 연봉이에요. 실수령은 따로 계산해요."`. Grep `web/src` for any other user-visible snake_case tool names in notes and fix them the same way.
- `ui/chat.jsx:116-123` (ProfileCard):
  - render the source Badge only when `sourceKo(r.source)` is non-empty
  - use the muted `neutral` variant for "물어볼 값" and `blue` for "내가 말한 값"
  - hide `r.note` when it equals the label or the value text
- Tests: fieldRows on an empty profile gives no "내가 말한 값"; on "연봉 4천" gives exactly one.
- Commit `13e2: profile card labels`.

## 4. Intake: no invented salary
- `ui/intake.jsx:37`: `value || { kind: "annual", amount: 40000000 }` invents 4,000만 원. Start empty: `amount: null`, a placeholder ("예: 4,000만 원"), and the stepper's first press starts from a sensible step.
- Check every other stepper in `ui/intake.jsx` and `intake.js` (cash, budget, living cost, price range) for the same pattern.
- Test: the intake steps built from the newlywed example (`?example=newlywed-couple`, no salary said) contain no salary value.
- Commit `13e2: intake starts empty`.

## 5. Tool rows say the label once
- `ui/consult.jsx:22-35` (`ToolRows`) shows `name = toolActionKo(r.name)` **and** `target = r.summary`. The summaries in `ui/chat.jsx` repeat the label:
  - `:571` "상황 읽기"
  - `:677` "집 후보 N곳(정렬: …)"
  - `:756` "시나리오 (…)"
  - `:764`, `:766`
- Make summaries carry only the result:
  - `:571` → "" when ok, "읽기 실패" otherwise
  - `:677` → `${n}곳 · ${HOME_SORT_KO[sort]}`
  - `:756`, `:764`, `:766` similar
- In `ToolRows`, show duration as seconds with one decimal for ≥100 ms (`0.2초`), and `ms` otherwise.
- Recorded replies (`ui/chat.jsx:973`) pass `t.summary`. Strip a leading copy of the label there too.
- Test: no row's target starts with its own label.
- Commit `13e2: tool rows`.

## 6. Station photos: no platforms or concourses
- `places/photo-filter.js:36-40` lets "platform / 승강장 / 대합실 / 개찰구 / concourse" through for stations. The leaked photo is `File:대모산입구역 승강장.jpg` (author revi): its metadata never mentions people, so keyword rules can't catch it.
- New rule: for `kind = "station"`, drop interior words (platform, 승강장, 대합실, 개찰구, concourse, ticket gate, lobby, 역사 내부) entirely. Keep exteriors, entrances, street views. Also add to the people list: passenger(s), commuter(s), crowd, waiting, woman, women, man, men, child, children, 기다리는.
- In `places/select-photos.js`: when a station has no photo left, fall through to the card's next source (already the order; verify).
- Report counts: write a small node script under `web/scripts/` (or a test) that runs the filter over `scenarios/places/commons-named.json` and prints how many photos each rule removes. Put the numbers in the RESULT.
- Commit `13e2: station photo filter`.

## 7. Sim map tags stay inside the stage
- `main.js:1004-1016` (`paintTag`) positions tags with `innerWidth` / `innerHeight`, so a tag can land under the right drawer.
- Use the canvas/stage rect instead. Hide a tag whose x is beyond the stage's right edge (minus the drawer width when it is open) or outside the stage vertically.
- Make the stage rect a pure helper and test it.
- Commit `13e2: map tags inside stage`.

## Each item
- Run `cd web && npx vite build 2>&1 | tail -3` and `node --test tests/<the files you touched or added>`.
- Then `git add -A web && git commit -m "..."`.
- Read each file at most twice.

## End
- Run `cd web && npm test 2>&1 | tail -8`.
- Write `briefs/13e-RESULT.md`: per item, what changed (files, lines), the photo-rule counts, and capture URLs (the three from `briefs/13d-RESULT.md`).
- Commit it.
