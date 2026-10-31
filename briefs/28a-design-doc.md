# Stage 28a — Muse designs Ithaca's design system, landing and app layout (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section). Branch `chat-27`. **This run writes one file only: `docs/design.md`. No code changes, no tests.** Read only `docs/product.md` (whole, it is short) and the line ranges quoted below. Stop when the file is written.

## Why
User feedback on the live app (2026-10-31, after 27j):
- "지도 확대 축소 같은 기능이나 지금 label button에 대한 컴포넌트가 디자인 시스템이 제대로 잡힌 건지 의문"
- "메인화면이 이따위로 비어 있으면 어떡해?" — at 2000 px wide, the empty chat shows the heading at the top, the composer at the very bottom, ~600 px of nothing between, and the column sits right of centre.
- "UI 여전히 컴포넌트 간 간격 안 맞고 왜 여기 이렇게 배치되어 있는지 잘 모르겠는 것들이 많아."
- "서비스 소개할 수 있는 랜딩페이지랑 같이 들어가 있으면 좋겠어. manus.im 같은 거 참고해서 디자인 다시 해 봐."
- About the 3D neighbourhood panel: "항공사진으로 보기엔 좀 애매… 전경을 못 보는 것 같아서 문제." The camera opens close and low over a few buildings; the home is not marked; the places Muse just quoted (미금역 3.8분, 마트 2.3분) are not on screen; an auto tour card ("청솔어린이공원") pages by itself.

You are the designer. Decide the system; later stages implement exactly what you write.

## Facts to design from

### What exists today (orchestrator's audit of the code)
- Tokens: `web/src/ui/ui.css:1-20` (`--ui-t12…t28`, `--ui-s4…s32`, `--ui-r-chip 8 / card 12 / sheet 16`, page `#f6f4ef`, ink `#1d1b18`, accent `#2f6fed`, status colours). Components come from the Astryx library (`@astryxdesign/core`: Button variants `ghost` ×40, `secondary` ×20, Badge `info`, Banner, Card, Chat, Collapsible, Dialog) mixed with hand-made CSS.
- Five button looks appear side by side: black filled pill (`담기`, tray `이 집들로 30일 살아 보기`), grey filled chip (suggestions, `EMPTY_STARTERS` in `web/src/ui/chat.jsx`), white outlined (`지도로`, `새 창으로`), text links (`지도에서 보기`, `3D로 보기 →`, `장면 보기` which clips to `장면 …`), and Astryx IconButton (`×`).
- Spacing values outside the scale are common in `ui.css` (2px ×16, 6px ×7, 10px ×2). Assistant cards carry grey avatar dots to their left; text bubbles have none, so card and text edges do not line up.
- Map: zoom is hand-made (`.ui-chatmap-zoom`, `ui.css:655-664`: `+`, `−`, a text button `맞추기`, 32 px, white, no group); the title pill (`.ui-stage-pill`, `ui.css:666-668`, top-left) and the legend (top-right) collide with the panel close `×`; the picks tray floats at the bottom centre over the map (`.ui-picks-tray`, `ui.css:670-680`).
- Top bar (`web/src/ui/topbar.jsx`): `Ithaca` · `Muse` · a blue badge `연결됨 · Muse Spark 1.3` · a centred status pill (`상황을 알려주세요`, later the profile summary) · `English` · a wrench icon.
- Chat turn: user bubble → Muse text → one collapsible `확인한 것 n가지` row with source chips → cards (profile card `고객님 상황`, candidates card with 6 rows of photo + name + price + 3 lines, result card with score / cost / commute / 살아 보니 moments / diary).
- Work panel (right, opens on request): `StageArea` map with candidate price pins and subway lines, or `SceneFrame` iframe (3D neighbourhood `?area=…&embed=1`, sim scene).
- Phone (≤ 480 px) layout already exists from stage 26m/26p (header tabs 대화/지도); keep it working.

