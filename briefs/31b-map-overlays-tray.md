# Stage 31b — map overlays and the pick tray: one panel style, nothing covered, the run button knows when the run is done (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md` (Astryx: component props first, then tokens, no raw hex/px in new rules). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

Stage 31a already changed the chat thread. Do not touch the thread components it owns: `ProfileCard`, `CandidatesCard`, `ResultSummary`, `SimulationCard`, and the `.ui-chat*` / `.ui-result*` / `.ui-tag*` / `.ui-cite*` / `.ui-cand*` / `.ui-src*` / `.ui-section*` CSS.

## First: one test fix left from 31a
`web/tests/chat-hierarchy-31a.test.js` ~146 counts `aria-label="장면 보기:` in everything before the `일기 5줄 모두 보기` button. The 살아 보니 row now renders above the diary, so it counts 4, not 3. The code is right. Count only inside the diary part instead, i.e. the HTML after `살아 본 일기` and before the button. Add `tests/chat-hierarchy-31a.test.js` to your run.

## Found by the orchestrator
Real captures at 1440 × 900, Korean, after "1번이랑 2번 담아 줘" and "살아 봐 줘".

### 1. Floating pieces over the map each use a different style
| Piece | Today |
|---|---|
| Stage title, `.ui-stage-pill` (chat.jsx `StageArea` ~2922) | White **pill** (radius 999), 14/600. Looks like a button, but is `role="status"` |
| Legend, inline style (chatmap.jsx ~545) | `bottom: 32px; left: 12px`, radius 8, **11 px**, raw `#ffffff` / `#55514a` |
| Attribution, inline style (~564) | 10 px, `rgba(255,255,255,0.8)` |
| Zoom group `.ui-chatmap-zoom` | 32 px squares; 맞추기 is 12/600 |

### 2. The legend is covered
The pick tray sits at `bottom: 16px` across the stage. It covers the legend's right half ("● 후보 · ■ 회사 · — 지하철" is cut after "지하철") and the attribution line.

### 3. Pin pills are covered by other pins' dots
- When pins are close (판교: pins 1, 2, 4, 5 within 30 px), the black location dots and leader lines of one pin are drawn **over** another pin's pill. The picked pill "A 2억 4,700" reads "A 2억 4,7●●".
- **Cause:** each pin's `<g>` draws its leader, its dot and its pill together, in `ordered` order.

### 4. Pick tray
- **The × remove buttons are 17 × 22 px.**
- **After the 30-day run has finished for the same A and B, the tray still shows the filled primary "30일 살아 보기".** It invites a second identical run, and it is the strongest button on screen while the result card is already in the thread.

## Change
1. **One floating-panel style** for everything over the map: the stage title, the legend, the zoom group and the attribution. Put it in `web/src/ui/ui.css` as `.ui-float`:
   - card background, `--ds-r-card` (12 px) radius (**not** pill), `--ds-shadow-card`;
   - padding 8 px 12 px.

   Then apply it per piece:
   - **Stage title:** `.ui-float`, 14 / 600. It is plain text, so no pill shape and no hover.
   - **Legend:** move it out of chatmap.jsx inline styles into a class. Put it directly **under the stage title, top-left**, as a second `.ui-float` at 12 / 400 `--ds-ink-2` (gap 8 px under the title). The tray can then never cover it. Keep both legend strings exactly.
   - **Attribution:** class instead of inline style, 12 px meta, bottom-right. When the tray is present, keep it visible **above** the tray: lift it with a CSS sibling/state rule or a `data-tray` attribute on the stage. Keep the attribution strings exactly (VWorld and OSM credits must stay visible).
   - **Zoom group:** stays bottom-right. +, − and 맞추기 are all 32 px tall, 14 px, the same `.ui-float` surface. It must not overlap the tray: today it sits at bottom 104 px, so check it still clears the tray at 1440 × 900 with the tray showing.
2. **Pin z-order (chatmap.jsx):** render in two passes over the same `ordered` list. First pass: every leader line and location dot. Second pass: every pill. The highlighted (`cardHi`) pill renders last.
   - Same geometry as today; no layout changes.
   - Pills keep their click/hover handlers.
3. **Pick tray (chat.jsx `PicksTray` and its three call sites):**
   - **×:** 28 × 28 px hit area (40 × 40 at ≤ 480 px), glyph stays 14 px, `aria-label` unchanged.
   - **New prop `resultReady`** (boolean). The parent computes it: the thread's latest `kind === "simulation"` message has `data.status === "done"` and was run for the same picks as now. Compare candidate ids if the payload has them; otherwise compare `data.names` against `displayNameFor` of the picks.
   - When `resultReady`, the button becomes **secondary** with the label `결과 보기`. It scrolls that simulation card into view in the thread; give the card wrapper an id if it has none. On the phone Chat / Map toggle, it switches to Chat first.
   - When a pick changes, `resultReady` goes false and the primary `30일 살아 보기` returns.
   - The compact phone row follows the same rule.
4. **No raw hex or px** in the new or changed rules (tokens only). No `text-overflow: ellipsis`. Delete CSS that becomes unused (`.ui-stage-pill` if renamed).

New Korean string: `결과 보기` (list it in the final message).

## Test — `web/tests/map-tray-31b.test.js`
- **chatmap.jsx source:**
  - no inline `fontSize: 11` / `fontSize: 10` / `#55514a` for the legend and attribution;
  - the legend and attribution use classes.
- **SSR `ChatMap`** with three close pins (fixture: copy whatever existing chatmap tests use, `grep -ln "ChatMap" tests/*.test.js`). In the SVG markup, every pin's pill `<rect>` comes **after** every pin's location `<circle>` and leader `<line>`.
- **SSR `PicksTray`:**
  - with two picks and `resultReady` false: the button text is `30일 살아 보기`;
  - with `resultReady` true: `결과 보기`, not primary (assert the variant attribute/class Astryx emits);
  - the compact variant follows the same rule.
- **Exported helper** (e.g. `resultReadyFor(messages, picks, candidates)`):
  - true for a done simulation with the same picks;
  - false after a pick changes;
  - false when the last simulation is running or errored.
- **`ui.css`:**
  - `.ui-float` exists with `--ds-r-card`;
  - `.ui-pick-x` sets a 28 px min size;
  - no `ellipsis`.
- **Keep green:** every test file that mentions `PicksTray`, `ChatMap`, `chatmap`, `ui-picks`, `StageArea`, `ui-stage` or `RUN_BUTTON_LABEL`. Update source pins that pinned the old inline styles, and name them in the final message.

Run only:
```
cd web && node --test tests/map-tray-31b.test.js tests/chat-hierarchy-31a.test.js $(grep -lE "PicksTray|ChatMap|chatmap|ui-picks|StageArea|ui-stage|RUN_BUTTON_LABEL|WORKPLACE_ASK" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks it in a real browser at 1440 px and 390 px.

## Do not touch
The 31a-owned components and CSS listed above, `landing-page.jsx`, `.ds-lp-*`, `src/engine/**`, `src/i18n/**`, `src/consult/**`, `relay/**`, `pipeline/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Then the new Korean string and the test files you updated. Nothing else.
