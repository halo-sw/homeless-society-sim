// 12b, B: chat URLs, custom-run store and the client answer engine.
// Synthetic fixtures always run; the slim-vs-full cross-check runs
// the real build (skipped when data/build is absent).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  routeForSearch, parseChatSearch, chatUrl, chatReopenUrl, landingUrl,
  simMomentUrl, parseSimSearch, saveTranscript, loadTranscript,
  clearTranscript,
} from "../src/chat/urls.js";
import {
  customRunId, newCustomId, isCustomPayload, saveCustomRun,
  loadCustomRun, clearMemoryRuns,
} from "../src/chat/idb.js";
import {
  extractStep, searchStep, stationNames, profileSummary, fieldRows,
  sourceKo, missingChips, simReadyFor, homeForScenario,
  complexNameForCandidate, runStep, createWorkerRunner,
} from "../src/chat/engine.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const FULL = join(ROOT, "data/build/homes-index.json");
const HAS_DATA = existsSync(FULL);
const SKIP_DATA = !HAS_DATA
  ? "missing data/build/homes-index.json — generate data/build first"
  : false;

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

describe("chat urls", () => {
  it("routes screens from the search string", () => {
    assert.equal(routeForSearch(""), "landing");
    assert.equal(routeForSearch("?chat="), "chat");
    assert.equal(routeForSearch("?chat=hello"), "chat");
    assert.equal(routeForSearch("?mode=sim"), "sim");
    assert.equal(routeForSearch("?mode=sim&tour=demo"), "sim");
    assert.equal(routeForSearch("?tour=demo"), "tour"); // legacy: tour boot
    assert.equal(routeForSearch("?area=st-xxx"), "tour");
    assert.equal(routeForSearch("?mode=tour"), "tour");
  });

  it("carries the first message in ?chat=", () => {
    assert.equal(chatUrl("판교 출근"), "/?chat=%ED%8C%90%EA%B5%90+%EC%B6%9C%EA%B7%BC");
    assert.equal(chatUrl("", { area: "st-xxx" }), "/?chat=&area=st-xxx");
    assert.equal(chatUrl("a", { example: "single-firstjob" }),
      "/?chat=a&example=single-firstjob");
    assert.deepEqual(parseChatSearch("?chat=a&area=b&ask=c"),
      { message: "a", area: "b", ask: "c" });
    assert.equal(chatReopenUrl(), "/?chat=");
    assert.equal(landingUrl(), "/");
  });

  it("links sim moments for committed and custom runs", () => {
    const a = simMomentUrl({ scenario: "demo-two-homes", home: "A", day: 1, t: "08:21", follow: 1 });
    assert.equal(a, "/?mode=sim&home=A&day=1&t=08%3A21&follow=1&scenario=demo-two-homes");
    const b = simMomentUrl({ custom: "c1", home: "B", day: 2, t: "19:00", follow: 0 });
    assert.ok(b.includes("custom=c1") && !b.includes("scenario="));
    assert.deepEqual(parseSimSearch("?mode=sim&custom=c1&home=B"),
      { scenario: "", custom: "c1", home: "B", day: "1", t: "", follow: "0" });
    assert.equal(customRunId("?custom=c1"), "c1");
  });

  it("keeps the transcript in guarded session memory", () => {
    const s = memStorage();
    assert.equal(loadTranscript(s), null);
    const doc = { messages: [{ id: "m1", role: "user" }], picks: ["a"] };
    assert.equal(saveTranscript(doc, s), true);
    assert.deepEqual(loadTranscript(s), doc);
    assert.equal(clearTranscript(s), true);
    assert.equal(loadTranscript(s), null);
    s.setItem("sim.chat.v1", "not json");
    assert.equal(loadTranscript(s), null);
  });
});

describe("custom-run store", () => {
  it("validates payloads and round-trips (memory fallback in node)", async () => {
    clearMemoryRuns();
    assert.equal(isCustomPayload(null), false);
    assert.equal(isCustomPayload({ id: "x" }), false);
    const doc = { id: newCustomId(1000, () => 0.5),
      scenario: { name: "s" }, runs: { A: { meta: {} } }, labels: ["A"] };
    assert.match(doc.id, /^c[0-9a-z]+[0-9a-f]{4}$/);
    assert.equal(isCustomPayload(doc), true);
    await saveCustomRun(doc);
    const back = await loadCustomRun(doc.id);
    assert.equal(back.labels[0], "A");
    assert.equal(await loadCustomRun("missing"), null);
    await assert.rejects(saveCustomRun({ id: "bad" }), /invalid/);
    clearMemoryRuns();
  });
});

