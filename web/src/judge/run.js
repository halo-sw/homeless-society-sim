// Judge runner: decide the household's branches with a Meta model.
//
// The engine is synchronous but provider calls are async, and a choice
// can shift the rest of the member's day (decision ids carry minutes),
// so judging runs iteratively: simulate with everything fixed so far,
// judge the earliest unfixed household shell with its exact context
// (today's trips so far are final at that point), fix it, repeat.
// Agents are independent and household agents run first, so the
// background count never changes a household shell — judging iterations
// run with background 0 for speed, the final run with the full
// background. Call order is deterministic: members in agent order,
// each in day/minute order, strictly sequential.
//
// Only household shells reach the provider; background branches resolve
// by rule inside the same runs. Every fixed entry carries its
// provenance (chosen_by model|rule_fallback, reasons, provider, model,
// tokens, latency, and the refused reply as `rejected` on guard
// fallbacks), so the judged run and its --decisions replay are
// byte-identical.

import { simulate, ENGINE_VERSION } from "../engine/simulate.js";
import { dateOf, weekdayOf, WEEKDAYS, parseScenario } from "../engine/scenario.js";
import { complete, providerConfig } from "./providers.js";
import { buildPrompt, estimateTokens, COMPLETION_TOKENS_EST } from "./context.js";
import { checkOutput, ruleReason } from "./guards.js";

// Price per 1 M tokens: [input, cached input, output]. Baseten reports
// tokens only (no USD estimate).
export const PRICING = {
  meta: { input: 1.25, cached: 0.15, output: 4.25 },
  baseten: null,
};

export function costUsd(provider, usage) {
  const p = PRICING[provider];
  if (!p) return null;
  const prompt = usage.prompt_tokens || 0;
  const cached = usage.cached_tokens || 0;
  // completion_tokens already include reasoning_tokens — never add both.
  const completion = usage.completion_tokens || 0;
  return ((prompt - cached) * p.input + cached * p.cached + completion * p.output) / 1e6;
}

export function emptyUsage() {
  return {
    calls: 0, errors: 0, fallbacks: 0,
    prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, reasoning_tokens: 0, latency_ms: 0,
  };
}

function addUsage(usage, u) {
  usage.prompt_tokens += u.prompt_tokens || 0;
  usage.completion_tokens += u.completion_tokens || 0;
  usage.cached_tokens += u.cached_tokens || 0;
  usage.reasoning_tokens += u.reasoning_tokens || 0;
}

function clone(value) {
  return structuredClone(value);
}

// Household agent keys (h1, h2, …) in member order; background keys
// never collide (b01, …).
function householdKeysOf(members) {
  return new Set(members.map((_, i) => `h${i + 1}`));
}

function agentIndex(key) {
  const n = Number.parseInt(String(key).slice(1), 10);
  return Number.isInteger(n) ? n - 1 : 0;
}

function slimTrip(t) {
  return {
    depart_min: t.depart_min, arrive_min: t.arrive_min, purpose: t.purpose,
    from_label: (t.from && (t.from.label || t.from.id)) || "",
    to_label: (t.to && (t.to.label || t.to.id)) || "",
    minutes: t.minutes, distance_m: t.distance_m,
  };
}

function shellContext({ scenario, run, shell, members, memory }) {
  const idx = agentIndex(shell.agent);
  const agent = run.agents.find((a) => a.key === shell.agent) || {};
  const tripsToday = run.trips
    .filter((t) => t.agent === shell.agent && t.day === shell.day && t.depart_min < shell.minute)
    .map(slimTrip);
  return {
    member: members[idx] || { role: agent.role || "adult", preferences: "" },
    agentLabel: agent.label || shell.agent,
    date: dateOf(scenario.start_date, shell.day),
    weekday: WEEKDAYS[weekdayOf(scenario.start_date, shell.day)],
    minute: shell.minute,
    tripsToday,
    memory: (memory.get(shell.agent) || []).slice(-3),
    shell,
  };
}

