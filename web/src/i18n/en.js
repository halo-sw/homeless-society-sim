// Seed phrase table: every visible Korean string of ui/landing.jsx and
// ui/topbar.jsx, plus the #loading text in web/index.html.
// Plain, friendly English; Ithaca stays as is.
import { tablePhrases, tablePatterns } from "./en-table.js";

const seedPhrases = {
  // web/index.html
  "지역을 불러오는 중…": "Loading the area…",
  "Ithaca — 미니어처 3D": "Ithaca — Miniature 3D",

  // landing.jsx
  "계약 전에, 그 집에서 30일 먼저 살아 봐요": "Live 30 days in that home before you sign",
  "출근·돈·생활을 진짜 자료로 미리 살아 보고, 직접 고르세요": "Preview commutes, money and daily life with real data, then choose yourself",
  "어디로 출근하고, 누구와 살고, 예산은 얼마인가요?": "Where do you work, who do you live with, what is your budget?",
  "1인 사회초년생": "First-jobber living alone",
  "판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하": "New hire commuting to Pangyo: salary 40M won, savings 50M won, jeonse under 200M won",
  "예비·신혼부부": "Engaged / newly-wed couple",
  "맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상": "Dual-income engaged couple, working in Gangnam, jeonse under 400M won, 59m² or larger",
  "맞벌이 + 초등학생 자녀": "Dual-income + primary-school child",
  "맞벌이에 초등학생 아이 1명, 잠실 출근, 전세 6억 이하, 초등학교 도보 10분": "Dual-income with one primary-school child, working in Jamsil, jeonse under 600M won, primary school within a 10-min walk",
  "말로 조건 말하기": "Say what you need",
  "지도에서 후보 2곳 담기": "Save 2 candidates on the map",
  "30일 살아 보고 비교": "Compare after a 30-day preview",
  "서울 성동": "Seongdong, Seoul",
  "송파": "Songpa",
  "강남": "Gangnam",
  "강동": "Gangdong",
  "위례": "Wirye",
  "판교": "Pangyo",
  "성남": "Seongnam",
  "정자": "Jeongja",
  "분당": "Bundang",
  "미금": "Migeum",
  "수지": "Suji",
  "다루는 지역 11곳: 서울 성동 · 송파 · 강남 · 강동 · 위례 · 판교 · 성남 · 정자 · 분당 · 미금 · 수지": "11 areas covered: Seongdong, Seoul · Songpa · Gangnam · Gangdong · Wirye · Pangyo · Seongnam · Jeongja · Bundang · Migeum · Suji",
  "집값·전세: 국토교통부 실거래가 공개시스템 (최근 12개월, 참고용)": "Prices & jeonse: MOLIT actual transaction prices (last 12 months, for reference)",
  "집 위치·모양: OpenStreetMap + GIS건물통합정보 (국토교통부/VWorld)": "Home locations & shapes: OpenStreetMap + GIS building data (MOLIT/VWorld)",
  "타는 시간: 서울교통공사 표준 운행시간, 없으면 1~8호선 평균 속도로 추정": "Ride times: Seoul Metro standard times, or estimated from lines 1–8 average speed",
  "붐비는 정도: 서울교통공사 지하철혼잡도정보 (실측 표시가 없을 땐 가정값)": "Crowding: Seoul Metro congestion data (assumed values where no measured value is shown)",
  "주변 사진: Wikimedia Commons (자유 라이선스, 매물 사진 아님)": "Nearby photos: Wikimedia Commons (free licence, not listing photos)",
  "치안·학교: 경찰청·교육부 공식 통계만 (출처·기간·단위와 함께 표시)": "Safety & schools: official police and education statistics only (shown with source, period and unit)",
  "데이터 출처": "Data sources",
  "예시": "Example",
  "매물 글 붙여 넣기로 시작하기": "Start by pasting a listing",
  "매물 글 붙여 넣기": "Paste a listing",
  "본 매물 글을 붙여 넣으면 실거래와 비교해 드려요": "Paste a listing to compare it with actual transaction prices",

  // topbar.jsx
  "대화": "Chat",
  "살아 보기": "Preview",
  "동네 둘러보기": "Explore",
  "부동산 결정, 혼자 알아보기 어렵죠. 살아 보고, 돈 계산해 보고, 전세 신호를 확인하고, 도움 제도를 보고 직접 결정하세요.": "Choosing a home is hard alone. Preview life there, compare costs, check deposit signals, review support programmes, then decide yourself.",
  "정하지 않는 것: 집값이 오를지, 돈을 빌릴 수 있는지, 입주 자격, 살지 말지.": "We never decide for you: whether prices will rise, whether you can borrow, eligibility, or whether to move.",
  "설정": "Settings",
  "닫기": "Close",
  "모델": "Model",
  "가정 바꾸기": "Change assumptions",
  "대화에서 가정을 바꾸면 다음 살아 보기에 적용돼요.": "Assumption changes in chat apply to the next preview.",
  "대화로 이동": "Go to chat",
  "출처·라이선스": "Sources & licences",
  "이 시뮬레이션은?": "What is this simulation?",
  "지금 시뮬레이션 자세히": "About this simulation",
  "새로 시작": "Start over",
  "처음 화면으로 돌아가요.": "Return to the first screen.",
  "화면 선택": "Choose a view",
  "상황을 알려주세요": "Tell us your situation",
  "홈 선택": "Choose a home",
  "집만 밝게 보기": "Highlight homes only",
  "지역": "Area",
  "일시정지": "Pause",
  "재생": "Play",
  "범례": "Legend",
  "동네 전체": "Whole area",
  "따라가기": "Follow",
  // US area (26c-26e)
  "미국 자료는 월세만 있어요": "US data has rent only",
  "한 달 월세는 얼마까지 생각하세요? (예: $4,000 이하)": "How much rent can you pay per month? (e.g. up to $4,000)",
  "한 달 월세 상한(USD)": "Monthly rent limit (USD)",
  "달러(USD) 기준": "in US dollars",
  "가격 미정": "Price unknown",
  "미국 자료에는 전세·공공임대·지원 제도 정보가 없어요.": "US data has no jeonse, public rental or support programme information.",
  "Meta HQ까지 가까운 순": "Closest to Meta HQ",
  "월세 낮은 순": "Lowest rent",
  "미국 1곳: Menlo Park · Meta HQ (자전거·도보, Zillow 월세 추정)": "US, 1 area: Menlo Park · Meta HQ (bike/walk, Zillow rent estimate)",
  "미국 월세: Zillow Observed Rent Index (ZIP 단위 추정, 매물 가격 아님) · 지도 © OpenStreetMap © CARTO · 항공사진 USGS": "US rent: Zillow Observed Rent Index (ZIP-level estimate, not a listing price) · Map © OpenStreetMap © CARTO · Imagery USGS",
  "월세: Zillow ZORI (ZIP 추정) · 지도 © OpenStreetMap © CARTO · 항공사진 USGS": "Rent: Zillow ZORI (ZIP estimate) · Map © OpenStreetMap © CARTO · Imagery USGS",
  "자전거 속도": "Bike speed",
  "자전거 통근 상한": "Bike commute limit",
};

