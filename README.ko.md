<h1 align="center">Ithaca</h1>

<p align="center"><sub>(이전 이름 homeless-society-sim)</sub></p>

<p align="center"><b>The Pre-living Agent for Your Next Home</b><br><i>“We walk the odyssey. You just come home.”</i></p>

<p align="center"><b>계약하기 전에, 그 집에서 먼저 살아 보세요.</b><br>AI 가족이 후보 집마다 30일을 먼저 살아 보고, 매물 사진과 지도, 30분짜리 집 구경으로는 안 보이는<br>"살아 봐야 아는 문제"를 찾아내요.</p>

<p align="center">
  <img src="https://img.shields.io/badge/Meta_Global_AI_Hackathon-Build_for_Your_World-2f5d50?style=flat-square" alt="Meta Global AI Developer Hackathon, Build for Your World">
  <img src="https://img.shields.io/badge/Muse_Spark-1.3-2f5d50?style=flat-square" alt="Muse Spark 1.3">
  <img src="https://img.shields.io/badge/code_written_by-Muse_Code-2f5d50?style=flat-square" alt="제품 코드는 모두 Muse Code가 작성">
  <img src="https://img.shields.io/badge/tests-2225_JS_·_266_Python-2f5d50?style=flat-square" alt="JS 테스트 2225개, Python 테스트 266개">
  <img src="https://img.shields.io/badge/engine-deterministic-2f5d50?style=flat-square" alt="결정적 엔진">
  <a href="https://github.com/halo-sw/ithaca/actions/workflows/ci.yml"><img src="https://github.com/halo-sw/ithaca/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2f5d50?style=flat-square" alt="MIT 라이선스"></a>
</p>

<p align="center">
  <a href="https://halo-sw.github.io/ithaca/"><img src="https://img.shields.io/badge/바로_써_보기-live-2f5d50?style=for-the-badge" alt="바로 써 보기"></a>
  &nbsp;
  <a href="#빠른-시작"><img src="https://img.shields.io/badge/직접_실행-빠른_시작-2f5d50?style=for-the-badge" alt="직접 실행하기"></a>
  &nbsp;
  <a href="briefs/"><img src="https://img.shields.io/badge/Muse_Code-작업_기록-e8e4da?style=for-the-badge&labelColor=2f5d50" alt="Muse Code 작업 기록"></a>
  &nbsp;
  <a href="README.md"><img src="https://img.shields.io/badge/English-README-e8e4da?style=for-the-badge&labelColor=2f5d50" alt="English README"></a>
</p>

<p align="center"><sub>공개 사이트: <a href="https://halo-sw.github.io/ithaca/">https://halo-sw.github.io/ithaca/</a> — Muse와 VWorld 지도는 키를 서버에만 두는 작은 중계 서버를 거쳐요. 중계 서버를 못 쓰면 대화는 규칙 모드로 답하고 그렇게 표시해요.</sub></p>

<p align="center">
  <a href="#2분-안에-심사하기">2분 심사</a> ·
  <a href="#meta-ai-사용">Meta AI 사용</a> ·
  <a href="#구조">구조</a> ·
  <a href="#이렇게-작동해요">작동 방식</a> ·
  <a href="#갤러리">갤러리</a> ·
  <a href="#하는-일">하는 일</a> ·
  <a href="#meta-모델">Meta 모델</a> ·
  <a href="#검증">검증</a> ·
  <a href="#muse가-만들었어요">Muse가 만든 과정</a> ·
  <a href="#빠른-시작">빠른 시작</a> ·
  <a href="#한계">한계</a> ·
  <a href="#앞으로">앞으로</a>
</p>

## 2분 안에 심사하기

