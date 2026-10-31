// 29j1: the two-home layer over verifyReport — a report is
// { persona, sentences: [{ id, home: "A"|"B", item_id, text_ko, claims, evidence }] }.
// Pure; no DOM, no network. The server (29j2) and UI (29j3) call this.

import { loadGroundTruth } from "./checklist.js";
import { verifyReport, attemptSummary, UNSUPPORTED_PERSONA_KO } from "./loop.js";
import { judgeCandidates, judgeEvidence } from "./evidence.js";
import { engineValue, householdMembers } from "./numbers.js";

// Profile → persona key. members may be a plain array or a field
// object ({ value: [...] }); pets may be truthy plain or field .value.
export function personaFor(profile, { noCommute = false } = {}) {
  const p = profile || {};
  const raw = p.members && typeof p.members === "object" && !Array.isArray(p.members)
    && "value" in p.members ? p.members.value : p.members;
  const members = Array.isArray(raw) ? raw : [];
  if (members.some((m) => m && m.role === "child")) return "young_family";
  if (noCommute) return "remote_worker";
  if (members.some((m) => m
    && (m.role === "senior" || ["60s", "70s", "80+"].includes(m.ageBand)))) {
    return "multigen_family";
  }
  const petsRaw = p.pets && typeof p.pets === "object" && !Array.isArray(p.pets)
    && "value" in p.pets ? p.pets.value : p.pets;
  if (petsRaw) return "pet_owner";
  if (members.length === 1) return "single_firstjob";
  return "newlywed_couple";
}

// Ids of engine-backed judge items with no candidate events in this run:
// the writer cannot cover them for this home.
export function inapplicableItems(loaded, run) {
  return (loaded.items || [])
    .filter((it) => it.engine !== "none" && it.verify === "judge"
      && judgeCandidates(run, it.id).length === 0)
    .map((it) => it.id);
}

// What the writer needs per item, per home: deterministic items carry
// computed values, engine-backed judge items carry candidate events
// (id + text_ko only), engine:none items are flagged to skip.
export function reportDigest({ runs, labels, homes, persona, groundTruth, names = {} }) {
  const personaMap = (groundTruth && groundTruth.persona_map) || {};
  if (personaMap[persona] === null) {
    return { persona, unsupported: true, items: [] };
  }
  const loaded = loadGroundTruth(groundTruth, persona);
  const homesOut = {};
  for (const label of labels) {
    homesOut[label] = { name: (names && names[label]) || label };
  }
  const items = (loaded.items || []).map((it) => {
    const base = { id: it.id, label_ko: it.label_ko, priority: it.priority,
      engine: it.engine };
    if (it.engine === "none") return base;
    if (it.verify === "deterministic") {
      const values = {};
      for (const label of labels) {
        if (it.id === "N01") {
          const per = {};
          for (const m of householdMembers(runs[label])) {
            per[m] = engineValue(it.id, runs[label],
              { member: m, home: homes[label] });
          }
          values[label] = per;
        } else {
          values[label] = engineValue(it.id, runs[label],
            { home: homes[label] });
        }
      }
      return { ...base, values };
    }
    const events = {};
    for (const label of labels) {
      events[label] = judgeCandidates(runs[label], it.id).slice(0, 8)
        .map((e) => ({ id: e.id, text_ko: e.text_ko }));
    }
    return { ...base, events };
  });
  return { persona, unsupported: false, homes: homesOut, items };
}

// Verify one two-home report: each home's sentences through
// verifyReport (judge failures injected via judgeEvidence, empty
// engine-backed judge items marked inapplicable). Sentences whose
// home is not in labels fail as "알 수 없는 집이에요".
export async function verifyComparison(report, { runs, labels, homes, persona, groundTruth, judge = null }) {
  const personaMap = (groundTruth && groundTruth.persona_map) || {};
  if (personaMap[persona] === null) {
    return { pass: false, status: "미지원", reason_ko: UNSUPPORTED_PERSONA_KO,
      must_coverage: 0, weighted_coverage: 0, by_home: {}, failures: [],
      feedback_ko: [] };
  }
  const loaded = loadGroundTruth(groundTruth, persona);
  const sentences = (report && report.sentences) || [];
  const by_home = {};
  const failures = [];
  const feedback_ko = [];
  let mustMin = 1;
  let weightedMin = 1;
  for (const label of labels) {
    const homeSentences = sentences.filter((s) => s.home === label);
    const reportL = { persona, home: homes[label], sentences: homeSentences };
    const judged = await judgeEvidence(reportL, runs[label], loaded, judge);
    const inap = inapplicableItems(loaded, runs[label]);
    const res = verifyReport(reportL, runs[label], persona,
      { groundTruth, inapplicable: inap, extraFailures: judged.failures });
    by_home[label] = res;
    for (const f of res.failures) failures.push({ ...f, home: label });
    for (const line of res.feedback_ko) feedback_ko.push(`${label}: ${line}`);
    mustMin = Math.min(mustMin, res.must_coverage);
    weightedMin = Math.min(weightedMin, res.weighted_coverage);
  }
  const labelSet = new Set(labels);
  const unknown = sentences.filter((s) => !labelSet.has(s.home));
  for (const s of unknown) {
    failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "home",
      reason_ko: "알 수 없는 집이에요", home: s.home });
    feedback_ko.push(`${s.home}: 문장 ${s.id} (${s.item_id}): 알 수 없는 집이에요`);
  }
  const pass = labels.every((l) => by_home[l].pass) && unknown.length === 0;
  return { pass, must_coverage: mustMin, weighted_coverage: weightedMin,
    by_home, failures, feedback_ko };
}

// Same contract as runVerifyLoop but over verifyComparison.
export async function runComparisonLoop({ draft, revise, runs, labels, homes, persona, groundTruth, judge = null, maxRetries, onAttempt = null }) {
  if (!groundTruth) throw new Error("runComparisonLoop needs groundTruth");
  const retries = maxRetries ?? groundTruth.acceptance.max_retries ?? 3;
  const attempts = [];
  let report = draft;
  for (let attempt = 1; attempt <= 1 + retries; attempt++) {
    const result = await verifyComparison(report,
      { runs, labels, homes, persona, groundTruth, judge });
    const summary_ko = attemptSummary(result);
    attempts.push({ attempt, report, result, summary_ko });
    onAttempt?.({ attempt, summary_ko, pass: result.pass,
      weighted_coverage: result.weighted_coverage,
      must_coverage: result.must_coverage });
    if (result.pass || result.status === "미지원") {
      return { result, attempts, handoff: null };
    }
    if (attempt > retries) {
      return {
        result,
        attempts,
        handoff: {
          ask_user: true,
          question_ko: `리포트 검증을 ${attempts.length}번 시도했지만 통과하지 못했어요. `
            + `먼저 이 항목을 확인해 주세요: ${result.feedback_ko[0] ?? "누락된 항목"}`,
        },
      };
    }
    report = await revise(report, result, attempt);
  }
  return { result: attempts[attempts.length - 1].result, attempts, handoff: null };
}
