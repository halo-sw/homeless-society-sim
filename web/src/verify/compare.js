// 29j1: the two-home layer over verifyReport — a report is
// { persona, sentences: [{ id, home: "A"|"B", item_id, text_ko, claims, evidence }] }.
// Pure; no DOM, no network. The server (29j2) and UI (29j3) call this.

import { loadGroundTruth } from "./checklist.js";
import { verifyReport, attemptSummary, UNSUPPORTED_PERSONA_KO } from "./loop.js";
import { judgeCandidates, judgeEvidence } from "./evidence.js";
import { engineValue, householdMembers } from "./numbers.js";
import { householdKeys } from "../engine/moments.js";

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

// Ids of engine-backed items the writer cannot cover for this home:
// judge items with no candidate events in this run, plus (when home is
// passed explicitly) deterministic items whose engineValue is null
// (e.g. no money doc → C02 cannot be checked for that home).
export function inapplicableItems(loaded, run, home = null) {
  const ids = (loaded.items || [])
    .filter((it) => it.engine !== "none" && it.verify === "judge"
      && judgeCandidates(run, it.id).length === 0)
    .map((it) => it.id);
  // Two-arg calls keep the 29j1 behaviour (judge items only).
  if (arguments.length < 3) return ids;
  for (const it of loaded.items || []) {
    if (it.engine === "none" || it.verify !== "deterministic") continue;
    if (ids.includes(it.id)) continue;
    if (engineValue(it.id, run, { home }) === null) ids.push(it.id);
  }
  return ids;
}

// Minimal run the report step sends to the server: household members
// only (householdKeys), and only the fields the verifier reads.
export function slimRunForReport(run) {
  const r = run || {};
  const hh = householdKeys(r);
  const isHh = (a) => hh.has(a);
  const slimTrip = (t) => {
    if (!t || typeof t !== "object") return null;
    const out = {};
    for (const f of ["id", "agent", "day", "depart_min", "arrive_min",
      "minutes", "purpose", "mode", "distance_m", "parts"]) {
      if (t[f] !== undefined) out[f] = t[f];
    }
    for (const end of ["from", "to"]) {
      const p = t[end];
      if (p && typeof p === "object") {
        const kept = {};
        for (const f of ["id", "label", "kind"]) {
          if (p[f] !== undefined) kept[f] = p[f];
        }
        out[end] = kept;
      }
    }
    return out;
  };
  const slimAway = (a) => {
    if (!a || typeof a !== "object") return null;
    const out = {};
    for (const f of ["agent", "day", "kind", "start_min", "end_min", "label"]) {
      if (a[f] !== undefined) out[f] = a[f];
    }
    const d = a.detail;
    if (d && typeof d === "object") {
      const dd = {};
      if (d.ride && typeof d.ride === "object"
        && d.ride.minutesTotal !== undefined) {
        dd.ride = { minutesTotal: d.ride.minutesTotal };
      }
      if (d.rides && typeof d.rides === "object") {
        const rides = {};
        for (const half of ["out", "back"]) {
          const h = d.rides[half];
          if (h && typeof h === "object" && h.minutesTotal !== undefined) {
            rides[half] = { minutesTotal: h.minutesTotal };
          }
        }
        if (Object.keys(rides).length > 0) dd.rides = rides;
      }
      if (d.ride_minutes !== undefined) dd.ride_minutes = d.ride_minutes;
      if (Object.keys(dd).length > 0) out.detail = dd;
    }
    return out;
  };
  const agents = Array.isArray(r.agents) ? r.agents.filter((a) => {
    if (!a || typeof a !== "object") return false;
    const k = a.key ?? a.id ?? a.agent;
    return k !== undefined && k !== null && isHh(String(k));
  }) : [];
  const per = {};
  const pm = r.totals && r.totals.per_member;
  if (pm && typeof pm === "object") {
    for (const k of Object.keys(pm)) {
      if (isHh(String(k))) per[String(k)] = pm[k];
    }
  }
  return {
    meta: { start_date: r.meta?.start_date, area: r.meta?.area },
    agents,
    totals: { per_member: per },
    trips: (Array.isArray(r.trips) ? r.trips : [])
      .filter((t) => t && isHh(String(t.agent)))
      .map(slimTrip).filter(Boolean),
    aways: (Array.isArray(r.aways) ? r.aways : [])
      .filter((a) => a && isHh(String(a.agent)))
      .map(slimAway).filter(Boolean),
    decisions: (Array.isArray(r.decisions) ? r.decisions : []).map((d) => {
      if (!d || typeof d !== "object") return null;
      const out = {};
      for (const f of ["id", "agent", "day", "kind", "chosen_key"]) {
        if (d[f] !== undefined) out[f] = d[f];
      }
      return out;
    }).filter(Boolean),
  };
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
          const agents = (runs[label] && runs[label].agents) || [];
          for (const m of householdMembers(runs[label])) {
            const v = engineValue(it.id, runs[label],
              { member: m, home: homes[label] });
            if (v === null || v === undefined) {
              per[m] = v;
              continue;
            }
            const a = agents.find((x) => x && typeof x === "object"
              && (String(x.key) === m || String(x.id) === m
                || String(x.agent) === m));
            per[m] = { ...v, label_ko: (a && a.label) || null };
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
    const home = homes[label];
    const inap = inapplicableItems(loaded, runs[label], home);
    const inapplicableReasons = {};
    for (const id of inap) {
      if (engineValue(id, runs[label], { home }) === null) {
        const it = (loaded.items || []).find((e) => e.id === id);
        if (it && it.verify === "deterministic" && it.engine !== "none") {
          inapplicableReasons[id] = "이 집 자료로 계산할 수 없어요";
        }
      }
    }
    const res = verifyReport(reportL, runs[label], persona,
      { groundTruth, inapplicable: inap, inapplicableReasons,
        extraFailures: judged.failures });
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
