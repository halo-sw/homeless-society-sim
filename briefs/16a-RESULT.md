# 16a 결과 — 사용자 정답 기준 내장 검증

Branch `verify-16a`. 순수 함수만 (DOM·three.js·네트워크 없음), plain object 입출력.
참조 스코어러 `tools/verify_checklist.py`를 스펙으로 삼고, 깨끗한 입력에서 같은 숫자를 낸다.

## 파일

- `scenarios/verify/ground_truth.json` (수정): 아이템별 `engine`/`engine_source` 추가,
  `persona_map` 추가, `single_firstjob`(공통 항목만) 추가. 사용자 id·라벨·가중치·합격 조건은 그대로.
- `web/src/verify/checklist.js` (신규): 체크리스트 스코어러.
- `web/src/verify/numbers.js` (신규): 결정적(deterministic) 주장 대조.
- `web/src/verify/evidence.js` (신규): 근거(evidence) 인덱스·대조.
- `web/src/verify/loop.js` (신규): 리포트 검증 + 재시도 루프.
- `web/tests/verify-checklist.test.js`, `verify-claims.test.js`, `verify-loop.test.js` (신규): 76개 테스트.

## Exports

- `checklist.js`: `loadGroundTruth(json, persona)`, `scoreChecklist(loaded|personaKey, agentItems, { judge, groundTruth })`,
  `matchKeyword(keyword, text)`(통단어 규칙 단일 함수), `isNegated(text, index, length)`, `roundCoverage(x)`.
- `numbers.js`: `engineValue(itemId, run, { member, home })`, `meanMinutes`, `monthlyTotal`, `textNumbers`(judge 가드에서 import),
  `checkNumberClaims(report, run, loaded)`, `MINUTE_TOLERANCE`.
- `evidence.js`: `evidenceIndex(run)`, `awayId(away)`, `checkEvidence(report, run, loaded)`.
- `loop.js`: `verifyReport(report, run, persona, { groundTruth })`, `runVerifyLoop({ draft, revise, run, persona, groundTruth, maxRetries })`.

## 감사(audit) 수정 반영

- 1음절 한글·4자 이하 라틴 키워드는 통단어로만 ("향후/방향"→C04 차단, "짐작"→C07 차단,
  "parking"→F03 차단, "recall"→R02 차단). 2음절 한글도 경계를 적용 ("안전한 투자"→F02 차단, "병원비"→F05/M02 차단).
- 부정어 가드: 않·안·못·없이·제외·skip·not이 키워드 12자 안에 있으면 미적용 ("소음은 확인하지 않았어요"→C03 차단).
- 일대일 매칭: 한 줄은 최대 한 항목 (must 우선, 동률은 긴 키워드). 키워드 샐러드 한 줄은 1개만 적중하고 실패.
- 기지 limitation: "아침 식사 메뉴"는 독립 단어 아침을 포함해 C09에 여전히 적중한다.
  "아침 동선"과 구조가 같아 결정적 규칙으로 분리 불가 → 주입 예정인 judge(Muse Spark) 층에서 해소. 체크리스트 전체는 must 0%로 실패한다.

## 페르소나별 지원 지도 (엔진 backed / 전체)

| 페르소나 | must | should | 비고 |
|---|---|---|---|
| young_family | 3/5 (C01, C02, F01) | 3/10 (C05, F03, F05) | 데모 지원 |
| newlywed_couple | 3/4 (C01, C02, N01) | 1/10 (C05) | 데모 지원 |
| single_firstjob | 2/3 (C01, C02) | 1/6 (C05) | 공통 항목만 |
| remote_worker | 2/5 (C01, C02) | 1/9 (C05) | 미지원 (시나리오 없음) |
| multigen_family | 3/5 (C01, C02, M02) | 1/9 | 미지원 (시나리오 없음) |
| pet_owner | 3/5 (C01, C02, P02) | 1/9 | 미지원 (시나리오 없음) |

미지원 페르소나의 체크리스트 스코어링(part 2)은 동작한다(제안 항목만 읽기 때문).
리포트 검사(parts 3–4)는 `{ status: "미지원", reason_ko: "이 가족 유형은 아직 시뮬레이션 시나리오가 없어요" }`를 내고 절대 통과하지 않는다.

## 미지원 항목과 해제 조건 (마감 후 엔진 작업용)

공통: C03 소음→이벤트 `noise`, C04 향→리스팅 `orientation`, C06 귀갓길→이벤트 `late_return`,
C07 수납→이벤트 `move_in`·`storage`, C08 하자→이벤트 `maintenance_issue`, C09 아침동선→이벤트 `morning_routine`.
young: F02→`child_outing`, F04→리스팅 `has_elevator`, F06→`noise`.
newlywed: N02→`delivery`, N03→`late_return`, N04→리스팅 방 수, N05→여가 목적 이동.
remote: R01/R02/R05→`work_session`(R02는 `noise`도), R03→리스팅 `internet_mbps`, R04→카페 목적 이동.
multigen: M01→리스팅 단차·엘리베이터, M03→`daily_routine`, M04→리스팅 방/욕실 수, M05→`elder_outing`.
pet: P01→리스팅 `pets_allowed`, P03→`noise`, P04→동물병원 목적 이동, P05→`daily_routine`.
부분(partial) 항목의 한계: C02는 리스팅에 있는 금액 항목만 합산, F01은 school 이동(=아이 학교 앵커),
F05/M02는 clinic 이동으로 대조한다.

## Python 대비 패리티 (깨끗한 라벨 입력)

