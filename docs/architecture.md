# Architecture

[← README](../README.md) · [한국어](architecture.ko.md)

```text
ithaca/
├── pipeline/          Python: OSM extract, building register join, walking graph, subway network, terrain, 3D boxes
├── web/
│   ├── src/engine/    Pure JS life engine: routines, trips with causes, paired 30-day runs (deterministic, seeded)
│   ├── src/judge/     Muse calls: decision prompts, number guards, recorded decisions for exact replay
│   ├── src/consult/   Consult agent: tool calls (extract_profile, find_homes, pick_homes, start_life_run, …), reply guards, voice transcription
│   ├── src/verify/    Report checks: ground-truth checklist, number claims, retry loop
│   ├── src/money/     Payroll, 매매 / 전세 / 월세 formulas, real-transaction loader, public rentals
│   ├── src/transit/   Operator schedule and ride minutes
│   ├── src/render/    three.js scene: facades, terrain, roads, trees, vehicles, pedestrians, trains
│   ├── src/ui/        React 19 + Astryx (Meta's design system)
│   ├── scripts/       CLIs: simulate, money, judge, static server
│   └── tests/         node:test suites
├── relay/             Server that keeps keys off the browser: /api/consult, /api/voice/transcribe, map tiles (Vercel or docker compose)
├── scenarios/         Committed households, homes and recorded Muse decisions
├── tests/             Python tests for the pipeline
├── Dockerfile, docker-compose.yml, package.json, .env.example
└── briefs/            One brief + result per Muse Code stage
```

## System map

Where each part runs. The browser never holds a model key: every Muse call goes through the relay.

```mermaid
flowchart TB
  subgraph BR["Browser · React 19 + Astryx"]
    CHAT["Chat thread<br/>ui/chat.jsx"]
    MAP["Map · candidate cards · 3D<br/>ui/ · render/"]
    WK["sim-worker.js<br/>30-day engine · 10 paired seeds"]
    RC["ReportCheck<br/>timeline · reasons · 미지원"]
  end
  subgraph RL["Relay · relay/handler.js on Vercel or docker · keys stay here"]
    SV["consult/server.js<br/>POST /api/consult"]
    AG["agent.js · runTurn<br/>up to 6 tool rounds"]
    GD["guards.js<br/>numbers · verdict words"]
    TL["tools.js + tools-money.js + tools-search.js<br/>42 chat tools"]
    DY["diary.js<br/>task: diary"]
    RP["report.js · writeReport<br/>task: report, streamed as NDJSON"]
    VF["verify/<br/>compare · numbers · evidence · loop"]
    VO["voice.js<br/>/api/voice/transcribe"]
    STR["street.js<br/>/api/street"]
  end
  subgraph MM["Meta models"]
    SP["Muse Spark 1.3<br/>api.meta.ai/v1"]
    VT["Muse Voice Transcribe 1.0"]
    OP["Muse Spark Open on Baseten<br/>household decisions, judge CLI"]
  end
  subgraph DT["Data · committed or release data-v1"]
    KR["Seoul: 실거래가 · 건축물대장 · OSM<br/>서울교통공사 times and congestion"]
    US["Menlo Park: Zillow ZORI · OSM US"]
    GT["scenarios/verify/ground_truth.json"]
  end
  CHAT -- "messages + context" --> SV
  SV --> AG
  AG <--> SP
  AG --> TL
  AG --> GD
  TL --> KR
  TL --> US
  SV -- "reply + ui_actions" --> CHAT
  CHAT --> MAP
  CHAT -- "start_life_run" --> WK
  WK -- "run record" --> CHAT
  CHAT -- "task: diary" --> DY
  CHAT -- "task: report + slim runs" --> RP
  DY <--> SP
  RP <--> SP
  RP --> VF
  VF --> GT
  RP -- "attempt and done lines" --> RC
  VO <--> VT
```

## Agent flow: one chat turn

The browser owns the conversation; the relay runs one turn and sends back the reply plus the screen actions (`ui_actions`) that move the map, open cards or start the run.

