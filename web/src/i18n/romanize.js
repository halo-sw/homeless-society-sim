// Revised Romanization of Hangul, syllable by syllable (pure, no DOM).
const LEADS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp",
  "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const MEDIALS = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye",
  "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu",
  "eu", "ui", "i"];
const TAILS = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k",
  "m", "l", "l", "t", "p", "l", "m", "p", "p", "t", "t", "ng",
  "t", "t", "k", "t", "p", "t"];

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

// Final jamo (jongseong index) that romanize to "k" / "p".
const K_FINALS = new Set([1, 2, 24]); // ㄱ ㄲ ㅋ
const P_FINALS = new Set([17, 26]); // ㅂ ㅍ

function isNasalLead(lead) {
  return lead === 2 || lead === 6; // ㄴ ㅁ
}

function decompose(ch) {
  const code = ch.codePointAt(0);
  if (code == null || code < HANGUL_START || code > HANGUL_END) return null;
  const s = code - HANGUL_START;
  return {
    lead: Math.floor(s / (21 * 28)),
    medial: Math.floor((s % (21 * 28)) / 28),
    tail: s % 28,
  };
}

function romanizeWord(word) {
  const syls = [];
  for (const ch of word) {
    const d = decompose(ch);
    if (!d) {
      syls.push({ ch });
      continue;
    }
    syls.push({ lead: d.lead, medial: d.medial, tail: d.tail,
      init: LEADS[d.lead], fin: TAILS[d.tail] });
  }
  for (let i = 1; i < syls.length; i++) {
    const prev = syls[i - 1];
    const cur = syls[i];
    if (prev.tail == null || cur.lead == null) continue;
    if ((prev.tail === 4 && cur.lead === 5) || // ㄴ + ㄹ
      (prev.tail === 8 && cur.lead === 2)) { // ㄹ + ㄴ
      prev.fin = "l";
      cur.init = "l";
    } else if (K_FINALS.has(prev.tail) && isNasalLead(cur.lead)) {
      prev.fin = "ng"; // final ㄱ before ㄴ/ㅁ → ng
    } else if (P_FINALS.has(prev.tail) && isNasalLead(cur.lead)) {
      prev.fin = "m"; // final ㅂ before ㄴ/ㅁ → m
    }
  }
  return syls.map((s) => (s.ch != null
    ? s.ch
    : s.init + MEDIALS[s.medial] + s.fin)).join("");
}

// Well-known station / neighbourhood names the rules alone get wrong.
export const NAMES = {
  강남: "Gangnam",
  잠실: "Jamsil",
  판교: "Pangyo",
  선릉: "Seolleung",
  성수: "Seongsu",
  송파: "Songpa",
  분당: "Bundang",
  수지: "Suji",
  위례: "Wirye",
  성남: "Seongnam",
  강동: "Gangdong",
  정자: "Jeongja",
  서현: "Seohyeon",
  삼성: "Samseong",
  역삼: "Yeoksam",
  신논현: "Sinnonhyeon",
  석촌: "Seokchon",
  문정: "Munjeong",
  가락: "Garak",
  오금: "Ogeum",
  건대입구: "Konkuk Univ.",
  왕십리: "Wangsimni",
  서울숲: "Seoul Forest",
  뚝섬: "Ttukseom",
  미금: "Migeum",
  동천: "Dongcheon",
  수내: "Sunae",
  야탑: "Yatap",
  모란: "Moran",
  복정: "Bokjeong",
  장지: "Jangji",
};

export function romanize(text) {
  return String(text).split(" ").map((w) => {
    const r = romanizeWord(w);
    return r.charAt(0).toUpperCase() + r.slice(1);
  }).join(" ");
}

export function romanizeName(name) {
  return String(name).trim().split(/\s+/).filter(Boolean).map((w) => {
    if (Object.hasOwn(NAMES, w)) return NAMES[w];
    let suffix = "";
    const last = w.charAt(w.length - 1);
    if (last === "역") {
      w = w.slice(0, -1);
      suffix = " Stn";
    } else if (last === "동") {
      w = w.slice(0, -1);
      suffix = "-dong";
    } else if (last === "구") {
      w = w.slice(0, -1);
      suffix = "-gu";
    } else if (last === "시") {
      w = w.slice(0, -1);
      suffix = "-si";
    }
    if (Object.hasOwn(NAMES, w)) return NAMES[w] + suffix;
    return romanize(w) + suffix;
  }).join(" ");
}
