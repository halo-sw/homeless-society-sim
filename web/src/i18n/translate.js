import { romanizeName } from "./romanize.js";

const HANGUL = /[가-힣]/;

// 26t: placeholder shielding digit-group commas from the word splitter.
const COMMA_GUARD = "\u0001";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function num(s) {
  return parseFloat(String(s).replace(/,/g, ""));
}

function strip(s) {
  return String(s).replace(/,/g, "");
}

function formatM(m) {
  const r = Math.round(m * 10) / 10;
  return "₩" + String(r) + "M";
}

function plural(d, one, many) {
  const n = strip(d);
  return n === "1" ? `1 ${one}` : `${n} ${many}`;
}

function formatWon(won) {
  // One ₩ amount from a 천-bearing figure: ₩1.07M style at or above a
  // million (up to 2 decimals, trailing zeros trimmed), grouped won below.
  if (won >= 1000000) {
    const m = Math.round(won / 10000) / 100;
    return "₩" + String(m) + "M";
  }
  return "₩" + Math.round(won).toLocaleString("en-US");
}

const WEEKDAY = { 월: "Mon", 화: "Tue", 수: "Wed", 목: "Thu", 금: "Fri", 토: "Sat", 일: "Sun" };

// Korean number + unit → compact English. Only digit-prefixed units are
// touched; all other Hangul passes through.
export function localizeNumbers(s) {
  let out = String(s);
  // 천 amounts first: their 만/원 pieces would otherwise match the 억/만
  // rules below only partly ("100만 7천 원" → "₩1M" plus leftover).
  out = out.replace(/(\d+)\s*억\s*(\d[\d,]*)\s*만\s*(\d+)\s*천\s*원?/g,
    (_, a, b, c) => formatWon(100000000 * num(a) + 10000 * num(b) + 1000 * num(c)));
  out = out.replace(/(\d[\d,]*)\s*만\s*(\d+)\s*천\s*원?/g,
    (_, b, c) => formatWon(10000 * num(b) + 1000 * num(c)));
  out = out.replace(/(\d+)\s*천\s*만\s*원?/g,
    (_, a) => formatWon(10000000 * num(a)));
  out = out.replace(/(\d+)\s*천\s*원/g,
    (_, a) => formatWon(1000 * num(a)));
  // 억 is 100M; a number after 억, with or without 만, is ten-thousands.
  out = out.replace(/(\d[\d,]*)\s*억\s*(\d[\d,]*)\s*(만)?(\s*)(원)?/g,
    (_, a, b, man, sp, won) => formatM(100 * num(a) + num(b) / 100) + (won ? "" : sp));
  out = out.replace(/(\d[\d,]*)\s*억(\s*)(원)?/g,
    (_, a, sp, won) => formatM(100 * num(a)) + (won ? "" : sp));
  // 26t: 만 plus a comma-grouped remainder is one amount ("83만 5,000원"
  // → ₩835,000), like the 만/천 forms above. Runs after the 억 rules so
  // "1억 8,500만 원" keeps its 억 reading.
  out = out.replace(/(\d[\d,]*)\s*만\s*(\d[\d,]*)\s*원/g,
    (_, b, c) => formatWon(10000 * num(b) + num(c)));
  out = out.replace(/(\d[\d,]*)\s*만(\s*)(원)?/g,
    (_, b, sp, won) => formatM(num(b) / 100) + (won ? "" : sp));
  // Counters and misc units before the generic 일/개 rules below, so that
  // 일차 wins over 일 and 가지 is not split by 개.
  out = out.replace(/(\d+)일차/g, "Day $1");
  out = out.replace(/(\d+(?:\.\d+)?)\s*시간/g, "$1 h");
  out = out.replace(/(\d+)점(?![가-힣])/g, "$1 pts");
  out = out.replace(/(\d{4})년/g, "$1");
  out = out.replace(/(\d+)년/g, "$1 yr");
  out = out.replace(/(\d+)위/g, "#$1");
  out = out.replace(/(\d+)곳/g, "$1 places");
  out = out.replace(/(\d+)층/g, "floor $1");
  out = out.replace(/(\d+)호/g, "No. $1");
  out = out.replace(/(\d+)동(?![가-힣])/g, "Bldg $1");
  out = out.replace(/(\d+)회/g, "$1 times");
  out = out.replace(/(\d+)세(?![가-힣])/g, "age $1");
  out = out.replace(/(\d+)가지/g, "$1");
  out = out.replace(/(\d+)대(?![가-힣])/g, "$1s");
  out = out.replace(/\((월|화|수|목|금|토|일)\)/g, (_, w) => "(" + WEEKDAY[w] + ")");
  out = out.replace(/(\d[\d,]*)\s*분/g, "$1 min");
  out = out.replace(/(\d[\d,]*)\s*일/g, (_, d) => plural(d, "day", "days"));
  out = out.replace(/(\d[\d,]*)\s*개월/g, (_, d) => plural(d, "month", "months"));
  out = out.replace(/(\d[\d,]*)\s*번/g, (_, d) => plural(d, "time", "times"));
  out = out.replace(/(\d[\d,]*)\s*개/g, "$1");
  out = out.replace(/(\d[\d,]*)\s*명/g,
    (_, d) => (strip(d) === "1" ? "1 person" : `${strip(d)} people`));
  return out;
}

function hasBadPunct(s) {
  // Punctuation other than · - ( ) disqualifies the name-like fallback.
  return /[\p{P}\p{S}]/u.test(s.replace(/[·\-()]/g, ""));
}

function nameFallback(core) {
  const words = core.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 3) return undefined;
  if (/(요|다|까|죠|니다)[.?!]?$/.test(core)) return undefined;
  if (hasBadPunct(core)) return undefined;
  return romanizeName(core);
}