// Judge one shell through the provider (or fail soft to the rule).
// Returns the replay-style entry to fix for this id. ctx is the prompt
// context the guard checks cited numbers against; guard rejections
// keep the refused reply as `rejected` (parsed fields only, never raw).
export async function judgeSingle({ provider, prompt, shell, ctx = null, usage, fetchImpl, providerOpts = {} }) {
  const rule = ruleReason(shell);
  const fallback = (cause, extra = {}) => ({
    ...(shell.kind === "weekend_plan"
      ? defaultWeekend(shell)
      : { chosen_key: shell.default_key }),
    chosen_by: "rule_fallback",
    reason_ko: rule.reason_ko,
    reason_en: rule.reason_en,
    fallback_cause: cause,
    ...extra,
  });
  let res;
  try {
    res = await complete({
      provider, system: prompt.system, user: prompt.user,
      schema: prompt.schema, schemaName: prompt.schemaName,
      fetchImpl, ...(providerOpts || {}),
    });
  } catch (err) {
    usage.errors++;
    usage.fallbacks++;
    const code = err && err.code;
    const cause = code === "bad_json" ? "bad_json" : code === "truncated" ? "truncated" : "provider_error";
    if (cause === "truncated" && err.usage) {
      // The budget cut the reply, but the tokens (mostly reasoning) were
      // spent and reported — count them and keep them on the entry.
      addUsage(usage, err.usage);
      return fallback(cause, {
        provider, model: providerConfig(provider).model, usage: err.usage,
      });
    }
    return fallback(cause);
  }
  usage.calls++;
  addUsage(usage, res.usage);
  usage.latency_ms += res.latency_ms || 0;
  const check = checkOutput(shell, res.json, ctx);
  if (!check.ok) {
    usage.fallbacks++;
    return fallback(check.cause, {
      provider, model: res.model, usage: res.usage, latency_ms: res.latency_ms,
      ...(check.rejected ? { rejected: check.rejected } : {}),
    });
  }
  return {
    chosen_key: check.chosen_key,
    ...(check.plan !== null ? { plan: check.plan } : {}),
    chosen_by: "model",
    reason_ko: check.reason_ko,
    reason_en: check.reason_en,
    provider,
    model: res.model,
    usage: res.usage,
    latency_ms: res.latency_ms,
  };
}

function defaultWeekend(shell) {
  if (shell.default_key === "home") return { chosen_key: "home", plan: [] };
  return { chosen_key: shell.default_key, plan: [shell.default_key] };
}

export function entryToAnswer(entry) {
  const answer = { chosen_key: entry.chosen_key, chosen_by: entry.chosen_by };
  for (const k of ["plan", "reason_ko", "reason_en", "provider", "model",
      "usage", "latency_ms", "fallback_cause", "rejected"]) {
    if (entry[k] !== undefined) answer[k] = entry[k];
  }
  return answer;
}

