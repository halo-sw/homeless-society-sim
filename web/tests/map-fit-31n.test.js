// Stage 31n — the map fits its homes into the space the chrome
// leaves free: a measured fit inset, the tray as an obstacle, and
// the work marker avoiding the chrome too. node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

let fitInsetFromChrome;
let fitMapView;
let layoutMapPills;
let MAP_FIT_MARGIN;

before(async () => {
  ({ fitInsetFromChrome, fitMapView, layoutMapPills, MAP_FIT_MARGIN } =
    await import("../src/chatmap.js"));
});

const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w
  && a.y < b.y + b.h && b.y < a.y + a.h;

describe("31n fitInsetFromChrome phone case", () => {
  // iPhone-13-like stage: the top stack (filters + title + legend)
  // reaches 230 px, the tray covers 160 px, the control column takes
  // 64 px, and the tallest tag is 56 px high.
  it("clears the stack, the tray and the column", () => {
    const inset = fitInsetFromChrome(
      { W: 390, H: 700, top: 230, bottom: 160, right: 64, tagH: 56 });
    assert.ok(inset.top >= 230 + 56,
      `top reserves a tag over the stack: ${inset.top}`);
    assert.ok(inset.bottom >= 160, `bottom clears the tray: ${inset.bottom}`);
    assert.ok(inset.right >= 64, `right clears the column: ${inset.right}`);
    assert.equal(inset.left, 16, "left stays 16");
    assert.ok(700 - inset.top - inset.bottom >= 120, "120 px stay free");
  });
});

describe("31n fitInsetFromChrome crowded stage", () => {
  it("scales down to leave at least 120 px free", () => {
    const inset = fitInsetFromChrome(
      { W: 390, H: 400, top: 230, bottom: 160, right: 64, tagH: 56 });
    assert.ok(400 - inset.top - inset.bottom >= 120 - 1e-6,
      `height frees 120: ${JSON.stringify(inset)}`);
    assert.ok(390 - inset.left - inset.right >= 120 - 1e-6,
      `width frees 120: ${JSON.stringify(inset)}`);
  });

  it("scales a narrow width down too", () => {
    const inset = fitInsetFromChrome(
      { W: 150, H: 700, top: 40, bottom: 30, right: 64, tagH: 44 });
    assert.ok(150 - inset.left - inset.right >= 120 - 1e-6,
      `narrow width frees 120: ${JSON.stringify(inset)}`);
  });
});

describe("31n rank 0 avoids the chrome", () => {
  it("a work marker whose home slot hits an obstacle moves with a leader", () => {
    // Home slot centred above (320, 210): x 280..360, y 178..204.
    const titleBox = { x: 270, y: 150, w: 120, h: 90 };
    const laid = layoutMapPills(
      [{ id: "work", kind: "work", x: 320, y: 210, w: 80, h: 26, rank: 0 }],
      640, 420, [titleBox]);
    const work = laid.find((l) => l.id === "work");
    assert.ok(work && work.kind !== "cluster", "work is placed");
    assert.ok(!hit(work.box, titleBox),
      `work avoids the title: ${JSON.stringify(work.box)}`);
    assert.ok(work.leader, "a moved work marker keeps its leader line");
  });

  it("rank 0 is still placed (forced) when nothing is free", () => {
    const laid = layoutMapPills(
      [{ id: "work", kind: "work", x: 320, y: 210, w: 80, h: 26, rank: 0 }],
      640, 420, [{ x: 0, y: 0, w: 640, h: 420 }]);
    const work = laid.find((l) => l.id === "work");
    assert.ok(work && work.kind !== "cluster", "work is placed even with no room");
  });
});

describe("31n fitMapView with the phone inset", () => {
  it("maps every point inside the chrome-free rectangle", () => {
    const W = 390;
    const H = 700;
    const inset = fitInsetFromChrome(
      { W, H, top: 230, bottom: 160, right: 64, tagH: 56 });
    const pts = [
      { lon: 127.02, lat: 37.40 },
      { lon: 127.12, lat: 37.46 },
      { lon: 127.06, lat: 37.52 },
      { lon: 127.08, lat: 37.44 },
    ];
    const fit = fitMapView(pts, W, H, MAP_FIT_MARGIN, inset);
    for (const p of pts) {
      const [x, y] = fit.toXY(p.lon, p.lat);
      assert.ok(x >= inset.left - 1e-6 && x <= W - inset.right + 1e-6,
        `x ${x} inside [${inset.left}, ${W - inset.right}]`);
      assert.ok(y >= inset.top - 1e-6 && y <= H - inset.bottom + 1e-6,
        `y ${y} inside [${inset.top}, ${H - inset.bottom}]`);
    }
  });
});
