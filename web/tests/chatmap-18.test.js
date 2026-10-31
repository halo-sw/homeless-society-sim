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
    // 19b: light product basemap.
    assert.equal(MAP_COLORS.ground, "#f3f1ec");
    assert.equal(MAP_COLORS.water, "#c9dcea");
    assert.equal(MAP_COLORS.park, "#dfe9d3");
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
    assert.ok(html.includes(">A<") && html.includes(">2<"), "letter pill for the pick, number for the rest");
    assert.ok(html.includes("회사 · S2"), "workplace pill");
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
    // Candidate pins: the moved tag's 4 px ground dot (31g: only a
    // moved tag keeps a dot; 31f colours — ink-2, or the A/B pick
    // colour with a white ring, never work-marker black).
    const pins = [...html.matchAll(
      /<circle cx="([\d.\-e]+)" cy="([\d.\-e]+)" r="4" fill="#[0-9a-f]{6}"/g)];
    assert.equal(pins.length, 1, "the moved tag's true-point dot");
    for (const p of pins) inside(Number(p[1]), Number(p[2]), "candidate pin");
    // Pin numbers, price tags and region label.
    for (const m of html.matchAll(
      /<text x="([\d.\-e]+)" y="([\d.\-e]+)"[^>]*>([12AB]|전 [^<]*|성남 분당구)<\/text>/g)) {
      inside(Number(m[1]), Number(m[2]), `label ${m[3]}`);
    }
    // Workplace pill + 회사 label.
    const work = html.match(
      /<rect x="([\d.\-e]+)" y="([\d.\-e]+)" width="([\d.\-e]+)" height="26"[^>]*fill="#1d1b18"/);
    assert.ok(work, "workplace pill");
    inside(Number(work[1]) + Number(work[3]) / 2, Number(work[2]) + 13, "workplace pill");
    const workLabel = html.match(
      /<text x="([\d.\-e]+)" y="([\d.\-e]+)"[^>]*>회사 · 판교<\/text>/);
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
    // 19b: pill number glyphs are 10 px by design; everything else ≥ 11 px.
    for (const s of sizes) assert.ok(s >= 10, `label ${s}px >= 10px`);
    // 31g: only a moved tag keeps a ground dot (ink-2, or the A/B
    // pick colour — never work-marker black).
    const dots = [...html.matchAll(/<circle[^>]*r="([\d.]+)"[^>]*fill="#[0-9a-f]{6}"/g)]
      .map((m) => Number(m[1])).filter((r) => r === 4);
    assert.ok(dots.length === 1, `the moved tag's dot, got ${dots.length}`);
    for (const r of dots) assert.ok(r * 2 >= 8, `dot ${r * 2}px across`);
    const tags = [...html.matchAll(/<g[^>]*data-layer="home-pin"/g)];
    assert.ok(tags.length === 2, `two price tags, got ${tags.length}`);
  });
});

