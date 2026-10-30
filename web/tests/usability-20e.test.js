// Stage 20e: the 3D view is easy to follow (pure + SSR pins).
//
// - applyFollowOffset: zoom scales the camera-to-target distance
//   (clamped 0.5-6), yaw orbits around the target keeping the height.
// - placeLabels(items, w, h, reserved): toolbar/timeline rects are safe
//   zones — plain labels skip them, always-items nudge out, never drop.
// - familyRowText: whole numbers only ("약 9분", "피곤한 정도 5/100").
// - The sim credit line is visible and carries VWorld once state.aerial.
// - The sim drawer leads with now, ends with 내 기준 점수.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { applyFollowOffset } from "../src/camera.js";
import { placeLabels } from "../src/labels3d.js";
import { familyRowText } from "../src/nowcard.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const distOf = (p, t) => Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2]);

describe("20e applyFollowOffset", () => {
  const base = { pos: [100, 80, 60], look: [0, 0, 0] };
  const target = [0, 0, 0];

  it("zoom 2 doubles the camera-to-target distance", () => {
    const out = applyFollowOffset(base, target, { zoom: 2, yaw: 0 });
    assert.ok(Math.abs(distOf(out.pos, target) - 2 * distOf(base.pos, target)) < 1e-9);
    assert.deepEqual(out.look, target);
  });

  it("yaw 90deg orbits around the target, keeping the height", () => {
    const out = applyFollowOffset(base, target, { zoom: 1, yaw: 90 });
    assert.ok(Math.abs(distOf(out.pos, target) - distOf(base.pos, target)) < 1e-9);
    assert.ok(Math.abs(out.pos[1] - base.pos[1]) < 1e-9, "height kept");
    const before = Math.atan2(base.pos[0] - target[0], base.pos[2] - target[2]);
    const after = Math.atan2(out.pos[0] - target[0], out.pos[2] - target[2]);
    let deg = ((after - before) * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    assert.ok(Math.abs(deg - 90) < 1e-9 || Math.abs(deg - 270) < 1e-9, `rotated ${deg}deg`);
  });

  it("clamps zoom to 0.5-6", () => {
    const d = distOf(base.pos, target);
    const far = applyFollowOffset(base, target, { zoom: 100, yaw: 0 });
    assert.ok(Math.abs(distOf(far.pos, target) - 6 * d) < 1e-9);
    const near = applyFollowOffset(base, target, { zoom: 0.01, yaw: 0 });
    assert.ok(Math.abs(distOf(near.pos, target) - 0.5 * d) < 1e-9);
  });
});

describe("20e placeLabels reserved rects", () => {
  const zone = { left: 0, top: 0, right: 200, bottom: 60 };
  const hits = (b) => b.left < zone.right && b.right > zone.left
    && b.top < zone.bottom && b.bottom > zone.top;

  it("skips non-always labels intersecting the rect", () => {
    const items = [
      { id: "c1", level: "complex", title: "잠실주공아파트", x: 10, y: 10, w: 120, h: 22 },
      { id: "p1", level: "poi", title: "편의점", x: 400, y: 300, w: 80, h: 22 },
    ];
    const placed = placeLabels(items, 800, 600, [zone]);
    assert.ok(!placed.some((p) => p.id === "c1"), "toolbar overlap skipped");
    assert.ok(placed.some((p) => p.id === "p1"), "clear label kept");
    for (const p of placed) {
      if (p.level === "always") continue;
      const w = p.w ?? 100;
      const h = p.h ?? 22;
      assert.ok(!hits({ left: p.x, top: p.y, right: p.x + w, bottom: p.y + h }),
        `${p.id} must not intersect the reserved rect`);
    }
  });

  it("nudges an always-item out instead of dropping it", () => {
    const items = [
      { id: "home:b1", level: "always", title: "우리 집 · 레이크팰리스",
        x: 10, y: 10, w: 150, h: 22 },
    ];
    const placed = placeLabels(items, 800, 600, [zone]);
    assert.equal(placed.length, 1, "always-item kept");
    const p = placed[0];
    const w = p.w ?? 150;
    const h = p.h ?? 22;
    assert.ok(!hits({ left: p.x, top: p.y, right: p.x + w, bottom: p.y + h }),
      "always-item moved out of the rect");
  });
});

describe("20e familyRowText whole numbers", () => {
  it("rounds an 8.6-minute ride and fatigue 4.8", () => {
    const line = familyRowText({
      label: "구성원 2",
      line: "지하철 이동 중 · 2호선 잠실→강남 (약 8.6분) · 5분 남음",
      fatigue: 4.8,
    });
    assert.ok(line.includes("약 9분"), `rounded minutes: ${line}`);
    assert.ok(line.includes("피곤한 정도 5/100"), `scaled fatigue: ${line}`);
    assert.ok(!/\d+\.\d+분/.test(line), `no decimal minutes: ${line}`);
  });
});

describe("20e sim credit + now-first drawer (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let SimDrawer;
  let SimCredit;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ SimDrawer, SimCredit } = await import("../src/ui/app.jsx"));
  });

  function render(el) {
    const errors = [];
    const orig = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(" ")); };
    let html = "";
    try {
      html = renderToString(el);
    } finally {
      console.error = orig;
    }
    assert.equal(errors.length, 0, `React errors: ${errors.join(" | ").slice(0, 1000)}`);
    return html;
  }

  it("ui.css no longer hides the sim credit line", () => {
    const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");
    assert.ok(!css.includes(".ui-sim13 .ui-attr"), "no sim attr hiding rule");
    assert.ok(css.includes(".ui-simcredit"), "sim credit style exists");
  });

  it("credit carries VWorld once state.aerial is true", () => {
    const on = render(React.createElement(SimCredit, { state: { aerial: true } }));
    assert.ok(on.includes("VWorld"), "aerial credit shown");
    assert.ok(on.includes("OpenStreetMap"), "OSM always shown");
    const off = render(React.createElement(SimCredit, { state: {} }));
    assert.ok(off.includes("OpenStreetMap"), "OSM without the drape");
    assert.ok(!off.includes("VWorld"), "no aerial claim before the drape");
  });

  it("drawer leads with now, ends with 내 기준 점수", () => {
    const state = {
      clock: { day: 0, minute: 510, days: 30,
        startDate: "2026-11-02", label: "11월 2일(월) 08:30 · 1일차/30" },
      now: {
        agentKey: "h1", label: "구성원 1", state: "trip",
        now: "출근 중 · 레이크팰리스 → 잠실역 (걸어서 5분 남음)",
        why: "07:30 기준", whyKind: "routine", criterionIds: [],
        decision: null, progress: 0.5, next: "08:35 잠실역 도착", oldRun: false,
        fatigue: null,
        evidence: [{ text: "출퇴근 걷기 14분", tag: "비교" }],
        familyRows: [
          { agentKey: "h1", label: "구성원 1",
            line: "출근 중 · 레이크팰리스 → 잠실역 (걸어서 5분 남음)", fatigue: 4.8 },
        ],
      },
      ticker: [],
      judgeLog: [],
      journey: null, journeyView: "auto", journeyLoading: "",
      routeSteps: { outings: [] },
      moments: [
        { kind: "walk", home: "A", agent: "구성원 1", day: 0, minute: 510,
          followIndex: 1, dayLabel: "1일차", timeLabel: "08:30",
          text_ko: "아침에 14분 걸었어요",
          evidence: { type: "walk", id: "w1" } },
      ],
      money: {
        days: 30,
        homes: {
          A: { complex_name: "A단지", area_m2: 60,
            by_tenure: { "전세": { housing: { monthly_won: 2000000, source: "rtms" },
              remaining_won: 3000000, burden_ratio: 0.4 } },
            qol_time: { commute_minutes_per_day: 120, evening_at_home_minutes_per_day: 600 },
            qol_fatigue: { avg_30d: 40 },
            qol_convenience: { grocery: 1, clinic: 0, station: 0 },
            qol_education: { counts: { within_10min: { school_elementary: 1 } },
              nearest: { school: [{ minutes: 12 }] } },
            qol_safety: { total: 500, groups: [] } },
          B: { complex_name: "B단지", area_m2: 84,
            by_tenure: { "전세": { housing: { monthly_won: 1000000, source: "rtms" },
              remaining_won: 4000000, burden_ratio: 0.2 } },
            qol_time: { commute_minutes_per_day: 50, evening_at_home_minutes_per_day: 660 },
            qol_fatigue: { avg_30d: 10 },
            qol_convenience: { grocery: 3, clinic: 2, station: 1 },
            qol_education: { counts: { within_10min: { school_elementary: 3 } },
              nearest: { school: [{ minutes: 5 }] } },
            qol_safety: { total: 50, groups: [] } },
        },
      },
      moneyLoading: false, moneyTenure: {}, compare: null, compareOpen: false,
      priorityWeights: null,
    };
    const html = render(React.createElement(SimDrawer, { state }));
    const heroAt = html.indexOf("sim-hero");
    const evidenceAt = html.indexOf("이 장면이 결과에 들어가는 곳");
    const familyAt = html.indexOf("지금 식구들 모습");
    const todayAt = html.indexOf("오늘");
    const momentsAt = html.indexOf("살아 보니");
    const scoreAt = html.indexOf("내 기준 점수");
    assert.ok(heroAt !== -1 && evidenceAt !== -1, "now hero with evidence renders");
    assert.ok(familyAt !== -1, "family section renders");
    assert.ok(evidenceAt < momentsAt, "now evidence before 살아 보니");
    assert.ok(familyAt < todayAt && todayAt < momentsAt, "family, 오늘, 살아 보니 in order");
    assert.ok(scoreAt !== -1 && scoreAt > momentsAt
      && scoreAt > todayAt && scoreAt > heroAt, "내 기준 점수 last");
  });
});
