# 건축HUB 건축물대장정보 서비스 — facts for the pipeline

Source: official guide `OpenAPI활용가이드-_건축HUB_건축물대장_1.0` (supplied by the user, kept uncommitted in `data/raw/docs/`), plus one live call made by the orchestrator on 2026-10-28 (saved at `data/raw/register_api_samples/getBrTitleInfo_4113511000105530000.json`).

- Base: `https://apis.data.go.kr/1613000/BldRgstHubService/<operation>`; `_type=json`; key as `serviceKey`.
- Operations used: `getBrTitleInfo` (표제부, one record per building/동) and `getBrRecapTitleInfo` (총괄표제부, one per complex: `hhldCnt` 세대수, `mainBldCnt` 주건축물수, `totArea`).
- Request: `sigunguCd` (5, required), `bjdongCd` (5, required), `platGbCd` optional — **0 = 대지, 1 = 산, 2 = 블록**, `bun` (4), `ji` (4), `numOfRows` ≤ 100, `pageNo`. Paginate with `ceil(totalCount / numOfRows)`.
- Limits: average response ~500 ms, **max 30 TPS** per the guide. Stay well below (≤ 5 req/s).
- Success header: `resultCode "00"`, `resultMsg "NORMAL SERVICE"`. `items` may be `""` when empty and `item` may be a dict instead of a list when there is one record.
- Confirmed title fields (live): `bldNm`, `dongNm`, `mainPurpsCdNm`, `grndFlrCnt`, `ugrndFlrCnt`, `heit` (m, 0 = unknown), `archArea` (건축면적 m²), `totArea`, `hhldCnt`, `useAprDay` (YYYYMMDD), `mgmBldrgstPk`, `regstrKindCdNm`, `mainAtchGbCdNm` (주/부속), `platPlc`, `newPlatPlc`, `block`, `lot`.
- Live example: 성남시 분당구 백현동 553 returns **36 title records** (백현마을 4xx동, 경비실, 지하주차장 …) on one parcel. The register polygons there have no 동 name, so matching cannot rely on `dongNm` ↔ `A25`. Use a footprint-area match: compare each OSM/register polygon area with `archArea` of the parcel's main buildings (`mainAtchGbCdNm == 주건축물`, `grndFlrCnt > 0`), one-to-one assignment by smallest relative difference with a tolerance (e.g. ≤ 15 %), and leave ties/out-of-tolerance as inferred. Exclude 경비실 / 지하주차장 / 부속 records from height assignment.
- New towns (판교 etc.) may be addressed by 블록 (`platGbCd=2`); if a 대지 query returns 0 records, retry once with `platGbCd=2` before giving up.
