import { romanizeName } from "./romanize.js";

const HANGUL = /[가-힣]/;

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

// Korean number + unit → compact English. Only digit-prefixed units are
// touched; all other Hangul passes through.
export function localizeNumbers(s) {
  let out = String(s);
  // 억 is 100M; a number after 억, with or without 만, is ten-thousands.
  out = out.replace(/(\d[\d,]*)\s*억\s*(\d[\d,]*)\s*만?\s*원?/g,
    (_, a, b) => formatM(100 * num(a) + num(b) / 100));
  out = out.replace(/(\d[\d,]*)\s*억\s*원?/g,
    (_, a) => formatM(100 * num(a)));
  out = out.replace(/(\d[\d,]*)\s*만\s*원?/g,
    (_, b) => formatM(num(b) / 100));
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
    return { en: String(p.en), re: new RegExp("^" + src + "$"), slots };
  });

  function exactOrPattern(s) {
    if (Object.hasOwn(phrases, s)) return phrases[s];
    return matchPatterns(s);
  }

  // Common words first (glossary), then whole-string phrases, then a
  // trailing particle stripped and looked up again; only names fall
  // through to romanization. Never returns Hangul for a Hangul token.
  function wordFallback(s) {
    const tokens = String(localizeNumbers(s)).split(/([·(),:])/g)
      .flatMap((p) => String(p).split(/ +/))
      .filter((t) => t !== "");
    const mapped = tokens.map((tok) => {
      if (!HANGUL.test(tok)) return tok;
      if (Object.hasOwn(words, tok)) return words[tok];
      if (Object.hasOwn(phrases, tok)) return phrases[tok];
      const bare = tok.replace(/(이|가|은|는|을|를|의|에|에서|으로|로|와|과|도|만)$/, "");
      if (bare !== tok && bare !== "") {
        if (Object.hasOwn(words, bare)) return words[bare];
        if (Object.hasOwn(phrases, bare)) return phrases[bare];
      }
      return romanizeName(tok);
    });
    return mapped.join(" ").replace(/ ([,):])/g, "$1").replace(/\( /g, "(");
  }

  function matchPatterns(s) {
    for (const p of compiled) {
      const m = s.match(p.re);
      if (!m) continue;
      let en = p.en;
      p.slots.forEach((n, i) => {
        let cap = m[i + 1] ?? "";
        if (HANGUL.test(cap)) {
          if (cap !== s) {
            const t = translateCore(cap);
            cap = HANGUL.test(t) ? wordFallback(t) : t;
          } else {
            cap = wordFallback(cap);
          }
        }
        en = en.split("{" + n + "}").join(cap);
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
      result = (tokens.length <= 8 && !/(요|다|까|죠|니다)[.?!]?$/.test(cand))
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
