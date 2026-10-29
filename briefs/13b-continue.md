# Stage 13b — Finish stage 13 (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **Do not use sub-agents** (cost).

Stage 13 (`briefs/13-ux-redesign.md`, read it first) was stopped part-way, when the Meta credit ran out. Its work so far is committed as `aa5e423` ("wip: stage 13 partial"). Run `git show --stat aa5e423` to see what exists. Files added so far:
- intake: `intake.js`, `ui/intake.jsx`
- assumptions panel: `assumptions.js`, `ui/assumptions.jsx`
- model panel + BYOK: `models/`, `consult/byok.js`, `ui/model-panel.jsx`
- photos: `places/photo-filter.js`, `places/select-photos.js`
- candidate card: `ui/candidate-card.jsx`
- orb: `orb.js`, `ui/orb.jsx`
- map sim + walk graph: `mapsim.js`, `ui/mapsim-view.jsx`, `walkgraph.js`, `pipeline/walkgraph.py`
- errors: `load-error.js`
- credits: `sources.js`, `ui/sources.jsx`
- toast: `ui/toast.jsx`
- tests: `*-13.test.js`, `tests/test_walkgraph.py`

## Current state (measured by the orchestrator)
- `npm test`: 795 tests, 777 pass, 2 fail:
  - `compare tab groups` (test 18)
  - `tests/landing-chat-12b.test.js`
  - `stage 10b UI render smoke (SSR, no DOM)`
- `vite build`: failing.

## Do, in this order
1. Make `vite build` and all tests green. Change old tests only when the stage 13 brief changed the behaviour on purpose, and say which ones.
2. Check each of the 11 parts of the stage 13 brief against the code. For each part, write in the RESULT whether it is done, partly done, or not started.
3. Finish the parts that are not done. Priority, highest first:
   1. Layout: nothing overlaps (part 1).
   2. Intake + household (part 2).
   3. Candidate card hierarchy + photo order / de-dup, and the same-station copy (parts 5, 6).
   4. Editable conditions (part 3).
   5. Error reasons (part 9).
   6. Credits page; remove the bottom credit line (part 10).
   7. Pretendard self-hosted (refs).
   8. Model panel + BYOK + usage (part 4).
   9. Orb (part 7).
   10. Map sim for homes outside boxes (part 8).
   11. Interaction polish (part 11).
4. Wire the new modules into the actual screens (`ui/chat.jsx`, `ui/app.jsx`, `main.js`). A module that no screen uses does not count as done.

## Working rules to keep cost down
- Tests: `cd web && npm test` (from the repo root `npm test` does not exist); Python `.venv/bin/python -m pytest -q`; build `cd web && npx vite build`.
- Keep working through the list until it is done or you run out of steps; do not end with an empty or partial message. End with the RESULT file written.
- Read files with line ranges, not whole large files. Never read `data/build/*.json` whole. Use `head`, `jq` or a short node script.
- Run tests narrowly while working (`node --test web/tests/<file>`). Run the full `npm test` and `vite build` only at checkpoints, and pipe them through `tail -30`.
- Make several changes to one file in one edit or one write, not many small edits.
- Do not re-read a file you just wrote.

## Output
`briefs/13-RESULT.md`, as specified in the stage 13 brief, plus a per-part status table. Add the pipeline commands the orchestrator must run (e.g. `pipeline walkgraph`).
