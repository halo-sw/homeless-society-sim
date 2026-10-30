// Stage 26e — US map background, aerial photos, landing example,
// Korea-only panels hidden. node --test, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { basemapProvider, basemapTileUrl, isUsLonLat } from "../src/basemap.js";
import { AERIAL_CREDIT, aerialCreditFor, usgsTileUrl } from "../src/aerial/drape.js";
import { COMPARE_TABS, tabsForCurrency } from "../src/ui/compare-tabs.js";
import { extract_profile } from "../src/profile.js";

const landing = await import("../src/ui/landing.jsx");

describe("26e basemap provider", () => {
  it("Menlo Park is carto, Seoul is vworld", () => {
    assert.equal(basemapProvider(-122.15, 37.48), "carto");
    assert.equal(basemapProvider(127.03, 37.5), "vworld");
  });

  it("isUsLonLat matches the bbox", () => {
    assert.equal(isUsLonLat(-122.15, 37.48), true);
    assert.equal(isUsLonLat(127.03, 37.5), false);
  });

  it("carto URL shape with x/y subdomains", () => {
    const url = basemapTileUrl(null, 14, 6340, 2630, { provider: "carto" });
    assert.match(url, /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/light_all\/14\/2630\/6340\.png$/);
  });

  it("vworld URL is unchanged", () => {
    const base = "https://relay.example";
    assert.equal(
      basemapTileUrl(base, 14, 6340, 2630, { provider: "vworld" }),
      basemapTileUrl(base, 14, 6340, 2630));
    assert.equal(
      basemapTileUrl(base, 14, 6340, 2630),
      "https://relay.example/api/tiles/white/14/6340/2630.png");
  });
});

describe("26e aerial credit + USGS tiles", () => {
  it("US area credits USGS, Korean area keeps AERIAL_CREDIT", () => {
    assert.ok(
      aerialCreditFor({ country: "US", center: [-122.15, 37.48] }).includes("USGS"));
    assert.ok(
      aerialCreditFor({ bbox: [-122.19, 37.45, -122.125, 37.492] }).includes("USGS"));
    assert.equal(
      aerialCreditFor({ country: "KR", bbox: [127.0, 37.4, 127.1, 37.5] }),
      AERIAL_CREDIT);
  });

  it("usgsTileUrl is z/y/x", () => {
    assert.equal(
      usgsTileUrl(17, 50720, 21062),
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/17/50720/21062");
  });
});

describe("26e landing US example", () => {
  it("us-meta reads as USD at meta-hq", () => {
    const found = landing.EXAMPLE_PROMPTS.find((p) => p.id === "us-meta");
    assert.ok(found, "us-meta example exists");
    const ex = extract_profile(found.prompt, null, {});
    assert.equal(ex.ok, true);
    assert.equal(ex.profile.currency.value, "USD");
    const wp = ex.profile.workplaces.value[0];
    assert.equal(wp.resolved.place.id, "meta-hq");
  });
});

describe("26e compare tabs for currency", () => {
  it("USD drops jeonse, support, safety, listings-public", () => {
    const values = COMPARE_TABS.map((t) => t.value);
    const out = tabsForCurrency(values, "USD");
    for (const hidden of ["jeonse", "support", "safety", "listings-public"]) {
      assert.ok(!out.includes(hidden), `${hidden} hidden`);
    }
    assert.ok(out.includes("compare") && out.includes("money") && out.includes("listings"));
  });

  it("KRW returns the input unchanged", () => {
    const values = COMPARE_TABS.map((t) => t.value);
    assert.equal(tabsForCurrency(values, "KRW"), values);
  });
});
