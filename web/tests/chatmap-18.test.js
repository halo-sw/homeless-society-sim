// Stage 18 part 4 — the chat stage is a real map. Pure tests for the
// camera fit, pin numbering, network-data line colours and commute
// slices, plus a render smoke test for the SVG stage.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

// .jsx loads dynamically (static imports resolve before the loader).
let ChatMap = null;
before(async () => {
  ({ ChatMap } = await import("../src/ui/chatmap.jsx"));
});

import { buildChatMap, commutePathFor, extractGreenRings, findStop,
  fitMapView, lineColorFor, LINE_COLORS, MAP_COLORS } from "../src/chatmap.js";

const NET = {
  lines: [
    { id: "line2", name: "2호선", color: "#123456",
      stops: [
        { id: "line2:S1", key: "S1", name: "S1", lon: 127.0, lat: 37.5 },
        { id: "line2:S2", key: "S2", name: "S2", lon: 127.05, lat: 37.5 },
        { id: "line2:S3", key: "S3", name: "S3", lon: 127.1, lat: 37.5 },
      ],
      patterns: [{ id: "p1", stops: ["line2:S1", "line2:S2", "line2:S3"],
        chainage_km: [0, 2, 4] }] },
    { id: "line9", name: "9호선",
      stops: [
        { id: "line9:T1", key: "T1", name: "T1", lon: 127.0, lat: 37.45 },
        { id: "line9:S2", key: "S2", name: "S2", lon: 127.05, lat: 37.45 },
      ],
      patterns: [{ id: "p9", stops: ["line9:T1", "line9:S2"],
        chainage_km: [0, 3] }] },
  ],
};

const REGIONS = { regions: [
  { id: "r1", label: "R1", bbox: [126.98, 37.43, 127.12, 37.52] },
] };

const CANDS = [
  { id: "a", lon: 127.0, lat: 37.49,
    commute: { walk: { known: true, station: "S1", minutes: 5 },
      ride: { known: true, minutes: 10 } },
    tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 3 }] },
  { id: "b", lon: 127.1, lat: 37.46,
    commute: { walk: { known: true, station: "S3", minutes: 7 },
      ride: { known: true, minutes: 12 } },
    tenures: [{ tenure: "jeonse", median_won: 180000000, deals: 5 }] },
];

describe("18-4 camera fit", () => {
  for (const [W, H] of [[1440, 900], [390, 844]]) {
    it(`holds every pin inside the frame with ≥ 8 % margin at ${W}×${H}`, () => {
      const pts = [{ lon: 127.0, lat: 37.49 }, { lon: 127.1, lat: 37.46 },
        { lon: 127.05, lat: 37.5 }];
      const { toXY } = fitMapView(pts, W, H);
      for (const p of pts) {
        const [x, y] = toXY(p.lon, p.lat);
        assert.ok(x >= W * 0.08 - 1e-6 && x <= W * 0.92 + 1e-6, `x ${x} at ${W}`);
        assert.ok(y >= H * 0.08 - 1e-6 && y <= H * 0.92 + 1e-6, `y ${y} at ${H}`);
      }
    });
  }

  it("frames regions when there is nothing to fit", () => {
    const { view } = fitMapView([], 640, 420);
    assert.ok(view[2] > 0 && view[3] > 0, "non-empty fallback frame");
  });
});

