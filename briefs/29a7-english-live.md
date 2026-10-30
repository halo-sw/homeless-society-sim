# Stage 29a7 — Live Muse in English: Meta HQ works, every turn in English, chips readable (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
The orchestrator recorded a real live session in English (locale en-US, `?chat=&lang=en`) for the 29a6 replay. Turn by turn:
1. `I work at Meta HQ in Menlo Park. Two of us, rent up to $4,000 a month.` → Muse called only `extract_profile` (profile correct: `Meta HQ (1 Hacker Way) commute`, `rent up to $4,000/mo`, 2 people) and answered **"This area around Meta HQ is still being prepared, so I cannot show homes there yet."** The `us-menlo` region is built (`data/build/regions.json` has `us-menlo`, `data/build/us-menlo/`), and the 26c rules path searches it. Cause: `SYSTEM_PROMPT` in `web/src/consult/agent.js:~31-62` lists only Korean areas ("오늘 고를 수 있는 지역은 서울 성동구·…·위례이고", `grep -n "오늘 고를 수 있는 지역" web/src/consult/agent.js`) and says "다루지 않는 지역이면 '아직 준비 중이에요'" (`:37`), so the model refuses.
2. `Pick 1 and 2` → answer in **Korean**: `찜할 후보가 아직 없어서 고르기 어렵습니다. 월세 후보부터 찾아드릴까요?`
3. `Live in both homes for a month` → again Korean.
   The first line of `SYSTEM_PROMPT` says "항상 … 한국어로 짧게 답한다". `ENGLISH_NOTE` (`:18-19`) is pushed once and re-sent only after tool results (`:316-319`); the Korean-retry (`:337-350`, `isMostlyKorean`) did not fix turns 2–3 (find out why: the no-tool branch, a `checked.ok === false` branch, or the retry itself returning Korean — cover every final-answer branch).
4. **Suggestion chips garble**: Korean chips from `[[다음: …]]` show as `candidate Chatajwo`, `neighborhood Boyeojwo`, `Don Gyesanhaejwo`, `Commute route Boyeojwo`. `wordFallback` in `web/src/i18n/translate.js:~139-172` romanizes any unknown Hangul token as if it were a name (`찾아줘` → `Chatajwo`).

## Change

### 1. Coverage includes Meta HQ — `web/src/consult/agent.js`
- Add to the areas line: `미국 캘리포니아 Menlo Park · East Palo Alto(Meta 본사 1 Hacker Way 주변, 월세는 USD)도 고를 수 있다. 미국 집은 월세(USD) 후보만 있고 전세·매매·공공임대·한국 지원 제도는 해당 없음이라 밝힌다.`
- Check that `find_homes` (server tool, `web/src/consult/tools.js`, `grep -n "find_homes" web/src/consult/tools*.js`) searches `us-menlo` when the profile workplace/currency is US/USD, the same way the 26c client path does (`web/src/ui/chat.jsx:~1435-1445`: named `us-menlo` or `currency USD` → load exactly `us-menlo`). If it does not, route it the same way (load only `us-menlo`, never Korean regions, for a USD profile).
- `pick_homes` and `start_life_run` work with `us-menlo` candidate ids (check the id lookup uses the same loaded candidates).

### 2. English on every turn — `web/src/consult/agent.js`
- First line of `SYSTEM_PROMPT`: replace "한국어로" with "고객의 화면 언어로(기본 한국어, 영어 화면이면 영어로)".
- When `context.lang === "en"`, put `ENGLISH_NOTE` as the **last** system message of every request in the turn (not only after tool results), and extend it: `Write the [[다음: …]] suggestions in English too, e.g. [[다음: Compare them | Show the commute | Live in both]].`
- Every final-answer branch that returns text in English mode runs the `isMostlyKorean` retry once (export a small helper `needsEnglishRetry(text, isEnglish)` and use it everywhere a final reply is accepted). If the retry is still Korean, keep the retry text anyway but never fall back to the first Korean reply when an English one exists.
- `splitSuggestions` keeps English chips as they are.

### 3. Chips never romanize ordinary words — `web/src/i18n/translate.js`
- Add a small verb-frame table for chip-like phrases (the 12-char Korean chips Muse writes): `X 찾아줘|찾아 줘` → `Find X`, `X 보여줘|보여 줘` → `Show X`, `X 계산해줘|계산해 줘` → `Calculate X`, `X 비교해줘|비교해 줘` → `Compare X`, `X 알려줘|알려 줘` → `Tell me X`, `살아 봐 줘|살아봐 줘` → `Live in them`, where `X` goes through the normal word/phrase lookup (`후보` → `candidates`, `동네` → `neighborhood`, `돈` → `costs`, `출근길` → `commute route`).
- In `wordFallback`, a token that ends in a verb/request ending (`줘`, `해`, `해요`, `요`, `다`, `까`) is never passed to `romanizeName`; if it cannot be translated, the whole string falls back to the existing gloss-free English placeholder the table uses for unknown sentences (find it; if none, return the original Korean wrapped so `dom.js` leaves it — Korean is better than fake romanization).

## Test — new `web/tests/english-live-29a7.test.js`
- `SYSTEM_PROMPT` contains `Menlo Park` and no longer contains `항상 정중한 존댓말로, 한국어로`.
- With a fake provider (reuse the fake `complete` the agent tests already use, `grep -ln "runAgentTurn\|SYSTEM_PROMPT" web/tests/*.test.js`): English context, the fake returns Korean then English → the turn's answer is the English one; in a no-tool turn too; the last system message of every request is `ENGLISH_NOTE`.
- `find_homes` with a USD profile whose workplace is Meta HQ returns `us-menlo` candidates (use the existing us-menlo fixture the 26c tests use, `grep -ln "us-menlo" web/tests/*.test.js`), never Korean ones.
- Translator (en): `후보 찾아줘` → `Find candidates`; `동네 보여줘` → `Show neighborhood`; `돈 계산해줘` → `Calculate costs`; `출근길 보여줘` → `Show commute route`; none of the outputs matches `/jwo\b/i`.

Run only:
```
cd web && node --test tests/english-live-29a7.test.js $(grep -ln "runAgentTurn\|SYSTEM_PROMPT\|us-menlo\|wordFallback\|createTranslator" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
If an older pin asserts the exact old first prompt line, update only that pin.

## Do not touch
Landing files, map / 3D / engine files, `web/src/i18n/dom.js`, `relay/`, `web/src/chat/recording.js`.

## Final message
Changed files, one line each. Nothing else.
