# Stage 29a4 — Global polish: contrast, summary pill, chips, sources (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Last group of the outside review (low priority but visible to every judge):
- **Grey text contrast.** `--ds-ink-3: #8a8275` measures **3.45:1** on `--ds-page #f6f4ef` and 3.74:1 on `--ds-surface` (orchestrator's WCAG calculation) — below 4.5:1 for 12–14 px text. `#736b5f` gives 4.78:1 / 5.17:1.
- **The blue summary pill** in the top bar (`web/src/ui/topbar.jsx`, `ui-bar-center`, the `Badge variant="info"` with `강남 출근 · 2인 · 전세 4억 원 이하`) looks like a status badge; nobody can tell it is (or is not) editable.
- **Suggestion chips and the big composer** stay fixed at the bottom and cover results while reading.
- **Source chips truncate** (`MOLIT Real Transaction Pric…`) and do not say what was checked (`CiteRows`, `web/src/ui/consult.jsx:43-60`).
- **"Example" labels** appear in several places (e.g. `예시로 채우기 (예시)`, `web/src/ui/listings.jsx:122`).
- **Two pane toggles.** The review saw a mode switch and a `Chat / View` toggle at the same time. Today `narrowTabs` (`web/src/ui/chat.jsx:2213-2221`) is rendered in the top bar when the work panel is open on desktop and again inside the shell on phones (`:2232`, `:2252`). Make sure only one pane toggle can exist at any width, and no other mode switch is rendered in chat mode.

## Change

### 1. Contrast — `web/src/ui/ui.css` (the `--ds-ink-3` token) and `docs/design.md` §2.1
`--ds-ink-3: #736b5f` in both. Add one line to the design doc under the colour block: `보조 글자(ink-3)는 페이지·카드 바탕에서 4.5:1 이상(#736b5f: 4.78:1 / 5.17:1).` The 28c test compares doc and CSS values; both change together.

### 2. Summary pill → an edit affordance — `web/src/ui/topbar.jsx` (`ui-bar-center`)
Render the summary as a ghost sm button: neutral (`--ds-sunken` background, `--ds-ink-1` text, not blue), label = the summary text, a trailing `✎` glyph, `aria-label` `조건 고치기: {summary}`. Clicking it dispatches a store action (add one, e.g. `act("openProfileDetails")`, or set a store flag that `chat.jsx` watches) that scrolls the thread to the latest `고객님 상황` card and opens its `자세히` section. Before any summary exists keep the plain supporting text.

### 3. Chips fold while reading — `web/src/ui/chat.jsx` (the chip row above the composer, `grep -n "ui-chat-chips\|nextChips\|suggestions" web/src/ui/chat.jsx` near the composer render)
When the thread scroller is more than 160 px away from the bottom, hide the chip row (keep the composer). Show it again when the customer scrolls back to within 160 px or sends a message. Pure helper `chipsVisible(scrollTop, scrollHeight, clientHeight)` exported for the test.

### 4. Sources say what was checked — `web/src/ui/consult.jsx:43-60` and `web/src/ui/ui.css`
Citation labels never truncate: allow wrapping (no `text-overflow: ellipsis`, `max-width: 100%`). Use a short name per source where `sources.js` has one (add `short` to the entries used most: 국토교통부 실거래가 → `실거래가(국토부)`, OpenStreetMap → `OSM`, GIS건물통합정보 → `건물정보`), and put the full name in the `title`. Prefix the row with `확인한 출처` (12 px, `--ds-ink-2`).

### 5. One "example" notice — `web/src/ui/listings.jsx:122` and others
`예시로 채우기 (예시)` → `예시로 채우기`. Search `grep -rn "(예시)" web/src/ui` and remove duplicated `(예시)` suffixes on buttons; where example data is shown, keep the single existing banner/notice line.

### 6. One pane toggle — `web/src/ui/chat.jsx:2213-2252`
Keep `narrowTabs` in exactly one place per layout (top bar on desktop when the work panel is open, inside the shell on phone). Assert in the test that the SSR markup of the chat shell with `workOpen` true contains `화면 선택` once.

Add the new visible strings to `web/src/i18n/en.js` (`Edit conditions`, `Sources checked`, short source names).

## Test — new `web/tests/global-polish-29a4.test.js`
- `ui.css` and `docs/design.md` contain `--ds-ink-3: #736b5f`.
- `chipsVisible(0, 1000, 500)` → false (500 px from bottom); `chipsVisible(400, 1000, 500)` → true.
- SSR `TopBar` with a summary: contains `✎` and `조건 고치기`, does not use the info badge for it.
- `CiteRows` with the MOLIT source renders `확인한 출처` and the short name, and the full name in a `title`.
- `listings.jsx` source no longer contains `(예시)"`.

Run only:
```
cd web && node --test tests/global-polish-29a4.test.js tests/tokens-28c.test.js tests/powered-by-muse-28b.test.js tests/chat-first-27a.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
Landing files, `candidate-card.jsx`, `intake.jsx`/`intake.js` (29a3), map / 3D / engine files, `web/src/i18n/dom.js`.

## Final message
Changed files, one line each. Nothing else.
