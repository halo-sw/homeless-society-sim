# Stage 32b — candidate cards: one-line price, short commute line, clean wrapping; thumbnails become 3D miniature → street photo → building silhouette (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md` (Astryx first, tokens, no `text-overflow: ellipsis`). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Why (customer screenshots, 1440 split view, EN `menlo-month`)
1. **The price line wraps.** `Rent $4,261/mo · ZIP 94025 estimate (Zillow)` is built as one string by `tenurePriceLine` (`web/src/ui/candidate-card.jsx` ~20), the KO original being `월세 월 $4,261 · ZIP 94025 추정 (Zillow)`. 31i made the whole string 20 px / 700, so it takes 2 lines on every card.
2. **The commute line is long and says "estimate" twice:** `Meta HQ (1 Hacker Way): bike 12 min · walk 39 min · estimate (assumed speed) ● Estimate`. The workplace name repeats on every card, though the list title already names it.
3. **Titles wrap awkwardly:** `Apartments on South Perimeter Road` breaks beside `Pick`.
4. **Thumbnails are aerial photos only.** The customer asked for alternatives and chose, in this order:
   1. our own 3D miniature;
   2. a street-level photo (Mapillary, stage 32c adds the source; build the slot now);
   3. a building silhouette drawing.

   No aerial photo in the row thumbnail any more.

## Change
### A. Card text (`candidate-card.jsx` row variant; `ui.css`)
1. **Price line = the amount only**, 20 px / 700, one line, tabular numbers:
   - KO `월세 월 $4,261`, `전세 2억 6,000만 원`, `월세 1,000만/85만`;
   - EN through the translator as today.

   Split `tenurePriceLine` so it returns the amount (`price`) and the basis separately (`basis`: `ZIP 94025 추정 (Zillow)` for USD, `실거래 중간값 · N건` for KR). Callers that need the old joined string get `price + " · " + basis` from a small helper, so the result table and pin card keep their text.
2. **Meta line:** `{basis} · {kind} · {budget fit}` in 12 px `--ds-ink-2`, wrapping at ` · `.
3. **Commute line:**
   - drop the workplace name when it equals the stage's work name (the list title already says it), e.g. `자전거 12분 · 걸어서 39분`;
   - put **one** estimate marker at the end as a neutral small `Badge` `추정`, and only when the time is an estimate;
   - remove the duplicate `추정 (가정 속도)` text;
   - the full sentence (with the workplace and `가정 속도`) goes in the line's `title`.
4. **Wrapping:**
   - KO text uses `word-break: keep-all`; titles use `text-wrap: pretty`, at most 2 lines (no ellipsis; long names may take 2 lines);
   - `Pick` / `담기` keeps a fixed width at the top-right so the title wraps beside it, never under it;
   - at 320 px thread width, nothing overflows.

### B. Thumbnails (`candidate-card.jsx` `RowThumb`, `preview.jsx`)
1. **Row thumbnail order:**
   1. the complex photo (hero) when one exists (unchanged);
   2. **3D miniature** (`SceneThumb`) when the home has a scene box. US homes have `scene: "us-menlo"` from `pipeline/homes_us.py`; today `aerialLiveFor` wins first in the US, so put the 3D branch before it.
   3. **Street photo** slot: a new `StreetThumb` component that asks `streetPhotoFor(candidate)`. In this stage that function always resolves to `null` (stage 32c wires Mapillary), so the slot falls through.
   4. **Building silhouette** (new `SilhouetteThumb`): an SVG of the home's own building footprint seen from above, filled `--ds-ink-1` at 12% with a 1.5 px `--ds-ink-1` outline, north up, scaled to fit. Inside or under it, a small label: floors and year when known (`15층 · 2014년`; EN via the translator). Use the same building lookup the 3D thumb uses (`thumbnailSceneSpec` / the area's buildings for the home's lon/lat).
   5. Last fallback: today's `MiniMap` text line.
   - **Remove** the aerial branch from the row thumbnail.
2. **Opened card hero:**
   - a small `SegmentedControl` `3D | 거리 사진 | 건물 모양` with only the available ones;
   - aerial stays available there as a fourth option `항공` (the customer did not ask to remove it everywhere);
   - default = the first available in the row order.
3. **Credits:**
   - 3D and silhouette: `우리 자료로 만든 모형 (GIS건물통합정보·OSM)` for KR, `우리 자료로 만든 모형 (OSM)` for US;
   - the list footer credit names only the sources actually shown.

New strings (KO): list them all in the final message. The orchestrator adds the EN.

## Test — `web/tests/card-thumbs-32b.test.js`
- **`tenurePriceLine`:**
  - USD → `price` has no `ZIP` and `basis` has `ZIP 94025`;
  - KR jeonse → `price` `전세 …`, `basis` `실거래 중간값 · N건`;
  - the joined helper equals the old string for both.
- **SSR row card** (US fixture with `scene: "us-menlo"` and an estimated bike commute):
  - the price element has no `ZIP`;
  - the commute line has no `Meta HQ` when the work name is Meta HQ;
  - exactly one `추정` badge;
  - no `가정 속도` in the visible text (only in `title`).
- **`RowThumb` order** (pure helper, e.g. `thumbKindFor(candidate, { hasStreet })` → `"hero" | "scene" | "street" | "silhouette" | "minimap"`):
  - US with scene → `scene`;
  - no scene, `hasStreet` true → `street`;
  - neither, with a footprint → `silhouette`;
  - never `aerial`.
- **`SilhouetteThumb`:** a square footprint renders an SVG `<path>` or `<polygon>` inside the viewBox, plus the floors label.
- **CSS:** `keep-all` on the row card text; no `ellipsis`.
- **Keep green:**
  - `tests/list-tabs-31i.test.js`, `tests/chat-hierarchy-31a.test.js`, `tests/map-markers-31f.test.js` (pin card);
  - every test mentioning `tenurePriceLine`, `RowThumb`, `aerialLiveFor`, `AerialThumb`, `SceneThumb`, `CandidateCard` or `ui-cand`.
  - Update pins on the aerial row thumbnail, and name them.

Run only (**run it before you finish**):
```
cd web && node --test tests/card-thumbs-32b.test.js tests/list-tabs-31i.test.js tests/chat-hierarchy-31a.test.js tests/map-markers-31f.test.js $(grep -lE "tenurePriceLine|RowThumb|aerialLiveFor|AerialThumb|SceneThumb|CandidateCard|ui-cand" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator re-checks in a real browser (KO + EN, 390 / 1440).

## Do not touch
`chat.jsx` (beyond passing the work name to the card if it doesn't have it), the map, `landing-page.jsx`, `src/engine/**`, `src/consult/**`, `src/i18n/**`, `relay/**`, `pipeline/**`, `data/`, `README*`.

## Final message
Changed files, one line each. New KO strings. Updated test files. Nothing else.
