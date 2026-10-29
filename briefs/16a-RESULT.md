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
