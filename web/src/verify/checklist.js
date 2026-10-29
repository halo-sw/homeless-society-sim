// Stage 16a part 2: checklist scorer (pure, no DOM / network).
//
// JS port of tools/verify_checklist.py (the reference spec) with the
// orchestrator's audit fixes (2026-10-29):
//   1. Short keywords match as whole words only (matchKeyword, below).
//   2. A keyword next to a negation marker does not cover its item.
//   3. One-to-one matching: each agent line covers at most one
//      ground-truth item (greedy: must first, then longest keyword).
//
// Scoring contract (same numbers as the Python reference on clean input):
// same items (common + persona), same weights, must_coverage and
// weighted_coverage rounded to 2 decimals, pass when must is 100 % and
// weighted >= 0.8. `judge` is an injected async fallback for unmatched
// items (Muse Spark later); default none.

const HANGUL_RE = /[\uAC00-\uD7A3\u3131-\u318F]/;
// Single syllables that may directly follow a Korean keyword: particles
// (이/가/은/는/을/를/의/에/로/와/과/도/만, plus 으 for 으로). A following
// content syllable (향후, 짐작, 병원비, 안전한) means another word.
const PARTICLE_FOLLOW = new Set([...("이가은는을를의에로와과도만으")]);
const LATIN_SHORT_RE = /^[A-Za-z]{1,4}$/;
const KOREAN_RE = /[\uAC00-\uD7A3]/;

export function isHangul(ch) {
  return HANGUL_RE.test(ch);
}

// The whole-word rule, in one function. Returns start indices of every
// match of `keyword` in `text`:
//   - Latin keyword of <= 4 letters: \b on both sides ("park" matches
//     "park 근처" but not "parking"; "call" but not "recall").
//   - Korean keyword (any length: the audit's "안전한 투자" and "병원비"
//     show 2-syllable keywords need boundaries too): the match must start
//     at a word start (string start or non-Hangul before) and end at a
//     word end (string end, non-Hangul, or a particle after). So "향"
//     matches "향이" but not "향후"/"방향"; "남향" matches via its own
//     full keyword, not via "향".
//   - Anything else (longer Latin, mixed): case-insensitive substring,
//     exactly like the Python reference.
export function matchKeyword(keyword, text) {
  const kw = String(keyword ?? "");
  const s = String(text ?? "");
  if (!kw || !s) return [];
  if (LATIN_SHORT_RE.test(kw)) {
    const out = [];
    const re = new RegExp(`\\b${kw}\\b`, "gi");
    let m;
    while ((m = re.exec(s)) !== null) out.push(m.index);
    return out;
  }
  if (KOREAN_RE.test(kw)) {
    const out = [];
    let from = 0;
    while (true) {
      const i = s.indexOf(kw, from);
      if (i === -1) break;
      const leftOk = i === 0 || !isHangul(s[i - 1]);
      const j = i + kw.length;
      const rightOk = j >= s.length || !isHangul(s[j]) || PARTICLE_FOLLOW.has(s[j]);
      if (leftOk && rightOk) out.push(i);
      from = i + 1;
    }
    return out;
  }
  const out = [];
  const lowS = s.toLowerCase();
  const lowK = kw.toLowerCase();
  let from = 0;
  while (true) {
    const i = lowS.indexOf(lowK, from);
    if (i === -1) break;
    out.push(i);
    from = i + 1;
  }
  return out;
}

// Negation guard: a keyword occurrence with a negation marker within 12
// characters does not count ("소음은 확인하지 않았어요" covers nothing).
// Standalone 안 needs word-ish boundaries so 안전/불안 do not trip it.
const NEG_WINDOW = 12;
const NEG_SUB = ["않", "못", "없이", "제외"];
const NEG_EN_RE = /\b(skip|not)\b/i;

function hasStandaloneAn(win, winStart, full) {
  let from = 0;
  while (true) {
    const i = win.indexOf("안", from);
    if (i === -1) return false;
    const g = winStart + i;
    const leftOk = g === 0 || !isHangul(full[g - 1]);
    const r = full[g + 1];
    const rightOk = r === undefined || r === " " || r === "했" || r === "함"
      || r === "해" || r === "하" || (!isHangul(r) && !/[A-Za-z]/.test(r));
    if (leftOk && rightOk) return true;
    from = i + 1;
  }
}

export function isNegated(text, index, length) {
  const s = String(text ?? "");
  const start = Math.max(0, index - NEG_WINDOW);
  const win = s.slice(start, index + length + NEG_WINDOW);
  if (hasStandaloneAn(win, start, s)) return true;
  for (const m of NEG_SUB) {
    if (win.includes(m)) return true;
  }
  return NEG_EN_RE.test(win);
}

export function loadGroundTruth(json, persona) {
  const gt = typeof json === "string" ? JSON.parse(json) : json;
  if (!gt.personas || !gt.personas[persona]) {
    const have = gt.personas ? Object.keys(gt.personas) : [];
    throw new Error(`unknown persona: ${persona} (have: ${have.join(", ")})`);
  }
  return {
    persona,
    items: [...(gt.common_items || []), ...gt.personas[persona].items],
    acceptance: gt.acceptance,
  };
}