`tools/verify_checklist.py` 실행값(2026-10-30)을 테스트에 하드코딩. 6개 페르소나 전부
`passed true, must 1.0, weighted 1.0, missing []`로 JS와 일치. 반올림은 Python round-half-even과 동일하게 구현
(예: 3/24=0.125→0.12).

## 시도 로그 샘플 (young_family, 초안→3차 수정)

1. `검증 실패: 보고한 600,000원이 계산 650,000원과 달라요 1개, 근거 없는 숫자 1개, 커버리지 25%`
2. `검증 실패: 근거 없는 숫자 1개, 커버리지 50%`
3. `검증 실패: 누락 항목 있음, 커버리지 58%`
4. `검증 통과: 커버리지 83%`

3번 재시도 후에도 실패하면 `handoff = { ask_user: true, question_ko }`로 사용자에게 넘긴다
(`on_fail_after_retries: "escalate_to_user"`).

판단(judge) 항목은 마감 전까지 전부 미지원이라, "근거 없는 문장" 검사는 지원 judge 항목이
생긴 뒤에 발동한다(합성 항목으로 테스트済). 데모 로그의 실패 종류는 근거 없는 숫자·숫자 불일치·누락이다.

## 테스트

- `cd web && node --test tests/verify-*.test.js`: 76 pass, 0 fail.
- `npm test`: 1000 pass, 1 fail — `share.test.js`의 "result card on the real demo build" 1건으로,
  다른 단계의 변경 때문이며 verify 파일과는 무관하다(verify를 import하는 건 verify 테스트뿐).

## 16b — 오케스트레이터 최종 검증 수정 (2026-10-30)

16a를 Python 참조·실제 30일 런과 대조한 결과의 두 회귀를 수정. 브랜치 `verify-16a` 계속.

### 1. 한글 매칭: 참조와 같은 substring + exclude + 페르소나 타이브레이크

- 통단어 규칙은 1음절 한글 키워드로 복귀, 2음절 이상은 Python 참조와 같은 substring
  ("층간소음", "까지", "미끄럼" 모두 적중).
- 열린 감사 구멍은 데이터로 차단: `ground_truth.json`에 항목별 `exclude` 추가
  (F05·M02 `["병원비"]`, F02 `["투자"]`, C09 `["아침 식사", "아침 메뉴"]`).
  사용자 id·라벨·키워드·가중치·합격 조건은 불변.
- 타이브레이크: 공통 should와 페르소나 항목이 한 라인을 놓고 충돌하면 페르소나 항목이
  차지 ("유모차로 엘리베이터…" → F04, "욕실 낙상 위험" → M03). 공통 must는 여전히
  페르소나 should를 이긴다 ("층간소음이 심한지" → C03). "엘리베이터 대기" young_family는
  C09 → F04로 변경.

자연 체크리스트 (Python vs JS, `web/tests/fixtures/verify-natural.json`):

| persona | Python passed / must / weighted | JS passed / must / weighted |
|---|---|---|
| young_family | true / 1.0 / 0.88 | true / 1.0 / 0.8 |
| newlywed_couple | false / 1.0 / 0.73 | false / 1.0 / 0.73 |
| multigen_family | false / 1.0 / 0.79 | false / 1.0 / 0.75 |
| pet_owner | false / 1.0 / 0.75 | false / 1.0 / 0.75 |
| remote_worker | false / 1.0 / 0.75 | false / 1.0 / 0.75 |

JS weighted가 낮은 것은 일대일 매칭 탓으로 전부 0.1 이내
(young: F06이 3번 라인을 C03에, C09가 7번 라인을 F04에 내줌, −0.08;
multigen: C09, −0.04; 나머지 3종은 Python과 동일).
16a 감사 트랩은 전부 여전히 미적중 (병원비·안전한 투자·아침 식사 메뉴는 exclude로,
향후·방향·짐작·parking·recall·부정·샐러드는 기존 규칙으로).
"주차장(parking)"은 주차로 C09에 적중하는데 Python 참조와 동일하다
(주차는 C09의 정당한 키워드이고, 트랩이던 F03 "park"는 여전히 차단).

### 2. 엔진값: 가구 door-to-door

- 가구원 = `totals.per_member` 키 중 시뮬레이션 이웃 제외 (run의 `household`/`background`
  플래그 우선, 없으면 `b` 접두사).
- C01 = 통근하는 가구원의 편도 door-to-door 평균
  (`commute_walk_minutes + commute_ride_minutes` / 편도 통근 수),
  편도 = 해당 구성원의 `purpose: "commute"` 이동과 `kind: "ride"` 외출이 찍힌
  (day, 오전|오후) distinct (오전 = 12:00 이전). N01은 구성원별 동일 값.
  C05/F01/F03/F05/M02/P02는 가구원 이동만 평균.
- 실측: `demo-two-homes-A` C01 42.7, `demo-two-homes-B` C01 16.5,
  `persona-newlywed-couple-B` N01 h1 46.5, `persona-dual-income-child-A` C01 42.7.
  손계산 러티니 (도보 10 + 지하철 30 + 도보 5 편도, 왕복) → C01 45.
- `verifyReport`로 dual-income-child-A에 C01 43.6분 주장 → 숫자 실패 없음,
  10.3분(이웃 평균 시절 값) 주장 → 숫자 실패 1건.

### 매치하지 못한 것

- 없음. 자연 체크리스트 5종 전부 passed·must 일치, weighted 0.1 이내.
  엔진값 4종 전부 정확히 일치.

### 테스트

- `cd web && node --test tests/verify-*.test.js`: 99 pass, 0 fail.
- `npm test`: 1023 pass, 1 fail — stage 15의 `share.test.js`
  "result card on the real demo build" 1건만이며 verify와 무관.
