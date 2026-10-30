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
