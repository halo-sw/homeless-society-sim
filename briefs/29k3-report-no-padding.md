# Stage 29k3 — Report sentences stop padding to a length and say what each number measures (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only `web/src/consult/report.js:13-45`. Stop when the named test passes.

## Why
Replay after 29k1 (real Muse Spark 1.3, 2026-11-01): the report now passes on the first try with true numbers, but the `40~70자` rule makes Muse pad short facts to length, and one sentence claims more than the engine measured:
```
회사까지 편도 평균 8.2분 걸렸고 출근길 이동 시간은 이렇게 기록됐어요      ← padding
가장 가까운 마트와 편의점까지 걸어서 1.2분 걸려 장보기가 이렇게 측정됐어요  ← "가장 가까운" is not what C05 measures; padding
```
C05's engine value is the mean minutes of the household's actual grocery trips (`meanMinutes(trips, purpose)`), not the distance to the nearest shop. C01 is the door-to-door one-way commute averaged over the household.

## Changes — `web/src/consult/report.js`
In `REPORT_PROMPT`:
- Replace `한 문장에 한 가지, 40~70자.` with `한 문장에 한 가지, 70자 이하로 짧게. 글자 수를 채우려고 "이렇게 기록됐어요" 같은 말을 덧붙이지 않는다.`
- Add one line of item meanings: `값의 뜻: C01 = 문 앞에서 회사까지 편도, 집안 사람 평균. C05 = 이번 달 실제로 장 보러 다닌 길의 평균 시간(가장 가까운 가게까지가 아님). N01 = 구성원마다 편도 평균. C02 = 월세·관리비를 더한 한 달 금액.`
- Update the two examples to the short form: `"회사까지 편도 평균 8.2분 걸렸어요"`, `"장 보러 다닌 길은 평균 1.2분이었어요"`.
Mirror in `REPORT_PROMPT_EN` (short, 70 characters or fewer is not required in English — say "short; never pad"; same item meanings in English).

## Test — extend `web/tests/report-members-29k1.test.js`
`REPORT_PROMPT` contains `70자 이하`, `가장 가까운 가게까지가 아님`, `덧붙이지 않는다`; it no longer contains `40~70자`. `REPORT_PROMPT_EN` contains `never pad`.

Run only:
```
cd web && node --test tests/report-members-29k1.test.js tests/submit-report-29j2.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
Everything else; `briefs/`.

## Final message
Changed files, one line each. Nothing else.
