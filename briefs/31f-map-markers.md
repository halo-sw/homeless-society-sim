# Stage 31f — map markers read as what they are: a home pin is a button that opens a small card with 담기, A and B have their own colours everywhere, labels are not buttons (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md` (tokens, no raw hex/px in CSS). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (`web/src/ui/chatmap.jsx`, `web/src/chatmap.js`, chat.jsx `StageArea` and its call site ~2779)
Current markers on the chat map, after 31b:

### Home pin (white pill: number disc + short price, tail, black location dot)
- **Click** only scrolls the candidate card into view (chat.jsx ~2779).
  - Nothing on the map changes.
  - On a phone the map is the "지도·후보" tab and the card is in the hidden "대화" tab, so the click visibly does nothing.
- **No keyboard access.** It is an SVG `<g onClick>` with no role, no tabIndex and no label.
- **Hover** only scales the pill by 1.08. There is no border or colour change, so the pin does not read as pressable.
- **You cannot 담기 / 빼기 from the map.** You have to find the card in the list.

### Picked pins A and B
- Both are filled with the same blue (`MAP_COLORS.pinPicked` = `#2f6fed`), so A and B differ only by a 10 px letter.
- The same blue is also `pinHi` (hover/highlight), so "picked" and "hovered" look alike.
- Everywhere else A and B are black discs (`.ui-pick-disc`: tray, compare heads, result rows). The tokens `--ds-home-a` (`#b3541e`) and `--ds-home-b` (`#2f6fed`) exist but are unused.

### Location dots
- Every pin's ground dot is black, the same colour as the work pin. At 판교, four black dots sit next to the black "회사 · 판교" pill.

### Work pin
- A black pill with the same shape as the home pills. It is not clickable, but it looks like a darker version of the same button.

### Region labels ("성남시 분당구" …)
- They have `cursor: pointer` and an `onRegion` click that sets `orbFilter`.
- `orbFilter` is **never read** (chat.jsx ~1426), and the toast says `‘bundang’ 지역만 보기 — 후보 찾기를 눌러주세요`. That shows an English id and names a button that does not exist.

### Legend
- It says "숫자는 출근 편도(추정)", but the numbers on the home pins are **prices**. Check what the commute-minute labels (`m.commutes`) actually draw at default zoom; the legend must describe what is on screen.

## Change

### 1. A and B colours, one mapping everywhere
- **A = `--ds-home-a`, B = `--ds-home-b`.**
- **CSS discs:** `.ui-pick-disc` gets `data-home="A"|"B"` (add the attribute wherever chat.jsx / candidate-card.jsx render a disc with a letter), and CSS colours the disc background by it. Discs without a letter stay ink.
- **Map:** `MAP_COLORS` gets `pinA` / `pinB` with the same hex values, since the SVG cannot read CSS vars reliably in tests. Add a comment that they mirror the tokens. A picked pill is filled with its letter's colour, with white text.
- **Hover/highlight on the map** is no longer blue. It is a 2 px `pinText` (ink) outline plus the existing lift, so it never looks like "picked B".

### 2. The home pin is a real button
- The pill group gets `role="button"`, `tabIndex={0}`, Enter/Space → the same as click, and a visible focus ring (2 px ink outline, same as hover).
- **aria-label:** `{n}번 후보 {displayNameFor(candidate)} · {price} · 출근 {minutes}분`. Leave out the parts that are missing.
- An invisible hit rect at least 32 px tall around the pill (40 px at ≤ 480 px stage width); the visible pill size is unchanged.
- **Hover/focus:** ink outline + lift + `cursor: pointer`. **Default:** today's white pill with the `--ds-line`-coloured border. **Picked:** filled A/B colour.
- **Location dot:** a 4 px dot in `--ds-ink-2` (today it is ink) with a white 1.5 px ring. Picked pins use the A/B colour. This makes it different from the black work marker.

### 3. Click opens a pin card on the map (desktop and phone)
- Clicking or pressing a home pin opens a small card anchored above it (below it if there is no room), inside the map, using the 31b `.ui-float` surface. It shows:
  - **line 1:** number disc (or A/B disc) + `displayNameFor(candidate)` (Body strong, wraps, no ellipsis);
  - **line 2:** price as the candidate card shows it (e.g. `전세 2억 7,000만 원`);
  - **line 3:** the commute line as the candidate card shows it (`총 5분 · 판교역 걸어서`), Meta;
  - **buttons:**
    - `담기` (secondary) or `빼기` (secondary) when already picked, calling the same toggle the candidate card's 담기 uses. When 2 are already picked and this one is not, `담기` is disabled with the meta line `2곳까지 담을 수 있어요`;
    - `카드 보기` (ghost) does today's scroll-to-card. On the narrow layout it first switches to the 대화 tab, using the existing narrow-tab state in chat.jsx.
  - A close × (28 px). Esc, a click on empty map, or opening another pin closes it.
