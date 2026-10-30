# Stage 26n3 — phone thumbnails: the aerial label covers the photo (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
At 390 px the candidate thumbnail is 64 px (26m). The `AerialThumb` corner label (26n) takes about a third of the photo:
- in English, "Aerial photo" wraps to two lines and covers the lower half.

The credit line under the list already says where the photo comes from.

## Change — `src/ui/ui.css` (+ the label's class name in `src/ui/preview.jsx` if it has none)
Under `@media (max-width: 480px)`, hide the corner label inside `.ui-cand-thumb` only. The full-card hero keeps it. On every width the label is `white-space: nowrap`.

## Test — extend `web/tests/aerial-thumb-26n.test.js`
`ui.css` has a 480 px rule that hides the aerial label inside `.ui-cand-thumb`; the label rule has `white-space: nowrap`; still no `text-overflow: ellipsis`.

Run only:
```
cd web && node --test tests/aerial-thumb-26n.test.js tests/mobile-26m.test.js tests/phone-26p.test.js tests/compare-tabs.test.js 2>&1 | tail -8
```

## Final message
Changed files, one line each. Nothing else.
