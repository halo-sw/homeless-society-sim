# Stage 29j4 — The verified report reads like Ithaca, and each rejection says why (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here. Stop when the named tests pass.

## Why
First live end-to-end run (orchestrator, 2026-11-01, Korean newlywed example, real Muse): the loop works — `1차 반려 (88%) → 2차 반려 (88%) → 3차 반려 (88%) → 4차 통과 (100%)` — but what the customer reads is not product copy:
```
주 통근·통학 시간은 8.2분이다.          ← reads the checklist label aloud, 해라체
월 주거비 총액은 1109367원이다.         ← no thousands separator
두 사람의 통근 시간은 각각 8.2분과 8.2분이다.
직장에서 집 도착 기록이 있다. 근거 1개   ← says nothing; the record had a date, time and minutes
```
and the three rejections show only a percentage — the reason (`summary_ko`, e.g. `검증 실패: 근거가 문장을 뒷받침하지 않아요 1개, 커버리지 88%`) is only in a hover title, so neither the customer nor a demo viewer sees what Muse was sent back for.

## Changes

### 1. `web/src/consult/report.js` — `REPORT_PROMPT` (`report.js:11-17`) and `JUDGE_PROMPT` (`:31`)
Keep every existing rule; add these lines to `REPORT_PROMPT`:
- 고객에게 쓰는 존댓말(해요체)로, 한 문장에 한 가지, 40~70자. 항목 이름(label_ko)을 그대로 읽지 말고 생활 말로 쓴다. 예: "회사까지 편도 평균 8.2분 걸렸어요", "월세·관리비를 더하면 한 달 1,109,367원이에요".
- 문장 속 숫자는 천 단위 쉼표를 쓴다(1,109,367원). claims의 value는 쉼표 없는 숫자 그대로.
- events가 있는 항목은 인용한 기록의 날짜·시각·분을 문장에 그대로 쓴다. 예: "12일째 19:42, 해가 진 뒤 걸어서 13분 만에 집에 왔어요". 여러 기록을 묶어 "n번"이라고 쓰면 그 n개의 id를 모두 evidence에 단다.
- feedback_ko를 받으면 지적된 문장만 고치고, 통과한 문장은 그대로 다시 낸다.
`JUDGE_PROMPT` gets the item label too (`makeJudge` already sends `item_id`; also send `label_ko` when the sentence's item is known — pass `labels: Map(item_id → label_ko)` into `makeJudge` from `writeReport`, built from the digest items) and one extra rule: 문장의 숫자·횟수가 인용 기록의 개수·시각·분과 같으면 supported=true.
Update `REPORT_PROMPT_EN` with the same voice rules in English (plain, friendly, numbers with commas, cite the record's day/time/minutes).

### 2. `web/src/ui/chat.jsx` — `ReportCheck` (`chat.jsx:742-…`)
Under the timeline row, for every **rejected** attempt, one supporting line: `${attempt}차 반려 · ${summary_ko without the leading "검증 실패: "}` (e.g. `1차 반려 · 근거가 문장을 뒷받침하지 않아요 1개, 커버리지 88%`), class `ui-check-reason`, and `data-no-i18n` only when the page is Korean (English pages translate via `en.js` patterns: add `{0}차 반려 · {1}` → `Try {0} sent back · {1}` and the reason fragments `근거가 문장을 뒷받침하지 않아요` → `the cited records do not support the sentence`, `근거 없는 문장` → `sentence without a record`, `근거 없는 숫자` → `number without a claim`, `커버리지` → `coverage`, `누락 항목 있음` → `items missing`).

## Tests
- Extend `web/tests/submit-report-29j2.test.js`: `REPORT_PROMPT` contains `해요체`, `1,109,367원`, `날짜·시각·분`; `makeJudge`'s user message JSON includes `label_ko` when given a labels map.
- Extend `web/tests/report-check-29j3.test.js`: SSR of `ReportCheck` with attempts `[{attempt:1,pass:false,weighted_coverage:0.88,summary_ko:"검증 실패: 근거가 문장을 뒷받침하지 않아요 1개, 커버리지 88%"},{attempt:2,pass:true,weighted_coverage:1,summary_ko:"검증 통과: 커버리지 100%"}]` → contains `1차 반려 · 근거가 문장을 뒷받침하지 않아요 1개, 커버리지 88%` and no reason line for attempt 2.

Run only:
```
cd web && node --test tests/submit-report-29j2.test.js tests/report-check-29j3.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
Verifier code (`web/src/verify/*`), tools.js, server.js, other UI, `briefs/`.

## Final message
Changed files, one line each. Nothing else.