describe("18-4 pins, colours and paths", () => {
  it("numbers pins in card order", () => {
    const m = buildChatMap({ regions: REGIONS, network: NET,
      candidates: CANDS, picks: ["b"], workplaceStation: "S2" });
    assert.deepEqual(m.pins.map((p) => [p.n, p.id]),
      [[1, "a"], [2, "b"]]);
    assert.deepEqual(m.pins.filter((p) => p.picked).map((p) => p.id), ["b"]);
  });

  it("takes line colours from the network data, falling back per line", () => {
    assert.equal(lineColorFor(NET.lines[0]), "#123456");
    assert.equal(lineColorFor(NET.lines[1]), LINE_COLORS.line9);
    assert.equal(lineColorFor({ id: "nope" }), "#6b7280");
  });

  it("paints the palette ground, water and parks", () => {
    assert.equal(MAP_COLORS.ground, "#cfc4ad");
    assert.equal(MAP_COLORS.water, "#3f6f8f");
    assert.equal(MAP_COLORS.park, "#8a9a5b");
  });

  it("routes picked homes along the subway to work, null when unknown", () => {
    const path = commutePathFor(NET, "S1", "S3");
    assert.ok(path && path.legs.length === 1, "one direct leg");
    assert.equal(path.legs[0].color, "#123456");
    assert.ok(path.legs[0].pts.length >= 2, "geometry, not a straight claim");
    assert.equal(commutePathFor(NET, "S1", "어딘가"), null);
    assert.equal(commutePathFor(NET, null, "S3"), null);
  });

  it("pins the workplace, omitting it when unresolvable", () => {
    const m = buildChatMap({ regions: REGIONS, network: NET,
      candidates: CANDS, picks: [], workplaceStation: "S2" });
    assert.equal(m.workPin && m.workPin.name, "S2");
    const no = buildChatMap({ regions: REGIONS, network: NET,
      candidates: CANDS, picks: [], workplaceStation: "어딘가" });
    assert.equal(no.workPin, null);
    assert.equal(findStop(null, "S2"), null);
  });

  it("splits box landuse into water and park rings, dropping junk", () => {
    const g = extractGreenRings([
      { kind: "natural:water",
        geometry: { coordinates: [[[127.0, 37.5], [127.001, 37.5], [127.001, 37.501], [127.0, 37.5]]] } },
      { kind: "leisure:park",
        geometry: { coordinates: [[[127.0, 37.5], [127.001, 37.5], [127.001, 37.501], [127.0, 37.5]]] } },
      { kind: "landuse:residential",
        geometry: { coordinates: [[[127.0, 37.5], [127.001, 37.5], [127.001, 37.501], [127.0, 37.5]]] } },
      { kind: "natural:water", geometry: null },
    ]);
    assert.equal(g.water.length, 1);
    assert.equal(g.parks.length, 1);
  });
});

describe("18-4 stage render", () => {
  it("renders pins, workplace and region labels as SVG, never slabs", async () => {
    const React = (await import("react")).default;
    const { renderToString } = await import("react-dom/server");
    const m = buildChatMap({ regions: REGIONS, network: NET,
      tiles: [], green: { water: [], parks: [] },
      candidates: CANDS, picks: ["a"], workplaceStation: "S2", tenure: "jeonse" });
    const html = renderToString(React.createElement(ChatMap, { map: m, cardHi: "home:a" }));
    assert.ok(html.includes("<svg"), "svg stage");
    assert.ok(html.includes(">1<") && html.includes(">2<"), "numbered pins");
    assert.ok(html.includes("직장"), "workplace pin");
    assert.ok(html.includes("R1"), "region label");
    assert.ok(html.includes("#123456"), "network line colour");
    assert.ok(!html.includes("BoxGeometry"), "no slabs");
  });
});

