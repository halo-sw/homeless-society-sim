# Stage 29h5 — The street photo credit fits inside the row thumbnail (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here. Stop when the named tests pass.

## Why
Since 29h3 the candidate rows show the real Mapillary street photo first. Its credit (`© janerik · Mapillary`, `streetShortCreditFor`, `web/src/ui/candidate-card.jsx:314-317`, rendered as `<figcaption className="ui-street-credit">` at `:580`) is anchored to the right and never wraps (`web/src/ui/ui.css:720-722`):
```css
.ui-street-credit { position: absolute; right: var(--ds-s-4); bottom: var(--ds-s-4);
  background: rgba(17, 20, 26, 0.72); color: #fff; font-size: var(--ds-t-12);
  border-radius: var(--ds-r-pill); padding: 0 var(--ds-s-4); white-space: nowrap; }
```
In the 96 px row thumbnail (`.ui-cand-thumb`, `ui.css:672-675`, `overflow: hidden`) the label is wider than the box, so its left part is cut off: the orchestrator's capture shows `anerik · Mapillary` — the photographer's name, which CC BY-SA asks us to show, is clipped.

## Change — `web/src/ui/ui.css` only (right after `ui.css:722`)
A row-thumbnail override, so the full card's hero keeps today's pill:
```css
/* 29h5: in the small row thumb the credit wraps inside the box (the
   photographer's name is never cut). */
.ui-cand-thumb .ui-street-credit {
  left: var(--ds-s-4); right: var(--ds-s-4); max-width: calc(100% - 2 * var(--ds-s-4));
  box-sizing: border-box; white-space: normal; overflow-wrap: anywhere;
  line-height: var(--ds-lh-tight); border-radius: var(--ui-r-chip); text-align: center; }
```
Check that `--ds-lh-tight` and `--ui-r-chip` exist in the token files (`grep -n "\-\-ds-lh-tight\|\-\-ui-r-chip" web/src/ui/*.css web/src/**/*.css | head -4`); if one does not, use the nearest existing token. No `ellipsis`, no `text-overflow`, no `overflow: hidden` on the credit.

## Test — new `web/tests/street-credit-29h5.test.js`
Read `web/src/ui/ui.css` as text: a rule for `.ui-cand-thumb .ui-street-credit` sets `white-space: normal`, `overflow-wrap: anywhere`, and both `left:` and `right:`; the base `.ui-street-credit` rule is unchanged (still `white-space: nowrap`); the file still contains no `ellipsis` and no `text-overflow`.

Run only:
```
cd web && node --test tests/street-credit-29h5.test.js tests/street-32c.test.js tests/mobile-26m.test.js tests/thread-edge-31d.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
Any `.jsx`/`.js` file except the new test; other CSS rules; `briefs/`.

## Final message
Changed files, one line each. Nothing else.
