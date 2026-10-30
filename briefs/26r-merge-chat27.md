# Stage 26r — resolve the merge of main (chat-27) into ithaca-17 (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git commands that change state (the orchestrator commits), no todo list, no build. Branch `ithaca-17` with a merge of `main` in progress. Stop when this part is done.

## Situation
The orchestrator ran `git merge --no-commit main` on `ithaca-17`.
- `main` carries chat-27 (chat-first Ithaca): in chat mode the top bar shows "Muse" + a status badge instead of the mode tabs; other modes show "← 대화로". The work panel stays closed until asked (`workOpen`), 3D scenes open in the work panel (`scene`), and there is a `dataTick` re-render.
- `ithaca-17` carries 26m–26q. On phones (`usePhoneMedia`), the pane toggle (대화 / 지도·후보, variable `narrowTabs`) sits on its own row under the top bar. Wider screens keep it in the bar (`extra`). The mode tabs use short labels on phones (`shortModeLabel`).

Conflicts, all marked with `<<<<<<<` / `>>>>>>>`:
1. `web/src/ui/topbar.jsx`, one hunk: mode tabs (ithaca-17) vs Muse header / ← 대화로 (main).
2. `web/src/ui/chat.jsx`, three hunks:
   - the imports;
   - the state block: `phone` vs `workOpen`, `dataTick`, `scene`;
   - the `extra=` prop of `TopBar`.

## Resolve — keep both sides' behaviour
1. **topbar.jsx:** take main's header (Muse + badge in chat mode, ← 대화로 otherwise). Keep `usePhoneMedia` and `shortModeLabel` exported if anything still imports them or tests use them (`grep -rn` in `src/` and `tests/`). Remove them only if nothing does.
2. **chat.jsx imports:** keep both: `import { TopBar, usePhoneMedia } from "./topbar.jsx";` and main's `EXAMPLE_PROMPTS, COVERAGE_AREAS` import.
3. **chat.jsx state:** keep both: `const phone = usePhoneMedia();` (with its 26p comment) and main's `workOpen` / `dataTick` / effect / `scene`.
4. **chat.jsx `extra`:**
   - the pane toggle shows only when the work panel is open (main) and, on phones, on its own row under the bar (ithaca-17): `extra={workOpen && !phone ? narrowTabs : null}`;
   - the phone row under the bar renders only when `workOpen && phone`;
   - `narrowTabs` keeps the 26p labels `대화` / `지도·후보`. Find where ithaca-17 renders the phone row (search `26p`) and add the `workOpen` condition there.
5. Search all of `web/src` for any remaining `<<<<<<<`, `=======` (at line start) or `>>>>>>>` markers. None may remain.

## Test
Run the whole web suite once at the end; this merge touches shared files:
```
cd web && node --test tests/*.test.js 2>&1 | grep -E "^not ok|^# (tests|pass|fail)"
```
Known failures that existed before and are not yours: "stage 10b UI render smoke" and "real-build engine values (16b)".
- Any other failure: fix the code if the merge caused it.
- If a 26m/26p test asserts something chat-27 removed on purpose (e.g. mode tabs in the chat bar), update that test to the chat-27 behaviour and say so in your final message.
- If still failing after 2 fix attempts, stop and print the failing names.

## Do not touch
`src/engine/**`, `src/i18n/**`, `pipeline/**`, `data/`. No `text-overflow: ellipsis`.

## Final message
Changed files, one line each, the test counts, and any test you changed and why. Nothing else.
