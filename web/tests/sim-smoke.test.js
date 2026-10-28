// Stage 8b smoke: boots the sim state machine headlessly (no WebGL, no
// DOM) through load → first frame → follow → day change on the real
// data/build run. This is the path that crashed browsers at the end of
// stage 7 (ROLE_KO temporal dead zone in main.js): the sim-meta build
// now lives in the tested nowcard module and is exercised here with the
// same inputs the scene passes. Skips with a clear message when the
// build output is absent (gitignored data/).

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { agentLabelOf, chosenLabel, dayDecisions, DECISION_KIND_KO, decisionBadge,
  formatClock, homeOccupancy, indexRun, latestDecision, optionsLine, parseTParam,
  sampleAgent } from "../src/sim.js";
import { FATIGUE_MODEL_NOTE, fatigueFor, householdNow, nowCardFor, simMetaFor,
  tickerFor } from "../src/nowcard.js";
import { commuteSegments, corridorFor, journeyBanner, journeyCameraState,
  journeyPhase, legAt, rideStateFor, trainPosition } from "../src/journey.js";
import { highlightFor } from "../src/highlight.js";
import { bboxContains, destInLoadedAreas, pickStationArea } from "../src/station-areas.js";
import { originOf } from "../src/load.js";
import { compare as compareRuns } from "../src/engine/simulate.js";
import { CONGESTION_SOURCE, FALLBACK_SOURCE } from "../src/engine/journey.js";
import { createStore, INITIAL_STATE } from "../src/ui/store.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const P = {
  runA: join(ROOT, "data/build/sim/demo-two-homes-A.json"),
  runB: join(ROOT, "data/build/sim/demo-two-homes-B.json"),
  money: join(ROOT, "data/build/sim/demo-two-homes-money.json"),
  scenario: join(ROOT, "scenarios/demo-two-homes.json"),
  graph: join(ROOT, "data/build/songpa-jamsil/graph.json"),
  network: join(ROOT, "data/build/region/network.json"),
  corridors: join(ROOT, "data/build/region/corridors.json"),
  mainSrc: join(ROOT, "web/src/main.js"),
  areaPangyo: join(ROOT, "data/build/pangyo/area.json"),
  areaSeongsu: join(ROOT, "data/build/seongsu/area.json"),
  areaSongpa: join(ROOT, "data/build/songpa/area.json"),
  areaJamsil: join(ROOT, "data/build/songpa-jamsil/area.json"),
};
const json = (p) => JSON.parse(readFileSync(p, "utf8"));

const REQUIRED = ["runA", "scenario", "graph"];
const missing = REQUIRED.filter((k) => !existsSync(P[k]));
const SKIP_ALL = missing.length > 0
  ? `missing ${missing.join(", ")} — generate data/build first (see briefs/01-RESULT.md); ` +
    "data/ is gitignored so this suite skips instead of failing"
  : false;
const skipIfMissing = (t, key) => {
  if (existsSync(P[key])) return false;
  t.skip(`missing ${key} (${P[key]}) — data/ is gitignored; generate it to run this check`);
  return true;
};

