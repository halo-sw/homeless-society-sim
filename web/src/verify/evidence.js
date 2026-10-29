// Stage 16a part 3: evidence checks (pure, no DOM / network).
//
// evidenceIndex(run) collects every citable id of a run: trip ids,
// away ids, decision ids, and decisions' ref_ids (the engine has no
// ref_ids yet — read defensively for forward compatibility). Aways
// carry no engine id, so the index synthesises a stable one from
// agent/day/start/kind; the report cites whatever this index holds.
//
// A verify:"judge" sentence with engine support needs at least one
// evidence id from the index, else "근거 없는 문장". (All judge items
// are engine:"none" until the deadline, so on real personas this fires
// only after engine events land; it is tested with supported-judge
// items and stays live for then.) The judge model call itself is
// injected later. Items with engine:"none" are never failed here.

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