```mermaid
sequenceDiagram
  autonumber
  actor U as Customer
  participant B as Browser chat.jsx
  participant S as Relay /api/consult
  participant A as agent.js runTurn
  participant M as Muse Spark 1.3
  participant T as Tools (42)
  participant G as guards.js
  U->>B: "강남 출근, 전세 4억 이하"
  B->>S: messages + scenario + context (picks, report_status)
  S->>A: runTurn
  loop up to 6 tool rounds
    A->>M: messages + tool definitions
    M-->>A: tool_calls
    A->>T: extract_profile, find_homes, pick_homes, start_life_run ...
    T-->>A: results from the engine, money formulas and real data
  end
  M-->>A: reply text
  A->>G: checkConsultReply(reply, tool results)
  alt a number not in any tool result, or a verdict word
    A->>M: retry once with a correction note
    M-->>A: corrected reply
    Note over A,M: still failing: answer with the tool numbers only
  end
  A->>A: fixStartClaim: said "started" without the tool, so start it for real
  A-->>S: reply + ui_actions + next-step chips
  S-->>B: JSON
  B->>U: bubble, cards, map pins, next step
```

## From one sentence to a checked comparison

```mermaid
flowchart TD
  A["Say it in your own words<br/>text or voice"] --> B["extract_profile<br/>내가 말한 값 · 물어볼 값"]
  B --> C["find_homes<br/>real deals or rents · door-to-work minutes"]
  C --> D["pick_homes<br/>A and B · C from a pasted listing"]
  D --> E["start_life_run"]
  E --> F["sim-worker: 30 days in both homes<br/>trips with causes · Muse choices · 10 seeds"]
  F --> G["Diary<br/>every line checked against the record"]
  F --> H["Comparison report<br/>task: report"]
  H --> I{"Household type<br/>has a checklist?"}
  I -- "no: remote worker · three generations · dog owner" --> UN["미지원 label<br/>result opens, nothing counted as a pass"]
  I -- yes --> J["Verify loop<br/>see Verification"]
  J -- pass --> P["통과"]
  J -- "4 tries without a pass" --> Q["Handoff bubble<br/>확인했어요 · 다시 검증하기"]
  Q -- "확인했어요" --> P2["확인 요청, confirmed by the customer"]
  P --> R["Result unlocked<br/>open_panel result · 결과 보기"]
  P2 --> R
  UN --> R
```

**Flow in words.**
1. **Profile.** The browser sends the chat to `/api/consult` (the dev server or the relay). The agent calls Muse with tools; tool results come from `web/src/engine` and `web/src/money`.
2. **Number check.** The reply guard (`web/src/consult/guards.js`) rejects a reply whose numbers are not in the tool results.
3. **30-day run.** The engine runs both homes in a browser worker (`web/src/sim-worker.js`).
4. **Diary.** Muse writes the diary from the run's record, and `web/src/consult/diary.js` checks every line against that record.
5. **Checked comparison.** Muse hands in the two-home comparison only through the `submit_report` tool; code and a Muse judge check it, and the result opens only after it passes, the customer confirms a handoff, or the household type is marked 미지원 (see [Verification](verification.md)).
6. **Household decisions.** Muse makes them through the judge CLI (`web/scripts/judge.mjs`), and they replay exactly from the recorded files.

`npm test` at the root runs the JS suites, and `npm run test:py` runs the Python ones. CI runs both on every pull request and every push to `main`.

## Layers

| Layer | Where | Notes |
|---|---|---|
| Data pipeline (Python) | `pipeline/` | OSM extract, building join with the national register, walking graph, regions, subway network, terrain and scene boxes |
| Life engine (JS, pure) | `web/src/engine/` | Routines, decisions, trips with causes, paired runs, money timeline, criteria loader |
| Muse judgement layer | `web/src/judge/` | Decision prompts, number guards, recorded decisions for exact replay |
| Consult agent | `web/src/consult/` | OpenAI-style tool calls to the Meta API, server-side only (keys never reach the browser) |
| Money and prices | `web/src/money/` | Payroll table, tenure formulas, real-transaction loader, public-rental adapter |
| Transit | `web/src/transit/` | Operator schedule, ride minutes per leg, fares |
| 3D scene and motion | `web/src/render/`, `web/src/scene/`, `web/src/motion/` | three.js 0.170: PBR facades, terrain, road ribbons, trees, procedural vehicles, pedestrians and trains |
| UI | `web/src/ui/` | React 19 + **Astryx** (Meta's design system) |
