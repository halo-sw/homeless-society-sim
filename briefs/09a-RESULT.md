# Stage 9a result — mission, personas and priorities (Muse)

Date: 2026-10-29. Agent mode, single agent (no subagents — `AGENTS.md`
reserves product code, tests and pipeline scripts to Muse). All code
and tests below are my own.

## What changed

**Part A — personas (`scenarios/personas/`)**
- Three runnable templates, each documenting its placeholder 가정값:
  `single-firstjob.json` (1인 사회초년생, 1 adult, small budget),
  `newlywed-couple.json` (예비·신혼부부, 2 working adults),
  `dual-income-child.json` (맞벌이 + 초등학생 자녀, 2 adults + 1 child
  with `school: true`).
- The child walks to the nearest `amenity:school` on the graph at the
  slow speed: verified trip minutes equal `round1(dist / 1.1 / 60)`
  (C-walk-speed), schoolday stay 360 min, zero school `unavailable`.
- Consult opens with "어떤 상황이세요?" (greeting + system prompt) and
  applies the pick with the new `apply_persona` tool (template
  validation + home verification), then asks priorities. One adult
  works end-to-end: compare, money, Now card, fatigue (tested +
  CLI-run).

**Part B — priorities (`web/src/priorities.js`, 내 기준으로 보기 tab)**
- Five groups × 0–5, no defaults beyond 모두 보통 (3): 교육,
  두 사람/나의 생활, 치안, 돈, 생활 편의. 15 metrics, each with unit +
  source + direction, listed in `docs/criteria.md` and the 기준 tab.
- The tab shows every group A vs B(/C) side by side with "고객님이 정한
  비중". The one number appears only on request, with the formula
  visible (min-max across shown homes → group means → weighted mean);
  homes are never ordered, no winner, no "추천 집". **Safety counts are
  shown but never summed** (counts are not a risk score).
