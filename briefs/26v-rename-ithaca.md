# Stage 26v — the repo becomes `halo-sw/ithaca` (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no build. Branch `ithaca-17`. Stop when this part is done.

## Context
The user decided to rename the GitHub repo `halo-sw/homeless-society-sim` → `halo-sw/ithaca`. The orchestrator does the rename, README links and deploys. After the rename:
- the public site is `https://halo-sw.github.io/ithaca/`;
- the Pages base path is `/ithaca/`.

The relay's CORS origin (`https://halo-sw.github.io`) has no path, so it does not change.

## Change (code and config only)
1. `.github/workflows/pages.yml`: `PAGES_BASE=/ithaca/`, and the comment at line 7.
2. `relay/handler.js:20`: `DEFAULT_DATA_BASE = "https://halo-sw.github.io/ithaca/"`.
3. `web/package.json` and `web/package-lock.json` (the two top-level `name` fields only): `ithaca-web`.
4. `web/src/paths.js:30` comment: `/ithaca/`.
5. Tests: `web/tests/pages-22a.test.js` and `web/tests/pages-22b.test.js` use `/homeless-society-sim/` as the example base. Switch them to `/ithaca/`, including the workflow needle `PAGES_BASE=/ithaca/` at pages-22a:127. Also update any relay test that pins `DEFAULT_DATA_BASE` (`grep -rn homeless-society-sim relay web/tests tests`).
6. After the edit, `git grep homeless-society-sim -- web relay .github tests` must return nothing. `README*`, `docs/` and `briefs/` are the orchestrator's.

Run:
```
cd web && node --test tests/pages-22a.test.js tests/pages-22b.test.js $(ls tests | grep -i relay | sed 's#^#tests/#') 2>&1 | tail -8
cd .. && ls relay && (ls relay/*.test.* 2>/dev/null; true)
```
If a relay test exists outside `web/tests`, run it too. If still failing after 2 fix attempts, stop and print the last lines.

## Do not touch
`web/src/engine/**`, `web/src/i18n/**`, `pipeline/**`, `data/`, `README*`, `docs/`, `briefs/`. Another stage is editing `web/src/ui/chat.jsx`, `web/src/ui/landing.jsx` and `web/src/ui/ui.css` right now.

## Final message
Changed files, one line each. Nothing else.
