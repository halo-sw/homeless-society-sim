#!/usr/bin/env node
// Judge CLI: decide a scenario's household branches with a Meta model.
//
//   node web/scripts/judge.mjs --scenario scenarios/demo-two-homes.json \
//       --home both --provider meta [--dry-run] [--effort low] [--max-tokens 2000]
//
// Live mode calls the provider once per household decision (background
// neighbours stay rule-based), strictly sequential in deterministic
// order, and writes scenarios/decisions/<name>-<home>-<provider>.json
// (full decision records with reasons + provenance, no keys, no raw
// headers) plus a <...>-usage.json summary. Replay the run with
// simulate.mjs --decisions <file>: zero provider calls, byte-identical.
//
// --dry-run prints the planned call count and token/cost estimates
// without network or keys. Keys come from the environment only:
// MODEL_API_KEY (meta) or BASETEN_API_KEY (baseten).
//
// muse-spark-1.3 reasons before answering: --effort sets reasoning_effort
// (meta default "low", baseten omits unless set), --max-tokens the cap
// (default 2000). Too small a cap ends calls as fallback_cause
// "truncated" instead of "bad_json".

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { canon } from "../src/engine/canonical.js";
import { homeOf, parseScenario } from "../src/engine/scenario.js";
import { simulate } from "../src/engine/simulate.js";
import { DEFAULT_MAX_TOKENS, META_DEFAULT_EFFORT, REASONING_EFFORTS, providerConfig } from "../src/judge/providers.js";
import { costUsd, decisionsFile, judgeHome, planCalls } from "../src/judge/run.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

function usage(exit = 2) {
  console.error("usage: judge.mjs --scenario <json> --home A|B|both --provider meta|baseten [--dry-run] [--out <dir>] [--effort <level>] [--max-tokens <n>]");
  process.exit(exit);
}

function args(argv) {
  const out = { home: null, scenario: null, provider: null, dryRun: false, out: "scenarios/decisions", effort: null, maxTokens: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--scenario") out.scenario = argv[++i];
    else if (a === "--home") out.home = argv[++i];
    else if (a === "--provider") out.provider = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--effort") {
      const v = argv[++i];
      if (v == null) usage();
      out.effort = v;
    } else if (a === "--max-tokens") {
      const v = argv[++i];
      if (v == null) usage();
      out.maxTokens = Number(v);
    }
    else if (a === "--help" || a === "-h") usage(0);
    else usage();
  }
  if (!out.scenario || !out.home || !out.provider) usage();
  if (!["meta", "baseten"].includes(out.provider)) usage();
  if (out.effort != null && !REASONING_EFFORTS.includes(out.effort)) {
    console.error(`judge: --effort must be one of ${REASONING_EFFORTS.join("|")} (got ${JSON.stringify(out.effort)})`);
    process.exit(2);
  }
  if (out.maxTokens != null && (!Number.isInteger(out.maxTokens) || out.maxTokens <= 0)) {
    console.error(`judge: --max-tokens must be a positive integer (got ${JSON.stringify(argv[argv.indexOf("--max-tokens") + 1])})`);
    process.exit(2);
  }
  return out;
}

async function loadArea(areaId) {
  const dir = join(REPO, "data", "build", areaId);
  const area = JSON.parse(await readFile(join(dir, "area.json"), "utf8"));
  for (const [key, value] of Object.entries(area)) {
    if (value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).join() === "$ref") {
      area[key] = JSON.parse(await readFile(join(dir, value.$ref), "utf8"));
    }
  }
  return area;
}

const opts = args(process.argv.slice(2));
const cfg = providerConfig(opts.provider);
const scenarioRaw = JSON.parse(await readFile(resolve(REPO, opts.scenario), "utf8"));
const scenario = parseScenario(structuredClone(scenarioRaw));
const labels = opts.home === "both" ? scenario.homes.map((h) => h.label) : [opts.home];
for (const label of labels) homeOf(scenario, label);

if (opts.dryRun) {
  for (const label of labels) {
    const home = homeOf(scenario, label);
    const area = await loadArea(home.area);
    const plan = planCalls(area, structuredClone(scenarioRaw), label);
    console.log(JSON.stringify({
      home: label, area: home.area, provider: opts.provider, model: cfg.model,
      calls: plan.calls, by_kind: plan.by_kind,
      est_input_tokens: plan.est_input_tokens,
      est_completion_tokens: plan.est_completion_tokens,
      est_usd: opts.provider === "meta" ? Math.round(plan.est_usd_meta * 1000) / 1000 : null,
      note: opts.provider === "baseten" ? "tokens only (no USD estimate)" : plan.note,
    }));
  }
  process.exit(0);
}

const keyEnv = cfg.keyEnv;
if (!process.env[keyEnv]) {
  console.error(`judge: ${keyEnv} is not set (provider ${opts.provider}); refusing to run without a key`);
  process.exit(1);
}

const outDir = resolve(REPO, opts.out);
await mkdir(outDir, { recursive: true });

const providerOpts = {
  ...(opts.effort != null ? { reasoningEffort: opts.effort } : {}),
  ...(opts.maxTokens != null ? { maxTokens: opts.maxTokens } : {}),
};
// Effective values for provenance (complete() applies the same defaults).
const effEffort = opts.effort ?? (opts.provider === "meta" ? META_DEFAULT_EFFORT : null);
const effMaxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;

for (const label of labels) {
  const home = homeOf(scenario, label);
  const area = await loadArea(home.area);
  const judged = await judgeHome({
    area, scenarioRaw: structuredClone(scenarioRaw), homeLabel: label, provider: opts.provider,
    providerOpts,
  });
  const file = decisionsFile({
    scenarioName: scenario.name, homeLabel: label,
    provider: opts.provider, decisions: judged.decisions, usage: judged.usage,
  });
  const decPath = join(outDir, `${scenario.name}-${label}-${opts.provider}.json`);
  await writeFile(decPath, `${canon(file)}\n`, "utf8");
  const usageDoc = {
    scenario: scenario.name, home: label, provider: opts.provider, model: cfg.model,
    effort: effEffort, max_tokens: effMaxTokens,
    engine: file.meta.engine, ...judged.usage, est_usd: costUsd(opts.provider, judged.usage),
  };
  const usagePath = join(outDir, `${scenario.name}-${label}-${opts.provider}-usage.json`);
  await writeFile(usagePath, `${canon(usageDoc)}\n`, "utf8");
  console.log(JSON.stringify({
    home: label, decisions: decPath, usage: usagePath,
    effort: effEffort, max_tokens: effMaxTokens,
    calls: judged.usage.calls, errors: judged.usage.errors, fallbacks: judged.usage.fallbacks,
    prompt_tokens: judged.usage.prompt_tokens, completion_tokens: judged.usage.completion_tokens,
    reasoning_tokens: judged.usage.reasoning_tokens,
    est_usd: costUsd(opts.provider, judged.usage),
  }));
  // Sanity: the replay path must reproduce this exact run (proves the
  // file carries every choice; cheap to check here).
  const replayed = simulate(area, structuredClone(scenarioRaw), label, { decisions: judged.decisions });
  const a = canon(judged.run);
  const b = canon(replayed);
  if (a !== b) {
    console.error(`judge: replay mismatch for home ${label} (wrote files, but refusing to call it clean)`);
    process.exit(1);
  }
}