- Consult: `get_priorities` (groups + questions + metrics cited) and
  `set_priorities` (stored on the scenario as the customer's own).
  Removed the old dead 3-axis weight inputs from the 삶의 질 tab
  (display-only, superseded).

**Part C — safety (`pipeline/safety.py`, `web/src/safety.js`)**
- `pipeline safety` reads the cp949 police CSV →
  `data/build/region/safety.json` (gitignored): counts by 대분류 and
  every 중분류 row, source, period, unit, level. Population table
  absent → rates skipped with a note. No score/ranking/danger colour
  anywhere; the 안전·교육 tab and `get_safety` carry the caveats.
- Attribution in `ATTRIBUTION.md` and on screen (안전·교육/내 기준 tabs).

**Part D — education (`web/src/education.js`)**
- `buildPlaces` gains an `education` list (same anchored POIs, same
  ≤500 m rule): schools by level from names (초등/중학/고등, unknown
  never guessed), kindergarten, childcare, library, academies
  (prep/language/music/arts school categories + 학원 names, driving
  schools excluded, `office:*` accepted).
- Per home: counts within 10/15 graph minutes (adult speed, labelled),
  nearest per bucket with graph minutes/metres, and the child's
  simulated school route (minutes, metres, distinct primary ways).
  Academy counts carry "OSM 기준, 실제보다 적을 수 있음"; quality /
  scores / 학군 rankings are unrepresentable (no such field) and
  guarded. Extract scan: the four areas carry **no** office-tagged
  academies, so no pipeline rebuild was needed; the classifier is ready
  for them.
- Adapter seam `web/src/education-official.js` + fixtures +
  `docs/education-official.md` for 학교알리미 / NEIS (keys later,
  server-side).

**Part E — mission + glossary**
- Intro card leads with the mission sentence (verbatim). Glossary
  `web/src/ui/glossary.js`: 11 terms, plain Korean, official links
  (확정일자→iRos, 전입신고→정부24, 전세보증보험→HUG, LTV/DSR→금융위,
  공공임대→LH). UI shows definitions on hover/tap (`Gloss`); the agent
  serves the same rows via `define_term`.

**Guards.** Safety/crime stat words are no longer blanket-banned
(citing tool counts is the feature); new no-score guard `scoreVerdict`
trips safety verdicts, safety/school scores or rankings, and 추천 집
language (cause `score_verdict`, tested with a fake provider that
insists → numbers-only fallback). Bare LTV/DSR and 전세가율 mentions
are definitions now, not verdicts (verdict contexts still trip).

## Per-area safety table (counts, 건, 2025-01-01…2025-12-31)

Source: 경찰청 범죄 발생 지역별 통계 (2025년). Caveats (also on
screen): counts are where crimes were **recorded**, not a resident's
risk; **성남시는 시 단위라 판교/분당을 분리할 수 없음**; 구 vs 시
columns are not directly comparable; no scores or rankings; no
per-population rates (no population table).

| 대분류 | 서울 송파구 (구) | 서울 성동구 (구) | 경기도 성남시 (시) |
|---|---|---|---|
| 강력범죄 | 331 | 144 | 381 |
| 절도범죄 | 2,369 | 763 | 2,886 |
| 폭력범죄 | 2,110 | 963 | 3,562 |
| 지능범죄 | 6,916 | 2,933 | 8,673 |
| 풍속범죄 | 300 | 199 | 727 |
| 특별경제범죄 | 1,508 | 685 | 3,191 |
| 마약범죄 | 182 | 79 | 110 |
| 보건범죄 | 105 | 31 | 224 |
| 환경범죄 | 3 | 2 | 21 |
| 교통범죄 | 1,732 | 897 | 3,501 |
| 노동범죄 | 1 | 2 | 8 |
| 안보범죄 | 28 | 0 | 4 |
| 선거범죄 | 41 | 16 | 46 |
| 병역범죄 | 95 | 45 | 155 |
| 기타범죄 | 3,777 | 1,668 | 5,797 |
| **합계** | **19,498** | **8,427** | **29,286** |

Selected 중분류 (shown under each 대분류 on screen): 송파구 살인기수 2 ·
강도 5 · 강간 69 · 강제추행 227 · 방화 9 · 절도 2,369 · 상해 116 ·
폭행 1,291; 성동구 0 · 3 · 17 · 116 · 5 · 763 · 64 · 511; 성남시 5 ·
6 · 72 · 245 · 20 · 2,886 · 242 · 1,933.

## Education counts per home (graph minutes, adult 1.3 m/s, OSM)

Home A · 잠실 레이크팰리스: 10분 안 초등 1 (송전초등학교 1.1분/88m) ·
유치원 1 (레이크어린이집 1.3분) · 중·고·도서관·학원·돌봄 0. 15분 안
동일. Child route: 송전초등학교 1.3분/88m, primary 구간 0.

Home B · 판교 백현마을: 10분 안 초등 1 (화랑초등학교 5.7분/446m) ·
중 1 · 고 1 · 유치원 0 (판교테크노어린이집 29.3분) · 학원 0 (OSM
기준, 실제보다 적을 수 있음). 15분 안 초등 2. Child route:
화랑초등학교 6.8분/446m, primary 구간 0.

## The three persona runs (placeholder 가정값, 30 days, rules)

- **single-firstjob**: 1명 · 실수령 월 241만 · 전세 주거비 A 320만/B
  310만 (부담률 133/129% — placeholder 예산으로 감당 불가, shown not
  judged) · 통근/일 A 62.6분/B 68.2분 · 피로 7.6/7.1.
- **newlywed-couple**: 2명 · 실수령 월 565만 · 전세 A 293만/B 283만
  (부담률 52/50%) · 통근/일 A 125.3분/B 136.4분 · 피로 7.6/7.1.
- **dual-income-child**: 3명 · 실수령 월 659만 · 전세 A 277만/B 267만
  (부담률 42/41%) · 등교 A 송전초 1.3분/B 화랑초 6.8분 · 피로 5.1/4.9.

Determinism: same input twice → identical canonical JSON (tested).

## Commands run and observed output

1. `.venv/bin/python -m pipeline safety` → `data/build/region/safety.json` ✓
2. `node web/scripts/simulate.mjs --scenario scenarios/personas/<p>.json --home both` × 3 ✓
3. `node web/scripts/money.mjs --scenario scenarios/personas/<p>.json` × 3 ✓ (stage-6 demo numbers reproduce: 전세 260/250만)
4. `.venv/bin/pytest tests/ -q` → **168 passed** (was 163: +5 safety)
5. `cd web && node --test tests/*.test.js` → **421 passed** (was 384: +priorities 5, +glossary 3, +safety 5, +education 7, +education-official 3, +consult-9a 11, +personas 4, −1 merged guard test)
6. `cd web && npm run build` → ✓ built (~2.9 s, chunk-size warning only)
7. Bundle scan: no `*_API_KEY`/tokens; no crime counts; new tab strings present (the dev-only consult greeting is tree-shaken from prod, as before)

## Capture URLs (dev server, port 5173; CLIs first)

- Persona pick in consult: `/?mode=sim&scenario=persona-single-firstjob&home=A` → 상담 panel greeting ("어떤 상황이세요?") + `apply_persona` round-trip (needs dev server + keys)
- 내 기준으로 보기: `/?mode=sim&scenario=persona-dual-income-child&home=A&tab=priorities` (weights, side-by-side, 한 숫자로 보기)
- 안전·교육: `/?mode=sim&scenario=persona-dual-income-child&home=A&tab=safety` (police counts + caveats, OSM education, school route)
- 1-person Now card: `/?mode=sim&scenario=persona-single-firstjob&home=A&day=1&t=08:28&follow=1`
- Mission copy: `/?mode=sim&home=A` (intro card opens, no `?t=`)

## What needs keys

- 학교알리미 / NEIS school·academy rosters (adapter seam + fixtures ready; keyed source lands server-side).
- Live consult + `apply_persona`/`get_safety` round-trips (dev server + `MODEL_API_KEY`); production shows the demo transcript.
- The safety/education/priorities views themselves need no keys — only the built files (`pipeline safety`, `simulate.mjs`, `money.mjs`).

## Known gaps

1. No office-tagged academies in today's extracts — the classifier accepts `office:*`, verified empty by scan.
2. Per-population crime rates need `data/raw/safety/population*.csv` (absent; skipped with a note).
3. Persona money C-home and consult-stored weights vs tab weights are separate inputs (both labelled as the customer's).
4. Journey/fatigue for the child persona: unchanged engine paths; 9c reworks the commute itself.