describe("chat engine presentation", () => {
  const profile = {
    members: { value: [{ role: "worker" }], source: "customer" },
    workplaces: { value: [{ text: "판교", resolved: { station: "판교" } }], source: "customer" },
    tenure: { value: "jeonse", source: "customer" },
    depositMax: { value: 200000000, source: "customer" },
    salaryAnnual: { value: null, source: "default", note: "기본값" },
  };

  it("summarises the profile for the top-bar chip", () => {
    assert.equal(profileSummary(profile), "판교 출근 · 1인 · 전세 2억 원 이하");
    assert.equal(profileSummary({}), "");
  });

  it("rows every field with its source", () => {
    const rows = fieldRows(profile);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.equal(byKey.workplaces.text, "판교");
    assert.equal(sourceKo("customer"), "내가 말한 값");
    assert.equal(sourceKo("default"), "기본값");
    assert.equal(sourceKo("derived"), "계산한 값");
    assert.equal(byKey.depositMax.text, "2억 원");
  });

  it("chips the missing essentials", () => {
    const chips = missingChips(profile);
    const fields = chips.map((c) => c.field);
    assert.ok(!fields.includes("members"));
    assert.ok(fields.includes("sizeMin") || fields.includes("commuteMax"));
  });
});

describe("chat engine steps on synthetic data", () => {
  const home = (id, cx, price) => ({ id, name: id, kind: "아파트",
    region: "bundang", lon: 127.1, lat: 37.35, build_year: 2010,
    match: "register", pnu: `pnu-${id}`, scene: "st-판교",
    station: { station: "판교", walk_minutes: 5, source: "graph" },
    buckets: [{ center_m2: 60, range_m2: [55, 65],
      jeonse: { count: 4, median_won: price, min_won: price, max_won: price,
        recent: true, months: [1] } }] });
  const index = { homes: [home("a", 60, 200000000), home("b", 60, 150000000)] };
  const ev = (value) => ({ value, source: "customer", evidence: " synthetic " });
  const profile = {
    members: ev([{ role: "worker" }]),
    workplaces: ev([{ text: "판교", resolved: { station: "판교" }, evidence: "판교" }]),
    salaryAnnual: ev([40000000]),
    cash: ev(50000000),
    tenure: ev("jeonse"),
    depositMax: ev(200000000),
    monthlyMax: { value: null, source: "customer" },
    priceMax: { value: null, source: "customer" },
    sizeMin: { value: null, source: "customer" },
    commuteMax: { value: null, source: "customer" },
    mustHaves: { value: [], source: "customer" },
  };

  it("extracts over the current profile (accumulated words)", () => {
    const first = "판교로 출근하는 신입, 연봉 4천, 모은 돈 5천";
    const r1 = extractStep(first, null, ["판교"]);
    assert.equal(r1.value.ok, true);
    const r = extractStep(`${first}\n전세 2억 이하`, r1.value.profile, ["판교"]);
    assert.equal(r.value.ok, true);
    assert.equal(r.value.profile.depositMax.value, 200000000);
    assert.equal(r.value.profile.workplaces.value[0].resolved.station, "판교");
  });

  it("searches with the customer sort (change reorders)", () => {
    const walky = (id, walk, price, count) => {
      const h = home(id, 60, price);
      h.station = { station: "판교", walk_minutes: walk, source: "graph" };
      h.buckets[0].jeonse.count = count;
      return h;
    };
    const idx = { homes: [walky("a", 5, 200000000, 9), walky("b", 2, 150000000, 4)] };
    const byCommute = searchStep(profile, idx, {}, { sort: "commute", limit: 6 }).value;
    assert.deepEqual(byCommute.candidates.map((c) => c.id), ["b", "a"]);
    const byDeals = searchStep(profile, idx, {}, { sort: "deals", limit: 6 }).value;
    assert.equal(byDeals.sort, "deals");
    assert.deepEqual(byDeals.candidates.map((c) => c.id), ["a", "b"]);
  });

  it("gates running on scene + walk + position", () => {
    const found = searchStep(profile, index, {}, {}).value;
    const ready = simReadyFor(found.candidates[0], null);
    assert.equal(ready.ready, true);
    assert.equal(ready.anchor, "coordinate"); // no area: coordinate preview
    assert.equal(simReadyFor({ ...found.candidates[0], scene: null }, null).ready, false);
    assert.equal(simReadyFor({ ...found.candidates[0],
      commute: { walk: { known: false } } }, null).ready, false);
  });

  it("joins complexes verbatim (PNU, else OSM name, else nothing)", () => {
    const area = { complexes: [{ id: "c1", name: "푸른마을", building_ids: ["b1"] }],
      buildings: [{ id: "b1", register: { pnu: "pnu-a" }, geometry: null }] };
    assert.equal(complexNameForCandidate({ pnu: "pnu-a", name: "x" }, area), "푸른마을");
    assert.equal(complexNameForCandidate({ pnu: null, name: "x", osm_name: "푸른마을" }, area),
      "푸른마을");
    assert.equal(complexNameForCandidate({ pnu: null, name: "없는단지" }, area), null);
  });

  it("maps candidates to scenario homes", () => {
    const found = searchStep(profile, index, {}, {}).value;
    const h = homeForScenario(found.candidates[0], "푸른마을");
    assert.equal(h.name, "푸른마을");
    assert.equal(h.station.station, "판교");
    assert.ok(Number.isFinite(h.lon) && Number.isFinite(h.lat));
  });

  it("runs the worker and compares (injected worker)", async () => {
    const calls = [];
    const fakeWorker = async (scenario, labels, onProgress) => {
      onProgress({ done: 0, total: labels.length, label: labels[0] });
      calls.push(labels);
      onProgress({ done: 1, total: labels.length, label: labels[0] });
      const { readFileSync } = await import("node:fs");
      const a = JSON.parse(readFileSync(join(HERE, "fixtures/min-run-a.json"), "utf8"));
      const b = JSON.parse(readFileSync(join(HERE, "fixtures/min-run-b.json"), "utf8"));
      return { A: a, B: b };
    };
    const progress = [];
    const { runs, compare, ms } = await runStep(fakeWorker, { name: "s" }, ["A", "B"],
      (p) => progress.push(p));
    assert.deepEqual(calls, [["A", "B"]]);
    assert.ok(progress.length >= 2);
    assert.ok(runs.A && runs.B && Array.isArray(compare.metrics));
    assert.ok(ms >= 0);
    await assert.rejects(runStep(async () => ({ A: {} }), {}, ["A"]), /2곳 이상/);
  });

  it("reads station names from the network", () => {
    const net = { lines: [{ stops: [{ name: "판교역" }, { name: "강남" }] }] };
    assert.deepEqual(stationNames(net).sort(), ["강남", "판교"]);
    assert.deepEqual(stationNames(null), []);
  });

  it("refuses the worker runner without a browser Worker", () => {
    assert.equal(typeof Worker, "undefined");
    assert.throws(() => createWorkerRunner("x"), /browser Worker/);
  });
});