export function createTranslator({ phrases = {}, patterns = [], words = {} } = {}) {
  const cache = new Map();
  const missing = new Set();
  const compiled = (patterns || []).map((p) => {
    const slots = [];
    const src = String(p.ko).split(/\{(\d+)\}/g).map((part, i) => {
      if (i % 2 === 1) {
        slots.push(Number(part));
        return "(.+?)";
      }
      return escapeRegExp(part);
    }).join("");
    // 29a1: en may be a function of the translated captures (plurals).
    return { en: p.en, re: new RegExp("^" + src + "$"), slots };
  });

  function exactOrPattern(s) {
    if (Object.hasOwn(phrases, s)) return phrases[s];
    return matchPatterns(s);
  }

  // Common words first (glossary), then whole-string phrases, then a
  // trailing particle stripped and looked up again; only names fall
  // through to romanization. Never returns Hangul for a Hangul token.
  // 26t: a comma inside digits (/\d,\d{3}/) is not a split point, so
  // "₩835,000" never becomes "₩835, 000". The comma is guarded through
  // the split and restored before the per-token pass.
  function wordFallback(s) {
    const guarded = String(localizeNumbers(s)).replace(/(\d),(\d)/g, `$1${COMMA_GUARD}$2`);
    const tokens = guarded.split(/([·(),:])/g)
      .flatMap((p) => String(p).split(/ +/))
      .filter((t) => t !== "");
    const mapped = tokens.map((t0) => {
      // A token like 176시간 can survive the whole-string pass (digits
      // glued to the unit); localize it on its own before giving up.
      const tok = localizeNumbers(t0.split(COMMA_GUARD).join(","));
      if (!HANGUL.test(tok)) return tok;
      if (Object.hasOwn(words, tok)) return words[tok];
      if (Object.hasOwn(phrases, tok)) return phrases[tok];
      const bare = tok.replace(/(이|가|은|는|을|를|의|에|에서|으로|로|와|과|도|만)$/, "");
      if (bare !== tok && bare !== "") {
        if (Object.hasOwn(words, bare)) return words[bare];
        if (Object.hasOwn(phrases, bare)) return phrases[bare];
      }
      // 29a1: "<name>까지/에서/으로·로" — the particle is a
      // preposition, never part of the romanized name ("Gangnamkkaji").
      const pm = /^(.*?)(까지|에서|으로|로)$/.exec(tok);
      if (pm && (pm[1].length >= 2 || Object.hasOwn(words, pm[1]) || Object.hasOwn(phrases, pm[1]))) {
        const head = pm[1];
        const headEn = Object.hasOwn(words, head) ? words[head]
          : Object.hasOwn(phrases, head) ? phrases[head]
          : HANGUL.test(head) ? romanizeName(head) : head;
        if (!HANGUL.test(headEn)) return `${pm[2] === "에서" ? "from" : "to"} ${headEn}`;
      }
      return romanizeName(tok);
    });
    return mapped.join(" ").replace(/ ([,):])/g, "$1").replace(/\( /g, "(");
  }

  function matchPatterns(s) {
    for (const p of compiled) {
      const m = s.match(p.re);
      if (!m) continue;
      const caps = p.slots.map((n, i) => {
        let cap = m[i + 1] ?? "";
        if (HANGUL.test(cap)) {
          if (cap !== s) {
            const t = translateCore(cap);
            cap = HANGUL.test(t) ? wordFallback(t) : t;
          } else {
            cap = wordFallback(cap);
          }
        }
        return cap;
      });
      // 29a1: a function en picks the wording from the captures
      // ("1 thing checked" vs "3 things checked").
      if (typeof p.en === "function") return p.en(caps);
      let en = String(p.en);
      p.slots.forEach((n, i) => {
        en = en.split("{" + n + "}").join(caps[i]);
      });
      return en;
    }
    return undefined;
  }

  function translateCore(core) {
    const hit = cache.get(core);
    if (hit !== undefined) return hit;
    let result;
    let cand = core;
    // Money first when the core names eok/man: "전세 2억 6,000만 원"
    // localizes to "전세 ₩260M" before any stale table pattern runs.
    const numFirst = /억|만\s*원/.test(core);
    if (numFirst) {
      const loc = localizeNumbers(core);
      if (loc !== core) {
        cand = loc;
        result = exactOrPattern(loc);
        if (result === undefined && !HANGUL.test(loc)) result = loc;
      }
    }
    if (result === undefined) result = exactOrPattern(core);
    if (result === undefined && !numFirst) {
      const loc = localizeNumbers(core);
      if (loc !== core) {
        cand = loc;
        result = exactOrPattern(loc);
        if (result === undefined && !HANGUL.test(loc)) result = loc;
      }
    }
    if (result === undefined && HANGUL.test(cand)) {
      const tokens = cand.split(/\s+/).filter(Boolean);
      // A localized string (cand !== core) is data, not prose: keep the
      // localized numbers via wordFallback even when long, instead of
      // dropping them by returning the Korean core.
      const localized = cand !== core;
      result = ((tokens.length <= 8 || localized) && !/(요|다|까|죠|니다)[.?!]?$/.test(cand))
        ? wordFallback(cand)
        : nameFallback(cand);
    }
    if (result === undefined) {
      result = core;
      if (missing.size < 2000) missing.add(core);
    }
    if (cache.size > 5000) cache.clear();
    cache.set(core, result);
    return result;
  }

  function translate(text) {
    if (typeof text !== "string" || !HANGUL.test(text)) return text;
    const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m) return text;
    if (!m[2]) return text;
    return m[1] + translateCore(m[2]) + m[3];
  }

  return { translate, missing };
}
