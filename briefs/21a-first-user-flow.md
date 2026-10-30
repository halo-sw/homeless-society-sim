# Stage 21a — A first-time user gets a real answer (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. First edit within 5 tool calls. Commit, then stop. The orchestrator re-walks the flow on the GPU with a real mouse.

## Why
The user asked for the flow to work for real users, not just the prepared examples. The orchestrator walked it as a first-time user at 1440×900 and typed:

> 강남역으로 출근해요. 혼자 살고 전세 3억 이하, 역 가까운 오피스텔이면 좋겠어요

What happened, step by step:
1. **The workplace was misread.** The top chip read "강남역으 출근" and the 상황 card read "강남역으 (모름)". `findWorkplace` in `web/src/profile.js:174-193` uses `/([가-힣A-Za-z0-9·]+?)(?:로|에|에서)\s*출근/`. The lazy group stops at "강남역으" and "로" matches. The same bug hits every place ending in a consonant: 강남역으로, 성수역으로, 잠실역으로.
2. **We asked again for what was already said.** The 1/6 form opened with 연봉. The 함께 사는 사람 0/4 form showed twelve chips although the sentence said 혼자. The 직장 역/장소 input was empty although the sentence named 강남역. Everything appeared at once in a long column.
3. **The housing type was ignored.** The sentence said 오피스텔. Candidates 3–6 were 아파트 20 m² and 연립·다세대.
4. **The run went ahead with no workplace.** The result said "출퇴근 편도 – / –" and **"A와 B가 같아요 (편도 평균 0분)"**, which is false. In 3D, on a Thursday (11일차) at 10:53, 나 was walking in a park: an office worker with no commute for 30 days. 내 기준 점수 read 75 vs 25 with no weights set.
5. One candidate was named "(242-4)", a bare lot number.

## Changes
1. **Workplace parsing** (`profile.js`):
   - Match `(?:으로|로|에서|에)` in that order. Strip a trailing "으" defensively when the mention ends in "역으".
   - "강남역으로 출근" must resolve through `resolveWorkplace` to 강남. Check that the station list has it.
   - Add the cases from the test list below.
2. **Never re-ask what was said.**
   - `missingQuestions` / the step form skip any field the sentence filled: household from 혼자/1인/둘이/부부, workplace, tenure and budget.
   - When the household is 1인, the 함께 사는 사람 step does not appear.
   - Show **one question at a time** (the current step only), with 다음 / 나중에.
   - The 상황 card keeps the chips for what is known.
3. **Housing type preference.**
   - Parse 오피스텔 / 아파트 / 빌라·연립·다세대 / 원룸 into `profile.home_kinds`.
   - The candidate search keeps only those kinds when at least 3 remain. Otherwise it fills with others and labels the row "원하신 유형이 아니에요".
   - The 상황 card shows the kind chip.
4. **Workplace gate before the run** (the PicksTray run button and the chat run step):
   - If the workplace is unresolved, the button reads "회사 위치를 알려 주세요". Clicking it focuses an inline input, "회사 근처 역이나 동네 (예: 강남역)", in the tray, with station autocomplete from the stations list.
   - Only when it resolves does the button become "이 집들로 30일 살아 보기".
   - A user who works from home or does not commute can pick "출근 안 해요". Then the run is labelled "출근 없이" everywhere and the commute row says "출근 없이 살아 봤어요".
5. **Honest result when a value is missing.**
   - Never print "A와 B가 같아요" when either side is missing or non-finite. Fix `chat.jsx:340`, `chat.jsx:424`, `app.jsx:708` and `app.jsx:711`.
   - Show "회사 위치가 없어 계산하지 않았어요" instead.
6. **Candidate names.** When the name is a lot number (`/^\(?\d+(-\d+)?\)?$/`), show "{동} {유형} ({지번})", e.g. "대치동 연립·다세대 (242-4)". Use the candidate's region or dong field. If there is none, show "{유형} ({지번})".

## Tests — `web/tests/first-user-21a.test.js`
- `extract_profile` (or `findWorkplace` via the public extractor):
  - "강남역으로 출근해요" gives a workplace text without "으" that resolves to 강남;
  - also check 성수역으로, 판교로, 잠실에서 일해요 → 잠실 if supported, else unchanged, and 제기동으로 출근 keeps 제기동.
- The full sentence above gives a household of 1, tenure 전세, budget 3억, and `home_kinds` including 오피스텔. `missingQuestions` excludes the household, workplace and budget questions.
- The candidate filter: with `home_kinds` = [오피스텔] and a fixture of 6 candidates with 3 오피스텔, only the 3 오피스텔 remain. With 2 오피스텔, the extra rows carry the "원하신 유형이 아니에요" flag.
- The comparison sentence helper: missing (null/NaN) on either side never gives "같아요".
- The lot-number name: "(242-4)" with dong 대치동 and kind 연립·다세대 gives "대치동 연립·다세대 (242-4)".
- The run gate: a pure function `runGate(profile)` returns `{ ok: false, ask: "workplace" }` when unresolved, `{ ok: true }` when resolved, and `{ ok: true, noCommute: true }` for "출근 안 해요".

Run:
```
cd web && node --test tests/first-user-21a.test.js tests/chat*.test.js tests/profile*.test.js 2>&1 | tail -10 && npx vite build 2>&1 | tail -2
```
Update the older pins that this changes, and name them in the commit body.

Commit `21a: first-time sentence understood (으로, kinds, 혼자), one question at a time, workplace gate before the run, no false 같아요`. Then stop.
