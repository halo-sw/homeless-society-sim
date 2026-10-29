# Attribution

Data sources used by the stage-1 pipeline. Keep this file and the on-screen
attribution in later stages in sync.

* **OpenStreetMap** — © OpenStreetMap contributors. Data is available under
  the Open Database License (ODbL): <https://www.openstreetmap.org/copyright>
  (licence text: <https://opendatacommons.org/licenses/odbl/>). National
  extract used here: data up to 2026-10-27T21:23:59Z.
* **Geofabrik** — national South-Korea extract
  (`south-korea-latest.osm.pbf`) downloaded from the Geofabrik download
  service: <https://download.geofabrik.de> (<https://www.geofabrik.de>).
  Extract contents are OpenStreetMap data (ODbL, see above).
* **GIS건물통합정보 (building register)** — 건물통합정보 provided by the
  Ministry of Land, Infrastructure and Transport (국토교통부) via VWorld.
  Source shapefiles (`data/raw/buildings/<region>/`, 기준일 2026-10-09)
  are labelled CC BY / 공공누리 제1유형 (attribution). VWorld:
  <https://www.vworld.kr>.
* **건축물대장 표제부 API (building register title API, stage 2)** —
  title records from 국토교통부 건축HUB via the public data portal
  (`https://www.data.go.kr`, service `1613000/BldRgstHubService`),
  fetched per parcel by `pipeline/register_api.py` (key from
  `DATA_GO_KR_KEY`, raw responses cached under
  `data/raw/register_api/`). Same register family as above; carries the
  same 국토교통부 attribution.

Derived files under `data/build/` mix these sources: OSM-derived geometry
remains ODbL-covered, and register-derived building attributes require the
register attribution above. When the simulator displays a map or scene, show
“© OpenStreetMap contributors · GIS건물통합정보 (국토교통부/VWorld)” with a
link to this file or the sources above.
* **국토교통부 실거래가 공개시스템 (RTMS, stage 6; 9 districts in 12a)** — apartment /
  rowhouse / officetel trade + rent CSVs for 송파구 · 성동구 ·
  성남시 분당구 (stage 6) plus 강남구 · 강동구 · 성남시 수정구 ·
  중원구 · 용인시 수지구 · 하남시 (stage 12a), all
  2025-10-28…2026-10-27 (`data/raw/rtms/`, not
  committed): <https://rt.molit.go.kr>. Reference use only, no legal
  effect, contract-date basis; for public statistics use the official
  stats. Shown on screen with every price reference.
* **공공주택 데이터 API — LH·마이홈 (stage 6)** — public-rental
  complexes, unit types and notices via
  `https://public-housing-map.vercel.app/api/v1` (key `HOUSING_API_KEY`,
  server-side only); dev/tests use the local snapshot
  `data/raw/public_housing/snapshot_3districts.json` (fetched
  2026-10-28, not committed). Shown on screen as “LH·마이홈
  (공공주택 데이터 API, 스냅샷 시각 표시)”.
* **경찰청 범죄 발생 지역별 통계 (2025년, stage 9a)** —
  `경찰청_범죄 발생 지역별 통계_20251231.csv` (`data/raw/safety/`, not
  committed): occurrence counts by 범죄대분류/범죄중분류 per 시군구 for
  the year ending 2025-12-31. Used for local computation and display
  only — the CSV and the derived `data/build/region/safety.json` are
  never committed or redistributed. Shown on screen with every reading
  (source, period, unit, geographic level). 성남시 is city-level
  (판교/분당 not separable); counts are where crimes were recorded, not
  a resident's risk; no scores, no rankings.
* **서울교통공사 지하철혼잡도정보 (stage 8)** —
  `서울교통공사_지하철혼잡도정보_20260930.xlsx`
  (`data/raw/traffic/`, not committed): Seoul Metro lines 1–8, sheets
  평일/토요일/일요일, per line / station number / station name /
  direction, 30-minute slots 05:30…25:00 (average congestion %;
  34 % ≈ all seats taken, 100 % = rated capacity). Licence:
  공공누리 3유형 (출처표시+변경금지). Used for local computation and
  display only — the xlsx and the derived
  `data/build/region/congestion.json` are never committed or
  redistributed. Shown on screen as “서울교통공사
  지하철혼잡도정보(2026-09-30 기준)” with every congestion reading and
  in the journey legend; lines without coverage (신분당선·수인분당선·9호선
  등) show “혼잡도 자료 없음” and use the C-congestion 가정값.
* **주택도시기금 상품 안내 (stage 10, Part F)** — 버팀목·디딤돌·신생아
  특례 조건값은 공식 상품 페이지(nhuf.molit.go.kr, 2026-10-29 확인)를
  옮긴 것으로 `scenarios/assumptions/kr-support-programs.json`에
  프로그램별 `source_url`·`as_of`·조건별 `note`와 함께 기록한다.
  화면에는 “(2026-10-29 공식 페이지 기준)”과 공식 페이지 링크를 함께
  보여주며, 최종 판정은 하지 않는다.
* **전세사기 피해 현황 문맥 (stage 10, Part F)** —
  `scenarios/assumptions/kr-jeonse-checklist.json`의 문맥줄은 국토교통부
  자료를 인용한 2025-03-10 SBS Biz 보도(피해자 27,372명, 20·30대
  20,432명 ≈ 74.6 %)에서 가져왔으며 출처 URL과 함께 기록한다.

## Wikimedia Commons (neighbourhood photos, stage 12)

`scenarios/places/commons-photos.json` lists freely licensed, geotagged photos from Wikimedia Commons (CC0, public domain, CC BY, CC BY-SA) near the 11 areas, fetched 2026-10-29 with the MediaWiki API. The repository stores only the manifest (title, author, licence, link, coordinates). Thumbnails load from upload.wikimedia.org. Every photo shown in the app carries its author, licence and a link to its Commons page. These photos show the neighbourhood, never a specific listing.

## 서울교통공사 역간거리 및 소요시간 (stage 12a2)
- File: `scenarios/transit/seoul-metro-interstation.csv` (UTF-8 copy of the file on 서울 열린데이터광장, dataset OA-12034, downloaded 2026-10-29; lines 1–8, standard running time per station gap, reference date 2024-03-25).
- Source: 서울교통공사, https://data.seoul.go.kr/dataList/OA-12034/S/1/datasetView.do
- Licence: 공공누리 제1유형 (출처표시). Running times are the operator's standard schedule; real trips vary.

## 국토교통부 수도권 전철 운임 조정 (stage 15)
- Rule: 수도권 통합 거리비례 운임 (교통카드, 성인), 시행 2025-06-28. Base 1,550원 to 10 km; 10–50 km +100원 per started 5 km; over 50 km +100원 per started 8 km; single-use ticket +100원; transfers inside the integrated system add no new base fare.
- Source: 국토교통부, <https://www.molit.go.kr>. Quoted rule, not legal advice; check the official notice before quoting.
- Distances come from the interstation file above (lines 1–8); other legs use the engine's OSM chainage or the straight line × 1.2 and are marked 추정.
- 신분당선 구간별 별도운임 (신사–강남, 강남–정자, 정자–광교) stays null with status 확인 필요 until filled from the operator's official page; trips touching the line show “신분당선 별도운임 확인 중” and keep the 가정값 source.

## Wikimedia Commons, name search (stage 13)
- File: `scenarios/places/commons-named.json`. A manifest only, no image bytes: 884 freely licensed photos found by searching Commons for station names (117 stations) and apartment complex names (20 complexes), fetched 2026-10-29.
- Each item keeps its author, licence, licence URL and source page; the app shows a credit per photo.

## AWS Terrain Tiles, Terrarium (stage 14)
- Directory: `data/raw/dem/terrarium/14/{x}_{y}.png` (231 tiles, zoom 14, lon 126.98–127.22, lat 37.27–37.62, downloaded 2026-10-29, not committed).
- Source: AWS Terrain Tiles (Mapzen/Tilezen Joerd), <https://registry.opendata.aws/terrain-tiles/>. In Korea the tiles derive from SRTM (~30 m effective), resampled here to a 2.5 m grid with bilinear interpolation plus weak seeded noise (see `pipeline/dem.py`).
- Decode: `elevation_m = R*256 + G + B/256 − 32768`.
- Use: 3D terrain heights only (built into per-box `scene.json`, ODbL OSM data stays separate). Shown on screen via the 출처·라이선스 drawer (`terrain-tiles` in `web/src/sources.js`). Not survey-grade: mountain outlines only.