describe("sim smoke (headless boot)", { skip: SKIP_ALL }, () => {
  let run; let scenario; let indexed; let household; let homes;
  let nodeLonLat; let edgeLen; let homeLonLat;

  before(() => {
    run = json(P.runA);
    scenario = json(P.scenario);
    indexed = indexRun(run);
    household = run.agents.filter((a) => a.household);
    // Same homes fallback as bootSim: scenario homes, else this home alone.
    homes = scenario && Array.isArray(scenario.homes) && scenario.homes.length > 0
      ? scenario.homes
      : [{ label: "A", area: run.meta.area, complex_name: run.meta.complex }];
    const graph = json(P.graph);
    nodeLonLat = new Map(Object.entries(graph.nodes));
    edgeLen = new Map(graph.edges.walk.map((e) => [`${e.from}>${e.to}`, e.length_m]));
    homeLonLat = new Map(run.agents.map((a) => [a.key, nodeLonLat.get(a.home_node) || [127.0, 37.5]]));
  });

  it("loads the real build run and scenario", () => {
    assert.equal(run.meta.scenario, "demo-two-homes");
    assert.equal(run.meta.home, "A");
    assert.equal(run.meta.days, 30);
    assert.ok(run.trips.length > 0 && run.aways.length > 0);
    assert.deepEqual(household.map((a) => a.key), ["h1", "h2"]);
    assert.deepEqual(homes.map((h) => h.label), ["A", "B"]);
    assert.ok(indexed.tripsByAgent.get("h1").length > 0);
    assert.ok(indexed.awaysByAgent.get("h1").length > 0);
  });

  it("publishes simMeta — the stage-8b crash site", () => {
    // The exact call that crashed sim load (TDZ on ROLE_KO): the scene
    // builds this inside store.set() before first paint.
    const meta = simMetaFor({ household, scenario, run, homes });
    assert.deepEqual(meta.members, ["구성원 1 (성인)", "구성원 2 (성인)"]);
    assert.equal(meta.neighbours, run.meta.background);
    assert.equal(meta.days, 30);
    assert.equal(meta.startDate, run.meta.start_date);
    assert.deepEqual(meta.homes, ["A", "B"]);
    assert.ok(meta.assumptions.length > 0);
    for (const a of meta.assumptions) {
      assert.ok(a.label && (a.source === "가정값" || a.source === "고객 입력"));
    }
    // The scene survives a missing scenario file (scenario = null).
    const fallbackHomes = [{ label: "A", area: run.meta.area, complex_name: run.meta.complex }];
    const bare = simMetaFor({ household, scenario: null, run, homes: fallbackHomes });
    assert.equal(bare.members.length, 2);
    assert.deepEqual(bare.assumptions, []);
    assert.deepEqual(bare.homes, ["A"]);
  });

  it("keeps the crash site in the tested module", () => {
    // Tripwire: sim-meta building must stay in nowcard.js (imported and
    // executed above), never drift back into main.js wiring untested.
    const src = readFileSync(P.mainSrc, "utf8");
    assert.ok(!src.includes("buildSimMeta"),
      "main.js must not rebuild sim meta locally (use simMetaFor from nowcard.js)");
    assert.ok(!src.includes("const ROLE_KO"),
      "main.js must not redeclare ROLE_KO (it lives in nowcard.js module scope)");
    assert.ok(src.includes("simMetaFor"),
      "main.js must import simMetaFor from nowcard.js");
    // Stage 8c: station-area containment must stay in the tested
    // station-areas.js module — main.js must not destructure the
    // object-returning bboxToXY() as an array again.
    assert.ok(!src.includes("] = bboxToXY("),
      "main.js must not array-destructure bboxToXY() (it returns {minX,minY,maxX,maxY})");
    assert.ok(src.includes("pickStationArea") && src.includes("destInLoadedAreas"),
      "main.js must use pickStationArea/destInLoadedAreas from station-areas.js");
  });

  it("paints the first frame (?day=1&t=08:28, follow=1)", () => {
    const day = 0;
    const minute = parseTParam("08:28");
    assert.equal(minute, 508);
    const label = formatClock(run.meta.start_date, day, minute, run.meta.days);
    assert.ok(label.includes("1일차"), label);
    // Agent sampling on the real graph (placeAgents input).
    for (const a of household) {
      const s = sampleAgent(a.key, indexed, day, minute, nodeLonLat,
        homeLonLat.get(a.key), edgeLen);
      assert.ok(["trip", "away", "home"].includes(s.state), s.state);
      assert.ok(Number.isFinite(s.lon) && Number.isFinite(s.lat));
      if (s.state === "trip") assert.equal(s.visible, true);
    }
    // Now card + highlight for the followed member.
    const card = nowCardFor({ run, indexed, agentKey: "h1", day, minute });
    assert.equal(card.label, "구성원 1");
    assert.ok(card.now.length > 0 && card.why.length > 0);
    const hi = highlightFor({ run, indexed, follow: 1, day, minute });
    assert.equal(hi.followedKey, "h1");
    assert.equal(hi.homeBuildingId, run.meta.home_building);
    assert.deepEqual(hi.ticks, [...hi.ticks].sort((x, y) => x.minute - y.minute));
    // The scene publishes exactly these keys at sim load; the store
    // drops anything else, so a drifted payload fails loudly here.
    const store = createStore();
    store.set({ mode: "sim", home: "A", homes, scenarioName: "demo-two-homes",
      follow: 1, playing: false, speed: 1,
      clock: { day, minute, days: 30, startDate: run.meta.start_date, label },
      simMeta: simMetaFor({ household, scenario, run, homes }),
      now: card, ticker: [], bogusKey: 1 });
    const st = store.getState();
    assert.equal(st.mode, "sim");
    assert.equal(st.now.label, "구성원 1");
    assert.ok(!("bogusKey" in st));
    assert.ok("simMeta" in INITIAL_STATE && "now" in INITIAL_STATE);
  });

  it("follows each member + free camera (paintNow branches)", (t) => {
    if (skipIfMissing(t, "money")) return;
    const money = json(P.money);
    const events = money.homes.A.spending_events || [];
    assert.ok(events.length > 0);
    // Free camera: one row per member.
    const rows = householdNow({ run, indexed, day: 0, minute: 508 });
    assert.equal(rows.length, 2);
    for (const r of rows) assert.ok(r.line.length > 0);
    // Followed members: Now card + ticker + captioned decision.
    for (const [i, a] of household.entries()) {
      const card = nowCardFor({ run, indexed, agentKey: a.key, day: 0, minute: 508 });
      const tick = tickerFor({ run, indexed, agentKey: a.key, day: 0, minute: 508,
        moneyEvents: events });
      assert.ok(tick.length <= 5);
      assert.deepEqual(tick, [...tick].sort((x, y) => x.minute - y.minute));
      const d = latestDecision(run, a.key, 0, 508);
      if (d) { // paintJudgeCaption path: badge + options + choice
        const badge = decisionBadge(d);
        assert.ok(badge.text && badge.cls);
        assert.ok(optionsLine(d).length > 0 && chosenLabel(d).length > 0);
        assert.ok((DECISION_KIND_KO[d.kind] || d.kind).length > 0);
        assert.equal(agentLabelOf(run, a.key), a.label);
      }
      assert.equal(card.agentKey, a.key, `member ${i + 1}`);
    }
  });

  it("rides the stage-9c commute (walk → ride → work → ride → walk)", (t) => {
    const dayAways = indexed.awaysByAgent.get("h1").filter((a) => a.day === 0);
    const outRide = dayAways.find((a) => a.kind === "ride"
      && (!a.detail || a.detail.direction !== "back"));
    const backRide = dayAways.find((a) => a.detail && a.detail.direction === "back");
    const work = dayAways.find((a) => a.kind === "work");
    assert.ok(outRide && backRide && work, "expected ride out + work + ride back on day 1 for h1");
    // Work is labelled by the workplace and starts on arrival there —
    // never "<home station> 방면 근무".
    assert.equal(work.label, "직장 (가정: 판교역 인근) 근무");
    assert.ok(!work.label.includes("방면"));
    assert.equal(outRide.label, "지하철 이동");
    assert.equal(outRide.detail.ride_minutes, 30); // customer input (가정값)
    // The legs chain exactly: walk → ride → (destination walk) → work …
    const commuteTrips = indexed.tripsByAgent.get("h1")
      .filter((x) => x.day === 0 && x.purpose === "commute");
    const firstTrip = commuteTrips[0];
    assert.equal(firstTrip.arrive_min, outRide.start_min);
    assert.ok(outRide.end_min <= work.start_min);
    assert.ok(work.end_min <= backRide.start_min);
    const lastTrip = commuteTrips[commuteTrips.length - 1];
    assert.equal(lastTrip.depart_min, backRide.end_min);
    // The ride is its own leg: work starts at the workplace door.
    assert.equal(work.detail.commute.mode, "ride");
    assert.equal(work.detail.commute.out_start, outRide.start_min);
    assert.equal(work.detail.commute.back_end, backRide.end_min);
    const out = rideStateFor(outRide, outRide.start_min + 1);
    assert.equal(out.dir, "out");
    assert.equal(out.elapsed, 1);
    assert.equal(rideStateFor(outRide, outRide.start_min - 1), null);
    const back = rideStateFor(backRide, backRide.end_min - 1);
    assert.equal(back.dir, "back");
    // Camera state for ANY clock position (static ?t= loads included):
    // inside the ride → cruise; before → street; work hours → hold at
    // the destination.
    const segments = commuteSegments(dayAways);
    assert.ok(segments && segments.out && segments.work && segments.back);
    const mid = Math.floor((outRide.start_min + outRide.end_min) / 2);
    assert.equal(journeyCameraState({ segments, minute: mid }).phase, "cruise");
    assert.equal(journeyCameraState({ segments, minute: outRide.start_min + 1 }).phase, "rising");
    assert.equal(journeyCameraState({ segments, minute: outRide.start_min - 1 }).phase, "street");
    assert.equal(journeyCameraState({ segments, minute: work.start_min + 30 }).phase, "hold");
    assert.equal(journeyCameraState({ segments, minute: backRide.end_min + 1 }).phase, "street");
    assert.equal(journeyCameraState({ segments, minute: mid, view: "low" }).phase, "boarding");
    // Banner legs carry per-leg congestion + source badges; the split
    // sums to the input ride minutes (transfer gaps first).
    const ride = outRide.detail.ride;
    assert.ok(ride, "expected a drawn 잠실→판교 path on day 1");
    const banner = journeyBanner({ ride, dir: "out",
      elapsed: 1, rideMinutes: outRide.detail.ride_minutes });
    assert.ok(banner.where.length > 0 && banner.minutesLeft > 0);
    const legSum = banner.legs.reduce((x, l) => x + l.minutes, 0);
    const gaps = ride.transfers.length * 4; // C-ride-split 가정값
    assert.ok(Math.abs(legSum + gaps - outRide.detail.ride_minutes) < 0.05,
      `split sums to input: ${legSum}+${gaps}=${outRide.detail.ride_minutes}`);
    for (const l of banner.legs) {
      assert.ok(l.line && l.from && l.to && Number.isFinite(l.valuePct));
      assert.ok(l.source === CONGESTION_SOURCE || l.source === FALLBACK_SOURCE, l.source);
    }
    assert.equal(legAt(ride, 0).legIndex, 0);
    // Camera phases (auto / low / high) on the real ride.
    assert.equal(journeyPhase({ riding: { progress: 0.05 } }), "rising");
    assert.equal(journeyPhase({ riding: { progress: 0.5 } }), "cruise");
    assert.equal(journeyPhase({ riding: { progress: 0.99 }, hasDetailDest: true }), "descending");
    assert.equal(journeyPhase({ riding: { progress: 0.5 }, view: "low" }), "street");
    // Train marker on the real line geometry + corridor manifest.
    if (!skipIfMissing(t, "network")) {
      const network = json(P.network);
      const start = trainPosition(network, ride, 0);
      assert.ok(Number.isFinite(start.lon) && Number.isFinite(start.lat));
      assert.equal(start.legIndex, 0);
      const end = trainPosition(network, ride, outRide.detail.ride_minutes - 0.01);
      assert.equal(end.legIndex, ride.legs.length - 1);
    }
    if (!skipIfMissing(t, "corridors")) {
      const index = json(P.corridors);
      const legs = ride.legs;
      const corridor = corridorFor(index, legs[0].from, legs[legs.length - 1].to);
      assert.ok(corridor && corridor.id, "expected a corridor for the commute");
    }
    // The Now card during the ride names the itinerary, never "work".
    const card = nowCardFor({ run, indexed, agentKey: "h1", day: 0, minute: mid });
    assert.equal(card.state, "ride");
    assert.match(card.now, /^지하철 이동 중 · /);
    assert.ok(card.now.includes("분 남음"));
    assert.ok(card.ride && card.ride.legs.length === ride.legs.length);
    assert.ok(!card.now.includes("근무"));
  });

  it("resolves station areas (stage-8c crash site)", (t) => {
    // Follow mode preloads the destination area via areaForStation and
    // gates the descent on destDetailLoaded; both destructured the
    // object-returning bboxToXY() as an array and threw on every
    // follow-mode sim URL. Same inputs the scene passes: the real
    // area.json bboxes, the home-area origin, real network stop coords.
    for (const k of ["areaPangyo", "areaSeongsu", "areaSongpa", "areaJamsil", "network"]) {
      if (skipIfMissing(t, k)) return;
    }
    const areas = {
      pangyo: json(P.areaPangyo),
      seongsu: json(P.areaSeongsu),
      songpa: json(P.areaSongpa),
      "songpa-jamsil": json(P.areaJamsil),
    };
    const origin = originOf(areas[run.meta.area]);
    const entries = Object.entries(areas).map(([id, a]) => [id, a.bbox]);
    const network = json(P.network);
    const stopNamed = (name) => {
      for (const line of network.lines || []) {
        const s = (line.stops || []).find((s) => s.name === name);
        if (s) return s;
      }
      return null;
    };
    const jamsil = stopNamed("잠실");
    const pangyo = stopNamed("판교");
    assert.ok(jamsil && pangyo, "expected 잠실/판교 stops in network.json");
    // 잠실역 sits in both songpa and songpa-jamsil — smallest wins.
    assert.equal(pickStationArea(jamsil.lon, jamsil.lat, entries, origin), "songpa-jamsil");
    assert.equal(pickStationArea(pangyo.lon, pangyo.lat, entries, origin), "pangyo");
    assert.ok(bboxContains(areas["songpa-jamsil"].bbox, jamsil.lon, jamsil.lat, origin));
    // Outside every built area → null → corridor level + note.
    assert.equal(pickStationArea(126.9, 37.4, entries, origin), null);
    // Descent gate: dest detail counts as loaded only when its bbox is
    // among the loaded second areas.
    const dest = [pangyo.lon, pangyo.lat];
    assert.equal(destInLoadedAreas(dest, [areas.pangyo.bbox], origin), true);
    assert.equal(destInLoadedAreas(dest, [areas["songpa-jamsil"].bbox], origin), false);
    assert.equal(destInLoadedAreas(null, [areas.pangyo.bbox], origin), false);
  });

  it("shows stage-8 fatigue on 9c legs (load → recovery)", () => {
    const rideAway = indexed.awaysByAgent.get("h1")
      .find((a) => a.day === 0 && a.kind === "ride" && a.detail && a.detail.ride);
    assert.ok(rideAway);
    // Mid-ride: load delta with a congestion note + source badge.
    const ride = fatigueFor({ run, agentKey: "h1", day: 0, minute: rideAway.start_min + 1 });
    assert.ok(ride);
    assert.ok(ride.value >= 0 && ride.value <= 100);
    assert.ok(Number.isFinite(ride.delta));
    assert.ok(ride.note.length > 0);
    assert.ok(ride.source === CONGESTION_SOURCE || ride.source === FALLBACK_SOURCE, ride.source);
    assert.ok(ride.criterionIds.includes("C-fatigue-load"));
    assert.ok(Array.isArray(ride.series) && ride.series.length > 0);
    // The crowding number beside fatigue: the day's peak boarding
    // equals the highest leg reading (2호선 잠실 morning 실측 here), so 0
    // crowded minutes reads as a measurement, not a gap.
    assert.ok(ride.peakCongestion, "expected the day's peak boarding");
    const dayRides = indexed.awaysByAgent.get("h1")
      .filter((a) => a.day === 0 && a.kind === "ride" && a.detail && a.detail.ride);
    const legPeak = Math.max(...dayRides.flatMap((a) => a.detail.ride.legs)
      .map((l) => l.congestion.valuePct));
    assert.equal(ride.peakCongestion.pct, legPeak);
    assert.equal(ride.peakCongestion.line, "2호선");
    assert.equal(ride.peakCongestion.station, "잠실");
    assert.equal(ride.peakCongestion.source, CONGESTION_SOURCE);
    // Evening at home: recovery branch.
    const home = fatigueFor({ run, agentKey: "h1", day: 0, minute: 1320 });
    assert.ok(home && home.criterionIds.includes("C-fatigue-recovery"));
    // Series resets to 8 at midnight; summaries carry the QoL fields.
    const entry = run.daily.find((d) => d.agent === "h1");
    const fat = entry.days[0].fatigue;
    assert.equal(fat.start, 8);
    assert.equal(fat.series[0].v, 8);
    for (const k of ["arrival_work", "after_home", "peak", "crowded_min"]) {
      assert.ok(Number.isFinite(fat[k]), k);
    }
    assert.deepEqual(fat.peak_congestion, ride.peakCongestion);
    assert.ok(FATIGUE_MODEL_NOTE.includes("가정으로 계산한"));
  });

  it("changes day (setDay branch)", () => {
    const d0 = formatClock(run.meta.start_date, 0, 508, run.meta.days);
    const d1 = formatClock(run.meta.start_date, 1, 508, run.meta.days);
    assert.ok(d0.includes("1일차") && d1.includes("2일차"));
    const entry = run.daily.find((d) => d.agent === "h1");
    assert.ok(entry.days[0].weekday !== entry.days[1].weekday
      || entry.days[0].date !== entry.days[1].date);
    // Everything the day jump repaints still resolves on day 2.
    const card = nowCardFor({ run, indexed, agentKey: "h2", day: 1, minute: 508 });
    assert.ok(card.now.length > 0);
    const hi = highlightFor({ run, indexed, follow: 2, day: 1, minute: 508 });
    assert.equal(hi.followedKey, "h2");
    const occ = homeOccupancy(run, indexed, 1, 508);
    assert.ok(occ instanceof Map && occ.size > 0);
    assert.ok(Array.isArray(dayDecisions(run, 1)));
  });

  it("loads compare + money payloads (compare card)", (t) => {
    let compared = false;
    if (!skipIfMissing(t, "runB")) {
      const runB = json(P.runB);
      const cmp = compareRuns(run, runB);
      assert.ok(cmp.metrics.length > 0);
      assert.ok(cmp.metrics.some((m) => m.key.startsWith("fatigue")),
        "compare carries the stage-8 fatigue metrics");
      compared = true;
    }
    if (!skipIfMissing(t, "money")) {
      const money = json(P.money);
      assert.ok(money.homes.A && money.homes.B);
      const store = createStore();
      store.set({ compareOpen: true, compareTab: "quality", money });
      assert.equal(store.getState().money.homes.A, money.homes.A);
      compared = true;
    }
    assert.ok(compared, "unreachable: at least one payload is always present");
  });
});
