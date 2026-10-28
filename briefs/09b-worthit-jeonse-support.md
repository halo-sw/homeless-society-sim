# Stage 9b — Is it worth it? 전세 safety check, and support programmes at a glance (brief for Muse)

Agent mode. Read `AGENTS.md` (revised 2026-10-29), `briefs/06-RESULT.md`, `briefs/09a-RESULT.md`, `web/src/money/`. Sub-agents allowed (Muse only; Parts A, B, C are fairly independent). Sandbox: no network, no keys.

Mission and the user's words: see `briefs/09a-mission-priorities.md`. This stage covers: "is the mortgage really worth it", "warn people about 전세사기 with a simulation, even a mock one", and "make public rental and government benefits intuitive at the same salary".

## Part A — "살 만한가?" multi-year housing-cost simulation (buy vs 전세 vs 월세 vs 공공임대)
1. Horizon 5 / 10 / 20 years (customer picks). For each tenure, from real-transaction references (stage 6) and customer inputs: total cash out, interest paid, deposit/equity locked, opportunity cost of cash at a customer-set return rate (가정값), and — for buying only — equity under **customer-chosen price-change scenarios** (default set −2 / 0 / +2 % a year, each labelled "가정 시나리오, 전망 아님"). Break-even year between buy and each rental option per scenario, or "기간 안에 없음".
2. Loan view: amortised schedule, rate stress (+1 / +2 %p), DSR computed from the customer's stated income and debts — **display only**, with "대출 가능 여부는 금융기관이 판단합니다".
3. Costs not modelled are listed, not guessed: 취득세 · 중개수수료 · 재산세 · 보유세 · 이사비 — the schema has fields and they stay 0 / "미포함" unless a rule table is provided (`scenarios/assumptions/kr-ownership-costs.json`, every value with `source`, `as_of`, `needs_confirmation`; ship it with nulls, not invented rates).
4. Global-ready schema: a `locale` block so a US variant can add property tax, insurance, HOA and PMI later (schema + tests only; no US numbers now).
5. UI: a "살 만한가?" tab: a cumulative-cost line chart per tenure over the horizon with scenario bands, a table of totals, break-even markers, and the 30-day life sim's monthly 남는 돈 beside it. No verdict text; the agent explains, never recommends.

## Part B — 전세 안전 점검 (education, public data, mock scenarios)
1. **전세가율 신호** from `data/raw/rtms/` (same complex/area bucket, last 12 months): median 전세 ÷ median 매매, with counts. For 연립다세대 / 오피스텔 where sale deals are few, show "매매 거래가 적어 산출이 어렵습니다 — 시세 확인이 어려운 것 자체가 주의 신호일 수 있어요". Reference thresholds as criteria (`C-jeonse-ratio-caution` 70 %, `C-jeonse-ratio-warning` 80 %), source "참고 기준(통상 언급되는 값), 법적 기준 아님".
2. **Register signals we already have**: from the building register data (stage 2), show fields relevant to tenants if present (e.g. 위반건축물 flag, 주용도, 사용승인일) — check `docs/building-register-fields.md`; if a field is absent, say so.
3. **체크리스트 with official links** (each item: what, why, where): 등기부등본 확인(근저당·압류·신탁) — 인터넷등기소; 전입신고 + 확정일자 — 정부24; 전세보증보험 가입 가능 여부 — HUG / HF / SGI; 임대인 국세·지방세 체납 열람; 선순위 보증금 확인; 안심전세 앱(국토교통부). Store as `scenarios/assumptions/kr-jeonse-checklist.json` with URLs left as `null` + `needs_confirmation` where you are not certain of the exact page; the orchestrator verifies URLs.
4. **모의 피해 시나리오** (clearly 모의): "계약 만료에 보증금을 돌려받지 못하면" on the customer's money timeline — deposit locked, months until recovery under (a) 보증보험 가입, (b) 미가입 + 경매 배당 일부, (c) 미회수 — each path's assumptions as editable criteria (가정값), effect on 남는 돈 and on the next move. Show the 전세피해지원센터 link and "법률 자문이 아닙니다".
5. Context line (source-labelled, in the intro of this tab): "전세사기 피해자의 약 75 %가 20·30대 (2025년 3월 보도, 국토교통부 자료 인용)" — store with source and date in the checklist file; the orchestrator will verify.
6. Never "이 집은 안전/위험" — only signals, missing information, and the checklist.

## Part C — 지원 제도 한눈에 (same salary, what support exists)
1. Public rental: reuse stage 6 (`recommend_public_rental`) and surface it here with the customer's income and household.
2. Policy loans and youth / newly-wed benefits: `scenarios/assumptions/kr-support-programs.json` — programmes (주택도시기금 버팀목 전세자금 · 청년전용 버팀목 · 신혼부부전용 전세 · 내집마련 디딤돌 · 신생아 특례 등) with conditions (age, household, marriage period, income ceiling, assets, home ownership, deposit / price limits), rate ranges, limits, `as_of`, `source_url`. **Ship it with the structure and names only; all numbers `null` + `needs_confirmation: true`** — the orchestrator fills verified values from official pages. The UI shows "공식 확인 필요" for nulls.
3. Condition comparison table per programme: rows = conditions, columns = 고객 입력 · 공고 조건 · 대조 (충족 / 미충족 / 확인 필요). Never "대상입니다". Link to the official page.
4. Adapter seams (fixtures only, no calls) for keyed APIs to add later: 온통청년 청년정책 API, 복지로 / 한국사회보장정보원 복지서비스 API.

## Agent
Tools: `worth_it(horizon, scenarios)`, `jeonse_check(home)`, `mock_deposit_loss(path)`, `support_programs(profile)`. Guards: no recommendation to buy/sign, no eligibility verdict, no safe/unsafe verdict, price scenarios always called 가정 시나리오, cites sources and criterion ids.

## Tests
Amortisation and break-even worked examples; scenario bands; DSR maths; null-safe ownership-cost table; 전세가율 on real CSVs for 레이크팰리스 / 백현마을 and a sparse 연립다세대 case; checklist and support files validate (nulls allowed, flagged); mock loss paths deterministic; comparison table never outputs an eligibility verdict; agent guards with a fake provider. Existing tests green; `vite build`; no keys or raw data in git or bundle.

## Output
`briefs/09b-RESULT.md`: what changed, worked examples for the demo couple (inputs stated as placeholders), 전세가율 for the demo complexes, the checklist and programme files' fields that need orchestrator verification (list them), capture URLs (살 만한가?, 전세 안전 점검, 지원 제도), and what needs keys.
