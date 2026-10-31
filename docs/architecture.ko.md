# 구조

[← README](../README.ko.md) · [English](architecture.md)

```text
ithaca/
├── pipeline/          Python: OSM 추출, 건축물대장 결합, 보행 그래프, 지하철망, 지형, 3D 상자
├── web/
│   ├── src/engine/    순수 JS 생활 엔진: 일과, 이유가 있는 이동, 짝지은 30일 실행(결정적, 시드 고정)
│   ├── src/judge/     Muse 호출: 판단 프롬프트, 숫자 가드, 정확히 다시 보기 위한 기록
│   ├── src/consult/   상담 에이전트: 도구 호출(extract_profile, find_homes, pick_homes, start_life_run …), 답변 가드, 음성 받아쓰기
│   ├── src/verify/    보고서 검사: 정답 체크리스트, 숫자 주장, 재시도 루프
│   ├── src/money/     급여, 매매·전세·월세 공식, 실거래가 로더, 공공임대
│   ├── src/transit/   운영사 시간표와 구간 분
│   ├── src/render/    three.js 장면: 외벽, 지형, 도로, 나무, 차량, 보행자, 열차
│   ├── src/ui/        React 19 + Astryx(Meta 디자인 시스템)
│   ├── scripts/       CLI: simulate, money, judge, 정적 서버
│   └── tests/         node:test 묶음
├── relay/             키를 브라우저에 보내지 않는 서버: /api/consult, /api/voice/transcribe, 지도 타일(Vercel 또는 docker compose)
├── scenarios/         커밋된 가구·집·기록된 Muse 판단
├── tests/             파이프라인 Python 테스트
├── Dockerfile, docker-compose.yml, package.json, .env.example
└── briefs/            Muse Code 단계마다 지시서 + 결과
```

## 시스템 지도

각 부분이 어디서 돌아가는지 보여 줘요. 브라우저는 모델 키를 갖지 않아요. Muse 호출은 모두 중계 서버를 거쳐요.

```mermaid
flowchart TB
  subgraph BR["브라우저 · React 19 + Astryx"]
    CHAT["채팅<br/>ui/chat.jsx"]
    MAP["지도 · 후보 카드 · 3D<br/>ui/ · render/"]
    WK["sim-worker.js<br/>30일 엔진 · 같은 조건 10회"]
    RC["ReportCheck<br/>검증 과정 · 반려 이유 · 미지원"]
  end
  subgraph RL["중계 서버 · relay/handler.js (Vercel 또는 docker) · 키는 여기에만"]
    SV["consult/server.js<br/>POST /api/consult"]
    AG["agent.js · runTurn<br/>도구 최대 6라운드"]
    GD["guards.js<br/>숫자 · 단정 표현"]
    TL["tools.js + tools-money.js + tools-search.js<br/>채팅 도구 42개"]
    DY["diary.js<br/>task: diary"]
    RP["report.js · writeReport<br/>task: report, NDJSON 스트림"]
    VF["verify/<br/>compare · numbers · evidence · loop"]
    VO["voice.js<br/>/api/voice/transcribe"]
    STR["street.js<br/>/api/street"]
  end
  subgraph MM["Meta 모델"]
    SP["Muse Spark 1.3<br/>api.meta.ai/v1"]
    VT["Muse Voice Transcribe 1.0"]
    OP["Baseten의 Muse Spark Open<br/>가구 판단, 판단 CLI"]
  end
  subgraph DT["데이터 · 레포 또는 릴리스 data-v1"]
    KR["서울: 실거래가 · 건축물대장 · OSM<br/>서울교통공사 역간 시간·혼잡도"]
    US["멘로파크: Zillow ZORI · OSM US"]
    GT["scenarios/verify/ground_truth.json"]
  end
  CHAT -- "대화 + 맥락" --> SV
  SV --> AG
  AG <--> SP
  AG --> TL
  AG --> GD
  TL --> KR
  TL --> US
  SV -- "답변 + ui_actions" --> CHAT
  CHAT --> MAP
  CHAT -- "start_life_run" --> WK
  WK -- "실행 기록" --> CHAT
  CHAT -- "task: diary" --> DY
  CHAT -- "task: report + 요약 기록" --> RP
  DY <--> SP
  RP <--> SP
  RP --> VF
  VF --> GT
  RP -- "시도·완료 줄" --> RC
  VO <--> VT
```

## 에이전트 흐름: 채팅 한 번