describe("slim-vs-full search on the real build", { skip: SKIP_DATA }, () => {
  it("agrees on the example top-6 (browser loads slim regions)", async () => {
    const { find_homes } = await import("../src/homes.js");
    const full = JSON.parse(readFileSync(FULL, "utf8"));
    const slimHomes = [];
    for (const id of ["bundang", "jungwon", "sujeong", "suji", "seongdong",
        "songpa-gu", "gangnam", "gangdong", "wirye"]) {
      const doc = JSON.parse(readFileSync(join(ROOT, `data/build/homes/${id}.json`), "utf8"));
      slimHomes.push(...doc.homes);
    }
    const { extract_profile } = await import("../src/profile.js");
    const network = JSON.parse(readFileSync(join(ROOT, "data/build/region/network.json"), "utf8"));
    const stations = stationNames(network);
    const r = extract_profile("판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하",
      null, { stations });
    assert.equal(r.ok, true);
    const { parseInterstationCsv } = await import("../src/transit/schedule.js");
    const schedule = parseInterstationCsv(
      readFileSync(join(ROOT, "scenarios/transit/seoul-metro-interstation.csv"), "utf8"));
    const a = find_homes(r.profile, full, { sort: "commute", limit: 6, network, schedule });
    const b = find_homes(r.profile, { homes: slimHomes },
      { sort: "commute", limit: 6, network, schedule });
    assert.deepEqual(b.candidates.map((c) => c.id), a.candidates.map((c) => c.id));
    assert.equal(b.total_matching, a.total_matching);
    // The browser keeps the fields it shows + joins on.
    for (const c of b.candidates) {
      assert.ok(c.match === "register" || c.match === "osm_name");
      assert.ok(typeof c.pnu === "string" || c.pnu === null);
    }
  });
});