// Non-negated occurrences of one ground-truth item's keywords in one
// agent line, summarised for the greedy matcher.
function itemOccurrences(gtItem, agentText) {
  let longest = 0;
  let count = 0;
  for (const kw of gtItem.keywords || []) {
    const hits = matchKeyword(kw, agentText).filter(
      (i) => !isNegated(agentText, i, String(kw).length));
    if (hits.length > 0) {
      count += hits.length;
      if (String(kw).length > longest) longest = String(kw).length;
    }
  }
  return { longest, count };
}

// Python round(x, 2) uses round-half-even; Math.round does not
// (3/24 = 0.125 -> 0.12 in Python, 0.13 with Math.round).
function round2py(x) {
  const n = x * 100;
  const f = Math.floor(n);
  if (Math.abs(n - f - 0.5) < 1e-9) {
    return (f % 2 === 0 ? f : f + 1) / 100;
  }
  return Math.round(n) / 100;
}

// Score an agent-proposed checklist (array of free-text lines) against
// the ground truth. `loaded` is loadGroundTruth's return, or a persona
// key string when opts.groundTruth holds the parsed JSON.
export async function scoreChecklist(loaded, agentItems, opts = {}) {
  const { judge = null, groundTruth = null } = opts;
  let items;
  let acceptance;
  if (typeof loaded === "string") {
    if (!groundTruth) {
      throw new Error("scoreChecklist(personaKey, …) needs opts.groundTruth");
    }
    ({ items, acceptance } = loadGroundTruth(groundTruth, loaded));
  } else {
    ({ items, acceptance } = loaded);
  }
  const agents = (agentItems || []).map((a) => String(a ?? ""));
  const occ = items.map((it) => agents.map((t) => itemOccurrences(it, t)));
  const otherCount = (gt, a) => {
    let n = 0;
    for (let o = 0; o < items.length; o++) {
      if (o !== gt) n += occ[o][a].count;
    }
    return n;
  };

  // Greedy, one-to-one: must items first, then longest keyword; each
  // item claims its most specific still-free agent line (longest
  // keyword, most keyword hits, fewest hits for other items).
  const order = items.map((it, idx) => ({
    idx,
    must: it.priority === "must" ? 0 : 1,
    longest: Math.max(0, ...occ[idx].map((o) => o.longest)),
    id: it.id,
  })).sort((a, b) => (a.must - b.must) || (b.longest - a.longest)
    || (a.id < b.id ? -1 : 1));
  const claimed = new Set();
  const coveredIdx = new Set();
  for (const { idx } of order) {
    const cands = [];
    for (let a = 0; a < agents.length; a++) {
      if (claimed.has(a) || occ[idx][a].count === 0) continue;
      cands.push({ a, longest: occ[idx][a].longest, count: occ[idx][a].count,
        other: otherCount(idx, a) });
    }
    cands.sort((x, y) => (y.longest - x.longest) || (y.count - x.count)
      || (x.other - y.other) || (x.a - y.a));
    if (cands.length > 0) {
      claimed.add(cands[0].a);
      coveredIdx.add(idx);
    }
  }

  // Injected judge fallback for unmatched items (async, in item order).
  if (judge) {
    for (let idx = 0; idx < items.length; idx++) {
      if (coveredIdx.has(idx)) continue;
      if (await judge(items[idx], agentItems)) coveredIdx.add(idx);
    }
  }

  const w = acceptance.weights;
  const mustIdx = items.map((it, i) => (it.priority === "must" ? i : -1))
    .filter((i) => i >= 0);
  const mustCovRaw = mustIdx.length === 0 ? 1
    : mustIdx.filter((i) => coveredIdx.has(i)).length / mustIdx.length;
  const totalW = items.reduce((n, it) => n + w[it.priority], 0);
  const covW = items.reduce((n, it, i) => n + (coveredIdx.has(i) ? w[it.priority] : 0), 0);
  const weightedRaw = totalW === 0 ? 1 : covW / totalW;
  const covered = [];
  const missing = [];
  for (let i = 0; i < items.length; i++) {
    (coveredIdx.has(i) ? covered : missing).push(items[i].id);
  }
  const feedbackKo = missing
    .map((id) => items.find((it) => it.id === id))
    .sort((a, b) => (a.priority === "must" ? 0 : 1) - (b.priority === "must" ? 0 : 1))
    .map((it) => `[${it.priority.toUpperCase()}] ${it.id} ${it.label_ko} 항목이 빠졌어요.`);
  return {
    passed: mustCovRaw >= acceptance.must_coverage
      && weightedRaw >= acceptance.weighted_coverage_threshold,
    must_coverage: round2py(mustCovRaw),
    weighted_coverage: round2py(weightedRaw),
    covered,
    missing,
    feedback_ko: feedbackKo,
  };
}