const seedPatterns = [
  { ko: "{0} 예시로 시작하기", en: "Start with the {0} example" },
  { ko: "다루는 지역 {0}곳: {1}", en: "Areas covered ({0}): {1}" },
];

// The seed wins over the generated table (one-off fixes go above).
export const phrases = { ...tablePhrases, ...seedPhrases };

// Specific patterns first; the generic splits go last so they never
// pre-empt a longer pattern that contains the same separator.
// US area (26c-26e): dollar amounts and bike/walk lines.
const usPatterns = [
  { ko: "{0}까지 자전거 {1}분 · 걷기 {2}분 · 추정 (속도 가정)", en: "{0}: bike {1} min · walk {2} min · estimate (assumed speed)" },
  { ko: "{0}까지 걷기 {1}분 · 자전거 {2}분 · 추정 (속도 가정)", en: "{0}: walk {1} min · bike {2} min · estimate (assumed speed)" },
  { ko: "월세 월 ${0} · ZIP {1} 추정 (Zillow)", en: "Rent ${0}/mo · ZIP {1} estimate (Zillow)" },
  { ko: "ZIP {0} 대표 월세 (Zillow ZORI, {1})", en: "Typical rent for ZIP {0} (Zillow ZORI, {1})" },
  { ko: "월세 월 ${0} 이하", en: "rent up to ${0}/mo" },
  { ko: "월세 ${0} 이하", en: "rent up to ${0}/mo" },
  { ko: "월 ${0}", en: "${0}/mo" },
  { ko: "직장: {0}", en: "Workplace: {0}" },
  { ko: "{0}까지 자전거 {1}분({2}분 이내, 속도 가정 {3}km/h)", en: "bike to {0} {1} min (within {2} min, assumed {3} km/h)" },
];
export const patterns = [ ...usPatterns,
  ...seedPatterns,
  ...tablePatterns,
  { ko: "{0} · {1}", en: "{0} · {1}" },
  { ko: "{0} — {1}", en: "{0} — {1}" },
  { ko: "{0} ({1})", en: "{0} ({1})" },
  { ko: "{0}: {1}", en: "{0}: {1}" },
];
