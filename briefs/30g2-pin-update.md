# Stage 30g2 — update one source pin after 30g (brief for Muse)

Agent mode. Sandbox: no network. No sub-agents, no git, no todo list. Branch `ithaca-17`. Stop when this part is done.

30g changed `web/src/ui/chat.jsx`: the build_scenario tool-row summary is now `picked.map((p) => displayNameFor(p)).join(" · ")`. The pin in `web/tests/tool-rows-13e2.test.js` (~line 47, "build_scenario summary") still looks for `summary: picked.map((p) => p.name)`.

Change only that assertion so it pins the new text `summary: picked.map((p) => displayNameFor(p))`. Touch nothing else.

Run only: `cd web && node --test tests/tool-rows-13e2.test.js tests/lot-names-30g.test.js 2>&1 | tail -6`

Final message: changed files, one line each.
