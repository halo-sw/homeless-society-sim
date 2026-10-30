// 27i: find_homes speed — memoised paths/medians, photos only for
// returned rows. Behaviour must stay identical; only the work is shared.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPath } from "../src/engine/journey.js";
import { find_homes, groupMedianFor } from "../src/homes.js";
import { emptyProfile, field } from "../src/profile.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const NETWORK_P = join(ROOT, "data/build/region/network.json");
const INDEX_P = join(ROOT, "data/build/homes-index.json");
const HAS_NETWORK = existsSync(NETWORK_P);
const HAS_INDEX = existsSync(INDEX_P);

function jbucket(center, median, count = 3) {
  return {
    center_m2: center, range_m2: [center - 5, center + 5], trade: null,
    jeonse: { count, median_won: median, min_won: median - 10, max_won: median + 10 },
    wolse: null,
  };
}

describe("find speed 27i", () => {
  it("memoises findPath per graph", (t) => {
    if (!HAS_NETWORK) return t.skip("needs data/build");
    const network = JSON.parse(readFileSync(NETWORK_P, "utf8"));
    const a = findPath(network, "미금", "판교", 2.0);
    const b = findPath(network, "미금", "판교", 2.0);
    assert.ok(a);
    assert.equal(a, b); // same cached object
    assert.ok(a.distanceKm > 0);
    const clone = structuredClone(network);
    assert.deepEqual(findPath(clone, "미금", "판교", 2.0), a);
  });

  it("groupMedianFor skips public rentals, handles odd and even counts", () => {
    const homes = [
      { name: "b1", kind: "아파트", region: "bundang", buckets: [jbucket(60, 200)] },
      { name: "백현마을3단지(주공)임대", kind: "아파트", region: "bundang",
        buckets: [jbucket(60, 1)] },
      { name: "s1", kind: "아파트", region: "suji", buckets: [jbucket(60, 100)] },
      { name: "s2", kind: "아파트", region: "suji", buckets: [jbucket(60, 200)] },
    ];
    const before = JSON.stringify(homes);
    const odd = { kind: "아파트", region: "bundang", centerM2: 60, tenureKey: "jeonse" };
    const even = { kind: "아파트", region: "suji", centerM2: 60, tenureKey: "jeonse" };
    assert.equal(groupMedianFor(odd, homes), 200);
    assert.equal(groupMedianFor(even, homes), 150);
    assert.equal(groupMedianFor(odd, homes), 200);
    assert.equal(groupMedianFor(even, homes), 150);
    assert.equal(JSON.stringify(homes), before);
  });

  it("find_homes fills photos only for returned rows, fields unchanged", () => {
    const homes = [];
    for (let i = 0; i < 8; i++) {
      homes.push({
        id: `h${i}`, name: `집${i}`, kind: "아파트", region: "bundang",
        lon: 127.1 + i * 0.01, lat: 37.38, build_year: 2010,
        buckets: [jbucket(60, 100000000, 8 - i)], station: null, scene: null,
      });
    }
    const manifest = {
      items: homes.map((h, i) => ({
        lon: h.lon, lat: h.lat, title: `park view ${i}`,
        thumb_url: "https://example.com/t.jpg", page_url: "https://example.com/p",
      })),
    };
    const p = emptyProfile();
    p.tenure = field("jeonse", "customer", "");
    p.depositMax = field(500000000, "customer", "");
    let calls = 0;
    const counting = new Proxy(manifest, {
      get(tg, prop, recv) {
        if (prop === "items") calls++;
        return Reflect.get(tg, prop, recv);
      },
    });
    const small = find_homes(p, { homes }, { sort: "deals", limit: 3, photos: counting });
    assert.equal(small.candidates.length, 3);
    assert.equal(calls, 3);
    for (const c of small.candidates) assert.ok(c.photos.length > 0);
    const full = find_homes(p, { homes }, { sort: "deals", limit: 8, photos: manifest });
    assert.deepEqual(small.candidates, full.candidates.slice(0, 3));
  });

  it("find_homes over the real index finishes in under 3000 ms", (t) => {
    if (!HAS_INDEX || !HAS_NETWORK) return t.skip("needs data/build");
    const index = JSON.parse(readFileSync(INDEX_P, "utf8"));
    const network = JSON.parse(readFileSync(NETWORK_P, "utf8"));
    const p = emptyProfile();
    p.members = field([{ role: "adult" }], "customer", "");
    p.workplaces = field([{ member: 0, text: "판교", resolved: { station: "판교" } }],
      "customer", "");
    p.tenure = field("jeonse", "customer", "");
    p.depositMax = field(200000000, "customer", "");
    const t0 = Date.now();
    const r = find_homes(p, index, { limit: 6, network });
    const ms = Date.now() - t0;
    assert.ok(r.candidates.length > 0);
    assert.ok(ms < 3000, `took ${ms} ms`);
  });
});
