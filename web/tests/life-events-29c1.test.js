// Stage 29c1 — "Only living there tells you": seated commutes and late
// walks home off the 30-day runs. node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { lifeEvents, lifeEventLines, sunsetMinFor } from "../src/engine/life-events.js";
import { createTranslator } from "../src/i18n/translate.js";
import { phrases, patterns } from "../src/i18n/en.js";
import { WORDS } from "../src/i18n/en-words.js";

const cong = (valuePct, source = "실측") =>
  ({ valuePct, hasData: true, source });
const leg = (valuePct, source) =>
  ({ from: "s1", to: "s2", minutes: 20, congestion: cong(valuePct, source) });
const workAway = (day, valuePct, source) => ({
  agent: "h1", day, kind: "work",
  detail: { rides: { out: { legs: [leg(valuePct, source)] } } },
});
const trip = (id, day, depart_min, minutes, toKind = "poi") => ({
  id, agent: "h1", day, depart_min, minutes,
  from: { kind: toKind === "home" ? "poi" : "home" },
  to: { kind: toKind }, purpose: "commute",
});
const agents = [{ key: "h1", household: true }];

function runA() {
  return { agents, decisions: [],
    aways: [workAway(0, 20), workAway(1, 30), workAway(2, 80),
      workAway(3, 10, "가정값")],
    trips: [trip("t-a0", 0, 480, 30), trip("t-a1", 1, 480, 30),
      trip("t-a2", 2, 480, 30),
      { ...trip("t-late-1", 5, 1340, 10, "home") },
      { ...trip("t-late-2", 6, 1410, 10, "home") }],
    meta: { home: "A" } };
}

function runB() {
  return { agents, decisions: [],
    aways: [workAway(0, 120), workAway(1, 140)],
    trips: [trip("t-b0", 0, 480, 30), trip("t-b1", 1, 480, 30),
      trip("t-early", 5, 1200, 10, "home")],
    meta: { home: "B" } };
}

describe("29c1 lifeEvents", () => {
  it("counts seated boarding days per home (measured only)", () => {
    const rows = lifeEvents(runA(), runB(), { labels: ["A", "B"] });
    const seated = rows.find((r) => r.kind === "seated");
    assert.ok(seated, "seated row present");
    assert.deepEqual(seated.a, { seated: 2, measured: 3 });
    assert.deepEqual(seated.b, { seated: 0, measured: 2 });
    assert.equal(seated.source, "실측 혼잡도");
    const lines = lifeEventLines(rows, ["A", "B"]);
    assert.ok(lines.some((l) => l.includes("A 2/3일 · B 0/2일")), "seated line");
  });

  it("counts late walks home with latest arrival", () => {
    const rows = lifeEvents(runA(), runB(), { labels: ["A", "B"] });
    const late = rows.find((r) => r.kind === "late_home");
    assert.ok(late, "late_home row present");
    assert.equal(late.a.count, 2);
    assert.equal(late.a.latest, "23:40");
    assert.equal(late.b.count, 0);
    const lines = lifeEventLines(rows, ["A", "B"]);
    const line = lines.find((l) => l.startsWith("밤 10시 이후 귀가:"));
    assert.ok(line.includes("A 2번") && line.includes("B 0번"), line);
  });

  it("omits rows when both homes have nothing to show", () => {
    const bare = () => ({ agents, decisions: [], aways: [],
      trips: [trip("t-x", 0, 480, 30)], meta: {} });
    assert.deepEqual(lifeEvents(bare(), bare()), []);
  });

  it("every row evidence id exists in its run", () => {
    const a = runA();
    const b = runB();
    for (const row of lifeEvents(a, b, { labels: ["A", "B"] })) {
      for (const [run, side] of [[a, "a"], [b, "b"]]) {
        const ev = row.evidence[side];
        if (!ev) continue;
        const ids = new Set([
          ...(run.trips || []).map((t) => t.id),
          ...(run.decisions || []).map((d) => d.id),
        ]);
        assert.ok(ids.has(ev.id), `${row.kind}.${side} evidence ${ev.id}`);
      }
    }
  });
});

describe("29c1 result card lifeEvents block (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let SimulationCard;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ SimulationCard } = await import("../src/ui/chat.jsx"));
  });

  const rows = () => lifeEvents(runA(), runB(), { labels: ["A", "B"] });
  const data = (life) => ({ status: "done", labels: ["A", "B"],
    names: { A: "A", B: "B" }, compare: { days: 30 },
    momentTexts: [], moments: [], lifeEvents: life });

  it("shows 살아 봐야 아는 것 with the seated line", () => {
    const html = renderToString(
      React.createElement(SimulationCard, { data: data(rows()) }));
    assert.ok(html.includes("살아 봐야 아는 것"), "block label");
    assert.ok(html.includes("앉아서 간 출근: A 2/3일"), "seated line");
  });

  it("old transcripts without lifeEvents render as today", () => {
    const html = renderToString(
      React.createElement(SimulationCard, { data: data(undefined) }));
    assert.ok(!html.includes("살아 봐야 아는 것"), "no block");
  });
});

