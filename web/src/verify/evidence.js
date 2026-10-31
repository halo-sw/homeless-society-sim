// Stage 16a part 3: evidence checks (pure, no DOM / network).
//
// evidenceIndex(run) collects every citable id of a run: trip ids,
// away ids, decision ids, and decisions' ref_ids (the engine has no
// ref_ids yet — read defensively for forward compatibility). Aways
// carry no engine id, so the index synthesises a stable one from
// agent/day/start/kind; the report cites whatever this index holds.
//
// A verify:"judge" sentence with engine support needs at least one
// evidence id from the index, else "근거 없는 문장". C06/N03 are
// engine-backed now (life-events dark_walk/late_home trips); other
// judge items stay engine:"none" and are never failed here. The judge
// model call is injected through judgeEvidence (below).

export function awayId(away) {
  return `away:${away.agent}:${away.day}:${away.start_min}:${away.kind}`;
}

export function evidenceIndex(run) {
  const ids = new Set();
  for (const t of (run && run.trips) || []) {
    if (t && t.id) ids.add(t.id);
  }
  for (const a of (run && run.aways) || []) {
    if (a) ids.add(awayId(a));
  }
  for (const d of (run && run.decisions) || []) {
    if (!d) continue;
    if (d.id) ids.add(d.id);
    for (const r of d.ref_ids || []) ids.add(r);
  }
  return ids;
}

import { lifeEventTrips, sunsetMinFor } from "../engine/life-events.js";
import { hhmm } from "../timeline.js";

// 29k1: the record says how (walk/bike/transit) and when —
// dark_walk trips append the after-sunset scene (with that run's
// sunset time), late_home trips the after-22:00 scene.
function tripTextKo(t, scene = [], sunset = null) {
  const day = (t.day ?? 0) + 1;
  const arr = hhmm(t.arrive_min ?? t.depart_min ?? 0);
  const move = t.mode === "bike" ? "자전거" : "걸어서";
  const mins = typeof t.minutes === "number" ? ` ${t.minutes}분` : "";
  const from = t.from_label ? ` (${t.from_label}에서)` : "";
  let tail = "";
  if (scene.includes("dark_walk")) {
    tail += sunset ? ` · 해 진 뒤(일몰 ${sunset})` : " · 해 진 뒤";
  }
  if (scene.includes("late_home")) tail += " · 밤 10시 넘어";
  return `${day}일 ${arr} 집 도착 · ${move}${mins}${from}${tail}`;
}

// 29k1: which life-event scenes (dark_walk and/or late_home) a trip
// id belongs to, reusing the judge candidate predicates — no new rules.
function tripScenes(run, id) {
  const scene = [];
  for (const kind of ["dark_walk", "late_home"]) {
    if (lifeEventTrips(run, kind).some((t) => t && t.id === id)) {
      scene.push(kind);
    }
  }
  return scene;
}

// 29j1: candidate engine events backing one judge item of one run.
// C06 → dark_walk ∪ late_home (deduped by id); N03 → late_home;
// anything else → []. Each entry gains text_ko.
export function judgeCandidates(run, itemId) {
  const kinds = itemId === "C06" ? ["dark_walk", "late_home"]
    : itemId === "N03" ? ["late_home"] : [];
  if (kinds.length === 0) return [];
  const sunset = hhmm(sunsetMinFor(run && run.meta));
  const seen = new Set();
  const out = [];
  for (const k of kinds) {
    for (const t of lifeEventTrips(run, k)) {
      if (!t || seen.has(t.id)) continue;
      seen.add(t.id);
      const scene = tripScenes(run, t.id);
      out.push({ ...t, scene, text_ko: tripTextKo(t, scene, sunset) });
    }
  }
  return out;
}

