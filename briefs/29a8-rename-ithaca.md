# Stage 29a8 — Ready for the repo rename to `ithaca` (brief for Muse)

Agent mode, rules in `AGENTS.md`. Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no full suite, no build. First edit within 2 tool calls. Stop when the named tests pass.

## Why
The owner will rename `halo-sw/homeless-society-sim` → `halo-sw/ithaca`. GitHub redirects git and web URLs of the repo, but **GitHub Pages does not**: the site moves from `https://halo-sw.github.io/homeless-society-sim/` to `https://halo-sw.github.io/ithaca/` and the old path 404s. Everything that builds or links the Pages path must change in the same push.

## Change (exact list, orchestrator's grep)
- `.github/workflows/pages.yml:7,41`: `PAGES_BASE=/ithaca/` (comment and build line).
- `relay/handler.js:20`: `DEFAULT_DATA_BASE = "https://halo-sw.github.io/ithaca/"`.
- `web/src/ui/landing-page.jsx` footer GitHub link → `https://github.com/halo-sw/ithaca`.
- `README.md:13,18,27` and `README.ko.md:13,18,27`: CI badge and links → `halo-sw/ithaca`, live site → `https://halo-sw.github.io/ithaca/`. Grep both READMEs for any other `homeless-society-sim` and update links only (keep the history sentence if one says the project was renamed; add one line under the title: `(formerly homeless-society-sim)` / `(이전 이름 homeless-society-sim)`).
- `docs/hackathon-checklist.md:14`: repo URL → `github.com/halo-sw/ithaca`.
- `web/src/paths.js:30`, `web/vite.config.js:266`: comments → `/ithaca/`.
- `web/package.json` `name`: `ithaca-web` (and the matching top entry in `web/package-lock.json` — only the two `"name"` fields at the top, nothing else).
- Tests: `web/tests/pages-22a.test.js:127` needle → `PAGES_BASE=/ithaca/`. The helper tests that use `/homeless-society-sim/` as an example base (`pages-22a.test.js:38-41`, `pages-22b.test.js:44-77`) switch to `/ithaca/` too so the repo has no stale path.

After the change `grep -rn "homeless-society-sim" --exclude-dir=node_modules --exclude-dir=data --exclude-dir=briefs .` returns only the "formerly" lines.

## Test
Run only:
```
cd web && node --test tests/pages-22a.test.js tests/pages-22b.test.js tests/relay-23a.test.js tests/judge-path-29a6.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Final message
Changed files, one line each. Nothing else.
