// Branch points for stage 4 (pure).
//
// At defined moments the routine builds a decision shell
// {agent, day, minute, kind, options, default_key} and the decider
// resolves it to a full record
// {id, agent, day, minute, kind, options, default_key, chosen_key,
//  chosen_by, ...extras}. chosen_by is "rule" (default), "hook" (a
// decide() call), "model" (judged by a Meta model), "rule_fallback"
// (the judge rejected the model's output and used the rule), or
// "replay" (a decisions file; zero hook calls).
//
// The rule default is the fastest option with a stable tie-break on
// the option key — except park_or_home, whose default comes from the
// agent's scheduled park days (see routines.js), and weekend_plan,
// whose default is the fastest available category as a single plan.
//
// The hook may return a key string (single-choice kinds), an array of
// keys (weekend_plan), or an object {chosen_key | plan, ...extras}
// where extras carry judge provenance (reason_ko, reason_en,
// provider, model, usage, latency_ms, fallback_cause, rejected) and an explicit
// chosen_by. Replay entries restore the stored provenance verbatim
// (except "hook", which becomes "replay" — the replay made zero hook
// calls), so a judged run and its replay are byte-identical.

export const WEEKEND_HOME = "home";

export const KNOWN_CHOICE_MODES = new Set([
  "rule", "hook", "model", "rule_fallback", "replay",
]);

// Extra record fields the hook and replay files may carry. Anything
// else is rejected (fail fast, keep replay byte-exact).
const EXTRA_FIELDS = new Set([
  "reason_ko", "reason_en", "provider", "model", "usage",
  "latency_ms", "fallback_cause", "rejected",
]);

export function ruleDefault(options) {
  const sorted = [...options].sort((a, b) => (a.minutes - b.minutes) || (a.key < b.key ? -1 : 1));
  return sorted[0].key;
}

export function decisionId(agent, day, minute, kind, seq) {
  return `${agent}:d${day}:${String(minute).padStart(4, "0")}:${kind}:${String(seq).padStart(2, "0")}`;
}

// Normalize a weekend_plan choice to {chosen_key, plan}. Accepts an
// array of keys (["park"] or [] / ["home"] for staying home) or the
// joined key string ("park+supermarket", "home"). Throws on unknown
// keys, > 3 activities, or "home" mixed with activities.
export function normalizeWeekendChoice(options, choice) {
  const keys = new Set(options.map((o) => o.key));
  let plan;
  if (Array.isArray(choice)) {
    plan = [...choice];
  } else if (typeof choice === "string") {
    plan = choice === WEEKEND_HOME ? [] : choice.split("+");
  } else {
    throw new Error(`weekend_plan: want an array or joined key, got ${JSON.stringify(choice)}`);
  }
  if (plan.length === 0 || (plan.length === 1 && plan[0] === WEEKEND_HOME)) {
    return { chosen_key: WEEKEND_HOME, plan: [] };
  }
  if (plan.length > 3) {
    throw new Error(`weekend_plan: at most 3 activities, got ${plan.length}`);
  }
  const seen = new Set();
  for (const key of plan) {
    if (!keys.has(key)) throw new Error(`weekend_plan: unknown key ${JSON.stringify(key)}`);
    if (key === WEEKEND_HOME) throw new Error(`weekend_plan: "home" cannot mix with activities`);
    if (seen.has(key)) throw new Error(`weekend_plan: duplicate key ${JSON.stringify(key)}`);
    seen.add(key);
  }
  return { chosen_key: plan.join("+"), plan };
}

function checkKey(id, keys, key) {
  if (!keys.has(key)) throw new Error(`decision ${id}: unknown key ${JSON.stringify(key)}`);
}

const SHELL_FIELDS = new Set([
  "id", "agent", "day", "minute", "kind", "options", "default_key",
  "chosen_key", "plan",
]);

function takeExtras(id, source, out) {
  for (const [k, v] of Object.entries(source)) {
    if (SHELL_FIELDS.has(k)) continue;
    if (k === "chosen_by") {
      if (!KNOWN_CHOICE_MODES.has(v)) {
        throw new Error(`decision ${id}: unknown chosen_by ${JSON.stringify(v)}`);
      }
      out.chosen_by = v;
      continue;
    }
    if (!EXTRA_FIELDS.has(k)) throw new Error(`decision ${id}: unknown field ${JSON.stringify(k)}`);
    checkExtra(id, k, v);
    out[k] = v;
  }
}

