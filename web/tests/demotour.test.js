import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_TOUR_STEPS, DEMO_TOUR_TOTAL_SECS, tourStepFromSearch,
  tourStepUrl, tourSkipUrl, recordedReplyFor,
  RECORDED_AGENT_REPLIES } from "../src/ui/demotour.js";
import { extract_profile } from "../src/profile.js";
import { find_homes } from "../src/homes.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

async function realBuild() {
  try {
    const [index, network, photos] = await Promise.all([
      readFile(join(REPO, "data", "build", "homes-index.json"), "utf8"),
      readFile(join(REPO, "data", "build", "region", "network.json"), "utf8"),
      readFile(join(REPO, "scenarios", "places", "commons-photos.json"), "utf8"),
    ]);
    return { index: JSON.parse(index), network: JSON.parse(network),
      photos: JSON.parse(photos) };
  } catch {
    return null;
  }
}

describe("demo tour step machine", () => {
  it("covers the briefed arc in order with one caption line each", () => {
    assert.deepEqual(DEMO_TOUR_STEPS.map((s) => s.id), [
      "persona", "commute-walk", "ride", "arrive", "home-b",
      "money", "jeonse", "listing", "public", "agent", "share",
    ]);
    for (const s of DEMO_TOUR_STEPS) {
      assert.ok(s.caption && !s.caption.includes("\n"), s.id);
      assert.ok(Number.isInteger(s.secs) && s.secs > 0, s.id);
    }
    assert.equal(DEMO_TOUR_TOTAL_SECS,
      DEMO_TOUR_STEPS.reduce((a, s) => a + s.secs, 0));
  });

  it("walks, rides and arrives at engine-verified times", () => {
    const by = Object.fromEntries(DEMO_TOUR_STEPS.map((s) => [s.id, s.params]));
    assert.deepEqual(by["commute-walk"], { home: "A", day: "1", t: "08:25", follow: "1" });
    assert.deepEqual(by.ride, { home: "A", day: "1", t: "08:40", follow: "1" });
    assert.deepEqual(by.arrive, { home: "A", day: "1", t: "09:05", follow: "1" });
    assert.deepEqual(by["home-b"], { home: "B", day: "1", t: "08:28", follow: "1" });
    assert.equal(by.money.tab, "money");
    assert.equal(by.jeonse.tab, "jeonse");
    assert.equal(by.listing.fill, "example");
    assert.equal(by.public.sub, "public");
    assert.equal(by.agent.ask, "switch");
    assert.equal(by.share.share, "1");
  });

  it("parses ?tour=demo&step= and clamps", () => {
    assert.equal(tourStepFromSearch("?mode=sim"), null);
    assert.equal(tourStepFromSearch("?tour=demo").index, 0);
    assert.equal(tourStepFromSearch("?tour=demo&step=9").step.id, "agent");
    assert.equal(tourStepFromSearch("?tour=demo&step=99").index, DEMO_TOUR_STEPS.length - 1);
    assert.equal(tourStepFromSearch("?tour=demo&step=-3").index, 0);
    assert.equal(tourStepFromSearch("?tour=demo&step=nope").index, 0);
  });

  it("builds step URLs keeping scenario, and a skip URL dropping tour keys", () => {
    const url = tourStepUrl(9, "?mode=sim&scenario=demo-two-homes&tab=money&step=2");
    const q = new URLSearchParams(url.slice(2));
    assert.equal(q.get("tour"), "demo");
    assert.equal(q.get("step"), "9");
    assert.equal(q.get("ask"), "switch");
    assert.equal(q.get("scenario"), "demo-two-homes");
    assert.equal(q.get("tab"), null);
    const skip = tourSkipUrl("?mode=sim&scenario=demo-two-homes&tour=demo&step=9&ask=switch");
    const qs = new URLSearchParams(skip.slice(2));
    assert.equal(qs.get("tour"), null);
    assert.equal(qs.get("ask"), null);
    assert.equal(qs.get("scenario"), "demo-two-homes");
    assert.equal(qs.get("mode"), "sim");
  });

  it("serves recorded agent replies with real demo numbers", () => {
    const rec = recordedReplyFor("switch");
    assert.ok(rec);
    assert.match(rec.q, /B로 바꾸면/);
    assert.match(rec.a, /27시간 50분/);
    assert.match(rec.a, /38시간 3분/);
    assert.match(rec.a, /A 260만 원 → B 250만 원/);
    assert.match(rec.a, /A 약 335만 원 → B 약 393만 원/);
    assert.match(rec.a, /A 7\.6 → B 7\.1/);
    assert.match(rec.a, /고객님이 정하세요/);
    assert.ok((rec.tools || []).length > 0);
    assert.equal(recordedReplyFor("nope"), null);
    assert.ok(Object.keys(RECORDED_AGENT_REPLIES).length >= 1);
  });

  it("serves the 12a profile-search reply with real index numbers", () => {
    const rec = recordedReplyFor("profile_search");
    assert.ok(rec);
    assert.match(rec.q, /판교로 출근하는 신입/);
    assert.match(rec.a, /예시로 찾아봤어요/);
    assert.match(rec.a, /2,917곳 중 6곳/);
    assert.match(rec.a, /오피스텔·빌라/);
    assert.match(rec.a, /하우징허브.*1\.69억/);
    assert.match(rec.a, /오라타워.*1\.25억/);
    assert.match(rec.a, /승차 미확인/);
    assert.match(rec.a, /3D로 살아 보기 가능/);
    assert.deepEqual(rec.tools.map((t) => t.name),
      ["extract_profile", "find_homes"]);
  });

  it("recorded profile-search numbers match the real build", async (t) => {
    const build = await realBuild();
    if (!build) {
      t.skip("data/build absent (operator runs the 12a pipeline first)");
      return;
    }
    const stations = new Set();
    for (const line of build.network.lines || []) {
      for (const s of line.stops || []) {
        if (s.name) stations.add(String(s.name).replace(/역$/, ""));
      }
    }
    const rec = recordedReplyFor("profile_search");
    const ex = extract_profile(rec.q, null, { stations: [...stations] });
    assert.equal(ex.ok, true);
    const r = find_homes(ex.profile, build.index,
      { network: build.network, photos: build.photos, limit: 6 });
    assert.equal(r.total_matching, 2917);
    assert.deepEqual(r.candidates.map((c) => c.name), [
      "하우징허브", "양지빌라A동(449-10)", "오라타워", "브라운스톤천호",
      "동인 레반트 오피스텔", "(1-25)",
    ]);
    assert.ok(r.candidates.every((c) => c.scene));
  });
});
