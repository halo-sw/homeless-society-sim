# Features in detail

[← README](../README.md) · [한국어](features.ko.md)

| Area | What it does | Backed by |
|---|---|---|
| **3D neighbourhood** | Footprints, heights, floors, complexes, roads, terrain, parks and trees, for 60 station areas and a corridor map of 10,971 buildings. Vehicles, pedestrians and trains move procedurally, so scrubbing the timeline never drifts. | OpenStreetMap, 건축물대장 / GIS건물통합정보, DEM tiles |
| **30-day life** | 2 adults plus 60 simulated neighbours (labelled as simulated) live on the real walking graph. The same seed gives byte-identical output. | Deterministic engine, [`scenarios/criteria/kr-default.json`](../scenarios/criteria/kr-default.json) |
| **Choices by Muse** | At each decision point the engine offers options, and Muse picks one and gives a reason. In one run Muse made 198 decisions, 50 of them different from the rule default. A guard rejects any answer that contains a number not found in a tool result. | Muse Spark 1.3 |
| **Commute** | Each home derives its own commute: walk, ride (per line, from the operator's schedule), transfers and walk. Fatigue comes from measured congestion per station, direction and 30-minute slot. | 서울교통공사 interstation times and congestion (출처: 서울교통공사 · 공공누리 제3유형(출처표시·변경금지)) |
| **Money** | Take-home pay from salary, then monthly housing cost for 매매, 전세, 월세 and public rental from real transactions of the same size over the last 12 months. Fares are distance-based, walking commutes are counted, and loans are capped. | 국토교통부 실거래가 |
| **Worth it over 5–20 years** | Total cash out, interest, locked cash, opportunity cost, rate stress and DSR. Price paths appear only as customer-chosen scenarios labelled "가정 시나리오, 전망 아님". | Customer inputs, stated formulas |
| **전세 safety check** | 전세-to-sale ratio, building-register signals, the official six-step checklist with links, and a mock deposit-loss simulation. Signals and next steps, never a verdict. | 실거래가, 건축물대장, 인터넷등기소, HUG |
| **Support programmes** | 버팀목, 디딤돌, 신혼부부·청년·신생아 products compared with the customer's numbers condition by condition, with the official link and date. Never says "eligible". | 주택도시기금 product pages (checked 2026-10-29) |
| **Check a real listing** | Paste a listing's text. The agent extracts only the values in the text and shows where the price sits among last year's real deals, then can live in it as home C. | 실거래가; private listing sites are never scraped |
| **Only living there tells you** | Under the result, what a listing never shows, counted from the 30-day record: walks (or bike rides) home after sunset, with how often, the average minutes and distance, where they start (work or the station) and that month's sunset time; on the subway, the mornings you got a seat (only where congestion is measured); and arrivals home after 22:00. A row appears only when the record has something to say. | The run's own trips and measured congestion, sunset tables for Seoul and Menlo Park |
| **Consult agent** | A floating chat with 20+ tools sets up the scenario, runs it, compares, explains, cites every source and moves the 3D view to the moment it is talking about. | Muse Spark 1.3 |
| **Plain words** | Every figure says what it means in everyday Korean and has "어떻게 계산했나요?". A test scans the UI for bare jargon. | [`docs/copy-guide.md`](copy-guide.md) |
