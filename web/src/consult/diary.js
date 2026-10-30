// Stage 27d: Muse writes "my diary" from the record digest; code checks every line.

import { findInventedNumbers } from "../judge/guards.js";

export const DIARY_PROMPT = [
  "너는 이 집들에서 각각 30일을 살아 본 '나'다. 아래 기록(facts)만 보고 쓴다.",
  "1) 집마다 일기 4~6줄. 한 줄은 fact 하나만 다루고 그 fact의 id를 단다. 일기체(~했다), 짧게, 그날의 느낌을 한마디 덧붙여도 되지만 숫자는 그 fact에 있는 숫자만 쓴다.",
  "2) summary: 고객에게 존댓말로 두 집의 차이를 3문장 이내로. 숫자는 totals와 facts에 있는 것만. 어느 집이 낫다, 계약하라 같은 판단은 하지 않는다.",
  'JSON으로만 답한다: {"summary": "...", "lines": [{"home": "A", "id": "<fact id>", "text": "..."}]}',
].join("\n");

const BANNED_SUMMARY = ["추천", "계약하", "사세요", "낫다"];

export function parseDiaryJson(content) {
  let text = String(content || "").trim();
  if (text.startsWith("```")) {
    const lines = text.split("\n");
    lines.shift();
    const end = lines.lastIndexOf("```");
    if (end >= 0) lines.length = end;
    text = lines.join("\n").trim();
  }
  return JSON.parse(text);
}

function digestsByLabel(digests) {
  const map = new Map();
  for (const d of digests || []) {
    if (!d || typeof d.label !== "string") continue;
    const factsById = new Map();
    for (const f of d.facts || []) {
      if (f && typeof f.id === "string") factsById.set(f.id, f);
    }
    map.set(d.label, { digest: d, factsById });
  }
  return map;
}

export function checkDiary(parsed, digests) {
  const failures = [];
  const byLabel = digestsByLabel(digests);
  const lines = parsed && Array.isArray(parsed.lines) ? parsed.lines : [];
  lines.forEach((line, i) => {
    const n = i + 1;
    const entry = line && typeof line.home === "string" ? byLabel.get(line.home) : null;
    if (!entry) {
      failures.push({ index: i, reason_ko: `줄 ${n}: 알 수 없는 집` });
      return;
    }
    const fact = typeof line.id === "string" ? entry.factsById.get(line.id) : null;
    if (!fact) {
      failures.push({ index: i, reason_ko: `줄 ${n}: 근거 없는 줄` });
      return;
    }
    const text = typeof line.text === "string" ? line.text : "";
    if (text.trim().length === 0) {
      failures.push({ index: i, reason_ko: `줄 ${n}: 빈 줄` });
      return;
    }
    if (text.length > 80) {
      failures.push({ index: i, reason_ko: `줄 ${n}: 80자를 넘었어요` });
      return;
    }
    const bad = findInventedNumbers(text, "", new Set(fact.numbers || []));
    if (bad.length > 0) {
      failures.push({ index: i, reason_ko: `줄 ${n}: 기록에 없는 숫자 ${bad[0]}` });
    }
  });
  let summaryOk = true;
  const summary = parsed && typeof parsed.summary === "string" ? parsed.summary : "";
  if (BANNED_SUMMARY.some((w) => summary.includes(w))) {
    summaryOk = false;
  } else {
    const allowed = new Set();
    for (const d of digests || []) {
      for (const f of (d && d.facts) || []) {
        for (const num of (f && f.numbers) || []) allowed.add(num);
      }
      const totals = (d && d.totals) || {};
      for (const v of Object.values(totals)) {
        if (Number.isFinite(v)) allowed.add(v);
      }
    }
    const bad = findInventedNumbers(summary, "", allowed);
    if (bad.length > 0) summaryOk = false;
  }
  return { failures, summaryOk };
}

function fallbackSummary(digests) {
  const parts = (digests || []).map((d) => {
    const v = d && d.totals ? d.totals.one_way_min : null;
    return `${d.label}는 출근 편도 평균 ${Number.isFinite(v) ? v : "–"}분`;
  });
  return `${parts.join(", ")}이었어요.`;
}

function keptLines(parsed, digests) {
  const byLabel = digestsByLabel(digests);
  const out = [];
  const lines = parsed && Array.isArray(parsed.lines) ? parsed.lines : [];
  const { failures } = checkDiary(parsed, digests);
  const badIdx = new Set(failures.map((f) => f.index));
  lines.forEach((line, i) => {
    if (badIdx.has(i)) return;
    const entry = byLabel.get(line.home);
    const fact = entry ? entry.factsById.get(line.id) : null;
    if (!fact) return;
    out.push({ home: line.home, id: line.id, text: line.text, day: fact.day, minute: fact.minute });
  });
  return out;
}

export async function writeDiary({ complete, provider, digests }) {
  const baseMessages = [
    { role: "system", content: DIARY_PROMPT },
    { role: "user", content: JSON.stringify(digests) },
  ];
  const first = await complete({ provider, messages: baseMessages, maxTokens: 2000 });
  const firstContent = (first && first.message && first.message.content) || "";
  let parsed;
  try {
    parsed = parseDiaryJson(firstContent);
  } catch {
    parsed = { summary: "", lines: [] };
  }
  let checked = checkDiary(parsed, digests);
  let retried = 0;
  let usage = (first && first.usage) || {};
  let current = parsed;
  let currentContent = firstContent;
  if (checked.failures.length > 0 || !checked.summaryOk) {
    retried = 1;
    const notes = checked.failures.map((f) => `줄 ${f.index + 1}: ${f.reason_ko.replace(/^줄 \d+: /, "")}`);
    if (!checked.summaryOk) notes.push("요약: 기록의 숫자만 쓰고 판단 표현(추천/계약/낫다)을 빼주세요.");
    const retry = await complete({
      provider,
      messages: [...baseMessages,
        { role: "assistant", content: currentContent },
        { role: "user", content: `고쳐 써주세요.\n${notes.map((n) => `${n}`).join("\n")}` }],
      maxTokens: 2000,
    });
    usage = (retry && retry.usage) || usage;
    const retryContent = (retry && retry.message && retry.message.content) || "";
    try {
      current = parseDiaryJson(retryContent);
    } catch {
      current = { summary: "", lines: [] };
    }
    currentContent = retryContent;
    checked = checkDiary(current, digests);
  }
  const lines = keptLines(current, digests);
  const dropped = (current && Array.isArray(current.lines) ? current.lines.length : 0) - lines.length;
  let summary = typeof current.summary === "string" ? current.summary : "";
  let summary_fallback = false;
  if (!checked.summaryOk) {
    summary = fallbackSummary(digests);
    summary_fallback = true;
  }
  const total = lines.length + dropped;
  return {
    ok: true,
    summary,
    lines,
    check: { total, passed: lines.length, retried, dropped, summary_fallback },
    usage,
  };
}
