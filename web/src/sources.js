// Every source in one file (13, Part 10). The 출처·라이선스 drawer
// renders from SOURCES; every entry in ATTRIBUTION.md must appear
// here (sources-13.test.js guards the count). Per-photo credits stay
// on the photo itself.
//
// Fields: id, name, use (what this app uses it for), licence,
// version (date or version), url, mustNot (what you must not do).

export const SOURCES = [
  {
    id: "osm",
    name: "OpenStreetMap",
    short: "OSM",
    use: "지도·도보 그래프·지하철 노선도의 바탕 지도. 후보 집 위치와 출퇴근 경로 계산에 씁니다.",
    licence: "ODbL (Open Database License)",
    version: "전국 추출 2026-10-27T21:23:59Z",
    url: "https://www.openstreetmap.org/copyright",
    mustNot: "출처 없이 쓰면 안 돼요. OSM에서 고친 지도는 같은 ODbL로 공개해야 해요.",
  },
  {
    id: "geofabrik",
    name: "Geofabrik (한국 추출본)",
    use: "전국 OSM 파일(south-korea-latest.osm.pbf)을 받는 곳. 내용은 위 OSM과 같습니다.",
    licence: "ODbL (내용물은 OSM)",
    version: "2026-10-27 내려받기",
    url: "https://download.geofabrik.de",
    mustNot: "OSM과 같은 규칙을 따라야 해요.",
  },
  {
    id: "gis-buildings",
    name: "GIS건물통합정보 (국토교통부/VWorld)",
    short: "건물정보",
    use: "3D 집 모양과 층수·용도. 동 이름 확인과 단지 위치 매칭에도 씁니다.",
    licence: "CC BY / 공공누리 제1유형 (출처표시)",
    version: "기준일 2026-10-09",
    url: "https://www.vworld.kr",
    mustNot: "출처(국토교통부/VWorld)를 지우면 안 돼요.",
  },
  {
    id: "register-api",
    name: "건축물대장 표제부 API (국토교통부 건축HUB)",
    use: "지번별 건물 표제부(준공연도 등). 키는 서버에만 두고 결과는 저장하지 않아요.",
    licence: "국토교통부 귀속 (출처표시)",
    version: "공공데이터포털 1613000/BldRgstHubService",
    url: "https://www.data.go.kr",
    mustNot: "출처 없이 재배포하면 안 돼요.",
  },
  {
    id: "rtms",
    name: "국토교통부 실거래가 공개시스템 (RTMS)",
    short: "실거래가(국토부)",
    use: "후보 카드의 전세·월세·매매 중간값과 거래 건수. 9개 구·시, 2025-10-28…2026-10-27.",
    licence: "공공데이터 (참고용, 법적 효력 없음)",
    version: "계약일 기준 2025-10-28…2026-10-27",
    url: "https://rt.molit.go.kr",
    mustNot: "공식 통계처럼 인용하면 안 돼요. 계약일 기준이라 발표 통계와 다를 수 있어요.",
  },
  {
    id: "public-rentals",
    name: "공공주택 데이터 API (LH·마이홈)",
    use: "공공임대 단지·평면·공고. 실패하면 스냅샷(2026-10-28)으로 보여줘요.",
    licence: "제공처 이용약관 (API 키는 서버에만)",
    version: "스냅샷 2026-10-28 · /api/v1은 2026-10-29부터 404 확인",
    url: "https://public-housing-map.vercel.app/api/v1",
    mustNot: "키를 브라우저나 깃에 올리면 안 돼요.",
  },
  {
    id: "police-safety",
    name: "경찰청 범죄 발생 지역별 통계 (2025년)",
    use: "시군구별 범죄 발생 건수 표시. 합산 점수·등급은 매기지 않아요.",
    licence: "공공데이터 (출처·기간·단위·지역 단위와 함께 표시)",
    version: "2025-01-01…2025-12-31 (20251231 공표)",
    url: "https://www.police.go.kr",
    mustNot: "주민 위험도처럼 해석하면 안 돼요. 성남시는 시 단위라 분당구만 떼어 볼 수 없어요.",
  },
  {
    id: "seoul-metro-congestion",
    name: "서울교통공사 지하철혼잡도정보",
    use: "출근길 혼잡도(1–8호선, 30분 단위). 없는 노선은 ‘혼잡 자료 없음’으로 보여줘요.",
    licence: "공공누리 제3유형 (출처표시 + 변경금지)",
    version: "2026-09-30 기준",
    url: "https://data.seoul.go.kr",
    mustNot: "숫자를 고치거나 다른 값과 섞어 새 지표로 만들면 안 돼요.",
  },
  {
    id: "seoul-metro-interstation",
    name: "서울교통공사 역간거리 및 소요시간 (OA-12034)",
    use: "역 사이 표준 운행시간. 지하철 타는 시간 계산에 씁니다.",
    licence: "공공누리 제1유형 (출처표시)",
    version: "기준일 2024-03-25 (2026-10-29 내려받기)",
    url: "https://data.seoul.go.kr/dataList/OA-12034/S/1/datasetView.do",
    mustNot: "출처를 지우면 안 돼요. 실제 소요와 다를 수 있어요.",
  },
  {
    id: "molti-fare",
    name: "국토교통부 수도권 전철 운임 조정 (2025-06-28 시행)",
    use: "출퇴근 1회 요금. 거리비례 기본 1,550원(교통카드·성인) 규칙 그대로 계산해요.",
    licence: "공식 운임 고시 인용 (신분당선 별도운임은 확인 중)",
    version: "2025-06-28 시행",
    url: "https://www.molit.go.kr",
    mustNot: "옮긴 값을 공식 확답처럼 쓰면 안 돼요. 신분당선 별도운임은 사업자 페이지에서 확인하세요.",
  },
  {
    id: "commons",
    name: "Wikimedia Commons (동네 사진)",
    use: "단지·역·거리 사진. 매물 자체 사진이 아니며, 사진마다 작가·라이선스·원본 링크를 달아요.",
    licence: "사진마다 다름 (CC0 / CC BY / CC BY-SA 등)",
    version: "2026-10-29 수집 (지오태그 + 이름 검색)",
    url: "https://commons.wikimedia.org",
    mustNot: "작가·라이선스 표시를 떼면 안 돼요. CC BY-SA는 같은 조건으로 공유해야 해요.",
  },
  {
    id: "housing-fund",
    name: "주택도시기금 상품 안내 (버팀목·디딤돌·신생아 특례)",
    use: "도움 제도 탭의 조건 비교표. 공식 페이지 값을 옮긴 것으로 최종 판정은 안 해요.",
    licence: "공식 안내 인용 (2026-10-29 확인)",
    version: "2026-10-29 공식 페이지 기준",
    url: "https://nhuf.molit.go.kr",
    mustNot: "옮긴 값을 공식 확답처럼 쓰면 안 돼요. 신청 전 공식 페이지를 확인하세요.",
  },
  {
    id: "jeonse-context",
    name: "전세사기 피해 현황 문맥 (SBS Biz, 국토교통부 인용)",
    use: "전세 점검 탭의 피해 현황 한 줄. 출처 URL과 함께 기록해요.",
    licence: "보도 인용 (2025-03-10)",
    version: "피해자 27,372명, 20·30대 ≈74.6%",
    url: "https://biz.sbs.co.kr",
    mustNot: "개별 매물의 위험 판단 근거로 쓰면 안 돼요.",
  },
  {
    id: "pretendard",
    name: "Pretendard Variable 1.3.9 (글꼴)",
    use: "앱 전체 글꼴. 서버에서 직접 내려받아 함께 배포해요.",
    licence: "SIL Open Font License 1.1",
    version: "1.3.9",
    url: "https://github.com/orioncactus/pretendard",
    mustNot: "글꼴 파일을 따로 팔면 안 돼요.",
  },
  {
    id: "emil-skills",
    name: "Emil Kowalski skills (docs only)",
    use: "상호작용·애니메이션 설계 참고 문서. 코드에 포함되지 않아요.",
    licence: "MIT",
    version: "docs/emil-skills (SOURCE-COMMIT.txt)",
    url: "https://github.com/emilkowalski/skills",
    mustNot: "문서 저작권 표시를 지우면 안 돼요.",
  },
  {
    id: "nemotron-personas",
    name: "NVIDIA Nemotron-Personas-Korea",
    use: "예시 인물(페르소나) 카드의 말투 참고. 예시에는 ‘예시’ 딱지를 달아요.",
    licence: "CC BY 4.0",
    version: "12c 스냅샷",
    url: "https://huggingface.co/nvidia/Nemotron-Personas-Korea",
    mustNot: "출처 없이 예시를 실사용자처럼 보이면 안 돼요.",
  },
  {
    id: "astryx",
    name: "Astryx Design System",
    use: "버튼·카드·대화창 같은 화면 부품과 간격 규칙.",
    licence: "Astryx 라이선스 (@astryxdesign/core 0.7.4)",
    version: "0.7.4",
    url: "https://astryx.design",
    mustNot: "라이선스 범위를 벗어나 재배포하면 안 돼요.",
  },
  {
    id: "zillow-zori",
    name: "Zillow Observed Rent Index (ZORI)",
    use: "ZIP 단위 월세 추정 (매물 가격이 아닌 대표 월세, 참고용). 미국 후보의 월세 비교에 씁니다.",
    licence: "Zillow 인용 (출처 표시)",
    version: "ZIP 단위 추정 2026-09 기준",
    url: "https://www.zillow.com/research/data/",
    mustNot: "매물 가격처럼 쓰면 안 돼요. ZIP 대표 추정치라 개별 집 월세와 다를 수 있어요.",
  },
  {
    id: "osm-us",
    name: "OpenStreetMap (미국 북캘리포니아 추출본, Geofabrik)",
    use: "미국 후보 집 위치와 도보·자전거 경로 계산의 바탕 지도.",
    licence: "ODbL (Open Database License)",
    version: "미국 북캘리포니아 추출본",
    url: "https://download.geofabrik.de",
    mustNot: "출처 없이 쓰면 안 돼요. OSM에서 고친 지도는 같은 ODbL로 공개해야 해요.",
  },
  {
    id: "usgs",
    name: "USGS The National Map (지도·항공사진, 퍼블릭 도메인)",
    use: "미국 지도의 바탕 지도와 항공사진.",
    licence: "퍼블릭 도메인 (미국 정부 제작)",
    version: "USGSTopo · USGSImageryOnly",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer",
    mustNot: "USGS 출처를 지우면 안 돼요. 측량도처럼 쓰면 안 돼요.",
  },
  {
    id: "terrain-tiles",
    name: "AWS Terrain Tiles (Terrarium, SRTM)",
    use: "3D 지형 높이(2.5m 격자로 재가공). 국내는 SRTM 30m 기반이라 큰 산 모양만 맞고 세부 굴곡은 약해요.",
    licence: "Mapzen/Tilezen Joerd terrain tiles (SRTM 출처 표기)",
    version: "줌 14, 2026-10-29 내려받기 (lon 126.98–127.22, lat 37.27–37.62)",
    url: "https://registry.opendata.aws/terrain-tiles/",
    mustNot: "정밀 측량처럼 쓰면 안 돼요. 출처(AWS Terrain Tiles, SRTM)를 지우면 안 돼요.",
  },
];

export function sourceById(id) {
  return SOURCES.find((s) => s.id === id) || null;
}

// 26k: chips under the candidate list and the result. USD candidates
// or runs cite the US entries; anything else keeps the Korean tool
// citations (null = no override).
export function chipSourceIds({ candidates = null, currency = null } = {}) {
  if (currency === "USD") return ["zillow-zori", "osm-us", "usgs"];
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length > 0 && list.every((c) =>
    c && (c.currency === "USD" || c.country === "US"))) {
    return ["zillow-zori", "osm-us", "usgs"];
  }
  return null;
}

// Mini credit shown next to the number it explains.
export function miniCreditFor(feature) {
  const map = {
    rtms: "실거래: 국토교통부",
    walk: "도보: OSM 그래프",
    ride: "운행시간: 서울교통공사",
    rentals: "공공임대: LH·마이홈",
    safety: "범죄 통계: 경찰청",
    congestion: "혼잡도: 서울교통공사",
    fare: "운임: 국토교통부 (2025-06-28 시행)",
    photos: "사진: Wikimedia Commons",
    support: "조건: 주택도시기금 (2026-10-29 확인)",
  };
  return map[feature] || "";
}