// Full judging pass for one home. judgeOne defaults to the live
// provider path; tests inject a fake.
export async function judgeHome({
  area, scenarioRaw, homeLabel, provider,
  fetchImpl = null, providerOpts = {}, judgeOne = null,
  region = null,
}) {
  providerConfig(provider); // unknown provider throws before any work
  const scenario = parseScenario(clone(scenarioRaw));
  const members = scenario.household.members;
  const household = householdKeysOf(members);
  const lean = clone(scenarioRaw);
  lean.background = 0; // household shells are identical either way
  const fixed = new Map(); // id -> entry
  const memory = new Map(); // agent -> [{day, minute, kind, chosen, reason_ko}]
  const usage = emptyUsage();
  const judge = judgeOne || ((args) => judgeSingle({ provider, fetchImpl, providerOpts, usage, ...args }));

  for (;;) {
    const pending = [];
    const run = simulate(area, clone(lean), homeLabel, {
      decide: (shell) => {
        if (fixed.has(shell.id)) return entryToAnswer(fixed.get(shell.id));
        if (!household.has(shell.agent)) {
          return { chosen_key: shell.default_key, chosen_by: "rule" };
        }
        pending.push(shell);
        return shell.kind === "weekend_plan"
          ? { ...defaultWeekend(shell), chosen_by: "rule" }
          : { chosen_key: shell.default_key, chosen_by: "rule" };
      },
    });
    if (pending.length === 0) break;
    const shell = pending[0];
    const ctx = shellContext({ scenario, run, shell, members, memory });
    const prompt = buildPrompt(ctx);
    const entry = await judge({ prompt, shell, ctx });
    fixed.set(shell.id, entry);
    if (!memory.has(shell.agent)) memory.set(shell.agent, []);
    memory.get(shell.agent).push({
      day: shell.day, minute: shell.minute, kind: shell.kind,
      chosen: entry.plan !== undefined
        ? (entry.plan.length === 0 ? "home" : entry.plan.join("+"))
        : entry.chosen_key,
      reason_ko: entry.reason_ko,
    });
  }

  // Final run: full background, household fixed, background by rule.
  const finalRun = simulate(area, clone(scenarioRaw), homeLabel, {
    ...(region ? { region } : {}),
    decide: (shell) => {
      if (fixed.has(shell.id)) return entryToAnswer(fixed.get(shell.id));
      return { chosen_key: shell.default_key, chosen_by: "rule" };
    },
  });
  const byKind = {};
  for (const d of finalRun.decisions) {
    if (!household.has(d.agent)) continue;
    byKind[d.kind] = (byKind[d.kind] || 0) + 1;
  }
  return {
    run: finalRun,
    decisions: finalRun.decisions,
    usage: { ...usage, by_kind: byKind },
    fixed: [...fixed.keys()],
  };
}

// Dry run: the exact call list (one rule pass, no network) plus token
// and cost estimates. Memory is empty here, so input tokens are a
// slight underestimate — noted in the output.
export function planCalls(area, scenarioRaw, homeLabel) {
  const scenario = parseScenario(clone(scenarioRaw));
  const members = scenario.household.members;
  const household = householdKeysOf(members);
  const lean = clone(scenarioRaw);
  lean.background = 0;
  const shells = [];
  const run = simulate(area, lean, homeLabel, {
    decide: (shell) => {
      if (household.has(shell.agent)) shells.push(shell);
      return shell.kind === "weekend_plan"
        ? { ...defaultWeekend(shell), chosen_by: "rule" }
        : { chosen_key: shell.default_key, chosen_by: "rule" };
    },
  });
  let estInput = 0;
  const calls = shells.map((shell) => {
    const ctx = shellContext({ scenario, run, shell, members, memory: new Map() });
    const prompt = buildPrompt(ctx);
    const tokens = estimateTokens(prompt.system) + estimateTokens(prompt.user);
    estInput += tokens;
    return { id: shell.id, agent: shell.agent, day: shell.day, minute: shell.minute, kind: shell.kind, est_input_tokens: tokens };
  });
  const estCompletion = calls.length * COMPLETION_TOKENS_EST;
  return {
    home: homeLabel,
    calls: calls.length,
    by_kind: calls.reduce((m, c) => ({ ...m, [c.kind]: (m[c.kind] || 0) + 1 }), {}),
    est_input_tokens: estInput,
    est_completion_tokens: estCompletion,
    est_usd_meta: ((estInput * PRICING.meta.input + estCompletion * PRICING.meta.output) / 1e6),
    note: "input tokens exclude short memory (empty here); add ~10 % headroom",
    engine: ENGINE_VERSION,
    call_list: calls,
  };
}

export function decisionsFile({ scenarioName, homeLabel, provider, decisions, usage }) {
  return {
    meta: {
      scenario: scenarioName,
      home: homeLabel,
      provider,
      model: providerConfig(provider).model,
      engine: ENGINE_VERSION,
      choices: "mixed",
      usage: { ...usage, est_usd: costUsd(provider, usage) },
    },
    decisions,
  };
}