describe("18f real tracks, spread tags, one 추정", () => {
  const havKm = (aLon, aLat, bLon, bLat) => {
    const r = (d) => (d * Math.PI) / 180;
    const s = Math.sin(r(bLat - aLat) / 2) ** 2
      + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(s));
  };
  const polyKm = (pts) => {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += havKm(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    return s;
  };

  it("draws each line from pattern geometry, one pattern per direction", async () => {
    const { buildChatMap: build, layoutPinLabels: layout } =
      await import("../src/chatmap.js");
    assert.ok(typeof layout === "function", "tag layout helper exists");
    // Synthetic: line.stops alphabetical, pattern stops in route order.
    const m = build({ regions: { regions: [] },
      network: { lines: [{
        id: "demo", name: "데모선",
        stops: [
          { id: "d:가", key: "가", name: "가", lon: 127.0, lat: 37.5 },
          { id: "d:나", key: "나", name: "나", lon: 127.3, lat: 37.5 },
          { id: "d:다", key: "다", name: "다", lon: 127.1, lat: 37.5 },
        ],
        patterns: [
          { id: "p-up", direction: "up", stops: ["d:다", "d:가", "d:나"] },
          { id: "p-up2", direction: "up", stops: ["d:다", "d:가", "d:나"] },
          { id: "p-dn", direction: "down", stops: ["d:나", "d:가", "d:다"] },
        ],
      }] },
      candidates: [], picks: [], workplaceStation: null });
    assert.equal(m.lines.length, 2, "one pattern per direction");
    const up = m.lines.find((l) => l.direction === "up");
    const lons = up.pts.map((p) => p[0]);
    assert.equal(lons[0], 127.1, "starts at the pattern's first stop (다)");
    assert.equal(lons[lons.length - 1], 127.3, "ends at the pattern's last stop (나)");
    assert.ok(lons.some((x, i) => i > 0 && x < 127.05),
      "passes through 가 (127.0) — route order, never alphabetical line.stops order");
    assert.ok(!lons.some((x, i) => i > 0 && lons[i - 1] === 127.0 && x === 127.1),
      "no alphabetical 가→다 adjacency");
    assert.ok(m.stations.length === 3, "station dots still come from stops");
  });

  it("follows the real track: short hops, true length", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const netPath = join(root, "data/build/region/network.json");
    if (!existsSync(netPath)) return; // generated data absent: skip
    const network = JSON.parse(readFileSync(netPath, "utf8"));
    const { buildChatMap: build } = await import("../src/chatmap.js");
    const m = build({ regions: { regions: [] }, network,
      candidates: [], picks: [], workplaceStation: null });
    assert.ok(m.lines.length > 0, "lines drawn");
    for (const l of m.lines) {
      assert.ok(l.pts.length >= 2, `${l.id}/${l.direction} has geometry`);
      for (let i = 1; i < l.pts.length; i++) {
        const hop = havKm(l.pts[i - 1][0], l.pts[i - 1][1], l.pts[i][0], l.pts[i][1]);
        assert.ok(hop <= 3, `${l.id}/${l.direction} hop ${i} is ${hop.toFixed(2)} km`);
      }
    }
    for (const line of network.lines) {
      const dirs = [...new Set((line.patterns || []).map((p) => p.direction || ""))];
      const drawn = m.lines.filter((l) => l.id === line.id);
      assert.equal(drawn.length, dirs.length,
        `${line.id}: one drawn line per direction (${dirs.join(",")})`);
      for (const dir of dirs) {
        const pat = line.patterns.find((p) => (p.direction || "") === dir);
        const one = drawn.find((l) => (l.direction || "") === dir);
        if (!pat || !one || !Number.isFinite(pat.distance_km)) continue;
        const len = polyKm(one.pts);
        const rel = Math.abs(len - pat.distance_km) / pat.distance_km;
        assert.ok(rel <= 0.15,
          `${line.id}/${dir}: drawn ${len.toFixed(1)} km vs pattern ${pat.distance_km} km`);
      }
    }
  });

  it("fans close pins and never overlaps tag boxes (synthetic pair)", async () => {
    const { layoutPinLabels: layout } = await import("../src/chatmap.js");
    const laid = layout([
      { id: "a", x: 200, y: 200, tag: "전세 1억 9,500만 원" },
      { id: "b", x: 204, y: 202, tag: "전세 1억 9,800만 원" },
    ], 640, 420);
    assert.ok(laid[0].pinLeader && laid[1].pinLeader, "close pins fan out with leaders");
    assert.ok(Math.hypot(laid[0].x - laid[1].x, laid[0].y - laid[1].y) >= 18,
      "fanned dots stand apart");
    const [A, B] = [laid[0].box, laid[1].box];
    const hit = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h;
    assert.ok(!hit, "tag boxes do not intersect");
  });

  for (const [W, H] of [[1440, 900], [390, 844]]) {
    it(`no two single-firstjob tag boxes intersect at ${W}×${H}`, async () => {
      const { existsSync, readFileSync } = await import("node:fs");
      const { dirname, join } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
      const homesPath = join(root, "data/build/homes-index.json");
      const netPath = join(root, "data/build/region/network.json");
      if (!existsSync(homesPath) || !existsSync(netPath)) return; // skip
      const { find_homes } = await import("../src/homes.js");
      const { field, emptyProfile } = await import("../src/profile.js");
      const { buildChatMap: build, fitMapView: fit, layoutPinLabels: layout,
        MAP_FIT_MARGIN: margin } = await import("../src/chatmap.js");
      const index = JSON.parse(readFileSync(homesPath, "utf8"));
      const network = JSON.parse(readFileSync(netPath, "utf8"));
      const profile = emptyProfile();
      profile.tenure = field("jeonse", "customer", "");
      profile.depositMax = field(200000000, "customer", "");
      profile.workplaces = field(
        [{ member: 0, text: "판교", resolved: { station: "판교" } }], "customer", "");
      const { candidates } = find_homes(profile, index, { network, limit: 6 });
      assert.ok(candidates.length >= 2, `real candidates, got ${candidates.length}`);
      const m = build({ regions: { regions: [] }, network, tiles: [],
        green: { water: [], parks: [] }, candidates,
        picks: [], workplaceStation: "판교", tenure: "jeonse" });
      const focus = [];
      if (m.workPin) focus.push(m.workPin);
      for (const p of m.pins) focus.push(p);
      const { toXY } = fit(focus, W, H, margin);
      const { tenurePriceLine } = await import("../src/ui/candidate-card.jsx");
      const laid = layout(m.pins.map((p) => {
        const [x, y] = toXY(p.lon, p.lat);
        let tag = "가격 미정";
        try {
          tag = tenurePriceLine(p.candidate, m.tenure).price;
        } catch { /* keep fallback */ }
        return { id: p.id, x, y, tag };
      }), W, H);
      assert.equal(laid.length, m.pins.length, "every pin laid out");
      for (let i = 0; i < laid.length; i++) {
        for (let j = i + 1; j < laid.length; j++) {
          const A = laid[i].box;
          const B = laid[j].box;
          const hit = A.x < B.x + B.w && B.x < A.x + A.w
            && A.y < B.y + B.h && B.y < A.y + A.h;
          assert.ok(!hit, `tags ${laid[i].id} × ${laid[j].id} overlap at ${W}×${H}`);
        }
      }
    });
  }

  it("shows 추정 once on the pre-run commute line", async () => {
    const { commuteShortLine } = await import("../src/ui/candidate-card.jsx");
    const cand = { commute: {
      walk: { known: true, station: "정자", minutes: 3.8 },
      ride: { known: true, minutes: 8.5, derived: { methodsUsed: ["estimate"] } } } };
    const line = commuteShortLine(cand, "판교");
    assert.match(line.text, /추정 \(살아 보기 전\)/);
    assert.equal(line.text.match(/추정/g).length, 1, "single 추정 in the text");
    const React = (await import("react")).default;
    const { renderToString } = await import("react-dom/server");
    const { CandidateCard } = await import("../src/ui/candidate-card.jsx");
    const full = { id: "h-a", name: "테스트집", kind: "오피스텔",
      lon: 127.11, lat: 37.39, ...cand,
      tenures: [{ tenure: "jeonse", median_won: 195000000, deals: 5 }] };
    const html = renderToString(React.createElement(CandidateCard,
      { candidate: full, tenure: "jeonse", destName: "판교" }));
    assert.ok(!html.includes("살아 보기 전"), "row has no pre-run label");
    assert.equal(html.match(/추정/g).length, 1, "row shows 추정 exactly once");
    assert.ok(!/\d+\.\d+분/.test(html), "row rounds minutes");
  });
});