대화는 브라우저가 갖고 있어요. 중계 서버는 한 턴을 돌리고, 답변과 함께 지도를 옮기거나 카드를 열거나 살아 보기를 시작하는 화면 동작(`ui_actions`)을 돌려줘요.

```mermaid
sequenceDiagram
  autonumber
  actor U as 고객
  participant B as 브라우저 chat.jsx
  participant S as 중계 /api/consult
  participant A as agent.js runTurn
  participant M as Muse Spark 1.3
  participant T as 도구 42개
  participant G as guards.js
  U->>B: "강남 출근, 전세 4억 이하"
  B->>S: 대화 + 시나리오 + 맥락 (담은 집, report_status)
  S->>A: runTurn
  loop 도구 최대 6라운드
    A->>M: 대화 + 도구 정의
    M-->>A: tool_calls
    A->>T: extract_profile, find_homes, pick_homes, start_life_run ...
    T-->>A: 엔진·비용 공식·실데이터로 계산한 결과
  end
  M-->>A: 답변
  A->>G: checkConsultReply(답변, 도구 결과)
  alt 도구 결과에 없는 숫자, 또는 단정 표현
    A->>M: 고칠 점을 붙여 한 번 다시
    M-->>A: 고친 답변
    Note over A,M: 그래도 안 되면 도구 숫자만으로 답해요
  end
  A->>A: fixStartClaim: 도구 없이 "시작했어요"라고 하면 실제로 시작
  A-->>S: 답변 + ui_actions + 다음 단계 칩
  S-->>B: JSON
  B->>U: 말풍선, 카드, 지도 핀, 다음 단계
```

## 한 문장에서 검증된 비교까지

```mermaid
flowchart TD
  A["내 말로 말하기<br/>글자 또는 음성"] --> B["extract_profile<br/>내가 말한 값 · 물어볼 값"]
  B --> C["find_homes<br/>실거래가·월세 · 문 앞에서 회사까지 시간"]
  C --> D["pick_homes<br/>A와 B · 붙여 넣은 매물은 C"]
  D --> E["start_life_run"]
  E --> F["sim-worker: 두 집에서 30일<br/>이유가 있는 이동 · Muse의 선택 · 10회"]
  F --> G["일기<br/>줄마다 기록과 대조"]
  F --> H["비교 리포트<br/>task: report"]
  H --> I{"이 가족 유형의<br/>체크리스트가 있나요?"}
  I -- "없음: 재택근무자 · 3세대 · 반려견" --> UN["미지원 표시<br/>결과는 열리고, 통과로 치지 않음"]
  I -- 있음 --> J["검증 루프<br/>아래 검증 참고"]
  J -- 통과 --> P["통과"]
  J -- "4번 모두 통과 못 함" --> Q["확인 요청 말풍선<br/>확인했어요 · 다시 검증하기"]
  Q -- "확인했어요" --> P2["확인 요청, 고객이 확인"]
  P --> R["결과 열림<br/>open_panel result · 결과 보기"]
  P2 --> R
  UN --> R
```

**말로 정리한 흐름**
1. **조건 정리.** 브라우저가 대화를 `/api/consult`(개발 서버 또는 중계 서버)로 보내요. 에이전트가 도구와 함께 Muse를 부르고, 도구 결과는 `web/src/engine`과 `web/src/money`가 계산해요.
2. **숫자 검사.** 답변 가드(`web/src/consult/guards.js`)는 도구 결과에 없는 숫자가 든 답을 돌려보내요.
3. **30일 살아 보기.** 엔진이 브라우저 워커(`web/src/sim-worker.js`)에서 두 집을 함께 돌려요.
4. **일기.** Muse가 실행 기록으로 일기를 쓰고, `web/src/consult/diary.js`가 줄마다 그 기록과 대조해요.
5. **검증된 비교.** Muse는 두 집 비교를 `submit_report` 도구로만 낼 수 있어요. 코드와 Muse 판정자가 확인하고, 통과하거나, 고객이 확인 요청에 답하거나, 미지원 가족 유형일 때만 결과가 열려요([검증](verification.ko.md) 참고).
6. **가구 판단.** Muse는 판단 CLI(`web/scripts/judge.mjs`)로 가구의 선택을 내리고, 기록된 파일로 똑같이 다시 볼 수 있어요.

루트에서 `npm test`는 JS 테스트를, `npm run test:py`는 Python 테스트를 돌려요. CI는 PR마다, 그리고 main에 푸시할 때마다 둘 다 돌려요.

## 층

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
