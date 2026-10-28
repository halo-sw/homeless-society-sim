# Stage 10 result (Muse): plain words, floating agent, listings, share, tour

## Before/after copy (20)
"월 주거비 (전세)"→"전세로 살면 매달 집에 드는 돈", "주거비 부담률"→"월급에서 집에 나가는 비율",
"남는 돈"→"집값과 생활비를 내고 남는 돈", "출근 도착 피로도"→"회사 도착할 때 피곤한 정도",
"도보 이동 시간 합계"→"30일 동안 걸은 시간", "도보 거리 합계"→"30일 동안 걸은 거리",
"통근 승차 시간 합계"→"30일 동안 차·지하철을 탄 시간", "장보기 완료 횟수"→"30일 동안 장본 횟수",
"18–24시 재택 시간 합계"→"30일 동안 저녁에 집에 머문 시간", "피로도 30일 평균"→"30일 평균 피곤한 정도",
"혼잡 100% 초과 탑승 시간"→"만원 지하철에 탄 시간", "누적 순비용"→"돌려받을 돈을 뺀 실제 지출",
"손익분기"→"매매가 전세·월세보다 적게 드는 해", "기회비용"→"다른 곳에 두었으면 벌었을 돈 (가정)",
"DSR"→"대출 갚는 부담 (DSR 풀이 말풍선)", "금리 스트레스"→"금리가 오르면 매달 내는 돈",
"목돈"→"처음에 한 번에 드는 돈", "전세가율 신호"→"보증금이 집값의 몇 %인지 (풀이 말풍선)",
"등기 신호"→"관청 자료에서 본 집 정보", "모형에 없음"→"아직 계산에 넣지 않은 것".
Guide: docs/copy-guide.md. Numbers/units/sources unchanged. Agent prompt explains in plain words,
offers "어떻게 계산했나요?". New: web/tests/copy.test.js (label scan + glossary-term check).

## Agent UI components used
Popover (anchored panel, per docs — Overlay is for on-surface content), ChatLayout,
ChatMessageList, ChatMessage/Bubble, ChatComposer, ChatToolCalls (plain action names),
ChatSystemMessage (view moves), Citation (repo-URL-only sources), Avatar, Button, Toast
(nudges, 1/min, reduced-motion/setting off), ToggleButton, SegmentedControl, Badge, Banner,
EmptyState, Markdown, Stepper (tour), Dialog (share), Collapsible ("어떻게 계산했나요?"),
LayerProvider. FAB bottom corner + snap; canvas full width (#panel-root hidden).
Context payload (tab/home/day/time/follow/selections) sent per message; "이거" resolves.

## Listing check example (real data)
`check_listing` 레이크팰리스 전세 9.8억·59.97㎡: parcel+name 386/408건, address_match true,
최근 1년 47건 중 한가운데 9.8억·범위 7.61억~11.8억·상위 49%, 전세가율 37% (참고선 아래),
등기 6행, 체크리스트 6항. No 싸다/비싸다/계약 판단 (test-scanned).

## Public listings near 판교역 (snapshot)
9 youth complexes w/ coords: 장지역 송파해링턴타워 9.6km, 문정역 마에스트로 10.3km,
잠실새내역 잠실엘타워 13.0km, 잠실센트럴파크 13.2km, 선릉역 마에스트로 13.6km,
장한평역 힐데스하임 19.0km, 왕십리역 라봄성동 19.8km, 마장역 한영스테이 20.0km,
왕십리역 청아진 청년주택 20.1km (all 값은 공고 원문). 26 recent of 150 kept (521 total).
No deadline field in API → honest "최근 공고" + 원문 확인 note.

## Capture URLs (dev server, /?mode=sim&scenario=demo-two-homes + …)
- `&tour=demo` (11 steps, 114s + loads; `&step=N` direct)
- `&tour=demo&step=9` (floating agent open, tool calls + citations; recorded reply labelled 기록된 답변 when no key)
- `&tab=listings` / `&tab=listings&fill=example` / `&tab=listings&sub=public` (매물 tab)
- `&tab=money&share=1` (result card dialog: preview + PNG + print)

## Needs real GPU/browser or keys
Live agent (Muse keys), map pins/journey visuals, tour recording, PNG/print eyeball,
Popover/Toast/Stepper/Dialog visual check — build-only verified here.

## Part F
5 failing tests updated to verified contract (values compare when needs_confirmation=false
+ source_url/as_of; nulls → 공식 확인 필요; never a verdict). Notes shown under rows,
"(2026-10-29 공식 페이지 기준)" + link. senior-deposits stays flagged.

## Verification
web: 525/525 node --test green; vite build green; bundle has no keys/server loaders;
verdict grep clean (2 code comments). python: env broken pre-existing (.venv self-symlink,
no osmium/shapely) — 47 runnable pass; 11 modules error identically on clean tree.