describe("29c1b dark_walk and seated without data", () => {
  const homeTrip = (id, day, depart_min, minutes, label, distance_m) => ({
    id, agent: "h1", day, depart_min, minutes, distance_m,
    from: { kind: "poi", label }, to: { kind: "home" }, purpose: "commute",
  });
  const novMeta = (home) => ({ start_date: "2026-11-02", area: "songpa-jamsil", home });
  const darkA = () => ({ agents, decisions: [], aways: [],
    trips: [homeTrip("t-da0", 0, 1068, 12, "잠실", 923),
      homeTrip("t-da1", 1, 1068, 12, "잠실", 923),
      homeTrip("t-da2", 2, 1068, 12, "잠실", 923)],
    meta: novMeta("A") });
  const darkB = () => ({ agents, decisions: [], aways: [],
    trips: [homeTrip("t-db0", 0, 1073, 17, "판교", 1299),
      homeTrip("t-db1", 1, 1073, 17, "판교", 1299),
      homeTrip("t-early", 2, 948, 12, "판교", 900)],
    meta: novMeta("B") });

  it("sunsetMinFor picks the month table", () => {
    assert.equal(sunsetMinFor({ start_date: "2026-11-02", area: "songpa-jamsil" }), 1045);
    assert.equal(sunsetMinFor({ start_date: "2026-11-02", area: "us-menlo" }), 1020);
    assert.equal(sunsetMinFor({}), 1045);
  });

  it("counts after-dark walks home with station averages", () => {
    const rows = lifeEvents(darkA(), darkB(), { labels: ["A", "B"] });
    const dw = rows.find((r) => r.kind === "dark_walk");
    assert.ok(dw, "dark_walk row present");
    assert.equal(dw.a.count, 3);
    assert.equal(dw.b.count, 2);
    assert.equal(dw.sunset, "17:25");
    assert.equal(dw.source, "기록 · 해 지는 시각 가정");
    const lines = lifeEventLines(rows, ["A", "B"]);
    const line = lines.find((l) => l.startsWith("해 진 뒤 걸어서 퇴근:"));
    assert.ok(line.includes("잠실역에서 평균 12분(920m)"), line);
    assert.ok(line.includes("판교역에서 평균 17분(1.3km)"), line);
    assert.ok(!rows.find((r) => r.kind === "late_home"), "no late_home");
  });

  it("seated prints no-data instead of 0/0", () => {
    const b = { agents, decisions: [], aways: [workAway(0, 80, "가정값")],
      trips: [], meta: { home: "B" } };
    const rows = lifeEvents(runA(), b, { labels: ["A", "B"] });
    const lines = lifeEventLines(rows, ["A", "B"]);
    assert.ok(lines.some((l) => l.includes("B 혼잡도 자료 없음")), lines.join("\n"));
    assert.ok(!lines.join("\n").includes("0/0일"), "no 0/0 anywhere");
  });

  it("orders dark_walk, seated, late_home", () => {
    const a = { ...darkA(), aways: [workAway(0, 20)],
      trips: [...darkA().trips, { ...trip("t-late-a", 5, 1340, 10, "home") }] };
    const b = { ...darkB(), aways: [workAway(0, 90)],
      trips: [...darkB().trips, { ...trip("t-late-b", 5, 1350, 10, "home") }] };
    const rows = lifeEvents(a, b, { labels: ["A", "B"] });
    assert.deepEqual(rows.map((r) => r.kind), ["dark_walk", "seated", "late_home"]);
  });
});

describe("29c1 English", () => {
  it("translates the two sample lines whole", () => {
    const { translate } = createTranslator({ phrases, patterns, words: WORDS });
    assert.equal(translate("살아 봐야 아는 것"), "Only living there tells you");
    assert.equal(
      translate("앉아서 간 출근: A 12/20일 · B 3/20일 (실측 혼잡도 34% 이하)"),
      "Got a seat on the way to work: A 12/20 days · B 3/20 days (measured crowding ≤ 34%)");
    assert.equal(
      translate("밤 10시 이후 귀가: A 4번(역에서 걸어 평균 9분, 가장 늦게 23:40) · B 0번"),
      "Home after 10 pm: A 4 times (avg 9 min walk from the station, latest 23:40) · B 0 times");
  });

  it("translates the 29c1b no-data and dark-walk lines", () => {
    const { translate } = createTranslator({ phrases, patterns, words: WORDS });
    assert.equal(
      translate("앉아서 간 출근: A 0/44일 · B 혼잡도 자료 없음 (실측 34% 이하일 때)"),
      "Got a seat on the way to work: A 0/44 days · B no crowding data (measured ≤ 34%)");
    assert.equal(
      translate("해 진 뒤 걸어서 퇴근: A 44번 · 잠실역에서 평균 12분(920m) · B 44번 · 판교역에서 평균 17분(1.3km) · 해 지는 시각 17:25 기준"),
      "Walked home from work after dark: A 44 times · avg 12 min (920 m) from Jamsil Station · B 44 times · avg 17 min (1.3 km) from Pangyo Station · sunset 17:25");
  });
});
