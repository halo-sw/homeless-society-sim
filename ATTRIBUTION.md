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
* **국토교통부 실거래가 공개시스템 (RTMS, stage 6)** — apartment /
  rowhouse / officetel trade + rent CSVs for 송파구 · 성동구 ·
  성남시 분당구, 2025-10-28…2026-10-27 (`data/raw/rtms/`, not
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
