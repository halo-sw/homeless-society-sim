# Stage 12b — RESULT (question-first entry, conversation, previews, day timeline)

Agent mode, Muse (`muse-spark-1.3`). Builds on 12a/12a2 (`extract_profile`,
`find_homes`/`find_public_rentals`, `photosNear`, `sceneThumbnail`,
`scenarioFromProfile`, `areas-index.json`, ride times with sources, per-region
`data/build/homes/<region>.json`).

## Template choices (and why)

Ran the four CLI commands offline in `web/` (`--no-install` worked; output
matched `docs/astryx/templates/*.source.tsx` byte-for-byte in structure), then
**ported them to JSX** under `web/src/ui/` instead of keeping the raw
`src/app/*/page.tsx` copies (deleted after porting; originals stay in
`docs/astryx/templates/`): the raw copies are Next-isms (`'use client'`) and
need `@heroicons/react`, which is not installed — the app uses Astryx string
icons (`close`, `chevronDown`, …). Sample content removed: JWT doc, shop
items, categories/modes/mentions/attachments, server/email inboxes, artifact
panel, mobile artifact Dialog.

- **Landing** (`ui/landing.jsx`) ← `ai-chat-landing`: Layout + greeting +
  ChatComposer + ClickableCard grid, kept verbatim in structure/spacing.
- **Chat** (`ui/chat.jsx`) ← `ai-chat`: ChatLayout + ChatMessageList +
  ChatComposer; transcript column + work area instead of the artifact panel.
- **Shell** ← **`shell-top-nav`** (not side-nav). Per the scaffold guide,
  SideNav is the default when the frame leaves navigation *open* — ours is a
  single-destination app (landing → chat → sim moment); a side nav would steal
  220–420 px from the chat/work split for destinations we will never plan.
  TopNav carries identity + the profile chip + 새로 시작, exactly the
  shell-top-nav slots. Structure guide: weakest container that groups.

## Screen flow + URLs

- `/` (no routing params) → **landing**: full-height `ai-chat-landing` over
  the tour scene of the default box, slowly drifting, dimmed + blurred
  (`.ui-landing-scrim`: 62% black + 6px blur; white text). Heading, sub-line,
  composer (`어디로 출근하고…`), 3 persona cards (fill example prompts,
  each badged **예시**) + 매물 글 붙여 넣기, 11-area coverage line + 데이터
  출처 popover. First message → `/?chat=<text>` (+ `&example=<id>` on 예시).
- `/?chat=…` → **chat**: shell-top-nav (profile chip `판교 출근 · 1인 ·
  전세 2억 원 이하`, 새로 시작), transcript left (440px, own scroll), work
  area right (3D scene behind + scene card, picks, compare tabs). Cards:
  Profile (value + source per field, missing chips fill the composer),
  Candidates (preview cards, customer sort dropdown, pick 2–3, 살아 보기
  gated on readiness), Simulation (real worker progress → plain-words
  compare rows → per-home 3D에서 보기), Listing (paste check), Tab
  (전세/살 만한가?/도움). Transcript persists in sessionStorage; `&area=`
  switches the work-area scene without losing it.
- Deep links unchanged: `?mode=sim…` (now with the day timeline),
  `?mode=sim&tour=demo` (tour; agent step shows the recorded Q&A card +
  대화에서 계속하기), bare `?tour=demo`/`?area=` (tour boot, as before).
- Two answer paths, same cards: deterministic **client engine**
  (`chat/engine.js`, no key — extract → find over lazy per-region files →
  scenario → worker simulate → compare) drives the fixed flow; the **live
  agent** (dev key) answers free questions and its recognised tool results
  render as the same cards. `?ask=…` replays recorded replies with 기록된
  답변. Chat-run sims round-trip through IndexedDB (`?custom=<id>`) for
  3D에서 보기; committed scenarios use their files.
- Engine note: picked officetels/villas often form no named complex, so
  `resolveHome` gained a **coordinate fallback** (footprint centroid →
  nearest graph node/building, recorded in `run.meta.home_anchor`, noted
  on the card). Same determinism rules; verbatim path untouched. Slim
  region files gained `pnu` (pipeline + rebuild; test updated).

## Spacing decisions (layout-spacing / responsive guides)

- One content line per region; gaps/padding only via Astryx `gap=`/`padding=`
  token props in new JSX — no raw px margins. Structural widths in px only
  (chat column 440, per scaffold).
- Chat shell: AppShell `contentPadding={0}`; pinned TopNav; thread + work
  area each own-scroll (headers-and-footers pattern). Responsive contract:
  ≥1100px side-by-side; <1100px the work area becomes a tab (대화/화면
  SegmentedControl, CSS-swapped); 800px: sim bar full-width, month grid
  15→10 cols, photo slides narrow.
- Timeline: route steps above the strip, strip + ticks + playhead, legend,
  30-day strip, follow control; A·B toggle stacks both homes' strips at the
  same minute. Keyboard ←/→/space (never while typing); reduced motion
  pauses ambient drift. Map route reuses strip colours (걷기 line, 지하철
  stub). No ellipsis anywhere (test-guarded); Korean `keep-all`, no
  mid-word truncation.
- 11b carryover: floating agent deleted; **대화** reopens the chat from
  every screen (unconditional; render-tested at 00:00/07:00/19:18/23:59 ×
  follow 0/1).

## Verification

- JS: **749/749** (`node --test tests/*.test.js`); Python: **216/216**;
  `vite build` green; bundle scan: no key values, no `data/raw` refs, no
  provider URLs. New tests: `timeline-12b`, `chat-engine-12b` (incl.
  slim-vs-full top-6 agreement on the real build), `preview-12b`
  (attribution per photo, disabled slots, bundle keys), `landing-chat-12b`
  (transition URLs, sources, sort render, no-demo-figures scan, keyboard,
  reopen wiring); `ui-render` extended (landing/chat/timeline SSR, A 08:50
  steps, A·B stack, tour card) + retargeted crash tripwires.
- Not done in-browser: sandbox blocks listening sockets and escalation is
  disabled, so no dev-server screenshots — SSR renders (0 React errors)
  + node end-to-end on real data (extract→find→simulate→compare, 1.1 s)
  stand in. Please confirm visually at the URLs below.

## Capture URLs (orchestrator, `npm run dev`)

- Landing: `/`
- Chat greeting: `/?chat=` · profile card: `/?chat=판교로%20출근하는%20신입`
- 예시 candidates with photos: `/?chat=<persona prompt>&example=single-firstjob`
- Listing: `/?chat=&listing=1` · recorded: `/?chat=&ask=switch`
- Day strip at A 08:50: `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`
- 30-day strip: same URL (bottom of the sim bar); A·B stack: toggle
  `A·B 하루 같이 보기` on that screen
- Narrow width: any chat URL at 390/800/1100 px (대화/화면 tabs)
- Tour agent step: `/?mode=sim&scenario=demo-two-homes&tour=demo&step=9`
  (then the step's own URL with `&agent=1&ask=switch` shows the card)
