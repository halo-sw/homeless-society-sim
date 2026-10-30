// Stage 19j — fractional minutes-left are whole minutes (ceil),
// and the hero reads decimals safely.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { nowCardFor } from "../src/nowcard.js";

let heroBig;
before(async () => {
  ({ heroBig } = await import("../src/ui/app.jsx"));
});

function fractionalTripRun() {
  const trip = {
    id: "t1",
    agent: "A",
    day: 3,
    depart_min: 1060.4,
    arrive_min: 1068.2,
    purpose: "errand",
    from: { label: "천사의도시Ⅱ오피스텔" },
    to: { label: "GS25" },
  };
  const run = { agents: [{ key: "A", label: "A" }], trips: [trip], aways: [], meta: { days: 30 } };
  const indexed = {
    tripsByAgent: new Map([["A", [trip]]]),
    awaysByAgent: new Map([["A", []]]),
  };
  return { run, indexed };
}

describe("19j fractional remain", () => {
  it("trip at minute 1068 shows 1분 남음 with no decimal", () => {
    const { run, indexed } = fractionalTripRun();
    const card = nowCardFor({ run, indexed, agentKey: "A", day: 3, minute: 1068 });
    assert.match(card.now, /1분 남음/);
    assert.doesNotMatch(card.now, /\d+\.\d+분/);
  });

  it("trip at minute 1063 shows 6분 남음", () => {
    const { run, indexed } = fractionalTripRun();
    const card = nowCardFor({ run, indexed, agentKey: "A", day: 3, minute: 1063 });
    assert.match(card.now, /6분 남음/);
  });

  it("heroBig ceils a decimal remain", () => {
    const got = heroBig({ now: { now: "장보기 중 · 천사의도시Ⅱ오피스텔 → GS25 (걸어서 0.2분 남음)" }, clock: null });
    assert.equal(got, "1분 남음");
  });
});
