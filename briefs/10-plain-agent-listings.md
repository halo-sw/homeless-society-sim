# Stage 10 — Plain words, a floating Astryx agent, real listings the customer brings, and a shareable result (brief for Muse)

Agent mode, rules in `AGENTS.md` (mission and rules revised 2026-10-29). Read `briefs/09a-RESULT.md`, `09b-RESULT.md`, `09c-RESULT.md`, `web/src/ui/`, `web/src/consult/`. Astryx docs offline in `docs/astryx/` (now also ChatLayout, ChatComposerDrawer, ChatToolCalls, ChatSystemMessage, Citation, Overlay, Popover, Toast, Stepper, Table, HoverCard, Collapsible, Tooltip, IconButton, ProgressBar, TabList, Tab, EmptyState, Typeahead, Avatar; `components.txt` lists all; `npx @astryxdesign/cli component <Name>` works offline). Sub-agents allowed (Muse only; Parts A–E are fairly independent). Sandbox: no network, no keys.

User requests (verbatim intent): "Make expressions like `월 주거비 (전세)` much easier to understand." "Bring in a floating chatbot-style AI agent UI from Astryx." "It would be good to explore real listings too." "Find more features worth adding and update."

## Part A — plain words everywhere ("쉬운 말")
Audience: Gen-Z first-job workers and couples with no real-estate background.
1. Write `docs/copy-guide.md` (Korean): 해요체; a label says what the number means in everyday words, then the number with its unit; no bracketed jargon in labels; jargon only with a glossary tooltip (9a glossary); one idea per line; verbs over nouns; never "부담률" alone — "월급에서 집에 나가는 비율".
   Examples to apply:
   - "월 주거비 (전세)" → "전세로 살면 매달 집에 드는 돈" · "260만 원" · expandable "어떻게 계산했나요? — 전세 대출 이자 ○○만 원 + 관리비 ○○만 원 (보증금 중 내 돈 2억 원, 나머지는 대출 가정)".
   - "주거비 부담률 36.0%" → "월급에서 집에 나가는 비율 36%" + "흔히 30%를 넘으면 빠듯하다고 해요 (참고 기준)".
   - "남는 돈" → "집값과 생활비를 내고 남는 돈".
   - "출근 도착 피로도(가정 모델)" → "회사 도착할 때 피곤한 정도" + tooltip about the model.
   - "도보 이동 시간 합계" → "30일 동안 걸은 시간".
2. Apply across every UI string (compare, 생활비, 삶의 질, 기준, 살 만한가, 전세 점검, 지원 제도, Now card, intro) and the agent's system prompt (the agent explains in the same plain words and offers "어떻게 계산했나요?" on request). Keep exact numbers, units and source badges.
3. A test that scans UI strings for banned bare jargon in labels (list in the guide) and checks every glossary term used is defined.

## Part B — floating agent (Astryx)
Replace the docked consult panel with a floating agent:
1. A floating action button bottom-right ("물어보기", IconButton/Button + Avatar) opens an anchored floating panel (Astryx Overlay/Popover/Layer — choose per docs) ~380×560 px, draggable or snap to corners, minimisable, never covering the followed resident or the Now card (auto-reposition). Canvas returns to full width.
2. Inside: Astryx Chat stack — `ChatLayout`, `ChatMessageList`, `ChatMessage`/`Bubble`, `ChatToolCalls` (each tool step shown as a compact row: "실거래가 확인 중 → 12건 찾음"), `ChatSystemMessage` for state changes ("화면을 B · 1일차 08:50으로 옮겼어요"), `Citation` for every source (실거래가, 서울교통공사, 경찰청, LH…), `ChatComposer` with suggested prompt chips that depend on the current screen ("이 출근길 왜 피곤해요?", "전세로 살면 매달 얼마예요?", "이 집 전세 괜찮은지 점검해 주세요", "비슷한 공공임대 있어요?").
3. Context-aware: the agent receives the current view (tab, home, day, time, followed member, selected item) with each message; the user can say "이거" and it knows what "이거" is.
4. Gentle nudges: at notable moments (crowding ≥ 80 % leg, first Muse decision, 전세가율 caution) a small Toast near the button offers an explanation; at most one per minute, dismissable, off with reduced motion / a setting.
5. Keep all guards, the token/cost counter, provider badge, and the production-build empty state.

