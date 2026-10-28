# Stage 9b result — 살 만한가, 전세 안전 점검, 지원 제도 (Muse)

Date: 2026-10-29. Agent mode, single agent (no subagents — `AGENTS.md`
reserves product code, tests and pipeline scripts to Muse). All code
and tests below are my own.

## What changed

**Part A — 살 만한가 (`web/src/money/worthit.js`, `web/src/ui/worthit.jsx`)**
- Pure engine: 5/10/20-year horizon (customer picks, enforced), per
  tenure total cash out / interest / locked cash / opportunity cost at a
  customer-set return rate (가정값), buy equity under customer-chosen
  price scenarios (default −2/0/+2 %/yr, every surface labelled
  "가정 시나리오, 전망 아님"). Net position = cash out minus recoverable
  value (buy equity per scenario, returned deposit for rentals);
  opportunity cost is shown alongside, never folded into break-even.
  Break-even year per scenario or "기간 안에 없음".
- Loan view: amortised yearly schedule (ties to tenure.js monthly,
  balance ends 0), rate stress +1/+2 %p, DSR display from stated
  income + debts with "대출 가능 여부는 금융기관이 판단합니다".
- `scenarios/assumptions/kr-ownership-costs.json`: 취득세·중개수수료·
  재산세·보유세·이사비, all null + `needs_confirmation` (every entry
  carries `source`/`as_of`); null-safe apply lists them as 미포함, never
  guesses. `locale` block + US extension schema (property tax,
  insurance, HOA, PMI — schema + tests only, no US numbers).
- UI tab 살 만한가?: home/horizon pickers, editable return rate and
  scenario set, cumulative net-cost chart (buy band + scenario lines,
  rental lines, break-even dots on the middle scenario), totals table,
  break-even table, DSR + stress + schedule, unmodelled-cost list, and
  the 30-day 남는 돈 per tenure beside it. No verdict text.

**Part B — 전세 안전 점검 (`web/src/money/jeonse.js`, `mockloss.js`, `web/src/ui/jeonse.jsx`)**
- 전세가율 = median 전세 ÷ median 매매, same complex/area bucket
  (±5 ㎡), last 12 months, with counts. Sparse sales render
  "매매 거래가 적어 산출이 어렵습니다 — …" (pinned exact string).
  Bands cite `C-jeonse-ratio-caution` (70 %) /
  `C-jeonse-ratio-warning` (80 %), source "참고 기준(통상 언급되는 값),
  법적 기준 아님". Wording is neutral ("70% 이상"), never 안전/위험.
- Register signals from our data (주용도·사용승인일·구조·세대수·주소);
  위반건축물 is absent from the extract and says so
  (checked `docs/building-register-fields.md` — no such field).
- `scenarios/assumptions/kr-jeonse-checklist.json`: 6 items
  (what/why/where), all URLs null + `needs_confirmation`, the 75 %
  context line with source + date, support centre, "법률 자문이 아닙니다".
- `mockDepositLoss`: insured / auction-part / unrecovered paths from
  editable `C-mockloss` assumptions (가정값), locked months, recovery +
  shortfall, shortfall in months of stated remainder, next-move flow
  note (모의). Deterministic.
- UI tab 전세 안전 점검: ratio card, register table, checklist with
  official links (or 공식 확인 필요), mock-loss path switch + deposit
  input, centre link, legal note, context line.

**Part C — 지원 제도 (`web/src/money/support.js`, `support-official.js`, `web/src/ui/support.jsx`)**
- `scenarios/assumptions/kr-support-programs.json`: 5 programmes
  (버팀목 전세자금·청년전용 버팀목·신혼부부전용 전세·내집마련 디딤돌·
  신생아 특례), structure + names only, every number/URL null +
  `needs_confirmation`.
- `compareProgram`: rows = conditions, 고객 입력 · 공고 조건 · 대조
  (충족/미충족/확인 필요). Null/unconfirmed rules or missing inputs
  read 확인 필요. Never an eligibility verdict (banned-word scan in
  tests, incl. 대상입니다/신청 가능/자격).
- Public rental reused: `support_programs` tool calls the stage-6
  recommend; `money.mjs` precomputes candidates without commute;
  UI shows both + `ELIGIBILITY_NOTE`.
- Adapter seam `web/src/support-official.js` + `docs/support-official.md`
  + fixtures for 온통청년 / 복지로 (fixtures only, no calls).

**Criteria.** Four new money criteria in `kr-default.json` (+ FLAT_MAP
+ `docs/criteria.md`): `C-worthit-scenarios` (default set, engine
contract — the customer picks the set via UI/tool),
`C-jeonse-ratio-caution/warning` (overridable thresholds),
`C-mockloss` (overridable path assumptions).

**Agent.** 31 tools (+4): `worth_it(horizon, scenarios)`,
`jeonse_check(home)`, `mock_deposit_loss(path)`,
`support_programs(profile)`; server `loadAssumption` (allowlisted);
prompt lines for the 9b flows; new guards `signVerdict` (contract
advice) and `supportVerdict` (eligibility verdicts) wired into
`checkConsultReply`; `numbersOnlyAnswer` covers all four shapes.

## Worked examples (demo couple — PLACEHOLDER inputs, not real data)

Inputs: cash 2억, loan 4 %/30년 (가정값), opportunity 3 % (가정값),
prices = RTMS medians below; income = net 722.1만 × 12 (display).