1. **공개 사이트 열기:** <https://halo-sw.github.io/ithaca/>. 브라우저 언어가 한국어가 아니면 영어로 시작해요(`?lang=ko`로 한국어).
2. **입력 없이 먼저 보기.** 첫 화면에서 **기록된 한 달 보기**를 누르세요. 2026-10-31에 기록한 실제 Muse Spark 1.3 대화를 키 없이 한 단계씩 재생해요. Meta 본사 출근, 1 Hacker Way 근처 실제 아파트, 2곳 담기, 집마다 30일, 일기까지 보여 줘요.
3. **직접 해 보기.** **Meta 본사 출근으로 해 보기**를 누르면 실제 아파트 6곳이 지도에 떠요. 집마다 항공사진, Zillow ZIP 월세 추정, 자전거·걷기 분이 붙어요. *"1번이랑 2번 담아 줘"* → *"두 집에서 살아 봐 줘"* 라고 하면 Muse가 두 집에서 30일씩 살고 일기를 써요. 일기 문장은 보여 주기 전에 하나하나 기록과 대조해요.
   - **키는 필요 없어요.** 사이트가 중계 서버로 Muse를 불러서 키를 넣을 일이 없어요.
   - **Muse를 못 쓰면**(중계 서버가 멈추거나 하루 한도에 닿으면) 머리글에 **규칙 모드**가 뜨고 대화에서도 알려 줘요. 숫자는 그때도 결정적 엔진이 계산하고, 기록된 한 달은 한 번 누르면 볼 수 있어요.
   - **로컬에서는** `docker compose up`으로 같은 앱이 돌아가요([빠른 시작](#빠른-시작)).
4. **증거 확인.**

| 주장 | 숫자 | 자세히 |
|---|---|---|
| 숫자는 모델이 만들지 않아요 | 모든 분·원은 결정적 엔진이 계산하고, 도구 결과에 없는 숫자를 쓴 답은 반려돼요 | [검증](#검증) |
| 모델이 바뀌어도 판단이 같아요 | Spark 1.3과 Spark Open이 같은 판단 지점 **139곳 중 120곳(86 %)** 에서 같은 선택 | [Meta 모델](#meta-모델) |
| 가드가 실제 실행에서 버텨요 | 모델마다 판단 **154개 모두** 답함, 가드 대체 **0건** | [Meta 모델](#meta-모델) |
| 일기 문장을 검사해요 | 문장마다 실행 기록의 사실을 인용해야 하고, 기록에 없는 숫자는 돌려보내 다시 쓰게 해요. 2026-10-31 실제 영어 실행(판교, 집 2곳): 일기 8문장 모두 기록과 일치(1번 고쳐 씀) | [검증](#검증) |
| 테스트 | JavaScript **2,225**개, Python **266**개, PR과 main 푸시마다 CI | [CI](https://github.com/halo-sw/ithaca/actions/workflows/ci.yml) |

<p align="center">
  <img src="briefs/img/19-chat.jpg" width="760" alt="대화 화면. 왼쪽은 대화와 후보 집 목록이에요. 줄마다 지도 번호, 이름, 실거래 전세 가격, 면적·연식, 예상 출퇴근 시간이 있고, 두 집이 A·B로 담겨 있어요. 오른쪽은 도로와 노선 색 지하철이 그려진 밝은 지도에 회사 · 판교 표시, 후보마다 가격 말풍선(A·B는 파란색), 출퇴근 분이 있어요. 지도 아래 줄에 담은 두 집과 버튼 하나, 이 집들로 30일 살아 보기가 있어요.">
</p>

<p align="center"><sub>한 문장으로 시작해서, 지도 위 실제 후보 중 두 곳을 담고, 버튼 하나로 살아 봐요. 실제 GPU 캡처, 2026-10-30.</sub></p>

---

사람들은 인생에서 가장 비싼 결정을 사진 몇 장과 30분짜리 집 구경으로 해요. 한국의 사회초년생, 결혼을 앞둔 커플, 어린 자녀가 있는 가족에게는 가장 위험한 결정이기도 해요. 전세사기 피해자의 약 75%가 20·30대예요(2025년 3월 보도, 국토교통부 자료 인용). 이사해 본 사람이라면 누구나 살아 보고 나서야 그 집을 제대로 알게 된 경험이 있어요.

그래서 AI 가족이 먼저 들어가 살아요. 내 상황을 말하고, 실거래가에서 후보 집을 고르면, 가족이 실제 동네를 옮긴 3D 모형 위에서 A집과 B집에 각각 30일을 나란히 살아요. 일상의 선택은 Muse Spark가 하고 이유를 남겨요. 시간과 돈은 결정적 엔진이 1분, 1원까지 세요. 그다음 고객이 정한 우선순위로만 두 집을 비교하고, 모든 숫자에 출처나 "가정값" 표시를 붙여요. 앱은 보여 주고 설명할 뿐이고, 결정은 고객이 해요.

> 상태(2026-10-31): 개발 중이에요. 해커톤 기간은 2026-10-27 → 11-05이고, 첫 커밋은 2026-10-28이에요. 해커톤 이전에 만든 코드는 없어요. *준비 중*이라고 적힌 항목은 아직 만들지 않았어요.

## Meta AI 사용

모든 호출은 모듈 하나, [`web/src/judge/providers.js`](web/src/judge/providers.js)를 거쳐요. OpenAI 방식 chat completions를 `fetch`로 부르고, 키는 서버 환경 변수에서만 읽어요([`.env.example`](.env.example) 참고).

| 모델 | 엔드포인트 | 여기서 하는 일 | 코드 | 증거 |
|---|---|---|---|---|
| **Muse Spark 1.3** (`muse-spark-1.3`) | `https://api.meta.ai/v1` | 가구의 일상 선택과 이유, 도구를 부르는 상담 에이전트 | [`judge/run.js`](web/src/judge/run.js) → [`providers.js`](web/src/judge/providers.js) `complete`, [`consult/agent.js`](web/src/consult/agent.js) → `completeWithTools` | [실제 호출 3건](docs/evidence/muse-spark-1.3-2026-10-31.json), [기록된 판단 154개](scenarios/decisions/compare-1029/) |
| **Muse Spark Open** (`meta-models/muse-spark-open-1026`) | `https://inference.baseten.co/v1` (Baseten) | 같은 가구 판단, 스위치 하나 `--provider baseten` | 같은 모듈 | [실제 호출 3건](docs/evidence/muse-spark-open-2026-10-31.json), Spark 1.3과 139곳 중 120곳 같은 선택 |
| **Muse Code** (`muse-spark-1.3` 에이전트 모드) | Muse Code CLI | 단계별 지시서를 받아 이 저장소의 제품 코드와 테스트를 모두 작성 | — | [`briefs/`](briefs/) (단계마다 지시서 + 결과) |
| Muse Voice Transcribe | — | 말로 조건 입력 | *준비 중* | — |
| SAM 3.1 | — | 매물 사진에서 창문 면적 | *준비 중* | — |

Spark Open은 Baseten이 공개한 그대로 서빙해요. 서빙된 두 모델을 비교했을 뿐, 어느 쪽도 파인튜닝하지 않았어요.

## 구조

```text
ithaca/
├── pipeline/          Python: OSM 추출, 건축물대장 결합, 보행 그래프, 지하철망, 지형, 3D 상자
├── web/
│   ├── src/engine/    순수 JS 생활 엔진: 일과, 이유가 있는 이동, 짝지은 30일 실행(결정적, 시드 고정)
│   ├── src/judge/     Muse 호출: 판단 프롬프트, 숫자 가드, 정확히 다시 보기 위한 기록
│   ├── src/consult/   상담 에이전트: 도구 호출(extract_profile, find_homes, pick_homes, start_life_run …), 답변 가드
│   ├── src/verify/    보고서 검사: 정답 체크리스트, 숫자 주장, 재시도 루프
│   ├── src/money/     급여, 매매·전세·월세 공식, 실거래가 로더, 공공임대
│   ├── src/transit/   운영사 시간표와 구간 분
│   ├── src/render/    three.js 장면: 외벽, 지형, 도로, 나무, 차량, 보행자, 열차
│   ├── src/ui/        React 19 + Astryx(Meta 디자인 시스템)
│   ├── scripts/       CLI: simulate, money, judge, 정적 서버
│   └── tests/         node:test 묶음
├── relay/             키를 브라우저에 보내지 않는 서버: /api/consult, 지도 타일(Vercel 또는 docker compose)
├── scenarios/         커밋된 가구·집·기록된 Muse 판단
├── tests/             파이프라인 Python 테스트
├── Dockerfile, docker-compose.yml, package.json, .env.example
└── briefs/            Muse Code 단계마다 지시서 + 결과
```

**흐름**
1. **조건 정리.** 브라우저가 대화를 `/api/consult`(개발 서버 또는 중계 서버)로 보내요. 에이전트가 도구와 함께 Muse를 부르고, 도구 결과는 `web/src/engine`과 `web/src/money`가 계산해요.
2. **숫자 검사.** 답변 가드(`web/src/consult/guards.js`)는 도구 결과에 없는 숫자가 든 답을 돌려보내요.
3. **30일 살아 보기.** 엔진이 브라우저 워커(`web/src/sim-worker.js`)에서 두 집을 함께 돌려요.
4. **일기.** Muse가 실행 기록으로 일기를 쓰고, `web/src/consult/diary.js`가 줄마다 그 기록과 대조해요.
5. **가구 판단.** Muse는 판단 CLI(`web/scripts/judge.mjs`)로 가구의 선택을 내리고, 기록된 파일로 똑같이 다시 볼 수 있어요.

루트에서 `npm test`는 JS 테스트를, `npm run test:py`는 Python 테스트를 돌려요. CI는 PR마다, 그리고 main에 푸시할 때마다 둘 다 돌려요.

## 이렇게 작동해요

| | 단계 | 일어나는 일 | 상태 |
|---|---|---|---|
| 1 | **내 말로 상황 말하기** | "맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상". 상담 에이전트가 이 말을 가족 프로필로 정리해요. 고객이 말한 값에는 "내가 말한 값", 빈칸에는 "물어볼 값"이 붙어요. | 완료(글자 입력) · 음성 입력 *준비 중* |
| 2 | **실제 후보 집 받기** | 서울·경기 동남부 11개 지역의 실거래가에서 후보를 찾아요. 이동 시간은 운영사 시간표로, 공공임대는 LH·마이홈 API로 찾아요. 후보는 지하철 노선, 직장, 출퇴근 시간과 함께 지도에 보여요. | 완료 |
| 3 | **가족이 30일 동안 살아 보기** | 실제 도보 경로를 따라 출근하고, 장을 보고, 공원을 걷고, 병원에 가요. 두 집에서 동시에요. 같은 조건으로 10번씩 돌려서, 두 집의 차이가 운이 아니라 집 때문에 생긴 것인지 확인해요. | 완료 |
| 4 | **보여 주기 전에 리포트 검증하기** | 에이전트가 만든 체크리스트와 리포트를 정답 기준으로 채점해요. 숫자는 엔진 값과 맞아야 하고, 문장마다 시뮬레이션 사건을 근거로 달아야 해요. 통과하지 못하면 최대 3번 에이전트에게 돌려보내고, 그래도 안 되면 고객에게 물어봐요. | 완료(채점기·숫자 검사·재시도 루프) · 화면 *작업 중* |
| 5 | **근거를 보며 비교하기** | 시간, 피곤한 정도, 매매·전세·월세·공공임대 비용, 전세 위험 신호, 지원 제도, 공식 치안·교육 통계를 고객이 정한 우선순위로만 비교해요. 집마다 0~100 **내 기준 점수**를 보여 줘요. 고객이 정한 비중으로 계산한 주관적인 점수이고, 계산식은 한 번 누르면 보여요. | 완료 |

## 갤러리

<table>
  <tr>
    <td width="50%"><img src="briefs/img/19-landing.jpg" alt="3D 도시 위의 첫 화면. 제목 계약 전에, 그 집에서 30일 먼저 살아 봐요, 입력창 하나, 세 단계(말로 조건 말하기 › 지도에서 후보 2곳 담기 › 30일 살아 보고 비교), 가구 유형 예시 카드 셋과 매물 글 붙여 넣기 카드가 있어요."></td>
    <td width="50%"><img src="briefs/img/19-result.jpg" alt="A | B 표로 정리한 30일 결과 카드. 내 기준 점수 48과 52(중립 막대), 월 주거비 월 66만 8천 원과 월 64만 2천 원, 출퇴근 편도 11분과 14분, 'B가 편도 평균 4분 더 걸려요', 그리고 3D로 보기가 붙은 30일 동안의 순간이 있어요."></td>
  </tr>
  <tr>
    <td><sub><b>한 문장으로 시작해요.</b> 다음에 무슨 일이 일어나는지 첫 화면에서 알려 줘요. 조건을 말하고, 지도에서 후보 두 곳을 담고, 30일씩 살아 보고 비교해요.</sub></td>
    <td><sub><b>답부터 보여 줘요.</b> 두 집에서 30일씩 산 뒤 내 기준 점수, 월 주거비, 문 앞→회사 출퇴근을 나란히 먼저 보여 주고, 근거가 달린 순간이 이어져요. 어느 집이 낫다고 정하지 않아요.</sub></td>
  </tr>
  <tr>
    <td><img src="briefs/img/19-sim.jpg" alt="고른 집 천사의도시Ⅱ오피스텔에서 미금역으로 가는 나를 3D 동네에서 따라가는 화면. 오른쪽에 내 기준 점수 A 48 · B 52, 근거가 달린 순간 2개, 4분 남음, 하루 이동 목록이 있어요."></td>
    <td><img src="briefs/img/18-share.jpg" alt="고른 두 집의 결과 공유 카드. 집 이름과 면적, 내 기준 점수, 출근 방법, 출퇴근 편도 11분 대 14분, 지하철 탄 시간, 걸은 시간, 회사 도착할 때 피곤한 정도가 있어요."></td>
  </tr>
  <tr>
    <td><sub><b>한 사람 따라가기.</b> 지금 카드가 무엇을 하는지, 왜 하는지(생활 규칙, 이유가 달린 Muse 판단, 고객 입력), 어떤 기준이 적용됐는지, 얼마나 피곤한지 알려 줘요.</sub></td>
    <td><sub><b>공유할 수 있는 결과.</b> A와 B를 쉬운 말로 나란히 놓고, 결과 카드와 같은 숫자에 측정·가정값 표시를 붙여요. PNG는 브라우저 안에서 만들고 어디에도 올리지 않아요.</sub></td>
  </tr>
</table>

모든 이미지는 실행 중인 앱을 실제 GPU에서 캡처한 거예요. [`briefs/img/`](briefs/img/)에 있어요.

## 하는 일

| 영역 | 하는 일 | 근거 |
|---|---|---|
| **3D 동네** | 건물 윤곽, 높이, 층수, 단지, 도로, 지형, 공원, 나무를 역세권 60곳에 세우고, 건물 10,971동의 이동 경로 지도도 만들어요. 차, 사람, 열차는 규칙으로 움직여서 타임라인을 앞뒤로 옮겨도 어긋나지 않아요. | OpenStreetMap, 건축물대장·GIS건물통합정보, 지형 타일 |
| **30일 생활** | 성인 2명과 시뮬레이션 이웃 60명(시뮬레이션 주민이라고 표시)이 실제 도보 경로에서 살아요. 같은 시드를 넣으면 바이트 단위까지 같은 결과가 나와요. | 결정적 엔진, [`scenarios/criteria/kr-default.json`](scenarios/criteria/kr-default.json) |
| **Muse의 선택** | 판단 지점마다 엔진이 선택지를 내놓으면 Muse가 하나를 고르고 이유를 남겨요. 한 실행에서 Muse는 198번 판단했고, 그중 50번은 규칙 기본값과 다르게 골랐어요. 도구 결과에 없는 숫자가 답에 들어가면 검사 장치가 거절해요. | Muse Spark 1.3 |
| **출퇴근** | 집마다 출퇴근 경로를 따로 계산해요. 걷기, 노선별 탑승(운영사 시간표), 환승, 걷기 순서예요. 피곤한 정도는 역·방향·30분 단위로 실측한 혼잡도로 계산해요. | 서울교통공사 역간 소요시간·혼잡도 |
| **돈** | 연봉으로 실수령액을 구하고, 같은 면적의 최근 12개월 실거래로 매매·전세·월세·공공임대 각각 매달 집에 드는 돈을 계산해요. 교통비는 거리 비례로 계산하고, 걸어서 하는 출퇴근도 세고, 대출에는 한도를 둬요. | 국토교통부 실거래가 |
| **5~20년 동안 살 만한가** | 총지출, 이자, 묶이는 돈, 기회비용, 금리 시험, DSR을 보여 줘요. 집값 변화는 고객이 고른 시나리오로만 보여 주고 "가정 시나리오, 전망 아님"이라고 붙여요. | 고객 입력, 공개한 계산식 |
| **전세 안전 점검** | 전세가율, 건축물대장 신호, 링크가 달린 공식 6단계 체크리스트, 보증금을 돌려받지 못하는 모의 시뮬레이션을 보여 줘요. 신호와 다음 할 일만 알려 주고 판정하지 않아요. | 실거래가, 건축물대장, 인터넷등기소, HUG |
| **지원 제도** | 버팀목, 디딤돌, 신혼부부·청년·신생아 상품의 조건을 고객 숫자와 하나씩 비교하고, 공식 링크와 확인 날짜를 붙여요. "받을 수 있어요"라고 판정하지 않아요. | 주택도시기금 상품 페이지(2026-10-29 확인) |
| **실제 매물 확인** | 매물 글을 붙여 넣으면 글에 있는 값만 뽑아서, 그 가격이 지난 1년 실거래 중 어디쯤인지 보여 줘요. 누르면 C집으로 넣어 살아 볼 수 있어요. | 실거래가. 민간 매물 사이트는 수집하지 않아요 |
| **상담 에이전트** | 도구 20개 이상을 가진 떠 있는 대화창이에요. 조건을 정하고, 돌리고, 비교하고, 설명하고, 출처를 달고, 이야기하는 장면으로 3D 화면을 옮겨요. | Muse Spark 1.3 |
| **쉬운 말** | 숫자마다 일상 한국어로 뜻을 적고 "어떻게 계산했나요?"를 달아요. 화면에 설명 없는 전문 용어가 있으면 테스트가 잡아내요. | [`docs/copy-guide.md`](docs/copy-guide.md) |

## Meta 모델

모델마다 맡은 일이 하나씩 있어요. 숫자는 절대 모델이 만들지 않아요.

| 모델 | 제품에서 맡은 일 | 상태 |
|---|---|---|
| **Muse Spark 1.3** | 가족의 일상 선택과 이유, 상담 에이전트, 그리고 이 레포를 작성한 코딩 에이전트(Muse Code) | 완료 |
| **Muse Spark Open** (Baseten의 `meta-models/muse-spark-open-1026`) | 오픈 웨이트 모델로 같은 가족 판단을 해요. 스위치 하나로 바꿔요(`--provider meta\|baseten`). 아래에 Spark 1.3과 비교했어요 | 완료(비교) |
| 판정자 역할의 Muse Spark | 리포트 문장마다 인용한 시뮬레이션 사건이 그 문장을 뒷받침하는지 확인해요 | *작업 중* |
| Muse Voice Transcribe | 말로 시작하기: 가족과 직장을 글 대신 말로 입력해요 | *준비 중* |
| SAM 3.1 | 매물 사진과 도면에서 방 크기와 창 면적을 재요 | *준비 중* |

## 검증

에이전트가 만든 결과는 고객에게 보여 주기 전에 코드가 먼저 확인해요.

- **정답 기준.** 가족 유형마다 꼭 다뤄야 할 항목 목록이에요. 공통 9개(통근·통학 시간, 월 주거비 총액, 소음은 *필수*, 채광, 생필품 접근성, 귀갓길 안전, 수납, 하자, 아침 동선은 *권장*)와 유형별 5~6개로 되어 있어요.
- **두 가지 검사.** *결정적* 항목(통근 시간, 주거비, 어린이집·공원 거리)은 엔진이 계산한 값과 정해 둔 오차 안에서 맞아야 해요. *판정* 항목(소음, 안전, 수납)은 시뮬레이션 사건을 하나 이상 근거로 달아야 해요.
- **통과 기준.** *필수* 항목을 모두 다루고, 가중 커버리지가 80% 이상이어야 해요(*필수* 3점, *권장* 1점). 통과하지 못하면 이유를 붙여 최대 3번 에이전트에게 돌려보내고, 그다음에는 고객에게 물어봐요.
- **모르는 건 모른다고 해요.** 엔진이 아직 근거를 댈 수 없는 항목은 "미지원"으로 보여 주고 통과로 치지 않아요. 지금 시나리오가 있는 가족 유형은 맞벌이+미취학 자녀 가족과 맞벌이 신혼부부 2개예요. 1인 재택근무자, 3세대 가족, 반려견 가구는 체크리스트만 채점해요.
- **실제 거주자 비교** *(준비 중)*. 실제 거주자 10~20명의 집과 살아 보고 알게 된 불편을 시뮬레이터 결과와 비교해서 일치율을 낼 거예요.

상태: 채점기, 숫자·근거 검사, 재시도 루프가 `main`에 들어갔어요(16a·16b 단계, 테스트 99개). 팀이 직접 쓴 정답 기준 파일과 참조 채점 코드로 확인했어요. 자연스러운 체크리스트에서 JS 채점기는 Python 참조와 통과 여부·*필수* 커버리지가 같고, 실제 문 앞→회사 출퇴근을 쓴 리포트는 통과, 틀린 숫자를 쓴 리포트는 실패해요. 검증 과정을 화면에 보여 주는 부분은 작업 중이에요.

## Muse가 만들었어요

이 레포의 제품 코드, 테스트, 파이프라인 스크립트는 한 줄도 빠짐없이 **Muse**(`muse-spark-1.3`, Muse Code 에이전트 모드)가 작성했어요. 사람과 조율 담당 어시스턴트는 단계별 지시서 작성, 데이터 내려받기, 테스트 실행, 실제 GPU 캡처, git 작업을 했어요. 단계마다 지시서와 결과 기록이 [`briefs/`](briefs/)에 있고, 규칙은 [`AGENTS.md`](AGENTS.md)에 있어요. Muse가 쓰지 않은 파일도 밝혀 둬요. 영어 문구표 `web/src/i18n/en.js`·`en-table.js`·`en-words.js`는 조율 담당 어시스턴트가 쓴 번역 내용이에요(번역 엔진 `translate.js`는 Muse 작성). 검증 정답 `scenarios/verify/ground_truth.json`과 기준 채점기 `tools/verify_checklist.py`는 팀이 Muse 채점기를 확인하려고 직접 만들었어요.

| 층 | 위치 | 내용 |
|---|---|---|
| 데이터 파이프라인(Python) | `pipeline/` | OSM 추출, 건축물대장 결합, 도보 그래프, 지역, 지하철망, 지형과 장면 상자 |
| 생활 엔진(JS, 순수 함수) | `web/src/engine/` | 생활 규칙, 판단, 원인이 붙은 이동, 짝 실행, 돈 흐름, 기준 불러오기 |
| Muse 판단 층 | `web/src/judge/` | 판단 프롬프트, 숫자 검사, 똑같이 다시 재생하기 위한 판단 기록 |
| 상담 에이전트 | `web/src/consult/` | Meta API로 보내는 OpenAI 방식 도구 호출. 서버에서만 실행해서 키가 브라우저에 가지 않아요 |
| 돈과 가격 | `web/src/money/` | 급여 표, 계약 형태별 계산식, 실거래 불러오기, 공공임대 연결 |
| 대중교통 | `web/src/transit/` | 운영사 시간표, 구간별 탑승 시간, 요금 |
| 3D 장면과 움직임 | `web/src/render/`, `web/src/scene/`, `web/src/motion/` | three.js 0.170: PBR 외벽, 지형, 도로, 나무, 규칙으로 움직이는 차·사람·열차 |
| 화면 | `web/src/ui/` | React 19 + **Astryx**(Meta의 디자인 시스템) |

**같은 가족으로 비교한 Spark 1.3과 Spark Open**(2026-10-29, `reasoning_effort` low, 파일은 [`scenarios/decisions/compare-1029/`](scenarios/decisions/compare-1029/)):

| | Spark 1.3 | Spark Open |
|---|---|---|
| 판단 수(A + B) | 154번, 모두 답함, 검사 탈락 0 | 154번, 모두 답함, 검사 탈락 0 |
| 같은 판단 지점에서 같은 선택 | 139번 중 120번(86%) | |
| 규칙 기본값과 다른 선택(154번 중) | 75 | 72 |
| 호출당 평균 응답 시간 | 3.7초 | 2.7초 |
| 출력 토큰(A + B) | 14만 | 9.6만 |

둘이 다르게 고른 곳은 대부분 퇴근길에 어느 가게에 들를지였어요(19번 중 15번). 생각 길이를 제한하지 않으면 Spark Open은 154번 중 116번에서 2,000토큰을 생각하는 데 다 써 버렸어요. `reasoning_effort: low`로 두니 모두 답했어요.

## 빠른 시작

**가장 빠른 방법: Docker.** 키가 없어도 돼요.

```bash
cp .env.example .env    # 선택: 실제 Muse를 쓰려면 META_API_KEY를 채워요 (MODEL_API_KEY도 돼요)
docker compose up       # 웹 http://localhost:8080, 중계 서버 :8787
```

- 공개 사이트와 같은 정적 사이트를 만들고, [`data-v1` 릴리스](https://github.com/halo-sw/ithaca/releases/tag/data-v1)의 미리 만든 데이터를 넣어요.
- 키가 없으면 머리글에 **규칙 모드**가 뜨고, 대화에서도 한 번 알려 줘요. 숫자는 그대로 엔진이 계산해요.
- 루트에서 `npm test`를 실행하면 JS 테스트가 돌아요.

**소스에서 직접.** 필요한 것: Node 20 이상, Python 3.12, 원본 데이터용 디스크 약 6GB.

```bash
# 1. Python 파이프라인
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
# data/raw/에 south-korea-latest.osm.pbf(Geofabrik)를,
# data/raw/buildings/<region>/에 GIS건물통합정보 shapefile을 넣어요 (ATTRIBUTION.md 참고)
.venv/bin/python -m pipeline build --all
.venv/bin/python -m pipeline.validate --all

# 2. 시뮬레이션 실행
cd web && npm install && cd ..
node web/scripts/simulate.mjs --scenario scenarios/demo-two-homes.json --home both --out data/build/sim/
node web/scripts/money.mjs   --scenario scenarios/demo-two-homes.json --out data/build/sim/

# 3. 앱 (상담 에이전트와 실시간 판단에는 서버 환경에 Meta API 키가 필요해요)
cd web && META_API_KEY=... npm run dev
```

자주 쓰는 주소(`/?mode=sim&scenario=demo-two-homes` 뒤에 붙여요):

| 주소 | 보여 주는 것 |
|---|---|
| `&tour=demo` | 3분 안내 투어 |
| `&home=A&day=1&t=08:50&follow=1` | 출근길 따라가기 |
| `&tab=money` | 생활비 |
| `&tab=listings&fill=example` | 매물 확인(예시라고 표시한 예시 포함) |
| `&tab=money&share=1` | 결과 카드 |
| `&tab=criteria` | 기준 |

`/`는 대화로 시작하는 첫 화면이고, `/?area=seongsu&shot=3&time=18:30`은 동네 둘러보기예요.

원본 데이터와 빌드 데이터는 커밋하지 않아요. 위 스크립트로 다시 만들 수 있어요. 실거래 CSV, 공공주택 스냅샷, 지하철 혼잡도 파일은 운영자가 직접 받아 로컬에만 둬요. 각 데이터의 이용 조건 때문이에요.

## 한계

**일부러 하지 않는 것.** 집값 전망은 하지 않아요(집값 변화는 고객이 고른 시나리오로만, 가정값이라고 표시해요). 사라/사지 말라, 계약하라/하지 말라고 조언하지 않아요. 대출이나 지원 제도를 받을 수 있다고 판정하지 않아요. 특정 집이나 집주인이 "안전/위험"하다고 판정하지 않아요. 치안이나 학교를 하나의 점수로 묶지 않고, 주민 구성을 분석하지 않고, 기본 "최고의 집" 순위를 매기지 않고(점수는 고객이 정한 비중으로 계산한 주관적인 내 기준 점수 하나뿐이에요), 직선거리로 출퇴근 시간을 말하지 않아요. 가정한 값은 가정값이라고 밝혀요. 법률·금융 자문이 아니에요.

**알려진 문제.**
- 시나리오가 있는 가족 유형은 2개뿐이에요. 엔진에 아직 소음, 늦은 귀가, 택배, 수납, 아침 혼잡 같은 사건이 없어서 해당 체크리스트 항목은 "미지원"으로 보여요.
- 신분당선은 공개 혼잡도 데이터가 없어서 70%라는 가정값을 밝히고 써요.
- Apple GPU(ANGLE Metal)에서 `?q=high`가 검게 나와요. 앱이 이를 감지해서 medium으로 바꿔요.
- 일부 급여 공제율과 보유 비용(취득세, 중개수수료, 재산세…)은 `needs_confirmation`으로 표시돼 있어요. 공식 페이지로 채우기 전까지는 "아직 계산에 넣지 않은 것"에 보여 줘요.
- 성남시 범죄 통계는 시 단위이고 서울은 구 단위예요. 숫자마다 단위를 함께 보여 줘요.
- 공공주택 공고 API에는 마감일 항목이 없어서 "최근 공고"로 보여 주고 원문 링크를 달아요.

## 앞으로

마감: 2026-11-05 11:00(한국 시간).

**이번 제출에 넣을 것**

| 날짜 | 계획 |
|---|---|
| 10-30 ✓ | 검증 루프(16), 내 기준 점수 앞에 보여 주기, 그림 같은 화면, 고객이 고른 집 끝까지 + 후보 지도(17–18) |
| 10-31 → 11-02 | 검증 화면, 영어 화면·자막 |
| 11-03 | 마무리, 밤에 기능 동결 |
| 11-04 | 3분 영상, README 마무리 |
| 11-05 | 오전 9시까지 제출 |

**준비 중** (이번 제출에는 넣지 않아요): 음성으로 시작하기, 매물 사진·도면에서 방과 창 재기(SAM 3.1), Spark Open으로 움직이는 가족 에이전트, 실제 거주자 비교, 엘리베이터 대기·층간소음 같은 생활 사건, 재택근무자·3세대·반려견 가구 시나리오.

<details>
<summary><b>결과 예시</b> (데모 부부, 입력은 임시값)</summary>

<br>

| | A집 · 잠실 레이크팰리스 59.97㎡ | B집 · 판교 백현마을 84.82㎡ |
|---|---|---|
| 실거래 중간값(최근 12개월) | 매매 26.5억 / 전세 9.8억 / 월세 4억 + 200만 | 매매 25.2억 / 전세 9.5억 / 월세 4.5억 + 200만 |
| 전세로 살면 매달 집에 드는 돈 | 260만 원 | 250만 원 |
| 월급에서 집에 나가는 비율 | 36% | 35% |
| 보증금이 집값의 몇 %인지(전세가율) | 37% | 37.7% |
| 출근 방법(직장은 판교역 근처, 가정값) | 걷기 → 2호선 → 신분당선 → 걷기 | 걷기 |
| 30일 동안 지하철 탄 시간 | 44시간 | 0 |
| 30일 동안 걸은 시간 | 27.8시간 | 38.0시간 |
| 회사 도착할 때 피곤한 정도(공개한 모델, 0–100) | 25.3 | 5.7 |
| 가장 붐빈 구간 | 2호선 93%(실측) | — |
| 30일 동안 저녁에 집에 있던 시간(18–24시) | 323시간 | 343시간 |
| 30일 동안 공원 / 장보기 | 10 / 33 | 26 / 17 |

가정한 입력: 세전 연봉 6,000만·5,000만 원, 현금 2억 원, 대출 금리. 화면에도 모두 가정값이라고 표시해요. 이 숫자는 15단계 이전 값이에요. 15단계부터는 같은 면적끼리 비교하고 걸어서 하는 출퇴근도 세요. 표는 차이를 보여 줄 뿐이고, 무엇이 더 중요한지는 고객이 정해요.

</details>

<details>
<summary><b>진행 기록</b> (Muse가 단계별로 만든 것)</summary>

<br>

| 단계 | Muse가 만든 것 | 지시서 → 결과 |
|---|---|---|
| 1–2 | 데이터 파이프라인, 3D 장면, 건축물대장 조회 | [`briefs/01…02b`](briefs/) |
| 3 | 결정적 30일 생활 엔진 | [`03-RESULT`](briefs/03-RESULT.md) |
| 4 | Muse 판단 층(실제 판단 198번, 숫자 검사) | [`04-RESULT`](briefs/04-RESULT.md) |
| 5 | Astryx 화면, 상담 에이전트, PBR 렌더링 | [`05a`](briefs/05a-RESULT.md), [`05b`](briefs/05b-RESULT.md) |
| 6 | 연봉 기반 생활비, 실거래가, 공공임대 | [`06-RESULT`](briefs/06-RESULT.md) |
| 7 | 지금 카드, 원인, 강조, 기준, 그림자 수정 | [`07-RESULT`](briefs/07-RESULT.md) |
| 8 | 이동 화면, 이동 경로 지도, 혼잡도 피로(+8b/8c 수정) | [`08-RESULT`](briefs/08-RESULT.md) |
| 9a | 상황별 시작, 고객 우선순위, 공식 치안·교육 통계 | [`09a-RESULT`](briefs/09a-RESULT.md) |
| 9b | 살 만한가 계산, 전세 안전 점검, 모의 보증금 손실, 지원 제도 | [`09b-RESULT`](briefs/09b-RESULT.md) |
| 9c | 집마다 다른 출퇴근, 탑승을 하나의 이동으로, 차분한 카드 | [`09c-RESULT`](briefs/09c-RESULT.md) |
| 10 | 쉬운 말, 떠 있는 Astryx 에이전트, 매물 확인, 공공 공고, 공유 카드, 데모 투어 | [`10-RESULT`](briefs/10-RESULT.md) |
| 10b | 수정: React 스냅숏 반복, 투어 NaN, 렌더 연기 테스트 | [`10-RESULT`](briefs/10-RESULT.md#stage-10b--whole-ui-react-loop--tour-nan-muse) |
| 11–11b | 에이전트 창 위치, 잘리지 않는 글자, A/B 숫자가 있는 공유 카드, 색 표, 탑승 바탕 지도 | [`11-RESULT`](briefs/11-RESULT.md) |
| 12a–12a2 | 11개 지역, 고객 숫자, 실제 후보 집, 9개 노선 시간표 기반 탑승 시간 | [`12a`](briefs/12a-RESULT.md), [`12a2`](briefs/12a2-RESULT.md) |
| 12b | 질문으로 시작하기, 대화, 집 미리보기, 하루 타임라인 | [`12b-RESULT`](briefs/12b-RESULT.md) |
| 13d–13e | 겹치지 않는 배치, 안내형 입력, 후보 카드, 서울·경기 지도 | [`13d`](briefs/13d-RESULT.md), [`13e`](briefs/13e-RESULT.md) |
| 14–14b | 역세권 60곳의 지형, 도로, OSM 나무. 규칙으로 움직이는 차·사람·열차 | [`14`](briefs/14-RESULT.md), [`14b`](briefs/14b-RESULT.md) |
| 15 | 엔진 정확도: 10번 짝 실행, 가구 공통 생활비, 걷는 출퇴근 포함, 거리 비례 요금, 같은 면적 비교, 대출 한도 | [`15 지시서`](briefs/15-engine-integrity.md) |
| 16a–16b | 내장 검증: Python과 같은 체크리스트 채점, 문 앞→회사 엔진 값으로 숫자 검사, 재시도 루프 | [`16a-RESULT`](briefs/16a-RESULT.md) |
| 17–17d | Ithaca 이름, 내 기준 점수 앞에, 순간 기록, 그림 같은 화면(따뜻한 빛·윤곽선·불 켜진 밤·시간대별 밝기) | [`17-RESULT`](briefs/17-RESULT.md) |
| 18–18g | 고객이 고른 집 끝까지(자기 돈 계산·점수·공유 카드), 막히지 않는 흐름, 읽기 쉬운 결과, 하나로 통일한 출퇴근 숫자, 실제 선로가 그려진 후보 지도 | [`18-RESULT`](briefs/18-RESULT.md) |
| 19–19j | UI 전면 개편: 대화·지도 두 칸과 지도 위 실행 버튼 하나, 도로와 가격 말풍선이 있는 밝은 지도, 한눈에 보이는 후보 줄, A·B 표 결과 카드, 크기 고정 열차 표시, 나·배우자 이름, 세 단계를 보여 주는 첫 화면, 클릭을 막던 투명 창·순간 링크·소수 분 표시 수정 | [`19a`](briefs/19a-chat-layout.md) … [`19j`](briefs/19j-float-remain.md) |
| 20a–20g | 사용자 피드백으로 3D 화면 다시 만들기: 카메라를 움직여도 우글거리지 않게(원래 해상도, 계단 없애기, 한 겹 도로), 건물·단지·생활 장소 이름표와 건축물대장 카드, 이 장면이 결과에 어떻게 들어가는지("오늘 출근 44분 = 걷기 14분 + 지하철 26분 + 기다림 4분"), 저장하지 않는 개발 서버 중계로 VWorld 항공사진을 땅과 지붕에 입히고 출처 표시, 따라가면서 확대·회전, 동네 전체·따라가기 버튼, 길과 목적지 표시, 지금 장면 먼저인 패널, 정수 분 | [`20a`](briefs/20a-no-shimmer.md) … [`20g`](briefs/20g-wheel-delta.md) |
| 21a–21c | 처음 온 사용자가 자기 문장으로 끝까지 쓸 수 있게: 강남역으로 읽기(으로 먼저), 집 유형(오피스텔) 반영, 말한 건 다시 묻지 않고 한 번에 한 질문, 회사 위치 없이는 실행하지 않음(역 자동완성 또는 출근 안 해요), 틀린 "같아요" 제거, 보이는 숫자로 출퇴근 문장, 지번 이름 읽기 쉽게, 지도 말풍선 겹침 없음·역 이름·가까운 후보에 맞춘 확대 | [`21a`](briefs/21a-first-user-flow.md) … [`21c`](briefs/21c-map-fit.md) |
| 22a–22c | GitHub Pages 공개 사이트: 공개 경로를 따르는 데이터 주소와 링크, /api 호출 없는 정적 모드(모델·VWorld 키는 브라우저에 가지 않음), 실행 데이터는 Release 파일로 배포(커밋 안 함), 배포용 빌드에서 채팅 계산 worker가 묶이지 않던 버그 수정 | [`22a`](briefs/22a-github-pages.md) … [`22c`](briefs/22c-chat-worker-build.md) |

</details>

<details>
<summary><b>데이터 출처</b></summary>

<br>

OpenStreetMap(ODbL, Geofabrik 경유) · GIS건물통합정보와 건축물대장(국토교통부 / VWorld / 건축HUB) · 국토교통부 실거래가 공개시스템 · 공공주택 데이터 API(LH · 마이홈) · 서울교통공사 지하철혼잡도정보(공공누리 3유형)와 역간 소요시간 · 경찰청 범죄 발생 지역별 통계(2025) · 주택도시기금 상품 페이지(nhuf.molit.go.kr, 2026-10-29 확인) · 공식 전세 체크리스트 사이트(인터넷등기소, 정부24, HUG 안심전세포털, 국세청). 자세한 이용 조건은 [`ATTRIBUTION.md`](ATTRIBUTION.md)에 있어요.

</details>

## 라이선스

코드는 [MIT](LICENSE)예요. 데이터, 사진, 폰트는 각자의 라이선스를 따르고, [`ATTRIBUTION.md`](ATTRIBUTION.md)에 정리돼 있어요.
