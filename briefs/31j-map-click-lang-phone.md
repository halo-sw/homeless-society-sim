# Stage 31j — map follow-ups: a mouse click on a tag must open its card; English tags; tags avoid the work marker; phone sizes (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (real browser; 1440 × 900 and iPhone 13, KO + EN, replay `seoul-couple` and live Meta HQ)

### 1. A mouse click on a home tag does nothing (keyboard works)
- **Keyboard:** focus a tag, then Enter → the pin card opens (`카드 보기` appears).
- **Mouse:** a real click at the tag's centre → no card. The same happened before 31f: the old "click scrolls to the card" never fired for a mouse either.
- **Cause:** `onSvgPointerDown` (`web/src/ui/chatmap.jsx` ~341) calls `e.currentTarget.setPointerCapture(e.pointerId)` on **every** pointerdown. With the pointer captured by the `<svg>`, the resulting `click` is targeted at the svg, so the tag's `onClick` never runs. Clusters are hit the same way.
- **Fix:**
  - On pointerdown, record the start point only. Call `setPointerCapture` (and set grabbing) only once the pointer has moved more than 4 px (the existing drag threshold), in `onSvgPointerMove`.
  - A press-and-release without movement leaves the click on its real target.
  - Keep `dragged` so a real drag still doesn't open a card.
  - Touch must still pan.

### 2. English tags read as broken
- **Area:** US homes have no area, and the header shows `3 · 0m²`. When the area is missing or 0, the header is just the number/letter.
- **Commute line:** the commute line is built in Korean (`출근 38분`) and the DOM translator turns it into `38 min commute`. That is wider than the tag, because the width was measured on the Korean text, so the text runs past the tag's right edge.
- **Fix:** build the tag lines for the current language in code: `currentLang()`, as `workPinLabel(name, lang)` already does. Measure the width on that text and mark the tag text `data-no-i18n`.

| Line | KO | EN |
|---|---|---|
| Header | `1 · 30㎡` | `1 · 30 m²` |
| Price | `전 2.7억` | `Jeonse ₩270M`-style is too long; use the same short Korean-unit price with an English tenure initial: `J 2.7억` / `M 85만` / `S 3.2억`. USD stays `$4,261`. |
| Commute | `출근 5분` | `5 min` |

- **Aria-label:** the same idea. KO `{n}번 후보 {name} · {price} · 출근 {m}분`; EN `Candidate {n}: {name} · {price} · {m} min commute`. Built in code with `data-no-i18n`-equivalent handling (the translator turned `1번 후보` into `1 time candidate`).
- **The pin card lines** (price and commute) come from the same builders the candidate card uses. Leave them unless they show Korean in EN mode.

### 3. Tags cover the work marker
- At 판교 the tags for 1 and 2 sit on top of `■ 회사 · 판교`.
- The tag collision layout must treat the work marker's box as occupied. The same goes for the stage title / legend / filter-row area at the top-left and the control column at the right: tags may move with a leader line, but never cover them.
- Use the existing layout helper; add the boxes as obstacles.

### 4. Phone (stage width ≤ 480 px)
- **Tags** use a compact size:
  - header 10 px;
  - price 13 px / 700;
  - commute 11 px;
  - padding 6 px;
  - minimum width 56 px.
- **Map credit:** it wraps to two lines and its second line is hidden under the pick tray. The right column's bottom offset must clear the tray's real height. Measure it (ResizeObserver on the tray, or a CSS variable the tray sets) instead of a fixed number, so both credit lines stay visible.
- **Filter chip row:** it must end before the close ×. Reserve the × width on the right; the row scrolls sideways under that limit.

## Test — `web/tests/map-click-31j.test.js`
- **Source** (or an exported pure helper for the pointer logic): `setPointerCapture` is not called inside `onSvgPointerDown`.
- **Exported line builders** (e.g. `tagLines(pin, { tenure, lang })`):
  - KO: `1 · 30㎡`, a price starting with `전`, `출근 5분`;
  - EN: header without `0m²` when the area is 0 or missing;
  - EN commute: `5 min`;
  - EN aria-label starts `Candidate 1:`;
  - `tagSizePx` widths follow the language text (the EN commute line no wider than the measured tag).
- **Layout:** with a work marker box overlapping a pin's natural spot, the laid-out tag box does not intersect the work box.
- **Keep green:**
  - `tests/map-markers-31f.test.js`, `tests/map-tags-31g.test.js`, `tests/map-controls-31h.test.js`, `tests/map-tray-31b.test.js`;
  - `tests/chatmap-18.test.js`, `tests/chatmap-19b.test.js`, `tests/chatmap-26o.test.js`, `tests/map-english-29a5.test.js`, `tests/walk-19g.test.js`;
  - everything mentioning `ChatMap` or `chatmap`.

Run only (**run it before you finish**):
```
cd web && node --test tests/map-click-31j.test.js tests/map-markers-31f.test.js tests/map-tags-31g.test.js tests/map-controls-31h.test.js tests/map-tray-31b.test.js $(grep -lE "ChatMap|chatmap|tagSizePx|workPinLabel" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator re-checks with a real mouse click.

## Do not touch
`CandidatesCard`, `landing-page.jsx`, `src/engine/**`, `src/i18n/**`, `src/consult/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Then new strings (KO and EN), and the test files you updated. Nothing else.