## Part C — real listings, the customer brings them
There is no open API for private listings (portals' terms forbid scraping; do not fetch or scrape them). Two compliant paths:
1. **"내가 본 매물 확인하기"**: the customer pastes the listing text they see in a real-estate app (or types it). The agent extracts fields with a tool `parse_listing(text)` → {거래 유형, 매매가 / 보증금 / 월세, 전용면적, 층, 단지명 or 주소, 관리비} — every value must appear in the pasted text (guard), missing ones are asked back. Then `check_listing(listing)`: match to a complex (name + address → PNU), show the asking price against real transactions of the same complex and area (중앙값, 범위, where it sits: "최근 1년 거래의 상위 20% 수준"), 전세가율 signal and register signals (9b), the checklist, and "이 매물로 30일 살아 보기" (adds as home C). Never "싸다/비싸다/계약하세요".
2. **Public listings (live, official)**: LH/SH notices and youth-housing complexes via the public-housing API (stage 6 adapter; source ids `lh-notices`, `sh-notices`, `youth-notices`, `youth-complexes`, `lh-listings`), shown in a "공공 매물·공고" list and as pins near the customer's workplace, filtered by region, deadline (open now), and the customer's household. Each links to the official notice. Tests use the snapshot.
3. UI: a "매물" tab with both paths, plus a short honest line: "민간 매물은 직접 붙여 넣어 주세요. 앱이 다른 사이트에서 가져오지 않아요."

## Part D — shareable result card
"결과 공유" makes one image (PNG via canvas) and a printable page: persona, A vs B (and C) in plain words — 출퇴근 시간, 매달 집에 드는 돈, 남는 돈, 피곤한 정도, 걸어서 10분 안 편의시설, 전세 점검 신호 — each with source badges and "가정값" marks, the customer's own priorities, date, and the disclaimer. No verdict. File stays in the browser (no upload).

## Part E — guided demo ("3분 둘러보기")
A scripted, skippable tour for the video and for first-time users: persona pick → follow the commute from home A (walk → 2호선 ride with crowding → 판교) → home B walk to work → 생활비 in plain words → 전세 점검 → 매물 붙여넣기 example (a fixture text, labelled 예시) → 공공임대 추천 → agent "B로 바꾸면?" → 결과 공유. Each step has one caption line; `?tour=demo` starts it; deterministic timing for screen recording; uses recorded agent replies when no key is present (labelled 기록된 답변).

## Tests
Copy-guide scan; floating panel position logic (pure: avoid rects of resident/Now card); context payload; nudge rate limit; `parse_listing` guard (no value not in text) with fixtures (apartment 전세, officetel 월세, villa 매매 with missing area); `check_listing` percentile maths on real CSVs; public-listing filters on the snapshot; result card data builder; demo tour step machine. All existing tests green; `vite build`; no keys / raw data in git or bundle.

## Output
`briefs/10-RESULT.md`: before/after copy table (20 examples), agent UI components used, listing check example outputs, public listings found near 판교역 in the snapshot, capture URLs (`?tour=demo`, floating agent open with tool calls and citations, 매물 tab, result card), what needs the real GPU or keys.

## Part F — orchestrator-verified data (update the tests' contract)
On 2026-10-29 the orchestrator filled `scenarios/assumptions/kr-support-programs.json` from the official 주택도시기금 product pages (nhuf.molit.go.kr; per-programme `source_url`, `as_of`, and a `note` per condition with exceptions such as the 신혼 income ceiling) and `scenarios/assumptions/kr-jeonse-checklist.json` (official site URLs checked to respond; context line verified from the 2025-03-10 SBS Biz report of 국토교통부 data: 27,372 victims, 20·30대 20,432 ≈ 74.6 %). Five tests written for the 9b "ships nulls" contract now fail by design (`support … ships structure and names only`, `shipped comparisons are all 확인 필요`, `jeonse checklist … validates with nulls flagged` regex `/75 %가 20·30대/`, and their parents). Update them to the new contract: values may be filled when `needs_confirmation` is false and `source_url`/`as_of` are present; nulls still render 공식 확인 필요; the comparison table still never emits an eligibility verdict. Show each condition's `note` under the row in plain words, and the programme's `source_url` + `as_of` ("2026-10-29 공식 페이지 기준"). `senior-deposits` keeps `url: null` (no single official page) and stays flagged.
