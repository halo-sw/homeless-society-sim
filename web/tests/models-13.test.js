import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MODEL_ROWS, OAUTH_NOTE, rowStatus, errorReason, newUsageLog,
  recordTurn, sessionTotals, usageCsv, formatCostUsd,
} from "../src/models/catalog.js";
import { priceFor, estimateCostUsd } from "../src/models/prices.js";

describe("model catalog", () => {
  it("lists one row per provider with no OAuth anywhere", () => {
    assert.deepEqual(MODEL_ROWS.map((r) => r.provider),
      ["meta", "baseten", "recorded"]);
    assert.ok(MODEL_ROWS.every((r) => r.oauth === false));
    assert.match(OAUTH_NOTE, /OAuth/);
  });
  it("reports connected / no-key / error with the exact reason", () => {
    assert.equal(rowStatus("meta", { hasServerKey: true }).status, "connected");
    assert.equal(rowStatus("meta", {}).status, "no-key");
    assert.equal(rowStatus("recorded", {}).status, "connected");
    const err = rowStatus("meta", { hasServerKey: true,
      lastError: { httpStatus: 401, providerMessage: "bad key" } });
    assert.equal(err.status, "error");
    assert.match(err.reason, /401/);
    assert.match(err.reason, /bad key/);
    assert.match(errorReason({ timeoutMs: 60000 }), /timeout/);
  });
});

describe("usage tracking", () => {
  it("records turns and totals with an estimated cost", () => {
    let log = newUsageLog();
    log = recordTurn(log, { provider: "meta", model: "muse-spark-1.3",
      input: 1000, output: 500, reasoning: 100, latencyMs: 1200 });
    log = recordTurn(log, { provider: "recorded", input: 0, output: 0 });
    const t = sessionTotals(log);
    assert.equal(t.turns, 2);
    assert.equal(t.input, 1000);
    assert.equal(t.output, 500);
    assert.equal(t.reasoning, 100);
    assert.ok(t.costUsd > 0);
    assert.match(formatCostUsd(t.costUsd), /추정/);
    assert.ok(priceFor("meta").note.includes("추정"));
  });
  it("exports a CSV with one row per turn", () => {
    let log = newUsageLog();
    log = recordTurn(log, { provider: "meta", input: 10, output: 5 });
    const csv = usageCsv(log);
    const lines = csv.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /input_tokens.*cost_usd_est/);
    assert.match(lines[1], /meta/);
  });
  it("does not double-count reasoning inside completion tokens", () => {
    const withSplit = estimateCostUsd("meta",
      { input_tokens: 0, output_tokens: 1000, reasoning_tokens: 400 });
    const flat = estimateCostUsd("meta",
      { input_tokens: 0, output_tokens: 1000, reasoning_tokens: 0 });
    assert.equal(withSplit, flat);
  });
});
