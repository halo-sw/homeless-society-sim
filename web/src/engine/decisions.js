// Branch points for stage 4 (pure).
//
// At defined moments the routine builds a decision shell
// {agent, day, minute, kind, options, default_key} and the decider
// resolves it to a full record
// {id, agent, day, minute, kind, options, default_key, chosen_key,
//  chosen_by}. chosen_by is "rule" (default), "hook" (a stage-4
// decide() call), or "replay" (a decisions file; zero hook calls).
// The rule default is the fastest option with a stable tie-break on
// the option key — except park_or_home, whose default comes from the
// agent's scheduled park days (see routines.js).

export function ruleDefault(options) {
  const sorted = [...options].sort((a, b) => (a.minutes - b.minutes) || (a.key < b.key ? -1 : 1));
  return sorted[0].key;
}

export function decisionId(agent, day, minute, kind, seq) {
  return `${agent}:d${day}:${String(minute).padStart(4, "0")}:${kind}:${String(seq).padStart(2, "0")}`;
}

export function makeDecider({ decide = null, decisions = null } = {}) {
  const replay = new Map();
  if (decisions) {
    const list = Array.isArray(decisions) ? decisions : decisions.decisions;
    if (!Array.isArray(list)) throw new Error("decisions: want an array or {decisions: [...]}");
    for (const d of list) {
      if (typeof d.id !== "string" || typeof d.chosen_key !== "string") {
        throw new Error(`decisions: bad entry ${JSON.stringify(d)}`);
      }
      replay.set(d.id, d.chosen_key);
    }
  }
  const stats = { hookCalls: 0, replayed: 0, ruled: 0 };
  return {
    stats,
    resolve(shell, seq) {
      const id = decisionId(shell.agent, shell.day, shell.minute, shell.kind, seq);
      const keys = new Set(shell.options.map((o) => o.key));
      if (!keys.has(shell.default_key)) {
        throw new Error(`decision ${id}: default_key ${JSON.stringify(shell.default_key)} not in options`);
      }
      let chosen_key;
      let chosen_by;
      if (replay.size > 0) {
        if (!replay.has(id)) throw new Error(`decision ${id}: not in the decisions file`);
        chosen_key = replay.get(id);
        if (!keys.has(chosen_key)) throw new Error(`decision ${id}: replayed key ${JSON.stringify(chosen_key)} not in options`);
        chosen_by = "replay";
        stats.replayed++;
      } else if (decide) {
        chosen_key = decide({ id, ...shell });
        stats.hookCalls++;
        if (!keys.has(chosen_key)) {
          throw new Error(`decision ${id}: hook returned unknown key ${JSON.stringify(chosen_key)}`);
        }
        chosen_by = "hook";
      } else {
        chosen_key = shell.default_key;
        chosen_by = "rule";
        stats.ruled++;
      }
      return { id, ...shell, chosen_key, chosen_by };
    },
  };
}
