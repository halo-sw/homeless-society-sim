// Paired A/B runs with repeated seeds (pure orchestration).
//
// runPaired(areas, scenario, opts) runs every home in `areas`
// (homeLabel -> area) under the same scenario, the same start date and
// one seed per repeat. Default seeds: scenario.seed .. scenario.seed+9
// (10 runs). Home-independent randomness (schedules, jitter, wishes)
// comes from per-(seed, agent, day, purpose) streams drawn before any
// routing (agents.planSchedule), so A and B see the same draws for the
// same seed; route-dependent choices may still differ.
//
// Run 1 uses the given decider or replay. Runs 2..10 always use the
// rule decider (never the model) and are labelled decided_by "일정".
// A judged run stays byte-identical to its replay (decisions.js).
//
// summary[home][metric] = {mean, min, max, n} over the runs. The
// default metrics are engine-only (commute_minutes_per_day, fatigue);
// callers pass summarize(run, homeLabel, seedIndex) for more (money.mjs
// adds grocery_won, transit_won and per-tenure
// remaining_won_per_month). Metrics whose name contains "won" round to
// whole won, everything else to 1 decimal.

import { simulate } from "./simulate.js";

export const PAIRED_RUN_COUNT = 10;

export const round1 = (x) => Math.round(x * 10) / 10;

export function defaultSeeds(scenario) {
  const s = Number(scenario.seed) || 0;
  return Array.from({ length: PAIRED_RUN_COUNT }, (_, i) => s + i);
}

// Engine-only metrics for one run (same commute formula as
// money.qualityCard: household walk + ride minutes per day).
export function engineMetrics(run) {
  const days = (run.meta && run.meta.days) || 30;
  const h = (run.totals && run.totals.household) || {};
  return {
    commute_minutes_per_day: round1(((h.commute_walk_minutes || 0) + (h.commute_ride_minutes || 0)) / days),
    fatigue: (typeof h.fatigue_avg_30d === "number" && Number.isFinite(h.fatigue_avg_30d))
      ? h.fatigue_avg_30d : null,
  };
}

function roundFor(metric) {
  return String(metric).includes("won") ? Math.round : round1;
}

// {mean, min, max, n} over the finite values (nulls when none).
export function summarizeValues(values, metric = "") {
  const nums = (values || []).filter((v) => Number.isFinite(v));
  if (nums.length === 0) return { mean: null, min: null, max: null, n: 0 };
  const round = roundFor(metric);
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    mean: round(sum / nums.length),
    min: round(Math.min(...nums)),
    max: round(Math.max(...nums)),
    n: nums.length,
  };
}

// Aggregate per-run metric dicts into {mean, min, max, n} per home per
// metric. A metric value may be a number (or null) or a dict of
// sub-metrics (e.g. remaining_won_per_month per tenure).
export function aggregateSummaries(perRun, labels) {
  const summary = {};
  for (const label of labels) {
    const metrics = {};
    for (const entry of perRun) {
      const m = (entry && entry[label]) || {};
      for (const [metric, value] of Object.entries(m)) {
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
          metrics[metric] = metrics[metric] || {};
          for (const [sub, v] of Object.entries(value)) {
            (metrics[metric][sub] = metrics[metric][sub] || []).push(v);
          }
        } else {
          (metrics[metric] = metrics[metric] || []).push(value);
        }
      }
    }
    const out = {};
    for (const [metric, value] of Object.entries(metrics)) {
      if (Array.isArray(value)) {
        out[metric] = summarizeValues(value, metric);
      } else {
        out[metric] = {};
        for (const [sub, values] of Object.entries(value)) {
          out[metric][sub] = summarizeValues(values, metric);
        }
      }
    }
    summary[label] = out;
  }
  return summary;
}

export function runPaired(areas, scenario, opts = {}) {
  const labels = Object.keys(areas || {});
  if (labels.length === 0) throw new Error("runPaired: need at least one area");
  const seeds = Array.isArray(opts.seeds) && opts.seeds.length > 0
    ? [...opts.seeds]
    : defaultSeeds(scenario);
  const summarize = typeof opts.summarize === "function" ? opts.summarize : engineMetrics;
  const destAreas = opts.destAreas || opts.destAreaByLabel || null;
  const runs = [];
  const perRun = [];
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const pair = { seed };
    const values = {};
    for (const label of labels) {
      const area = areas[label];
      const sc = { ...structuredClone(scenario), seed };
      const simOpts = {};
      // Run 1 keeps the given decider/replay; runs 2..10 are rule runs.
      if (i === 0) {
        if (opts.decide) simOpts.decide = opts.decide;
        if (opts.decisions) simOpts.decisions = opts.decisions;
      }
      if (opts.region) simOpts.region = opts.region;
      if (destAreas && destAreas[label]) simOpts.destArea = destAreas[label];
      else if (opts.destArea) simOpts.destArea = opts.destArea;
      const run = simulate(area, sc, label, simOpts);
      pair[label] = run;
      values[label] = summarize(run, label, i);
    }
    runs.push(pair);
    perRun.push(values);
  }
  return { seeds, runs, summary: aggregateSummaries(perRun, labels) };
}
