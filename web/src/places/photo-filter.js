// Photo relevance filter (13, Part 5). One keyword file for every photo
// slot: complex photos, station photos and geotagged neighbourhood
// photos all pass through isIrrelevantPhoto() before display.
//
// Drop when the title, description or categories suggest: people,
// portraits, events, food, interiors (except a station concourse or
// platform when kind = station and no people keywords), logos,
// documents, or other cities. Tests in photo-filter-13.test.js.

export const PEOPLE_KEYWORDS = [
  "portrait", "selfie", "face", "people", "person", "persons",
  "crowd", "pedestrian", "passenger", "passengers", "commuter",
  "man", "woman", "boy", "girl", "child", "children", "baby",
  "인물", "초상", "얼굴", "사람", "시민", "행인", "승객",
];

export const EVENT_KEYWORDS = [
  "wedding", "concert", "festival", "ceremony", "event", "protest",
  "demonstration", "press conference", "parade", "marathon",
  "exhibition", "performance", "rally", "campaign",
  "결혼", "공연", "축제", "행사", "시위", "집회", "이벤트",
];

export const FOOD_KEYWORDS = [
  "food", "dish", "meal", "cuisine", "restaurant", "cafe", "coffee",
  "bakery", "dessert", "beer", "menu",
  "음식", "요리", "맛집", "식당", "카페",
];

export const INTERIOR_KEYWORDS = [
  "interior", "bedroom", "kitchen", "bathroom", "living room",
  "officetel interior", "apartment interior",
  "실내", "내부", "거실", "침실", "주방", "화장실",
];

// Allowed interior-ish words only when kind = "station" (a concourse
// or platform is the station itself) and no people keywords match.
export const STATION_INTERIOR_ALLOW = [
  "concourse", "platform", "ticket gate", "ticketgate", "lobby",
  "대합실", "승강장", "개찰구", "역사 내부", "지하철역",
];

export const LOGO_DOC_KEYWORDS = [
  "logo", "emblem", "poster", "menu", "signage", "advertisement",
  "banner", "flyer", "document", "certificate", "map screenshot",
  "screenshot", "diagram", "chart", "graph",
  "로고", "간판", "광고", "포스터", "문서", "증명서", "지도 캡처",
];

// Other-city guard: a photo whose text names a city far outside
// 서울·경기 남동부 is never a station/complex photo for our homes.
export const OTHER_CITY_KEYWORDS = [
  "busan", "daegu", "incheon", "gwangju", "daejeon", "ulsan",
  "sejong", "jeju", "gangneung", "jeonju", "cheongju", "pohang",
  "tokyo", "osaka", "kyoto", "beijing", "shanghai",
  "부산", "대구", "인천", "광주", "대전", "울산", "세종", "제주",
  "강릉", "전주", "청주", "포항", "도쿄", "오사카", "베이징",
];

function textOf(photo) {
  const cats = Array.isArray(photo.categories) ? photo.categories.join(" ") : "";
  return `${photo.title || ""} ${photo.description || ""} ${cats}`;
}

function hasAny(text, words) {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(String(w).toLowerCase()));
}

function hasPeople(text) {
  return hasAny(text, PEOPLE_KEYWORDS);
}

// kind: "complex" | "station" | "street" (default "street").
export function irrelevantReason(photo, kind = "street") {
  if (!photo) return "missing";
  const text = textOf(photo);
  if (hasPeople(text)) return "people";
  if (hasAny(text, EVENT_KEYWORDS)) return "event";
  if (hasAny(text, FOOD_KEYWORDS)) return "food";
  if (hasAny(text, LOGO_DOC_KEYWORDS)) return "logo-or-document";
  if (hasAny(text, OTHER_CITY_KEYWORDS)) return "other-city";
  if (hasAny(text, INTERIOR_KEYWORDS)) {
    if (kind === "station" && hasAny(text, STATION_INTERIOR_ALLOW)) return null;
    return "interior";
  }
  return null;
}

export function isIrrelevantPhoto(photo, kind = "street") {
  return irrelevantReason(photo, kind) !== null;
}
