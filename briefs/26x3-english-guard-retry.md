# Stage 26x3 — English mode: the guard-correction retry asks for English (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Live English run after 26x2, with the `/api/consult` responses logged:

```
turn 2 "Save 1 and 2" → tools: pick_homes
  response: fallback=false, guardRetries=1,
  reply "고르신 곳을 저장해 두었습니다.\n이어서 비교 화면으로 보여 드릴까요?"
```

So the first answer failed the guard, and the turn went through the **guard-correction retry** in `src/consult/agent.js` (~line 375):

```js
content: `교정: 방금 답은 가드 실패(${checked.cause}: ${checked.detail}). 도구 결과의 수치만 그대로 쓰고, 금지 주제·현실예측 표현 없이 3줄 이내 한국어로 다시 답하라. 도구는 쓰지 마라.`
```

The note says "한국어로", so in English mode the retry is Korean, it passes the guard, and the raw Korean reaches English readers. 26x2 covered only the other branch (Korean reply that passed the guard).

## Change — `src/consult/agent.js`
1. When `isEnglish`, the correction note asks for English: the same rules in English, ending "Answer again in at most 3 lines, in English. Do not call tools." Korean mode keeps today's note word for word.
2. After that retry, when `isEnglish && checked2.ok && isMostlyKorean(split2.text)`:
   - prefer `actionConfirmation(toolResults, { names: session.lastCandidateNames })` when it is not `null`, with `fallback: true` and `guardCause: "english_retry_korean_action"`;
   - otherwise keep today's behaviour.
3. Use one small helper for that "English but still Korean → action confirmation" choice, so the 26x2 branch and this one share it.

## Test — extend `web/tests/english-action-26x2.test.js`
Use the same stub harness.
- **English mode:**
  - the first stub reply fails the guard (e.g. a number not in the tool results);
  - the retry stub returns Korean;
  - the tool results include a `pick` action with names;
  - expect the reply to contain both names and `찜했어요`, and the cause to be `english_retry_korean_action`.
- **English mode, retry prompt:** capture the messages sent on the retry call. The last user/system note contains "in English" and does not contain "한국어로".
- **Korean mode:** the retry note is unchanged and contains "한국어로".
- Keep green: every `tests/agent*`, `tests/guards*`, `tests/consult*` file and `tests/english-profile-26x.test.js`.

Run only:
```
cd web && node --test tests/english-action-26x2.test.js tests/english-profile-26x.test.js $(ls tests | grep -E '^(agent|guards|consult)' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**`, `src/ui/**`, `src/profile.js`, `pipeline/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Nothing else.