Home A · 레이크팰리스 59.97㎡, 10 years:

| 점유 | 지출 | 이자 | 묶인 돈 | 기회비용 | 순비용 |
|---|---|---|---|---|---|
| 매매 | 16.04억 | 8.84억 | 2.00억 | 0.69억 | 0%: 8.84억 · +2%: 3.03억 · −2%: 13.69억 |
| 전세 9.8억 | 12.92억 | 3.12억 | 9.80억 | 3.37억 | 3.12억 |
| 월세 4억/200만 | 6.40억 | 0 | 4.00억 | 1.38억 | 2.40억 |

Break-even (buy vs rental): 전세 대비 0% 기간 안에 없음 / +2%
10년차 / −2% 기간 안에 없음; 월세 대비 all 기간 안에 없음.
DSR 162 % (display only — placeholder income cannot carry the loan,
same story as stage 6). Stress: 월 1,170만 → +1%p 1,315만 →
+2%p 1,469만. Ownership costs: all five 미포함.

Mock loss on the 9.8억 deposit (net 722.1만, spent 387.2만, remainder
334.9만): insured → 9.8억 회수 · 2개월 묶임 · 부족 0; auction →
6.86억 회수 · 2.94억 부족 · 12개월 묶임 · 남는 돈의 87.8개월분;
unrecovered → 0 회수 · 9.8억 부족 · 292.6개월분. All 모의 + 법률 자문 아님.

## 전세가율 (demo complexes, parcel+name, 2025-10…2026-10)

- 레이크팰리스 59.97㎡: 37 % (매매 중간 26.5억 13건 ÷ 전세 중간
  9.8억 47건) — 70% 미만 (참고선 아래, C-jeonse-ratio-caution).
- 백현마을 84.82㎡: 37.7 % (매매 25.2억 28건 ÷ 전세 9.5억 133건) —
  70% 미만.
- Register: A 주용도 공동주택 · 사용승인 2006-12-28~2007-01-03 ·
  철근콘크리트구조 · 주소 송파구 잠실동 · 세대수 없음 ·
  위반건축물 정보 없음. B 공동주택 · 2009-09-14~2011-01-26 ·
  철근콘크리트 · 백현동 · 세대수 없음 · 위반건축물 정보 없음.

## Fields needing orchestrator verification

- `kr-jeonse-checklist.json`: `context` (text/source/date 2025-03);
  `items[].url` × 6 (registry, movein-date, guarantee-insurance,
  tax-arrears, senior-deposits, safe-jeonse-app); `support_center.url`.
- `kr-support-programs.json`: per programme (×5) — every
  `conditions[].value`, `rate_range_pct.min/max`, `limit_won.value`,
  `as_of`, `source_url`, and the programme `needs_confirmation` flag.
- `kr-ownership-costs.json`: all five `buy_costs[].value` (+ `source`,
  `as_of`, unit conventions) before any cost is added to the buyer.

## Commands run and observed output

1. `node web/scripts/money.mjs --scenario scenarios/demo-two-homes.json --out data/build/sim/` ✓
   (+ single-firstjob persona ✓; stage-6 tenure numbers reproduce)
2. `cd web && node --test tests/*.test.js` → **478 passed** (was 421:
   +worthit 18, +jeonse 10, +mockloss 6, +support 8, +consult-9b 15)
3. `.venv/bin/pytest tests/ -q` → **168 passed** (unchanged)
4. `cd web && npm run build` → **✓ built** (~2.1 s, chunk-size warning only)
5. Bundle scan: no `*_API_KEY`/tokens/URLs/raw paths; three tab strings present
6. Verdict grep over new UI + engine: only "never …" code comments

## Capture URLs (dev server, port 5173; CLIs first)

- 살 만한가?: `/?mode=sim&home=A&tab=worthit`
- 전세 안전 점검: `/?mode=sim&home=A&tab=jeonse`
- 지원 제도: `/?mode=sim&home=A&tab=support`
- Consult (needs dev server + keys): "10년 살면 매매랑 전세 뭐가 달라?"
  → worth_it → "이 단지 전세가율 어때?" → jeonse_check → "보증금 못
  받으면?" → mock_deposit_loss → "내 연봉에 지원 제도 있어?" →
  support_programs → insist "계약해도 돼?" / "대상자야?" (guard trip →
  numbers-only fallback)

## What needs keys

- Live consult round-trips (`MODEL_API_KEY` on the dev server); the
  tabs themselves need only the built money.json.
- 온통청년 청년정책 API + 복지로/한국사회보장정보원 API (seam +
  fixtures ready; keyed sources land server-side).
- `HOUSING_API_KEY` for live public-rental (else the gitignored dev
  snapshot); data.go.kr RTMS API backend (services unregistered —
  CSV only today).

## Known gaps

1. Ownership costs are all 미포함 until the rule table is filled —
   the buy totals understate buying by design (stated on screen).
2. `support_rentals` in money.json has no commute minutes (ranked by
   monthly cost); the consult tool adds the graph commute live.
3. Mock-loss recovery assumptions (2개월/100 %, 12개월/70 %, 0 %) are
   모의 가정값 — plausible flows, not measured medians.
4. Worth-it 전세 assumes the deposit returns in full at the horizon;
   deposit-loss risk lives in the 전세 tab, not in break-even.