function checkExtra(id, k, v) {
  const isStr = typeof v === "string";
  if (k === "reason_ko" || k === "reason_en" || k === "provider"
      || k === "model" || k === "fallback_cause") {
    if (!isStr) throw new Error(`decision ${id}: ${k} wants a string`);
  } else if (k === "latency_ms") {
    if (!Number.isFinite(v)) throw new Error(`decision ${id}: latency_ms wants a number`);
  } else if (k === "usage") {
    if (!v || typeof v !== "object") throw new Error(`decision ${id}: usage wants an object`);
    for (const [uk, uv] of Object.entries(v)) {
      if (!Number.isFinite(uv)) throw new Error(`decision ${id}: usage.${uk} wants a number`);
    }
  } else if (k === "rejected") {
    // Audit copy of the refused model reply: parsed fields only.
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      throw new Error(`decision ${id}: rejected wants an object`);
    }
    if (v.chosen_key !== undefined && typeof v.chosen_key !== "string") {
      throw new Error(`decision ${id}: rejected.chosen_key wants a string`);
    }
    if (v.plan !== undefined && (!Array.isArray(v.plan) || !v.plan.every((p) => typeof p === "string"))) {
      throw new Error(`decision ${id}: rejected.plan wants an array of strings`);
    }
    for (const rk of ["reason_ko", "reason_en"]) {
      if (v[rk] !== undefined && typeof v[rk] !== "string") {
        throw new Error(`decision ${id}: rejected.${rk} wants a string`);
      }
    }
    if (v.offending !== undefined
        && (!Array.isArray(v.offending) || !v.offending.every((t) => typeof t === "string"))) {
      throw new Error(`decision ${id}: rejected.offending wants an array of strings`);
    }
  }
}

export function makeDecider({ decide = null, decisions = null } = {}) {
  const replay = new Map();
  if (decisions) {
    const list = Array.isArray(decisions) ? decisions : decisions.decisions;
    if (!Array.isArray(list)) throw new Error("decisions: want an array or {decisions: [...]}");
    for (const d of list) {
      if (typeof d.id !== "string" || (typeof d.chosen_key !== "string" && !Array.isArray(d.plan))) {
        throw new Error(`decisions: bad entry ${JSON.stringify(d)}`);
      }
      replay.set(d.id, d);
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
      const multi = shell.kind === "weekend_plan";
      if (replay.size > 0) {
        if (!replay.has(id)) throw new Error(`decision ${id}: not in the decisions file`);
        const entry = replay.get(id);
        const rec = { id, ...shell };
        if (multi) {
          const norm = normalizeWeekendChoice(shell.options, entry.plan !== undefined ? entry.plan : entry.chosen_key);
          if (typeof entry.chosen_key === "string" && entry.chosen_key !== norm.chosen_key) {
            throw new Error(`decision ${id}: plan/chosen_key mismatch in the decisions file`);
          }
          rec.chosen_key = norm.chosen_key;
          rec.plan = norm.plan;
        } else {
          if (typeof entry.chosen_key !== "string") {
            throw new Error(`decision ${id}: replayed entry needs a chosen_key string`);
          }
          checkKey(id, keys, entry.chosen_key);
          rec.chosen_key = entry.chosen_key;
        }
        rec.chosen_by = "replay";
        takeExtras(id, entry, rec);
        // "hook" marks a decide() call in the run that wrote the file;
        // the replay made zero hook calls, so it must not survive.
        if (rec.chosen_by === "hook") rec.chosen_by = "replay";
        stats.replayed++;
        return rec;
      }
      if (decide) {
        const answer = decide({ id, ...shell });
        stats.hookCalls++;
        const rec = { id, ...shell };
        if (multi && (Array.isArray(answer) || typeof answer === "string")) {
          const norm = normalizeWeekendChoice(shell.options, answer);
          rec.chosen_key = norm.chosen_key;
          rec.plan = norm.plan;
          rec.chosen_by = "hook";
          return rec;
        }
        if (typeof answer === "string") {
          checkKey(id, keys, answer);
          rec.chosen_key = answer;
          rec.chosen_by = "hook";
          return rec;
        }
        if (answer && typeof answer === "object") {
          if (multi) {
            if (answer.plan === undefined && answer.chosen_key === undefined) {
              throw new Error(`decision ${id}: hook object needs plan or chosen_key`);
            }
            const norm = normalizeWeekendChoice(
              shell.options, answer.plan !== undefined ? answer.plan : answer.chosen_key);
            rec.chosen_key = norm.chosen_key;
            rec.plan = norm.plan;
          } else {
            if (typeof answer.chosen_key !== "string") {
              throw new Error(`decision ${id}: hook object needs a chosen_key string`);
            }
            checkKey(id, keys, answer.chosen_key);
            rec.chosen_key = answer.chosen_key;
          }
          rec.chosen_by = "hook";
          takeExtras(id, answer, rec);
          return rec;
        }
        throw new Error(`decision ${id}: hook returned ${JSON.stringify(answer)}`);
      }
      const rec = { id, ...shell, chosen_key: shell.default_key, chosen_by: "rule" };
      if (multi) rec.plan = shell.default_key === WEEKEND_HOME ? [] : [shell.default_key];
      stats.ruled++;
      return rec;
    },
  };
}
