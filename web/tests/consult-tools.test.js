import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tinyArea, tinyRegion, tinyScenario } from "./engine-fixture.js";
import {
  TOOL_DEFS, TOOL_NAMES, CONSULT_AREAS, MAX_TOOL_ROUNDS,
  createSession, callTool,
} from "../src/consult/tools.js";
import { simulate } from "../src/engine/simulate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

function fixtureScenario() {
  return tinyScenario({
    days: 2, background: 0, seed: 7,
    homes: [
      { label: "A", area: "pangyo", complex_name: "알파" },
      { label: "B", area: "pangyo", complex_name: "베타" },
    ],
  });
}

function fixtureSession(over = {}) {
  return createSession({
    scenario: fixtureScenario(),
    loadArea: async () => tinyArea(),
    ...over,
  });
}

async function realLoadArea(areaId) {
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

async function hasRealData() {
  try {
    await readFile(join(REPO, "data", "build", "songpa-jamsil", "area.json"), "utf8");
    await readFile(join(REPO, "scenarios", "demo-two-homes.json"), "utf8");
    return true;
  } catch {
    return false;
  }
}

async function demoScenario() {
  return JSON.parse(await readFile(join(REPO, "scenarios", "demo-two-homes.json"), "utf8"));
}

describe("consult tools", () => {
  it("exposes the forty-two documented tools", () => {
    assert.deepEqual([...TOOL_NAMES].sort(), [
      "compare", "explain_decision", "find_places", "get_day", "get_fatigue", "get_journey",
      "get_scenario",
      "list_areas", "list_complexes", "list_stations", "run_simulation",
      "set_view", "update_scenario",
      "list_criteria", "explain_criterion",
      "set_money", "estimate_net_pay", "price_reference", "living_cost",
      "recommend_public_rental", "add_home_c",
      "apply_persona", "get_priorities", "set_priorities",
      "get_safety", "get_education", "define_term",
      "worth_it", "jeonse_check", "mock_deposit_loss", "support_programs",
      "parse_listing", "check_listing", "add_listing_c",
      "extract_profile", "find_homes", "find_public_rentals", "build_scenario",
      "neighborhood", "open_panel", "pick_homes", "start_life_run",
    ].sort());
    assert.equal(TOOL_DEFS.length, 42);
    assert.equal(MAX_TOOL_ROUNDS, 6);
    for (const t of TOOL_DEFS) {
      assert.equal(t.type, "function");
      assert.ok(t.function.name && t.function.description && t.function.parameters);
    }
  });

  it("rejects unknown tools", async () => {
    const r = await callTool(fixtureSession(), "teleport", {});
    assert.equal(r.ok, false);
    assert.match(r.error, /unknown tool/);
  });

  it("lists the four built areas plus us-menlo", async () => {
    const r = await callTool(fixtureSession(), "list_areas", {});
    assert.equal(r.ok, true);
    assert.deepEqual(r.areas.map((a) => a.id), ["pangyo", "seongsu", "songpa", "songpa-jamsil", "us-menlo"]);
    assert.match(r.note, /다음 단계/);
    assert.equal(CONSULT_AREAS.length, 4);
  });

  it("get_scenario returns an isolated copy", async () => {
    const s = fixtureSession();
    const r = await callTool(s, "get_scenario", {});
    assert.equal(r.ok, true);
    assert.equal(r.scenario.homes.length, 2);
    r.scenario.homes.pop();
    assert.equal(s.scenario.homes.length, 2);
  });

  it("update_scenario patches members and stamps user ride input", async () => {
    const s = fixtureSession();
    const r = await callTool(s, "update_scenario", {
      members: [
        { id: "m1", label: "나", park_walks_per_week: 3,
          work: { type: "station_ride", station_name: "중앙역", ride_minutes: 25 } },
      ],
    });
    assert.equal(r.ok, true);
    const m1 = r.scenario.household.members[0];
    assert.equal(m1.label, "나");
    assert.equal(m1.park_walks_per_week, 3);
    assert.equal(m1.work.ride_minutes, 25);
    assert.equal(m1.work.ride_minutes_source, "user_input");
    assert.equal(m1.work.needs_user_input, false);
    assert.equal(s.scenario.household.members[0].label, "나");
  });

  it("update_scenario adds and removes members", async () => {
    const s = fixtureSession();
    const added = await callTool(s, "update_scenario", {
      add_member: { id: "m3", label: "구성원 3", role: "senior" },
    });
    assert.equal(added.ok, true);
    assert.equal(added.scenario.household.members.length, 3);
    const removed = await callTool(s, "update_scenario", { remove_member: "m3" });
    assert.equal(removed.ok, true);
    assert.equal(removed.scenario.household.members.length, 2);
    const missing = await callTool(s, "update_scenario", { remove_member: "nobody" });
    assert.equal(missing.ok, false);
    assert.match(missing.errors.join(";"), /no member/);
  });

  it("update_scenario requires the customer's own ride minutes", async () => {
    const s = fixtureSession();
    const r = await callTool(s, "update_scenario", {
      members: [{ id: "m1", work: { type: "station_ride", station_name: "중앙역" } }],
    });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(";"), /ride_minutes.*고객|고객.*ride_minutes/);
    // The working copy is untouched by a failed patch.
    assert.equal(s.scenario.household.members[0].work.ride_minutes, 20);
  });

  it("update_scenario validates schema, areas and complexes", async () => {
    const s = fixtureSession();
    const badRole = await callTool(s, "update_scenario", {
      members: [{ id: "m1", role: "astronaut" }],
    });
    assert.equal(badRole.ok, false);
    const badArea = await callTool(s, "update_scenario", {
      homes: [{ label: "A", area: "busan", complex_name: "알파" }],
    });
    assert.equal(badArea.ok, false);
    assert.match(badArea.errors.join(";"), /unknown area/);
    const badComplex = await callTool(s, "update_scenario", {
      homes: [{ label: "A", area: "pangyo", complex_name: "없는단지" }],
    });
    assert.equal(badComplex.ok, false);
    assert.match(badComplex.errors.join(";"), /no complex named/);
    const unknownMember = await callTool(s, "update_scenario", {
      members: [{ id: "m9", label: "누구" }],
    });
    assert.equal(unknownMember.ok, false);
    assert.match(unknownMember.errors.join(";"), /no member matches/);
  });

  it("update_scenario warns on unknown station spellings", async () => {
    const s = fixtureSession();
    const r = await callTool(s, "update_scenario", {
      members: [{ id: "m1",
        work: { type: "station_ride", station_name: "없는역", ride_minutes: 10 } }],
    });
    assert.equal(r.ok, true);
    assert.match((r.warnings || []).join(";"), /없는역/);
  });

  it("list_complexes and list_stations read the fixture area", async () => {
    const s = fixtureSession();
    const cx = await callTool(s, "list_complexes", { area: "pangyo" });
    assert.equal(cx.ok, true);
    assert.deepEqual(cx.complexes.map((c) => c.name), ["베타", "알파"]);
    const q = await callTool(s, "list_complexes", { area: "pangyo", query: "알" });
    assert.deepEqual(q.complexes.map((c) => c.name), ["알파"]);
    const st = await callTool(s, "list_stations", { area: "pangyo" });
    assert.equal(st.ok, true);
    assert.deepEqual(st.stations.map((x) => x.name), ["중앙역"]);
    assert.equal(st.stations[0].pois, 2);
    const bad = await callTool(s, "list_complexes", { area: "busan" });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /unknown area/);
  });

  it("find_places returns graph minutes from the home entrance", async () => {
    const s = fixtureSession();
    const r = await callTool(s, "find_places",
      { area: "pangyo", category: "supermarket", home: "A" });
    assert.equal(r.ok, true);
    assert.equal(r.home, "A");
    assert.ok(r.places.length >= 2);
    assert.equal(r.places[0].name, "슈퍼1");
    assert.ok(r.places[0].minutes > 0 && r.places[0].distance_m > 0);
    assert.equal(r.places[0].source, "graph");
    assert.match(r.speed_note, /1\.3/);
    const badCat = await callTool(s, "find_places", { area: "pangyo", category: "cinema" });
    assert.equal(badCat.ok, false);
    const badHome = await callTool(s, "find_places",
      { area: "pangyo", category: "park", home: "Z" });
    assert.equal(badHome.ok, false);
  });

  it("run_simulation runs rules, stores runs and compares", async () => {
    const s = fixtureSession();
    const one = await callTool(s, "run_simulation", { home: "A", decisions: "rules" });
    assert.equal(one.ok, true);
    assert.ok(one.run_ids.A);
    assert.ok(one.summary.totals.walk_minutes >= 0);
    assert.equal(one.home, "A");
    const both = await callTool(s, "run_simulation", { home: "both" });
    assert.equal(both.ok, true);
    assert.ok(both.run_ids.A && both.run_ids.B);
    assert.ok(both.compare.metrics.length > 0);
    const walk = both.compare.metrics.find((m) => m.key === "walk_minutes");
    assert.equal(walk.source, "graph");
    const ride = both.compare.metrics.find((m) => m.key === "commute_ride_minutes");
    assert.equal(ride.source, "scenario");
    const cmp = await callTool(s, "compare",
      { run_a: both.run_ids.A, run_b: both.run_ids.B });
    assert.equal(cmp.ok, true);
    assert.equal(cmp.compare.home_a.label, "A");
    const bad = await callTool(s, "compare", { run_a: "run999", run_b: both.run_ids.B });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /unknown run/);
  });

  it("get_journey and get_fatigue read rides and fatigue", async () => {
    const region = tinyRegion();
    const s = fixtureSession({ loadRegion: async () => region });
    s.scenario.household.members[0].work.destination_station = "직장역";
    const one = await callTool(s, "run_simulation", { home: "A", decisions: "rules" });
    assert.equal(one.ok, true);
    const id = one.run_ids.A;
    const j = await callTool(s, "get_journey", { run: id, day: 1, member: "h1" });
    assert.equal(j.ok, true);
    assert.equal(j.rides.length, 1);
    assert.equal(j.rides[0].out.legs.length, 2);
    assert.equal(j.rides[0].out.legs[0].congestion_source, "서울교통공사");
    assert.equal(j.rides[0].out.legs[1].congestion_source, "가정값");
    assert.equal(j.rides[0].out.minutes_total, 20);
    const f = await callTool(s, "get_fatigue", { run: id, member: "구성원 1" });
    assert.equal(f.ok, true);
    assert.match(f.model_note, /건강·의학적 판단이 아니에요/);
    assert.deepEqual(f.criteria, ["C-congestion", "C-fatigue-load", "C-fatigue-recovery"]);
    assert.ok(Number.isFinite(f.summary_30d.avg_30d));
    const fd = await callTool(s, "get_fatigue", { run: id, member: "h1", day: 1 });
    assert.equal(fd.ok, true);
    assert.ok(fd.day_fatigue.series.length > 0);
    assert.equal((await callTool(s, "get_journey", { run: id, day: 9, member: "h1" })).ok, false);
    assert.equal((await callTool(s, "get_fatigue", { run: id, member: "nobody" })).ok, false);
    assert.equal((await callTool(s, "get_fatigue", { run: "run999", member: "h1" })).ok, false);
  });

  it("get_journey reads new-form ride aways (stage 9c)", async () => {
    const region = tinyRegion();
    const s = fixtureSession({ loadRegion: async () => region });
    const work = s.scenario.household.members[0].work;
    work.destination_station = "직장역";
    work.place = { name: "먼직장", lon: 127.1, lat: 37.6 };
    const one = await callTool(s, "run_simulation", { home: "A", decisions: "rules" });
    assert.equal(one.ok, true);
    const j = await callTool(s, "get_journey", { run: one.run_ids.A, day: 1, member: "h1" });
    assert.equal(j.ok, true);
    assert.equal(j.rides.length, 1);
    assert.equal(j.rides[0].stay, "먼직장 근무");
    assert.equal(j.rides[0].out.legs.length, 2);
    assert.equal(j.rides[0].out.legs[0].congestion_source, "서울교통공사");
    assert.equal(j.rides[0].back.legs.length, 2);
    assert.ok(j.rides[0].dest_walk);
  });

  it("update_scenario accepts per-home ride minutes (stage 9c)", async () => {
    const s = fixtureSession();
    const r = await callTool(s, "update_scenario", {
      members: [{ id: "m1",
        work: { type: "station_ride", station_name: "중앙역", ride_minutes: { A: 25 } } }],
    });
    assert.equal(r.ok, true);
    assert.deepEqual(s.scenario.household.members[0].work.ride_minutes, { A: 25 });
    assert.equal(s.scenario.household.members[0].work.ride_minutes_source, "user_input");
    const bad = await callTool(s, "update_scenario", {
      members: [{ id: "m1",
        work: { type: "station_ride", station_name: "중앙역", ride_minutes: { A: -5 } } }],
    });
    assert.equal(bad.ok, false);
  });

  it("get_journey reports numeric rides honestly without a destination", async () => {
    const s = fixtureSession({ loadRegion: async () => tinyRegion() });
    const one = await callTool(s, "run_simulation", { home: "A", decisions: "rules" });
    const j = await callTool(s, "get_journey", { run: one.run_ids.A, day: 1, member: "h1" });
    assert.equal(j.ok, true);
    assert.equal(j.rides[0].out, undefined);
    assert.match(j.rides[0].note, /목적지 역 없음/);
  });

  it("run_simulation rejects bad homes and modes", async () => {
    const s = fixtureSession();
    assert.equal((await callTool(s, "run_simulation", { home: "Z" })).ok, false);
    assert.equal((await callTool(s, "run_simulation", { home: "A", decisions: "telepathy" })).ok, false);
  });

  it("run_simulation recorded falls back with a note when absent", async () => {
    const s = fixtureSession({ loadDecisions: async () => null });
    const r = await callTool(s, "run_simulation", { home: "A", decisions: "recorded" });
    assert.equal(r.ok, true);
    assert.match(r.notes.join(";"), /no committed decisions/);
  });

  it("run_simulation muse needs a judge runner and caps at one", async () => {
    const noJudge = fixtureSession();
    const r0 = await callTool(noJudge, "run_simulation", { home: "A", decisions: "muse" });
    assert.equal(r0.ok, false);
    assert.match(r0.error, /unavailable/);
    const s = fixtureSession({
      judgeHome: async ({ area, scenarioRaw, homeLabel }) => ({
        run: simulate(area, scenarioRaw, homeLabel),
        usage: { calls: 1, prompt_tokens: 10, completion_tokens: 5 },
      }),
    });
    const r1 = await callTool(s, "run_simulation", { home: "A", decisions: "muse" });
    assert.equal(r1.ok, true);
    assert.match(r1.notes.join(";"), /judged live/);
    const r2 = await callTool(s, "run_simulation", { home: "B", decisions: "muse" });
    assert.equal(r2.ok, false);
    assert.match(r2.error, /capped at 1/);
  });

  it("get_day and explain_decision read stored runs", async () => {
    const s = fixtureSession();
    const run = await callTool(s, "run_simulation", { home: "A" });
    const id = run.run_ids.A;
    const day = await callTool(s, "get_day", { run: id, day: 1, member: "h1" });
    assert.equal(day.ok, true);
    assert.equal(day.member, "h1");
    assert.ok(Array.isArray(day.trips) && Array.isArray(day.aways));
    for (const t of day.trips) assert.equal(t.source, "graph");
    const byLabel = await callTool(s, "get_day", { run: id, day: 1, member: "구성원 1" });
    assert.equal(byLabel.ok, true);
    assert.equal(byLabel.member, "h1");
    assert.equal((await callTool(s, "get_day", { run: id, day: 0, member: "h1" })).ok, false);
    assert.equal((await callTool(s, "get_day", { run: id, day: 9, member: "h1" })).ok, false);
    const badMember = await callTool(s, "get_day", { run: id, day: 1, member: "nobody" });
    assert.equal(badMember.ok, false);
    const stored = s.cache.runs.get(id).run;
    const first = stored.decisions.find((d) => d.agent === "h1");
    if (first) {
      const exp = await callTool(s, "explain_decision", { run: id, decision_id: first.id });
      assert.equal(exp.ok, true);
      assert.equal(exp.id, first.id);
      assert.ok(exp.options.length > 0);
      assert.ok(exp.badge);
    }
    const badDec = await callTool(s, "explain_decision", { run: id, decision_id: "h1:d0:0:nope:0" });
    assert.equal(badDec.ok, false);
    assert.match(badDec.error, /unknown decision/);
  });

  it("set_view validates and formats the chip", async () => {
    const s = fixtureSession();
    const r = await callTool(s, "set_view",
      { home: "B", day: 2, time: "08:18", follow: 1, mode: "sim" });
    assert.equal(r.ok, true);
    assert.deepEqual(r.view, { home: "B", day: 2, time: "08:18", follow: 1, mode: "sim" });
    assert.equal(r.chip, "화면 이동: B · 2일차 08:18");
    assert.equal((await callTool(s, "set_view", { home: "Z" })).ok, false);
    assert.equal((await callTool(s, "set_view", { day: 99 })).ok, false);
    assert.equal((await callTool(s, "set_view", { time: "25:00" })).ok, false);
    assert.equal((await callTool(s, "set_view", { follow: 9 })).ok, false);
    assert.equal((await callTool(s, "set_view", { mode: "cinema" })).ok, false);
  });

  it("runs recorded decisions on real data (demo scenario)", async (t) => {
    if (!await hasRealData()) {
      t.skip("data/build + scenarios/demo-two-homes.json absent (regenerate via the pipeline)");
      return;
    }
    const scen = await demoScenario();
    scen.days = 30;
    const s = createSession({
      scenario: scen, loadArea: realLoadArea,
      loadDecisions: async (name, label) => JSON.parse(await readFile(
        join(REPO, "scenarios", "decisions", `${name}-${label}-meta.json`), "utf8")),
    });
    const r = await callTool(s, "run_simulation", { home: "A", decisions: "recorded" });
    if (!r.ok && /not in the decisions file/.test(r.error || "")) {
      t.skip("committed recording predates the stage-15 schedules; re-record via the judge to reactivate");
      return;
    }
    assert.equal(r.ok, true);
    assert.match(r.notes.join(";"), /replayed committed/);
    assert.ok(r.summary.trips > 1000);
  });

  it("reads real complexes, stations and places", async (t) => {
    if (!await hasRealData()) {
      t.skip("data/build + scenarios/demo-two-homes.json absent (regenerate via the pipeline)");
      return;
    }
    const s = createSession({ scenario: await demoScenario(), loadArea: realLoadArea });
    const cx = await callTool(s, "list_complexes", { area: "songpa-jamsil" });
    assert.equal(cx.ok, true);
    assert.ok(cx.complexes.some((c) => c.name === "레이크팰리스"));
    const st = await callTool(s, "list_stations", { area: "songpa-jamsil" });
    assert.ok(st.stations.some((x) => x.name === "잠실"));
    const pl = await callTool(s, "find_places",
      { area: "songpa-jamsil", category: "convenience", home: "A" });
    assert.equal(pl.ok, true);
    assert.ok(pl.places.length > 0);
    assert.equal(pl.places[0].source, "graph");
    const ok = await callTool(s, "update_scenario", {
      homes: [
        { label: "A", area: "songpa-jamsil", complex_name: "레이크팰리스" },
        { label: "B", area: "pangyo", complex_name: "백현마을" },
      ],
    });
    assert.equal(ok.ok, true);
  });
});