// 29j1: compact records for cited ids of one run. Trips, aways
// (via the evidenceIndex away id) and decisions; unknown ids skipped.
export function citedEvents(run, ids) {
  const out = [];
  const sunset = hhmm(sunsetMinFor(run && run.meta));
  const tripsById = new Map(((run && run.trips) || []).map((t) => [t && t.id, t]));
  const awaysById = new Map();
  for (const a of ((run && run.aways) || [])) {
    if (a) awaysById.set(awayId(a), a);
  }
  const decisionsById = new Map();
  for (const d of ((run && run.decisions) || [])) {
    if (d && d.id) decisionsById.set(d.id, d);
  }
  for (const id of ids || []) {
    const t = tripsById.get(id);
    if (t) {
      // Walk is the engine default (walking trips carry no mode);
      // trips with parts are transit rides.
      const mode = t.mode
        ?? (Array.isArray(t.parts) && t.parts.length ? "transit" : "walk");
      const scene = tripScenes(run, t.id);
      const entry = scene.length > 0
        ? lifeEventTrips(run, scene[0]).find((e) => e && e.id === t.id)
        : null;
      const view = entry || { ...t,
        from_label: (t.from && t.from.label) || null };
      out.push({
        id: t.id, type: "trip",
        day: (t.day ?? 0) + 1,
        depart: hhmm(t.depart_min ?? 0),
        arrive: hhmm(typeof t.arrive_min === "number" && Number.isFinite(t.arrive_min)
          ? t.arrive_min
          : (t.depart_min ?? 0) + (t.minutes ?? 0)),
        purpose: t.purpose,
        minutes: t.minutes,
        mode,
        scene,
        text_ko: tripTextKo({ ...view, mode }, scene, sunset),
        from_label: (t.from && t.from.label) || null,
        to_kind: (t.to && t.to.kind) || null,
      });
      continue;
    }
    const a = awaysById.get(id);
    if (a) {
      out.push({
        id, type: "away",
        day: (a.day ?? 0) + 1,
        kind: a.kind,
        start: hhmm(a.start_min ?? 0),
        end: hhmm(a.end_min ?? 0),
        label: a.label || null,
      });
      continue;
    }
    const d = decisionsById.get(id);
    if (d) {
      out.push({
        id, type: "decision",
        day: (d.day ?? 0) + 1,
        kind: d.kind,
        chosen_key: d.chosen_key,
      });
    }
  }
  return out;
}

// 29j1: the injected judge model call over engine-backed judge
// sentences. For every sentence whose item is engine-backed
// (engine !== "none") and verify === "judge" and that already cites
// ≥1 indexed id, call await judge(sentence, citedEvents(...)). A
// { supported: false, reason } answer becomes a kind:"judge" failure.
// judge null → { failures: [] }. A throwing judge counts as no failure
// for that sentence but adds { judge_error: true } to the result.
export async function judgeEvidence(report, run, loaded, judge) {
  if (!judge) return { failures: [] };
  const failures = [];
  let judgeError = false;
  const byId = new Map((loaded.items || []).map((it) => [it.id, it]));
  const index = evidenceIndex(run);
  for (const s of (report && report.sentences) || []) {
    const item = byId.get(s.item_id);
    if (!item || item.engine === "none" || item.verify !== "judge") continue;
    const cited = (s.evidence || []).filter((id) => index.has(id));
    if (cited.length === 0) continue;
    let verdict = null;
    try {
      verdict = await judge(s, citedEvents(run, cited));
    } catch {
      judgeError = true;
      continue;
    }
    if (verdict && verdict.supported === false) {
      failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "judge",
        reason_ko: "근거가 문장을 뒷받침하지 않아요"
          + (verdict.reason ? ` (${verdict.reason})` : "") });
    }
  }
  const out = { failures };
  if (judgeError) out.judge_error = true;
  return out;
}

// Check every judge-verify, engine-backed sentence. `loaded` is
// loadGroundTruth's return ({ items }). Returns { failures } with
// failures of { sentence_id, item_id, kind: "evidence", reason_ko }.
export function checkEvidence(report, run, loaded) {
  const failures = [];
  const byId = new Map((loaded.items || []).map((it) => [it.id, it]));
  const index = evidenceIndex(run);
  for (const s of (report && report.sentences) || []) {
    const item = byId.get(s.item_id);
    if (!item || item.engine === "none" || item.verify !== "judge") continue;
    const cited = (s.evidence || []).filter((id) => index.has(id));
    if (cited.length === 0) {
      failures.push({ sentence_id: s.id, item_id: s.item_id, kind: "evidence",
        reason_ko: "근거 없는 문장" });
    }
  }
  return { failures };
}
