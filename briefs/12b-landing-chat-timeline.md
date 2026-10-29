# Stage 12b — Start from a question, continue in a conversation, preview real places, read the day at a glance (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/12a-RESULT.md` first (the APIs this stage builds on: `extract_profile`, `find_homes`, `find_public_rentals`, `photosNear`, `sceneThumbnail`, `scenarioFromProfile`, `areas-index.json`). Astryx references are offline:
- Templates the user asked for: `docs/astryx/templates/{ai-chat-landing,ai-chat,shell-top-nav,shell-side-nav}.source.tsx` and `.skeleton.txt` (spacing annotations).
- Layout guides: `docs/astryx/docs-layout.md` and `docs/astryx/layout/*.md` (scaffold, structure, headers-and-footers, side-panels, layout-spacing, responsive), plus `docs/astryx/docs-spacing.md` and `docs/astryx/docs-tokens.md`.
- The user's commands, which you should run inside `web/` (the CLI works offline with `--no-install`; adapt the paths to this Vite app, TSX is fine, or port to JSX):
  `npx --no-install @astryxdesign/cli template ai-chat-landing ./src/app/ai-chat-landing`, `… template ai-chat ./src/app/ai-chat`, `… template shell-side-nav ./src/app/shell-side-nav`, `… template shell-top-nav ./src/app/shell-top-nav`.
  Use them as the base, not as decoration. Remove template sample content you don't use.

Sub-agents allowed (Muse only).

## The user's request (2026-10-29, paraphrased)
"From the user's side it is still unclear how to use this. The service should pull the right data out for me instead of showing parts of a simulation, and today it only shows values we chose. Following the simulated person's route is still hard. Make the timeline more intuitive. First, a prompt space standing over the map background; after that, an AI chat conversation module. Collect real images of the areas and show them in a real-estate preview. Take care with Astryx spacing."

## Part A — the entry: a question over the map (ai-chat-landing)
1. The first screen is the **ai-chat-landing** template, full height, over a slowly moving 3D background of a real scene (a built box, dimmed and blurred enough for text contrast ≥ 4.5:1). No panels, cards or timeline yet.
2. The heading says what the service does in one line ("계약 전에, 그 집에서 30일 먼저 살아 봐요"), with one sub-line on what you get. The composer placeholder asks for the customer's situation ("어디로 출근하고, 누구와 살고, 예산은 얼마인가요?").
3. Suggestion cards (ClickableCard grid from the template) are the three personas, each filling an example prompt labelled **예시**, plus "매물 글 붙여 넣기" (stage 10 listing check). A small line under them shows the 11 areas covered and "데이터 출처" (popover).
4. Sending the first message moves to Part B with that message as the first turn.

## Part B — the conversation (ai-chat + shell)
1. Layout from **shell-top-nav** (or shell-side-nav if it reads better; pick one per the scaffold guide and say why): top bar with the product name, the current profile summary chip ("판교 출근 · 1인 · 전세 2억 이하") and "새로 시작". Main area: the **ai-chat** transcript on the left (≈ 420–480 px, its own scroll), and the **work area** on the right (map / 3D, candidates, results). On < 1100 px the work area becomes a tab or a sheet.
2. The flow is driven by the agent with the 12a tools, and every step renders as a **message with a data card**, not as free text:
   - Profile card: each field with value and source ("내가 말한 값" / "기본값" / "계산한 값"); missing essentials appear as chips to fill in ("월 예산?").
   - Candidates card: 3–6 homes as preview cards (Part C), with the sort shown and changeable ("출퇴근 짧은 순 ▾"). "이 집들로 살아 보기" asks the customer to pick 2–3.
   - Simulation card: progress while it runs, then the plain-words comparison (stage 10/11 rows) with "3D에서 보기" links that move the work area to that moment.
   - 전세 check, worth-it and support cards from the existing tabs, opened from the chat ("이 집 전세 점검해 줘").
   The existing tabs remain reachable from the work area, but the conversation is the main path.
3. The floating agent from stage 10/11 is replaced by this chat (keep its tool-call rows, citations, system messages and the no-key recorded replies, now for the new flow).
4. No demo numbers appear unless the customer picked an **예시** profile, and then each one is labelled 예시.

## Part C — real-estate preview cards with real photos
For each candidate: a photo strip (`photosNear`, up to 6, swipe/arrow, lazy, alt text from the description) with an overlay label "주변 사진 · 이 매물 사진이 아니에요" and an attribution line per photo (author, licence, link). Then our own 3D thumbnail (`sceneThumbnail`) when there is a scene, else a small map. Then name, kind, built year, area, and the real-transaction median and range for the customer's tenure with deal count and a 실거래 badge. Then commute (ride + walk, or "도보 미확인"), monthly cost in plain words (stage 10 copy), and the 전세가율 signal where available. Actions: "3D로 살아 보기" (only if scene), "전세 점검", "비교에 넣기". Use Astryx Card/ClickableCard, Badge, Token, Carousel or a simple HStack scroller, following the spacing guide (one content line per region, consistent gaps; no ad-hoc margins).

## Part D — the day you can read at a glance (timeline)
Today: two sliders (일차, 시간) and dots; following the route is hard.
1. Replace them with a **day strip**: one horizontal bar for 05:00–24:00 per followed member, with colour-coded segments by activity (집, 걷기, 지하철, 직장, 장보기, 공원, 기타) and icons. Hover shows the segment ("08:21–08:35 걷기 · 레이크팰리스 → 잠실역 14분"). A playhead can be dragged; click a segment to jump there. Use the same colours on the map route.
2. Above it, a **route steps** list for the current trip: "집 → 잠실역 (걸어서 14분) → 2호선 잠실→강남 (9분, 혼잡 91% 실측) → 환승 4분 → 신분당선 강남→판교 (17분, 70% 가정) → 직장 (걸어서 5분)". The current step is highlighted and each step is clickable (moves the camera). It also has the previous / next trip buttons ("◀ 이전 이동 · 다음 이동 ▶").
3. A **30-day strip** (small multiples or a heat row) for the day picker. Each day shows commute minutes or fatigue, and weekends are marked. Click a day to load it.
4. Playback controls stay (재생, 1×/10×/60×), and A·B switch shows both homes' day strips stacked for comparison at the same time of day.
5. Keyboard: ←/→ previous/next trip, space play/pause. Reduced motion respected.

## Part E — spacing and polish
Follow `docs/astryx/layout/layout-spacing.md`: one content line per region, gap scale from tokens only (no raw px margins in new code), consistent card padding, headers pinned per `headers-and-footers.md`, responsive rules per `responsive.md` (≥ 1440, 1280, 1100, 800). Check text never truncates mid-word (stage 11 rule) and contrast on the landing.

## Tests
Landing → chat transition, profile card rendering of sources, candidates card sort change, "no demo numbers without 예시" (render scan), photo strip attribution present for every photo, day-strip segment building from a trip list (pure), route-steps builder (pure, the 08:50 A example), 30-day strip data, keyboard handlers, server-render smoke test of the new screens (extend `ui-render.test.js`). All existing tests green, `vite build`, no keys in bundle.

## Output
`briefs/12b-RESULT.md`: which template choices and why, the screen flow with URLs (`/` landing, `/?chat=…`, deep links that still work: `?mode=sim…`, `?tour=demo`), the spacing decisions, and the capture URLs for the orchestrator (landing, profile card, candidates with photos, simulation card, day strip at A 08:50, 30-day strip, narrow width).
