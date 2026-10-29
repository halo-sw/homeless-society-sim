// Region / kind name words (client-safe, no keys): customer words
// ("판교", "빌라") -> region ids / home kinds. Shared by the server
// search tools and the browser chat engine (12b, B).

// Customer region words -> region ids (regions.json ids).
export const REGION_NAME_ALIASES = {
  seongdong: ["성동", "성동구", "seongdong"],
  "songpa-gu": ["송파", "송파구", "songpa-gu", "잠실"],
  gangnam: ["강남", "강남구", "gangnam"],
  gangdong: ["강동", "강동구", "gangdong", "천호"],
  bundang: ["분당", "분당구", "bundang", "서현", "수내"],
  sujeong: ["수정", "수정구", "sujeong"],
  jungwon: ["중원", "중원구", "jungwon", "모란"],
  suji: ["수지", "수지구", "suji"],
  wirye: ["위례", "wirye", "남위례"],
  pangyo: ["판교"],
  jeongja: ["정자"],
  migeum: ["미금"],
};

const PLACE_TO_REGION = { pangyo: "bundang", jeongja: "bundang", migeum: "bundang" };

export function regionsForNames(names) {
  const out = [];
  for (const raw of names || []) {
    const word = String(raw || "").trim();
    if (!word) continue;
    for (const [id, aliases] of Object.entries(REGION_NAME_ALIASES)) {
      if (id === word || aliases.includes(word)) {
        const region = PLACE_TO_REGION[id] || id;
        if (!out.includes(region)) out.push(region);
      }
    }
  }
  return out;
}

const KIND_ALIASES = {
  "아파트": "아파트", "apt": "아파트",
  "연립": "연립·다세대", "다세대": "연립·다세대", "빌라": "연립·다세대",
  "연립·다세대": "연립·다세대", "rowhouse": "연립·다세대",
  "오피스텔": "오피스텔", "오피": "오피스텔", "officetel": "오피스텔",
};

export function kindForName(name) {
  if (!name) return null;
  return KIND_ALIASES[String(name).trim()] || null;
}