describe("18d walkthrough map: one projected space, readable pins", () => {
  // The 18c walkthrough panel was blank beige: the viewBox was raw
  // degrees while every layer drew in another space. Full ChatMap
  // data → SVG path with single-firstjob shapes (판교 commute, two
  // picked homes), asserting pins sit inside the frame in the same
  // units at readable screen sizes.
  const NET18D = {
    lines: [{
      id: "sinbundang", name: "신분당선", color: "#D4003B",
      stops: [
        { id: "dx:판교", key: "판교", name: "판교", lon: 127.1112, lat: 37.3944 },
        { id: "dx:정자", key: "정자", name: "정자", lon: 127.1083, lat: 37.3670 },
        { id: "dx:미금", key: "미금", name: "미금", lon: 127.1128, lat: 37.3502 },
      ],
      patterns: [{ id: "pdx", stops: ["dx:판교", "dx:정자", "dx:미금"],
        chainage_km: [0, 3, 6] }],
    }],
  };
  const REG18D = { regions: [
    { id: "bundang", label: "성남 분당구", bbox: [127.09, 37.38, 127.13, 37.41] },
  ] };
  const CAND18D = [
    { id: "h-a", name: "천사의도시Ⅱ오피스텔", kind: "오피스텔",
      lon: 127.1102, lat: 37.3949,
      commute: { walk: { known: true, station: "정자", minutes: 5 },
        ride: { known: true, minutes: 6 } },
      tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 5 }] },
    { id: "h-b", name: "시그마3", kind: "오피스텔",
      lon: 127.1142, lat: 37.3999,
      commute: { walk: { known: true, station: "정자", minutes: 7 },
        ride: { known: true, minutes: 6 } },
      tenures: [{ tenure: "jeonse", median_won: 180000000, deals: 4 }] },
  ];

  async function svgFor() {
    const React = (await import("react")).default;
    const { renderToString } = await import("react-dom/server");
    const m = buildChatMap({ regions: REG18D, network: NET18D,
      tiles: [], green: { water: [], parks: [] },
      candidates: CAND18D, picks: ["h-a", "h-b"],
      workplaceStation: "판교", tenure: "jeonse" });
    return renderToString(React.createElement(ChatMap, { map: m }));
  }

  it("keeps every candidate pin and the workplace pin inside the viewBox", async () => {
    const html = await svgFor();
    const vb = html.match(/viewBox="([\d.\-e ]+)"/);
    assert.ok(vb, "svg has a viewBox");
    const [vx, vy, vw, vh] = vb[1].trim().split(/\s+/).map(Number);
    // SSR measures no panel: the stage is 640×420 px — the viewBox is
    // stage px (same projected space as every toXY layer), never raw
    // degrees (which framed ~0.1 wide).
    assert.deepEqual([vx, vy, vw, vh], [0, 0, 640, 420]);
    const inside = (x, y, what) => {
      assert.ok(x >= vx && x <= vx + vw, `${what} x ${x} inside ${vb[1]}`);
      assert.ok(y >= vy && y <= vy + vh, `${what} y ${y} inside ${vb[1]}`);
    };
    // Candidate pins: the two dark dots.
    const pins = [...html.matchAll(
      /<circle cx="([\d.\-e]+)" cy="([\d.\-e]+)" r="([\d.\-e]+)" fill="#1d1b18"/g)];
    assert.equal(pins.length, 2, "two candidate pins");
    for (const p of pins) inside(Number(p[1]), Number(p[2]), "candidate pin");
    // Pin numbers, price tags and region label.
    for (const m of html.matchAll(
      /<text x="([\d.\-e]+)" y="([\d.\-e]+)"[^>]*>([12]|전세 [^<]*|성남 분당구)<\/text>/g)) {
      inside(Number(m[1]), Number(m[2]), `label ${m[3]}`);
    }
    // Workplace pin dot + 직장 label.
    const work = html.match(
      /<circle cx="([\d.\-e]+)" cy="([\d.\-e]+)" r="[\d.\-e]+" fill="#b25a33"/);
    assert.ok(work, "workplace dot");
    inside(Number(work[1]), Number(work[2]), "workplace pin");
    const workLabel = html.match(
      /<text x="([\d.\-e]+)" y="([\d.\-e]+)"[^>]*>직장 · 판교<\/text>/);
    assert.ok(workLabel, "workplace label");
    inside(Number(workLabel[1]), Number(workLabel[2]), "workplace label");
    // Commute minute labels on the picked lines.
    let commuteLabels = 0;
    for (const m of html.matchAll(
      /<text x="([\d.\-e]+)" y="([\d.\-e]+)"[^>]*>(\d+(\.\d+)?분)<\/text>/g)) {
      inside(Number(m[1]), Number(m[2]), `commute ${m[3]}`);
      commuteLabels++;
    }
    assert.ok(commuteLabels >= 1, "picked commute labels land in the svg");
  });

  it("labels read at ≥ 11 px on a 1000 px panel", async () => {
    const html = await svgFor();
    const sizes = [...html.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(sizes.length > 0, "labels carry font sizes");
    for (const s of sizes) assert.ok(s >= 11, `label ${s}px >= 11px`);
    const pins = [...html.matchAll(/<circle[^>]*r="([\d.]+)"[^>]*fill="#1d1b18"/g)]
      .map((m) => Number(m[1]));
    assert.ok(pins.length === 2, `two candidate pins, got ${pins.length}`);
    for (const r of pins) assert.ok(r * 2 >= 20, `pin ${r * 2}px across`);
  });
});
