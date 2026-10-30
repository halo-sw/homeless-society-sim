// Stage 26k — keyless US map tiles, US sources, small leftovers.
// node --test, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

register("./jsx-loader.mjs", import.meta.url);

import { basemapProvider, basemapTileUrl } from "../src/basemap.js";
import { intakeTookLine } from "../src/intake.js";
import { SOURCES, sourceById, chipSourceIds } from "../src/sources.js";
import { usEmptyHint } from "../src/homes.js";

const landing = await import("../src/ui/landing.jsx");

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

function walkJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkJs(p, out);
    else out.push(p);
  }
  return out;
}

function usCandidate(rent) {
  return {
    id: `us-home-${rent}`, currency: "USD", country: "US",
    buckets: [{ center_m2: null, range_m2: null, trade: null, jeonse: null,
      wolse: { count: 1, deposit: null,
        monthly: { count: 1, median_won: rent, min_won: rent, max_won: rent } } }],
  };
}

describe("26k usgs basemap", () => {
  it("Menlo Park resolves to usgs with a National Map z/y/x URL", () => {
    assert.equal(basemapProvider(-122.15, 37.48), "usgs");
    assert.equal(
      basemapTileUrl(null, 16, 25402, 10528, { provider: "usgs" }),
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/16/25402/10528");
  });

  it("no file under src/ references cartocdn", () => {
    const bad = walkJs(SRC)
      .filter((p) => readFileSync(p, "utf8").includes("cartocdn"));
    assert.deepEqual(bad, []);
  });
});

describe("26k intake dollars", () => {
  it("a USD monthlyMax reads $5,000 with no 원", () => {
    const line = intakeTookLine({
      tenure: { value: "wolse", source: "customer", note: "" },
      monthlyMax: { value: 5000, source: "customer", note: "" },
      currency: { value: "USD", source: "customer", note: "" },
    });
    assert.ok(line.includes("$5,000"), line);
    assert.ok(!line.includes("원"), line);
  });
});

describe("26k US source chips", () => {
  it("registers the three US entries", () => {
    for (const id of ["zillow-zori", "osm-us", "usgs"]) {
      assert.ok(sourceById(id), `has ${id}`);
    }
    assert.ok(SOURCES.every((s) => s.url.startsWith("https://")));
  });

  it("a USD candidate list cites the US ids, never rtms", () => {
    const ids = chipSourceIds({ candidates: [usCandidate(4219), usCandidate(4261)] });
    assert.deepEqual(ids, ["zillow-zori", "osm-us", "usgs"]);
    assert.ok(!ids.includes("rtms"));
  });

  it("a USD run currency cites the US ids; KRW keeps tool citations", () => {
    assert.deepEqual(chipSourceIds({ currency: "USD" }),
      ["zillow-zori", "osm-us", "usgs"]);
    assert.equal(chipSourceIds({ candidates: [{ currency: "KRW" }] }), null);
  });
});

describe("26k landing us-meta", () => {
  it("caps at $5,000", () => {
    const found = landing.EXAMPLE_PROMPTS.find((p) => p.id === "us-meta");
    assert.ok(found, "us-meta example exists");
    assert.ok(found.prompt.includes("$5,000"), found.prompt);
  });
});

describe("26k empty-state minimum", () => {
  it("names the cheapest loaded rent above the budget", () => {
    const text = usEmptyHint([usCandidate(4219), usCandidate(4261)], 4000);
    assert.ok(text.includes("$4,219"), text);
  });

  it("stays silent with no budget or no rent above it", () => {
    assert.equal(usEmptyHint([usCandidate(4219)], null), "");
    assert.equal(usEmptyHint([usCandidate(3800)], 4000), "");
    assert.equal(usEmptyHint([], 4000), "");
  });
});