- Hovering a pin still highlights its card (unchanged). The card also highlights its pin (unchanged).
- **Wiring:** `StageArea` / `ChatMap` get `picks` and `onTogglePick` from the chat.jsx call site, the same functions `CandidatesCard` gets. Export the card's content builder (e.g. `pinCardModel(pin, { tenure, picks })` → `{ title, price, commute, picked, canPick }`) so it can be tested without a DOM.

### 4. Markers that are not buttons look like labels
- **Work marker:** a rounded rect (`--ds-r-chip`, not a pill), ink, with a 10 px white square glyph before the text (matches "■ 회사" in the legend). No pointer, no hover.
- **Region labels:** plain text. Remove the `onRegion` click, the pointer and the toast. Remove the unused `orbFilter` state and the `onOrbRegion` / `onRegion` props.
- **Cluster `+N`:** it is a button. Keep it, and give it `role="button"`, `tabIndex`, Enter/Space, an aria-label (`가까운 후보 {n}곳 펼치기`), and the same ink hover outline. Its blue outline becomes `--ds-line` + ink text like a default pin, with the count in a disc.

### 5. Legend matches the screen
Write it from what is drawn. If commute-minute labels are drawn at default zoom, keep them in the legend. The pill is explained as price. For example:
- Korean: `① 후보 번호·가격 · Ⓐ Ⓑ 담은 집 · ■ 회사 · ━ 지하철`;
- USGS variant: the same without 지하철.

List the final strings in your final message.

### 6. No raw hex in `ui.css`; `MAP_COLORS` is the only hex place for the SVG. No `text-overflow: ellipsis`.

## Test — `web/tests/map-markers-31f.test.js`
- **`MAP_COLORS`:** `pinA` = `#b3541e`, `pinB` = `#2f6fed`; `pinHi` is not equal to `pinB`.
- **SSR `ChatMap`** with 3 pins (2 picked as A and B; fixtures as in `tests/map-tray-31b.test.js`):
  - each home pill group has `role="button"`, `tabindex="0"` and an aria-label starting with `{n}번 후보`;
  - the A pill rect is filled `#b3541e` and the B pill rect `#2f6fed`;
  - no region label has `cursor: pointer` or an onClick (assert no `role="button"` on `data-layer="region-label"`);
  - the work marker rect's `rx` is not the pill radius.
- **`pinCardModel`:**
  - not picked and fewer than 2 picks → `canPick` true;
  - 2 picks and this one not picked → `canPick` false;
  - picked → `picked` true;
  - the title uses `displayNameFor` (a lot-number name `(647)` with a station gives `판교역 근처 오피스텔 (647)`).
- **Source:** chat.jsx has no `orbFilter`; no `지역만 보기` toast.
- **CSS:** `.ui-pick-disc[data-home="A"]` uses `--ds-home-a`; `[data-home="B"]` uses `--ds-home-b`.
- **Keep green:** `tests/chatmap-18.test.js`, `tests/chatmap-19b.test.js`, `tests/chatmap-26o.test.js`, `tests/map-tray-31b.test.js`, `tests/chat-hierarchy-31a.test.js`, `tests/thread-edge-31d.test.js`, and every test that mentions `ui-pick-disc`, `onRegion`, `orbFilter`, `MAP_COLORS`, `pinPicked` or `StageArea`. Update pins that pinned the old colours or region click, and name them.

Run only (and **run it before you finish**):
```
cd web && node --test tests/map-markers-31f.test.js tests/map-tray-31b.test.js tests/chat-hierarchy-31a.test.js tests/thread-edge-31d.test.js $(grep -lE "ChatMap|chatmap|ui-pick-disc|onRegion|orbFilter|MAP_COLORS|pinPicked|StageArea" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks it in a real browser at 1440 px and 390 px, Korean and English, 판교 and Menlo Park.

## Do not touch
`landing-page.jsx`, `.ds-lp-*`, `src/engine/**`, `src/i18n/**`, `src/consult/**`, `relay/**`, `pipeline/**`, `data/`, `README*`, the 3D scene (`src/scene/**` or whatever renders `?sim`).

## Final message
Changed files, one line each. Then every new or changed Korean string, and the test files you updated. Nothing else.
