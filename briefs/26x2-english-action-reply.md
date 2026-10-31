# Stage 26x2 — English mode: an action turn that is still Korean after the retry falls back to the translatable confirmation (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Live English run on the dev server after 26x:
- "I work in Pangyo. Jeonse under 200M won, living alone." → 6 candidates around Pangyo with commute minutes. 26x works.
- "Save 1 and 2" → the tray shows A and B, but Muse answered in Korean: "찜하신 두 곳을 저장해 두었습니다. 비교와 살아 보기를 이어서 도와드릴 수 있습니다."
- It stays Korean on screen. The phrase layer has no entry for free model text, and this is 합니다체, not our voice.

Code path: `src/consult/agent.js` ~351–362. When the English retry is still Korean (`checked2.ok && isMostlyKorean`), the Korean text is kept with `guardCause: "english_retry_korean"`.

## Change — `src/consult/agent.js`
In that branch, before keeping the Korean text:
- Compute `actionConfirmation(toolResults, { names: session.lastCandidateNames })` (same names source as 26x).
- If it is not `null`, reply with it instead, with `fallback: true`, `guardCause: "english_retry_korean_action"` and `suggestions: split2.suggestions`.
  - Its sentences are already in the English phrase table ("Saved {0}. {1}", the "Live in both homes" hint, the run-started line).
- Only when it is `null` (no action this turn) keep today's behaviour.

Apply the same rule to the first-pass path if there is an English-mode branch that returns a Korean reply without a retry. Check the code around the 26u English anchor; do not add a second model call.

## Test — `web/tests/english-action-26x2.test.js`
Use the existing agent test harness: find how `tests/agent*` or `tests/consult*` stub `complete()` with scripted replies.
- English mode, with a stub that answers both the first call and the retry with a Korean sentence.
- The tool results contain `{ ok: true, ui: { action: "pick", ids: ["x1", "x2"] } }`, and `session.lastCandidateNames = { x1: "판교푸르지오", x2: "봇들마을" }`.
- The final reply contains `찜했어요` and both names, `fallback === true`, `guardCause === "english_retry_korean_action"`.
- The same stub with no action in the tool results → the Korean text is kept and the cause is `"english_retry_korean"` (today's behaviour).
- Keep green: `tests/english-profile-26x.test.js` and every `tests/agent*`, `tests/guards*`, `tests/consult*` file.

Run only:
```
cd web && node --test tests/english-action-26x2.test.js tests/english-profile-26x.test.js $(ls tests | grep -E '^(agent|guards|consult)' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**`, `src/ui/**`, `src/profile.js`, `pipeline/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Nothing else.
