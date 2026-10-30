// Stage 26l — keep the US region out of Korean views. node --test, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { regionsForCurrency } from "../src/chat/engine.js";
import { buildChatMap } from "../src/chatmap.js";
import { commuteLines } from "../src/evidence.js";

const KR = { id: "bundang", label: "분당구", country: "KR",
  bbox: [127.0, 37.35, 127.2, 37.45] };
const US = { id: "us-menlo", label: "Menlo Park", country: "US",
  currency: "USD", bbox: [-122.19, 37.45, -122.125, 37.492],
  relations: [], rtms_files: [] };
const LEGACY = { id: "suji", label: "수지구", bbox: [127.05, 37.3, 127.15, 37.4] };
const DOC = { regions: [KR, US, LEGACY] };

describe("26l regionsForCurrency", () => {
  it("KRW keeps only Korean regions", () => {
    const out = regionsForCurrency(DOC, "KRW");
    assert.deepEqual(out.regions.map((r) => r.id), ["bundang", "suji"]);
  });

  it("USD keeps only the US region", () => {
    const out = regionsForCurrency(DOC, "USD");
    assert.deepEqual(out.regions.map((r) => r.id), ["us-menlo"]);
  });

  it("a missing country counts as KR", () => {
    assert.ok(regionsForCurrency(DOC, "KRW").regions.some((r) => r.id === "suji"));
    assert.ok(!regionsForCurrency(DOC, "USD").regions.some((r) => r.id === "suji"));
  });
});

describe("26l chat map framing", () => {
  it("no pins + filtered KR doc frames inside Korea (lon 124–132)", () => {
    const kr = regionsForCurrency(DOC, "KRW");
    const m = buildChatMap({ regions: kr, network: { lines: [] },
      candidates: [], picks: [] });
    assert.ok(m.regions.length > 0, "keeps Korean boxes");
    for (const r of m.regions) {
      assert.ok(r.bbox[0] >= 124 && r.bbox[2] <= 132,
        `${r.id} bbox ${r.bbox} is inside Korea`);
    }
  });
});

function trip(id, depart, arrive, extra = {}) {
  return { id, agent: "h1", day: 0, depart_min: depart, arrive_min: arrive,
    from: { label: "집" }, to: { label: "회사" }, purpose: "commute",
    minutes: arrive - depart, ...extra };
}

function avgLine(run, t) {
  const lines = commuteLines(run, "h1", t, t.depart_min);
  const avg = lines.find((l) => l.text.includes("편도 평균"));
  assert.ok(avg, "has the average line");
  return avg;
}

describe("26l bike average tag", () => {
  it("a bike-trip run tags the average 가정값", () => {
    const t = trip("b1", 480, 492, { mode: "bike" });
    const run = { meta: { days: 30 }, trips: [t], aways: [] };
    assert.equal(avgLine(run, t).tag, "가정값");
  });

  it("a walk run keeps the average at 측정", () => {
    const t = trip("w1", 480, 492);
    const run = { meta: { days: 30 }, trips: [t], aways: [] };
    assert.equal(avgLine(run, t).tag, "측정");
  });
});
