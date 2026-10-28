# 국토교통부 실거래가 공개시스템 CSV — how the orchestrator fetched it (2026-10-28)

Page: https://rt.molit.go.kr/pt/xls/xls.do?mobileAt= (user asked to use this source). Files in `data/raw/rtms/` (not committed).
- Form `frm_xls`: `srhThingNo` A=아파트 (B 연립/다세대, C 단독/다가구, D 오피스텔, G 토지 …), `srhDelngSecd` 1=매매 2=전월세, `srhAddrGbn` 1, `srhFromDt`/`srhToDt` (YYYY-MM-DD, ≤ 1 year when 시군구 chosen), `srhSidoCd` (11000 서울, 41000 경기), `srhSggCd` (11710 송파, 11200 성동, 41135 성남 분당). Region options are loaded by page JS, so a headless browser sets them and calls the page's `fnCSVDown()`; the server checks download counts.
- CSV: cp949, ~15 disclaimer lines before the header row (find the line containing `단지명`). Trade columns: NO, 시군구, 번지, 본번, 부번, 단지명, 전용면적(㎡), 계약년월, 계약일, 거래금액(만원), 동, 층, 매수자, 매도자, … Rent columns: NO, 시군구, 번지, 본번, 부번, 단지명, 전월세구분, 전용면적(㎡), 계약년월, 계약일, 보증금(만원), 월세금(만원), 층, 건축년도, …
- Amounts use thousands separators ("249,990"). Disclaimer on the source: reference only, no legal effect, contract-date basis; for public statistics use the official stats — show this note on screen.
- Fetched: 2025-10-28 … 2026-10-27, 아파트 매매 + 전월세 for 송파 (4,324 / 19,597 rows), 성동 (1,481 / 9,478), 분당 (3,696 / 15,048).
- Matching to our complexes: 시군구 text + 본번/부번 → PNU (bjdong code from our register data), then 단지명 as a check. Example: 레이크팰리스 59.97㎡ 매매 249,990만원 (2026-10); 전세 99,700만원; 월세 15,000/300.

## Added 2026-10-28 (evening)
- Also fetched 연립/다세대 (`rowhouse_*`, srhThingNo B) and 오피스텔 (`officetel_*`, D), 매매 + 전월세, same 3 districts and period (first-jobber scenarios). 18 CSVs total.
- Full CSV headers — 매매: NO, 시군구, 번지, 본번, 부번, 단지명, 전용면적(㎡), 계약년월, 계약일, 거래금액(만원), 동, 층, 매수자, 매도자, 건축년도, 도로명, **해제사유발생일** (non-empty → cancelled deal: exclude), 거래유형, 중개사소재지, 등기일자. 전월세: NO, 시군구, 번지, 본번, 부번, 단지명, 전월세구분, 전용면적(㎡), 계약년월, 계약일, 보증금(만원), 월세금(만원), 층, 건축년도, 도로명, 계약기간, 계약구분, 갱신요구권 사용, 종전계약 보증금(만원), 종전계약 월세(만원), 주택유형.
- API route for other regions later (user-supplied guide, `data/raw/docs/TransactionPrice.md`, PublicDataReader docs): data.go.kr services 아파트 매매 상세 (15126468), 아파트 전월세 (15126474), 오피스텔 매매/전월세 (15126464/15126475), 연립다세대 매매/전월세 (15126467/15126473), 단독다가구 (15126465/15126472). The API output has the same fields plus 법정동 codes and 단지일련번호 (`aptSeq`) and `해제여부`. Current keys are registered only for 토지 매매 and 단독/다가구 전월세 (verified); apartment services return "등록되지 않은 서비스키". Design the loader with two backends (CSV now, API when registered) behind one interface.
