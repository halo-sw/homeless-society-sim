#!/usr/bin/env node
// Life-engine CLI: run a scenario for home A, B or both.
//
//   node web/scripts/simulate.mjs --scenario scenarios/demo-two-homes.json \
//       --home both --out data/build/sim/
//
// Reads data/build/<area>/area.json (+ $ref parts), writes canonical
// <out>/<name>-<label>.json runs (and <name>-compare.json for both),
// prints run time and counts. Optional --decisions <file> replays a
// decisions file (zero hook calls). Paths resolve from the repo root
// (the script's ../..); run it from anywhere.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canon } from "../src/engine/canonical.js";
import { homeOf, parseScenario } from "../src/engine/scenario.js";
import { compare, simulate } from "../src/engine/simulate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

function usage(exit = 2) {
  console.error("usage: simulate.mjs --scenario <json> --home A|B|both [--out <dir>] [--decisions <json>]");
  process.exit(exit);
}

function args(argv) {
  const out = { home: null, scenario: null, out: "data/build/sim", decisions: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--scenario") out.scenario = argv[++i];
    else if (a === "--home") out.home = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--decisions") out.decisions = argv[++i];
    else if (a === "--help" || a === "-h") usage(0);
    else usage();
  }
  if (!out.scenario || !out.home) usage();
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

// Region data for journeys (stage 8): the OSM station network + the Seoul
// Metro congestion table. Missing files keep rides numeric (never fatal);
// the run records what it had in meta.region.
async function loadRegion() {
  const dir = join(REPO, "data", "build", "region");
  const region = {};
  for (const [key, file] of [["network", "network.json"], ["congestion", "congestion.json"]]) {
    try {
      region[key] = JSON.parse(await readFile(join(dir, file), "utf8"));
    } catch {
      region[key] = null;
    }
  }
  if (!region.network && !region.congestion) return null;
  return region;
}

const opts = args(process.argv.slice(2));
const scenarioRaw = JSON.parse(await readFile(resolve(REPO, opts.scenario), "utf8"));
const scenario = parseScenario(structuredClone(scenarioRaw));
const labels = opts.home === "both" ? scenario.homes.map((h) => h.label) : [opts.home];
for (const label of labels) homeOf(scenario, label); // unknown label throws here
let decisions = null;
if (opts.decisions) {
  decisions = JSON.parse(await readFile(resolve(REPO, opts.decisions), "utf8"));
}
const outDir = resolve(REPO, opts.out);
await mkdir(outDir, { recursive: true });

const region = await loadRegion();
console.log(JSON.stringify({ region: region ? {
  network: !!region.network, congestion: !!region.congestion,
} : null }));
const runs = {};
for (const label of labels) {
  const home = homeOf(scenario, label);
  const area = await loadArea(home.area);
  const t0 = performance.now();
  const simOpts = { ...(decisions ? { decisions } : {}), ...(region ? { region } : {}) };
  const run = simulate(area, structuredClone(scenarioRaw), label, simOpts);
  const ms = performance.now() - t0;
  const file = join(outDir, `${scenario.name}-${label}.json`);
  await writeFile(file, `${canon(run)}\n`, "utf8");
  runs[label] = run;
  console.log(JSON.stringify({
    home: label, area: home.area, file: join(opts.out, `${scenario.name}-${label}.json`),
    ms: Math.round(ms), agents: run.meta.agents, household: run.meta.household,
    background: run.meta.background, trips: run.trips.length,
    decisions: run.decisions.length, decisions_by_kind: run.decisions_by_kind,
    unavailable: run.unavailable.length,
    dijkstra_sources: run.meta.dijkstra_sources,
  }));
}
if (labels.length === 2) {
  const cmp = compare(runs[labels[0]], runs[labels[1]]);
  const file = join(outDir, `${scenario.name}-compare.json`);
  await writeFile(file, `${canon(cmp)}\n`, "utf8");
  console.log(JSON.stringify({ compare: join(opts.out, `${scenario.name}-compare.json`) }));
  for (const m of cmp.metrics) {
    console.log(`  ${m.key}: A=${m.a} B=${m.b} d=${m.delta_b_minus_a} ${m.unit} [${m.source}]`);
  }
}
