# Stage 26u — English mode: catch a Korean reply and ask once more in English (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (live run, `?lang=en`)
- Turn 1 ("I work in Pangyo. Find me a jeonse home…") came back in English.
- Turn 2 ("Save numbers 1 and 3"): Muse saved the homes, then replied in Korean: "말씀하신 후보를 찜했습니다. 비교나 출근길, 살아 보기를 원하시면 말씀해 주세요."
- Since 26s that bubble is `data-no-i18n`, so English readers see raw Korean.
- `src/consult/agent.js:289` adds the English system message once, right after the context line and before the tool loop. After Korean tool results pile up, the model drifts back to Korean.

## Change — `src/consult/agent.js` (+ a pure helper in `src/consult/guards.js`)
1. `isMostlyKorean(text)`:
   - drop parenthesised segments (`(강남역)`), `[[…]]` markers, URLs and digits;
   - then true when Hangul letters are more than 20 % of the remaining letters.
   - Export it.
2. When `context.lang === "en"`:
   - the English system message is also re-sent as the **last** message right before the final (non-tool) completion, so it sits after the tool results. Find where the loop builds the request for the turn's answer;
   - if the final reply `isMostlyKorean`, retry once with one more system note: "Your last answer was in Korean. Rewrite it in plain English with the same facts and numbers." Reuse the guard retry path at ~line 327 and add the usage the same way;
   - if the retry is still mostly Korean, keep it but mark the message so the UI does **not** set `data-no-i18n` on it (26s `fromModel`): the phrase layer then translates what it can.
3. Korean mode: no change at all.

## Test — `web/tests/english-drift-26u.test.js`
- `isMostlyKorean`:
  - "말씀하신 후보를 찜했습니다." → true;
  - "Saved A Cheonsa (천사의도시II오피스텔) and B Sigma 3." → false;
  - "" → false.
- Agent loop with a fake `complete`: first final answer Korean, second English → the turn's reply is the English one, and `complete` was called once more than without the retry.
- The same with `lang: "ko"` → no retry.
- Keep green: `tests/chatfirst-26t.test.js`, `tests/english-muse-26s.test.js`, and every `tests/*agent*`, `tests/*guard*`, `tests/*consult*` file.

Run:
```
cd web && node --test tests/english-drift-26u.test.js tests/chatfirst-26t.test.js tests/english-muse-26s.test.js $(ls tests | grep -iE 'agent|guard|consult' | sed 's#^#tests/#') 2>&1 | tail -12
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**`, `pipeline/**`, `relay/**`, `data/`. No keys.

## Final message
Changed files, one line each. Nothing else.
