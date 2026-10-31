# Stage 29a9 — Resolve the merge of main (26v–26y) into chat-27 (brief for Muse)

Agent mode, rules in `AGENTS.md`. Branch `chat-27`, **a merge of `origin/main` (f358cf6) is in progress**; the working tree has conflict markers (`<<<<<<< HEAD` = chat-27, `>>>>>>> origin/main` = main). Sandbox: no network, no keys. No sub-agents, **no git commands**, no todo list, no build. First edit within 3 tool calls. You may run the full suite once at the end (`cd web && npm test 2>&1 | grep -E "^# (pass|fail)|^not ok"`).

## Background
Two sessions worked in parallel. chat-27 (HEAD) has: new landing page at `/` (28d–28g, `bootLanding`, `landing-page.jsx`), Powered by Muse in the top bar (28b), tokens (28c, tests forbid `font-size: 13px` and non-token sizes in new rules), English trust / results list / intake / global polish / map (29a1–29a5), recorded replay and judge buttons (29a6–29a6e), live English Muse with Meta HQ (29a7–29a7d), rename prep (29a8). main has: rename (26v), first screen over the city scene (26w–26w3: chat empty state on the tour scene backdrop with scrim, landing heading, example cards, coverage), English action-turn fallback (26x2, 26x3 `englishActionFallback`, `correctionNote`), server US homes path (26y: `createUsHomesLoader`, `isUsProfile`, `needUsHomes`), README "Judge in 2 minutes", i18n fixes.

The owner chose: **keep both**.

## Resolve each file (`git diff --name-only --diff-filter=U` was: README.md, README.ko.md, docs/hackathon-checklist.md, web/src/consult/agent.js, web/src/consult/server.js, web/src/consult/tools-search.js, web/src/i18n/en-table.js, web/src/i18n/en.js, web/src/main.js, web/src/ui/chat.jsx, web/src/ui/topbar.jsx, web/src/ui/ui.css; `grep -n "^<<<<<<<\|^>>>>>>>" <file>`)
- **README.md / README.ko.md / docs/hackathon-checklist.md**: take main's side (newer content, relay sentence, "renamed" note). Keep chat-27's `(formerly homeless-society-sim)` line only if main has no equivalent.
- **main.js**: `landing` → `bootLanding()` (chat-27); `chat` → `bootTour("chat").catch(bootChat)` (main 26w2); everything else `bootTour(route)`.
- **topbar.jsx**: chat-27 (`<PoweredByMuse size="sm" live={LIVE_API} showStatus />`). Drop main's `ui-bar-muse`/Badge pair; if main's CSS references `.ui-bar-status`, leave the CSS harmless.
- **chat.jsx**:
  - thread `<section>`: main's className expression (`ui-chat-thread-empty` when empty) **plus** chat-27's replay bar as its first child.
  - empty state: main's structure (scrim, `ui-chat-empty-body`, `LANDING_HEADING`/`LANDING_SUB`, label, composer, starter row, example cards, coverage) **plus** chat-27's `<PoweredByMuse size="sm" live={LIVE_API} showStatus />` under the composer. The starter row keeps chat-27's `EMPTY_STARTERS` (the three judge buttons from 29a6). Keep both sets of imports used.
  - any third hunk: keep both behaviours; never drop replay gating (no consult calls while replaying).
- **agent.js**: keep chat-27's 29a7 structure (`needsEnglishRetry`, `englishRewrite`, `ENGLISH_NOTE` last on every request) and add main's 26x2/26x3 safety: after an English retry that is still mostly Korean, use `englishActionFallback(toolResults, session)` when it returns text (with main's `guardCause: "english_retry_korean_action"`); use main's `correctionNote` variable (it already has the English correction text). Keep every export both test suites import.
- **server.js / tools-search.js**: keep both loaders — `loadHomes = createHomesLoader(read)` (29a7c/d merged index) and main's `loadUsHomes = createUsHomesLoader(read)`, both passed to the session. In `find_homes` use main's `isUsProfile` / `needUsHomes` path; keep `usRegionsForProfile` exported (29a7 test) and implement it with `isUsProfile` (return `["us-menlo"]` or `null`).
- **en-table.js / en.js**: union. Where the same Korean key has two English values, prefer main's wording **except** when a chat-27 test pins chat-27's wording — then update that chat-27 test pin to main's wording (e.g. diary line `rewritten once` / `rewritten {1} times`, run button `Live 30 days in each`). The pick-tray label must stay short enough not to truncate.
- **ui.css**: union both blocks. In main's `.ui-landing-card*` rules replace literal sizes with tokens so 28c passes: `11px`→`var(--ds-t-12)`, `13px`→`var(--ds-t-12)` or `var(--ds-t-14)`, `6px` radius→`var(--ds-r-chip)`, `2px 6px` padding→`var(--ds-s-4) var(--ds-s-8)`, `6px 0 0` margin→`var(--ds-s-8) 0 0`; keep main's wrap/min-width fixes. Keep the 480px phone block containing both chat-27's 28b/28d lines and main's 26w lines.

## Done when
No conflict markers remain anywhere (`grep -rn "^<<<<<<<\|^>>>>>>>" web docs README*.md` is empty) and the full suite shows only these known failures: `stage 10b UI render smoke` (walked-hours B value) and `real-build engine values (16b)` (demo-two-homes-B C01). Fix any other failure you introduced, or update a pin that asserts one branch's wording the other branch replaced.

## Final message
Changed files, one line each, and the final `# pass / # fail` line. Nothing else.
