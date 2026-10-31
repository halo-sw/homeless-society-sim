# Stage 31g — map home markers become two-part price tags; clusters become count circles (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

31f already made home pins real buttons (role, tabIndex, aria-label, pin card with 담기/빼기), gave A/B their own colours (`MAP_COLORS.pinA` / `pinB`), and made the work marker a rounded rect. **Keep all of that.** This stage changes only how a home pin and a cluster look and how big they are.

## Why
The customer asked for map markers that read at a glance, like the price tags common on Korean real-estate maps. Today a pin is a one-line white pill ("① 2억 7,000"). It is unclear what the number means, and nothing tells you how far the commute is, even though the commute is the reason the list exists.

## The new home marker (SVG in `web/src/ui/chatmap.jsx`)
A two-part tag, our own style (Ithaca tokens, not any other product's colours or logo):

| Part | Spec |
|---|---|
| **Header strip** (18 px tall, top corners `--ds-r-chip` 8 px) | Text 11 px / 600, white, centred: `{n} · {area}㎡` (e.g. `1 · 30㎡`). Use `candidate.area_m2` or whatever field the candidate card shows for 면적; if there is no area, just `{n}`. Picked pins show the letter instead of n: `A · 30㎡`. Fill: default `MAP_COLORS.pinText` (ink); picked uses `pinA` / `pinB`. |
| **Body** (white, 1 px border in the header colour, bottom corners 8 px) | **Line 1:** short price, 14 px / 700, ink. Keep `shortPinPrice` for the number and prefix the tenure's first syllable (`전 2.7억`, `월 85만`, `매 3.2억`); USD stays `$4,261`. **Line 2:** `출근 {m}분`, 12 px / 600, `MAP_COLORS.pinHi` (the 31f hover colour must stay distinct from pinB; if pinHi is now ink, add `commute: "#2f6fed"`-like accent in `MAP_COLORS` mirroring `--ds-accent`). Omit line 2 when there is no commute, and the body shrinks. |
| **Tail** | A small triangle at the **bottom-left** corner of the body pointing at the location. When the tag sits right on its spot there is no leader line and no ground dot. When layout had to move it, keep today's leader line and the 31f ground dot. |

- **Width:** the measured width of the longest of the three lines + 16 px padding, minimum 64 px. Add a measuring helper next to `pinPillWidthPx` (e.g. `tagSizePx(pin, tenure)` → `{ w, h }`) and use it in the layout/collision code instead of the old pill size, so tags don't overlap.
- **States** (keep the 31f logic):
  - hover/focus/highlighted from card: 2 px ink outline around header+body, plus the existing lift;
  - picked: A/B header and border colour;
  - default: ink header.
- The invisible hit rect from 31f covers the whole tag (≥ 32 px tall anyway now).

## Clusters
- **Shape:** a circle (diameter 36 px, 44 px when the count ≥ 100). Fill `MAP_COLORS.cluster` = a soft translucent tint of `--ds-accent` (e.g. `rgba(47,111,237,0.18)`), 2 px white ring, count 15 px / 700 ink, centred. No "+".
- **Keep:** the 31f role/tabIndex/aria-label `가까운 후보 {n}곳 펼치기` and the expand-on-click fan-out. The fanned-out members draw as the new tags.

## Legend (31f strings)
Update to describe the tag:
- Korean: `번호·면적 / 가격 / 출근 시간 · Ⓐ Ⓑ 담은 집 · ■ 회사 · ━ 지하철`;
- USGS variant: the same without 지하철.

Keep it one line where it fits; wrapping at ` · ` is fine.

## Test — `web/tests/map-tags-31g.test.js`
- **`tagSizePx`:** a 3-line pin is taller than a pin without a commute; width ≥ 64; a longer price gives a wider tag.
- **SSR `ChatMap`** with 3 pins (one picked A), fixtures as in `tests/map-markers-31f.test.js`:
  - each home tag renders the header text `{n} · {area}㎡` (`A · …` for the picked one);
  - a price text starting with `전` for jeonse;
  - an `출근 {m}분` text;
  - the picked header fill is `pinA`;
  - tags still have `role="button"` and their aria-labels.
- **SSR with a cluster:** a `<circle>` with the count text and no `+`.
- **Keep green:** `tests/map-markers-31f.test.js`, `tests/map-tray-31b.test.js`, `tests/chatmap-18.test.js`, `tests/chatmap-19b.test.js`, `tests/chatmap-26o.test.js`, `tests/map-english-29a5.test.js`, and every test mentioning `pinPillWidthPx`, `shortPinPrice`, `cluster` or `ChatMap`. Update pins that pinned the old pill geometry, and name them.

Run only (**run it before you finish**):
```
cd web && node --test tests/map-tags-31g.test.js tests/map-markers-31f.test.js tests/map-tray-31b.test.js $(grep -lE "ChatMap|chatmap|pinPillWidthPx|shortPinPrice|cluster" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
chat.jsx, `landing-page.jsx`, the map controls and filters (stage 31h does those), `src/engine/**`, `src/i18n/**`, `src/consult/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Then new Korean strings, and the test files you updated. Nothing else.
