# Stage 29k1 — The report passes only on real numbers: member ids that match the engine, no empty sentences, records that say how and when (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here. Stop when the named tests pass.

## Why
Orchestrator replay of a real request (Seoul newlywed couple, real Muse Spark 1.3, 2026-11-01), every submit re-verified by hand:

1. **"엔진 기록으로 확인할 수 없어요 4개" on every try is our bug, not Muse's.** `REPORT_PROMPT` (`web/src/consult/report.js:17`) tells Muse `N01은 구성원마다 member(m1, m2…)`. Muse sends `member: "m1"`, `"m2"`. But the engine's trips carry `agent: "h1"`, `"h2"` (agents are `{key:"h1", id:"m1", label:"나"}`, `{key:"h2", id:"m2", label:"배우자"}`), `householdMembers` returns the keys (`numbers.js:45`), and `engineValue("N01", run, {member:"m1"})` → `commuteOneWayMinutes` filters `t.agent !== member` (`numbers.js:128`) → null → 2 failures per home, every try.
2. **The final "통과 (100%)" was won by deleting the numbers.** On try 3 Muse rewrote N01 as `"두 분 모두 함께 출근하고 함께 퇴근하며 같은 생활 리듬으로 지낸 기록이에요"` with `claims: []`. `checkNumberClaims` (`numbers.js:261`) only fails a claim-less sentence when its text has a number, so a number-free sentence on a deterministic item counts as covered (`loop.js:83`). A must item "passed" with a sentence the engine never said.
3. **The judge refused true records.** Engine walking trips carry no `mode` (walk is the default — see the comment at `web/src/engine/life-events.js:160-162`). `judgeCandidates` text says `걸어서` (`evidence.js:41`), but `citedEvents` (`evidence.js:82-93`) hands the judge `mode: undefined`, so the judge rejects every "걸어서" sentence ("기록에 이동수단 정보가 없어"). The cited record also never says *why* it is a C06 scene (after sunset vs after 22:00).
4. **Voice still invents.** Sentences add things no record says: `아침마다 여유 있게 다닐 수 있었어요`, `필요할 때마다 바로 다녀올 수 있었어요`, `남편도 … 아내도 …` (the record says 나 / 배우자), and the earlier run opened every sentence with `30일 동안 신혼집에서 함께 지내며`.

## Changes

### 1. `web/src/verify/numbers.js`
- New exported `memberKeyFor(run, member)`: returns the household agent key for `member` when it equals an agent's `key`, `id` or `label` (string compare); otherwise null. Uses `run.agents` the same way `householdMembers` does.
- `engineValue("N01", …)` resolves `member` through `memberKeyFor` before `commuteOneWayMinutes`.
- `checkNumberClaims`: for an engine-backed deterministic item (`item.engine !== "none"`, `item.verify === "deterministic"`) whose `engineValue` for that home is not null, a sentence with **no claims** fails with `kind: "number"`, `reason_ko: "숫자 없이 쓴 문장이에요"` (whether or not its text has digits — keep the existing `근거 없는 숫자` reason when it does). For N01 the engine value check uses the first household member.

### 2. `web/src/verify/compare.js` — `reportDigest` (`compare.js:156-162`)
N01 values per member become `{ [agentKey]: { value, unit, label_ko } }` where `label_ko` is the agent's `label` (나, 배우자…). Nothing else in the digest changes.

### 3. `web/src/verify/evidence.js`
- `citedEvents` trip entries: `mode: t.mode ?? (Array.isArray(t.parts) && t.parts.length ? "transit" : "walk")`, plus `scene`: `"dark_walk"` and/or `"late_home"` when the trip is in `lifeEventTrips(run, kind)` for that kind (both when both; reuse the same predicates, no new rules), plus the same `text_ko` the candidate list shows.
- `tripTextKo` / the candidate `text_ko` say the scene: append ` · 해 진 뒤` for a dark_walk trip and ` · 밤 10시 넘어` for a late_home trip (both when both). If `life-events.js` already exposes the sunset time for that day, add it as `(일몰 HH:MM)` after `해 진 뒤`; if it does not, do not invent one.

### 4. `web/src/consult/report.js` — `REPORT_PROMPT` (`:13-23`) and `REPORT_PROMPT_EN`
- Replace the N01 clause with: `N01은 digest N01 values의 구성원 키를 그대로 member에 쓰고(예: h1, h2), 문장에서는 그 label_ko로 부른다(나, 배우자). 남편·아내처럼 기록에 없는 호칭은 쓰지 않는다.`
- Add: `기록에 없는 느낌·평가·습관은 덧붙이지 않는다(예: "여유 있게", "필요할 때마다", "매일 같은 경로"). 숫자 하나와 그 뜻만 쓴다.`
- Add: `문장을 "30일 동안…"으로 시작하지 않는다. 리포트 제목이 이미 30일 기록이라고 말한다.`
- Add: `결정적 항목(values가 있는 항목)은 숫자 없이 쓰면 실패한다. 숫자를 빼서 고치지 말고 digest 값으로 고친다.`
- Mirror all four in `REPORT_PROMPT_EN` (English wording, same meaning; member labels in the sentence as the customer sees them).

## Tests — new `web/tests/report-members-29k1.test.js`
Build a tiny run: agents `[{key:"h1",id:"m1",label:"나",household:true},{key:"h2",id:"m2",label:"배우자",household:true}]`, a few `commute` trips for `h1` and `h2` (am + pm), one evening walking trip home (`purpose` home-bound, `to.kind:"home"`, no `mode`) that `lifeEventTrips(run,"dark_walk")` or `"late_home"` returns — read `life-events.js` exports to build it (≤ 40 lines).
- `memberKeyFor(run,"m1") === "h1"`, `memberKeyFor(run,"나") === "h1"`, `memberKeyFor(run,"h2") === "h2"`, `memberKeyFor(run,"x") === null`.
- `engineValue("N01", run, {member:"m1"})` equals `engineValue("N01", run, {member:"h1"})` and is not null.
- `checkNumberClaims` on an N01 sentence with `claims: []` and text `두 분 모두 함께 출근했어요` → one failure `숫자 없이 쓴 문장이에요`.
- `reportDigest` N01 values for the home have key `h1` with `label_ko: "나"`.
- `citedEvents(run, [thatTripId])[0].mode === "walk"` and its `scene` includes the kind used; its `text_ko` contains `걸어서`.
- `REPORT_PROMPT` contains `label_ko로 부른다`, `남편·아내`, `"30일 동안…"으로 시작하지 않는다`; it no longer contains `member(m1, m2…)`.
Update any existing pin these changes break (`verify-compare-29j1`, `submit-report-29j2`, `verify-claims`, `verify-loop`) to the new behaviour — never weaken a check.

Run only:
```
cd web && node --test tests/report-members-29k1.test.js tests/verify-compare-29j1.test.js tests/submit-report-29j2.test.js $(ls tests/verify-*.test.js) 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
UI files, tools.js, server.js, `briefs/`.

## Final message
Changed files, one line each. Nothing else.