### Reference: manus.im (captured 2026-10-31)
- Home: warm off-white page, top nav (logo · Features · Solutions · Resources · Events · Business · Pricing · black `Sign in` pill + outlined `Sign up`), a thin announcement bar, a small video card, then a serif headline "What can I do for you?" centred, one large rounded composer (placeholder "Assign a task or ask anything", `+` bottom-left, round send bottom-right), and one row of outlined chips with icons (Create slides, Build website, Create games, Video, More). Nothing else on the first screen.
- Feature page sequence: serif headline + one-line lede + black CTA pill → product video → comparison table (Manual / AI chatbot / Manus, Manus column shaded) → "the problem" with two small illustrations → product screenshot in a soft rounded frame with three short columns under it → "Real-world use cases" 2×2 cards (image + title + one line) → "How it works" 4 numbered steps → "Example prompts" list rows with copy buttons → FAQ accordion → final serif CTA.
- Restraint: one serif display face for headlines only, a sans for everything else, black as the only strong colour, generous whitespace, hairline borders instead of shadows on most cards.

### Product rules that the design must carry (`docs/product.md`, `AGENTS.md`)
Chat is everything; the work panel opens only on request; Muse suggests, the customer starts; every Muse tool call is visible as a row; "Muse는 판단, 엔진은 세고, 코드는 검사"; no winner / 추천 wording; sources, periods and 추정/가정 labels stay visible; simulated residents are labelled simulated; Korean first with `?lang=en`; Pretendard is self-hosted (`/fonts/pretendard/`); a second display face may be loaded from Google Fonts.

## What `docs/design.md` must contain (about 200–300 lines, Korean prose, values exact)
1. **원칙** — 5–7 lines (e.g. the first screen states what Ithaca does and offers the composer; one primary action per view; overlays only in fixed places).
2. **토큰** — exact values: colours (page, surface, sunken, line, ink ×3, home A, home B, ok/check, warning, subway-line colours used only on maps; light and dark), type (families incl. the display face and where it is allowed, sizes, weights, line heights), space scale, radii, shadows, layout widths (chat column max, sidebar width, work panel width, breakpoints 480 / 960). Name them as CSS custom properties (`--ds-…`) so stage 28b can paste them into `ui.css`.
3. **컴포넌트** — for each: anatomy, sizes, states, when to use / not use, and which current element it replaces (by file / class from the audit above): Button (primary / secondary / ghost, sm/md), IconButton, SuggestionChip (one look everywhere: empty screen, under replies), SourceTag (incl. 추정/가정 style), HomeDisc (A/B/C, candidates numbered in neutral), Composer (textarea, paste action, model line, send), MuseWorkLog (one per answer, collapsed summary + per-tool rows with time), CandidateRow, ResultCard + DiaryRow (no clipped buttons), MapControls (one group: zoom in / out / fit / layers, icons with labels as tooltips), MapOverlay corners rule (what sits in each corner, close lives in the panel header), SegmentedToggle, PanelHeader.
4. **화면** — wireframe-level descriptions with measurements:
   - **Landing** (`/`): nav, hero (headline + one-line lede + composer + chips + coverage line), product frame, then the section sequence you choose (use the manus feature page as the model, filled with Ithaca's real content: 실거래 25.10–26.10, 판교 출근 example, 30일 일기 with "✓ 문장 8개 모두 기록과 대조", data sources 국토교통부 실거래 / OpenStreetMap / 서울교통공사 혼잡도 / GIS건물통합정보, FAQ answers that follow the product rules). Write the actual Korean copy for every heading, lede, chip and FAQ answer.
   - **How landing and app connect**: typing in the landing composer or tapping a chip/use case opens the app with that message sent; a URL for the app (e.g. `/?app=1` or keep `/` → landing and `?chat` → app — pick one and say what `routeForSearch` in `web/src/chat/urls.js` should return).
   - **App empty state** (new conversation): what is centred, what fills the space (no void), behaviour at 1440 and 2000 px.
   - **App shell**: sidebar (new conversation, recent conversations kept in localStorage, examples, language, Muse status), main column header (conversation title from the profile summary), thread, bottom (chips + composer), work panel.
   - **Work panel — map**: corners rule applied; where the picks and the "start the 30 days" action live now that the chat can start it.
   - **Work panel — 동네 보기**: the overview you propose instead of the close 3D camera (e.g. top-down/oblique overview centred on the home, home marked, only the places from the `neighborhood` tool result with walking minutes and routes, a toggle to the close 3D walk). Say what data it uses (`neighborhood` returns `nearest: [{category_ko, name, minutes, distance_m}]` plus the candidate `lon/lat`).
   - **Phone ≤ 480 px**: what changes.
5. **구현 순서** — 4–6 stages (28b…), each one small enough for one Muse run, with the files each touches. Put the cut order last (what to drop if time runs out).

Write it once, as a single file write. Do not read other files to "check" — the facts above are current.
