// Shared glossary (stage 9a, Part E): plain-Korean housing definitions the
// agent and the UI both use (pure data — no React, no DOM).
//
// The UI shows `def` on hover/tap (see ui/gloss.jsx); the consult agent
// serves the same rows through the define_term tool. Official terms carry
// the official source link; market shorthand (전세가율, 주거비 부담률)
// carries none and says how it is computed instead.

export const GLOSSARY = [
  { term: "전세",
    def: "집주인에게 큰 보증금을 맡기고 월세 없이 사는 계약. 기간이 끝나면 보증금을 돌려받는다.",
    source_url: null },
  { term: "월세",
    def: "보증금과 매달 월세를 함께 내는 계약. 보증금이 적을수록 월세가 비싸지는 경우가 많다.",
    source_url: null },
  { term: "매매",
    def: "집을 사서 내 것으로 만드는 계약. 산 뒤에는 집값이 올라도 내려도 내 몫이다.",
    source_url: null },
  { term: "전세가율",
    def: "매매가 대비 전세가 비율(전세가 ÷ 매매가). 높을수록 깡통전세 의심을 받지만, 비율 하나로 안전을 판단할 수 없다.",
    source_url: null },
  { term: "LTV",
    def: "주택담보대출비율. 집값 대비 빌릴 수 있는 돈의 한도 비율이다.",
    source_url: "https://www.fsc.go.kr" },
  { term: "DSR",
    def: "총부채원리금상환비율. 연 소득 대비 모든 대출 원리금 상환액의 비율로, 대출 한도를 정하는 기준이다.",
    source_url: "https://www.fsc.go.kr" },
  { term: "확정일자",
    def: "계약서에 날짜 도장을 받는 것(등기소·주민센터·인터넷등기소). 나중에 집이 경매로 넘어가도 보증금을 우선 돌려받을 근거가 된다.",
    source_url: "https://www.iros.go.kr" },
  { term: "전입신고",
    def: "이사한 집에 주소를 옮기는 신고(주민센터·정부24). 확정일자와 함께 해야 대항력이 생긴다.",
    source_url: "https://www.gov.kr" },
  { term: "전세보증보험",
    def: "집주인이 보증금을 돌려주지 못할 때 대신 돌려주는 보증(HUG 등). 가입 조건과 보장 한도가 있다.",
    source_url: "https://www.khug.or.kr" },
  { term: "공공임대",
    def: "LH·SH 등이 공급하는 임대주택. 시세보다 싸고 거주 기간이 길지만, 소득·자산 등 입주 조건이 있다.",
    source_url: "https://www.lh.or.kr" },
  { term: "주거비 부담률",
    def: "소득 대비 주거비 비율(월 주거비 ÷ 월 소득). 이 앱은 30%를 참고선으로만 보여준다.",
    source_url: null },
  { term: "혼잡도",
    def: "지하철 한 칸에 사람이 얼마나 찼는지. 정원을 100%로 두고, 넘으면 서서 가는 사람이 많다는 뜻이다.",
    source_url: null },
  { term: "등기부등본",
    def: "집의 주민등록증 같은 서류. 진짜 주인, 빚(근저당), 압류가 있는지 인터넷등기소에서 뗄 수 있다.",
    source_url: "https://www.iros.go.kr" },
];

const BY_TERM = new Map(GLOSSARY.map((g) => [g.term, g]));

export function glossDef(term) {
  return BY_TERM.get(String(term || "").trim()) || null;
}

export function glossaryTerms() {
  return GLOSSARY.map((g) => g.term);
}
