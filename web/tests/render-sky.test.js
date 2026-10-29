import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dayPhase, fogRangeFor, skyParams } from "../src/render/sky.js";

// Seoul, autumn (the capture dates).
const LAT = 37.55;
const LON = 127.07;
const at = (hhmm, minute) =>
  skyParams(LAT, LON, new Date(`2026-10-15T${hhmm}:00+09:00`), minute);

describe("day phases", () => {
  it("bands altitude into day / golden / blue / night", () => {
    assert.equal(dayPhase(44, 720), "day");
    assert.equal(dayPhase(15, 990), "golden"); // 16:30 evening
    assert.equal(dayPhase(15, 600), "day"); // same sun, mid-morning
    assert.equal(dayPhase(10, 420), "golden"); // 07:00 morning gold
    assert.equal(dayPhase(4, 1050), "golden");
    assert.equal(dayPhase(-3, 1090), "blue");
    assert.equal(dayPhase(-7.6, 1110), "blue"); // 18:30 capture
    assert.equal(dayPhase(-30, 1320), "night");
  });
});

describe("Seoul sky parameters", () => {
  it("is day at noon: high sun, no bloom, sky dome on", () => {
    const p = at("12:00", 720);
    assert.equal(p.phase, "day");
    assert.ok(p.altitude > 40 && p.altitude < 50, `alt=${p.altitude}`);
    assert.ok(p.dayF > 0.99);
    assert.equal(p.bloom, 0);
    assert.equal(p.emissive, 0);
    assert.equal(p.skyVisible, true);
    assert.equal(p.sunColor, 0xffe9c8); // stage 6: warmer midday sun
  });

  it("is golden at 16:30: low warm sun, still no emissive", () => {
    const p = at("16:30", 990);
    assert.equal(p.phase, "golden");
    assert.ok(p.altitude > 10 && p.altitude < 20, `alt=${p.altitude}`);
    assert.notEqual(p.sunColor, 0xffe9c8); // warmed further
    assert.equal(p.skyVisible, true);
    assert.equal(p.bloom, 0);
    assert.equal(p.emissive, 0);
    assert.ok(p.turbidity > 5, "hazier dome");
  });

  it("is blue at 18:30: sun below horizon, lamps on, flat sky", () => {
    const p = at("18:30", 1110);
    assert.equal(p.phase, "blue");
    assert.ok(p.altitude < 0, `alt=${p.altitude}`);
    assert.ok(p.nightF > 0.9);
    assert.ok(p.bloom > 0.5);
    assert.ok(p.emissive > 0.5);
    assert.equal(p.skyVisible, false);
  });

  it("is night at 22:00: moonlight, full bloom, dim environment", () => {
    const p = at("22:00", 1320);
    assert.equal(p.phase, "night");
    assert.ok(p.altitude < -30, `alt=${p.altitude}`);
    assert.equal(p.sunColor, 0x93a0cc);
    assert.ok(p.sunIntensity < 0.3);
    assert.ok(p.bloom > 0.8);
    assert.equal(p.emissive, 1);
    assert.equal(p.skyVisible, false);
    assert.ok(p.envIntensity < 0.2);
    assert.ok(p.exposure < 1.0);
  });

  it("ramps the dusk bump through the evening", () => {
    const early = at("17:30", 1050);
    const peak = at("18:30", 1110);
    const late = at("20:00", 1200);
    assert.ok(early.duskF > 0 && early.duskF < peak.duskF);
    assert.equal(peak.duskF, 1);
    assert.ok(late.duskF < 1e-6, "back to 0 by 20:00");
  });

  it("is deterministic", () => {
    assert.deepEqual(at("16:30", 990), at("16:30", 990));
  });
});

describe("fog range routing (14f)", () => {
  it("uses camera-distance fog for painted, width multiples for photo", () => {
    assert.deepEqual(fogRangeFor(300, null, { style: "painted", camDistM: 1070 }),
      { near: 1670, far: 2870 });
    // Photo: defaults and explicit style both keep the 2.5×/6× multiples.
    assert.deepEqual(fogRangeFor(300), { near: 750, far: 1800 });
    assert.deepEqual(fogRangeFor(300, null, { style: "photo", camDistM: 1070 }),
      { near: 750, far: 1800 });
    // Painted without a camera distance falls back to the multiples.
    assert.deepEqual(fogRangeFor(300, null, { style: "painted" }),
      { near: 750, far: 1800 });
  });
});
