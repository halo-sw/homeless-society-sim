// Stage 20b: building / complex / place labels (pure module labels3d.js).
// Fixture is cut from the real area.json shape (3 complexes, 6 buildings,
// 6 POIs). Never reads data/.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildingCard, labelItemsFor, placeLabels } from "../src/labels3d.js";

function poly(lon, lat) {
  const s = 0.0002;
  return {
    type: "Polygon",
    coordinates: [[[lon, lat], [lon + s, lat], [lon + s, lat + s], [lon, lat + s], [lon, lat]]],
  };
}

function point(lon, lat) {
  return { type: "Point", coordinates: [lon, lat] };
}

const area = {
  complexes: [
    { id: "c1", name: "백현마을", centroid: [127.101, 37.351], building_ids: ["b1", "b2"], households: 3294, max_floors: 25, name_source: "register" },
    { id: "c2", name: "봇들마을", centroid: [127.105, 37.355], building_ids: ["b3", "b4"], households: 2100, max_floors: 22, name_source: "register" },
    { id: "c3", name: "판교원마을", centroid: [127.109, 37.359], building_ids: ["b5", "b6"], households: 1800, max_floors: 15, name_source: "register" },
  ],
  buildings: [
    { id: "b1", name: "백현마을 101동", geometry: poly(127.1, 37.35),
      register: { name: "백현마을", sub_name: "101동", use: "공동주택", floors_above: 25, approval_date: "2010-05-01" } },
    { id: "b2", geometry: poly(127.102, 37.352), kind: "apartments" },
    { id: "b3", geometry: poly(127.104, 37.354),
      register: { name: "봇들마을", sub_name: "704동", use: "공동주택", floors_above: 22, approval_date: "2009-08-20" } },
    { id: "b4", geometry: poly(127.106, 37.356), kind: "apartments" },
    { id: "b5", geometry: poly(127.108, 37.358), kind: "retail" },
    { id: "b6", name: "길옆 상가", geometry: poly(127.11, 37.36), kind: "retail" },
  ],
  pois: [
    { id: "p1", category: "shop:convenience", name: "GS25", geometry: point(127.103, 37.353) },
    { id: "p2", category: "amenity:pharmacy", name: "튼튼약국", geometry: point(127.104, 37.354) },
    { id: "p3", category: "amenity:school", name: "백현초", geometry: point(127.105, 37.355) },
    { id: "p4", category: "leisure:park", name: "봇들공원", geometry: point(127.106, 37.356) },
    { id: "p5", category: "amenity:cafe", name: "별다방", geometry: point(127.107, 37.357) },
    { id: "p6", category: "amenity:restaurant", name: "김밥집", geometry: point(127.108, 37.358) },
  ],
};

describe("labelItemsFor", () => {
  it("returns the home pill first", () => {
    const items = labelItemsFor(area, { homeBuildingId: "b3", destination: "GS25", cameraDistM: 600 });
    assert.ok(items.length > 0);
    assert.equal(items[0].level, "always");
    assert.match(items[0].title, /우리 집/);
    assert.match(items[0].title, /봇들마을/);
  });

  it("at 600m includes complex names and no sub_name", () => {
    const items = labelItemsFor(area, { homeBuildingId: "b3", destination: "GS25", cameraDistM: 600 });
    const titles = items.map((i) => `${i.title} ${i.sub || ""}`);
    assert.ok(titles.some((t) => t.includes("백현마을")));
    assert.ok(!titles.some((t) => t.includes("704동") && !t.includes("우리 집")));
    assert.ok(!items.some((i) => i.level === "dong"));
    assert.ok(!items.some((i) => i.level === "poi"));
  });

  it("at 150m includes 704동 and convenience POI labels", () => {
    const items = labelItemsFor(area, { homeBuildingId: "b3", destination: "GS25", cameraDistM: 150 });
    const dong = items.filter((i) => i.level === "dong");
    assert.ok(dong.some((i) => i.title === "704동"), "dong 704동 present");
    const poi = items.filter((i) => i.level === "poi");
    assert.ok(poi.some((i) => i.title === "GS25"), "convenience POI present");
    const conv = poi.find((i) => i.title === "GS25");
    assert.equal(conv.glyph, "편");
  });
});

describe("buildingCard", () => {
  it("renders the 봇들마을 704 record from the register", () => {
    const card = buildingCard(area.buildings.find((b) => b.id === "b3"));
    assert.equal(card.title, "봇들마을 704동");
    assert.equal(card.meta, "공동주택 · 22층 · 2009년 사용승인");
    assert.match(card.source, /건축물대장/);
  });

  it("falls back without undefined for buildings without a register", () => {
    const card = buildingCard(area.buildings.find((b) => b.id === "b2"));
    assert.ok(!/undefined|null/.test(JSON.stringify(card)));
    assert.match(card.meta, /층수 미확인/);
    assert.match(card.meta, /OpenStreetMap/);
  });
});

describe("placeLabels", () => {
  function box(id, level, x, y, w = 60, h = 22) {
    return { id, level, title: id, x, y, w, h };
  }

  it("places non-overlapping boxes and keeps always-items when crowded", () => {
    const items = [
      box("home", "always", 10, 10),
      ...Array.from({ length: 60 }, (_, i) =>
        box(`poi${i}`, "poi", 10 + (i % 5) * 8, 10 + (i % 5) * 5)),
    ];
    const placed = placeLabels(items, 800, 600);
    assert.ok(placed.length <= 40);
    assert.ok(placed.some((p) => p.id === "home"), "always-item survives");
    const boxes = placed.map((p) => ({ l: p.x, t: p.y, r: p.x + p.w, b: p.y + p.h }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
        assert.ok(!overlap, `${placed[i].id} overlaps ${placed[j].id}`);
      }
    }
  });
});
