# Stage 31e — two CSS leftovers from 31d (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done. **Only `web/src/ui/ui.css` (thread rules) and the test.**

## Found by the orchestrator
Measured in a real browser: `?replay=menlo-month&lang=en` at 390 × 844 (iPhone 13), with `getBoundingClientRect` and `getComputedStyle`.

### 1. A wrapped citation still overlaps
"OpenStreetMap (Northern California extract, Geofabrik)" wraps to two lines.

| Element | Computed style | Box |
|---|---|---|
| Inner label span | `height: 40px` (correct) | y=208 |
| Its anchor `a.astryx-citation` | `height: 20px; overflow: hidden; display: inline-flex` (Astryx) | y=218 |

The anchor centres the 40 px label in a 20 px box, so the label is clipped top and bottom and drawn over the line above. 31d set `height: auto` on the wrapper span `.ui-cite`, not on the anchor.

**Fix:** under `.ui-cites`, the citation anchor gets:
- `height: auto`;
- `min-height: 20px`;
- `overflow: visible`;
- `align-items: flex-start`.

Use a selector specific enough to beat the Astryx atomic class: `.ui-cites a.astryx-citation`, and add `.ui-cites .astryx-citation` if needed. The label wraps at spaces and the next citation moves down.

### 2. The composer starts 8 px right of the chips
The composer's ancestor chain inside the thread (x = left edge):

| Element | x | Padding |
|---|---|---|
| `.astryx-chat-composer` | 24 | — |
| Its parent wrapper | 16 | `0 8px 8px` (Astryx) |
| The 31d wrapper above it | 0 | `0 16px` |

**Fix:** zero the horizontal padding of the inner wrapper (keep its bottom padding) under `.ui-chat-thread`, so the composer box starts at x = 16 like the chips and the text. Do it at desktop and phone widths.

## Test — add to `web/tests/thread-edge-31d.test.js` (new `describe("31e")`)
- `ui.css` has a `.ui-cites` rule that targets `.astryx-citation` and sets `height: auto` and `overflow: visible`.
- `ui.css` has a `.ui-chat-thread`-scoped rule that sets the composer's inner wrapper horizontal padding to 0 (match however you select it).

Run only:
```
cd web && node --test tests/thread-edge-31d.test.js tests/chat-hierarchy-31a.test.js 2>&1 | tail -8
```
Run it before you finish.

## Final message
Changed files, one line each. Nothing else.
