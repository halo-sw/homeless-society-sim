# Stage 31k2 — update one test pinned to the removed hover re-order (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list. Branch `ithaca-17`. **Only `web/tests/map-tray-31b.test.js`.**

31k removed the hover re-order on purpose: the clickable tag `<g>` keeps a fixed DOM order, and the highlighted tag is drawn again as a non-interactive top-layer copy. Today the orchestrator confirmed in a real browser that a mouse click now opens the pin card, which it did not before.

`tests/map-tray-31b.test.js` "renders the highlighted tag last" still asserts the old behaviour. Rewrite that one assertion to match the 31k design:
- the highlighted pin's top-layer copy (`aria-hidden="true"`, no `role="button"`) comes after every interactive home tag in the markup;
- the interactive tags keep the same order as the render without `cardHi`.

Keep the rest of the file as is.

Run (before you finish):
```
cd web && node --test tests/map-tray-31b.test.js tests/map-hit-31k.test.js 2>&1 | tail -6
```

## Final message
One line: the test you changed. Nothing else.
