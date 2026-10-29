import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  selectPhotosForHome, selectPhotosForList, complexPhotosFor,
  stationPhotosFor, fallbackLabelFor,
  COMPLEX_LABEL, STATION_LABEL_PREFIX, STREET_LABEL,
} from "../src/places/select-photos.js";
import { PHOTOS_DISCLAIMER } from "../src/places/photos.js";

function named(over = {}) {
  return { kind: "complex", target: "home:h1", title: "File:A.jpg",
    thumb_url: "https://example.invalid/t.jpg", page_url: "https://example.invalid/p",
    author: "A", license: "CC BY-SA 4.0", categories: ["Apartment buildings"],
    ...over };
}

const HOME = { id: "h1", name: "푸른아파트", region: "bundang",
  lon: 127.1, lat: 37.39, station: { station: "서현", walk_minutes: 4 },
  scene: "st-서현" };

describe("photo selection order", () => {
  it("prefers complex photos first with the complex label", () => {
    const deps = { named: { items: [named()] }, manifest: { items: [] } };
    const { slots, fallback } = selectPhotosForHome(HOME, deps, new Set());
    assert.equal(slots.length, 1);
    assert.equal(slots[0].slot, "complex");
    assert.equal(slots[0].label, COMPLEX_LABEL);
    assert.equal(fallback, null);
  });
  it("matches the same complex name in the same region", () => {
    const item = named({ target: "home:other", complex_name: "푸른아파트", region: "bundang" });
    const hits = complexPhotosFor(HOME, { items: [item] });
    assert.equal(hits.length, 1);
    const other = complexPhotosFor(HOME, { items: [named({ target: "home:other",
      complex_name: "푸른아파트", region: "gangnam" })] });
    assert.equal(other.length, 0);
  });
  it("falls back to station photos with the station label", () => {
    const st = named({ kind: "station", target: "station:서현",
      title: "File:Seohyeon station exit.jpg", categories: ["Railway stations"] });
    const deps = { named: { items: [st] }, manifest: { items: [] } };
    const { slots } = selectPhotosForHome(HOME, deps, new Set());
    assert.equal(slots.length, 1);
    assert.equal(slots[0].slot, "station");
    assert.equal(slots[0].label, `${STATION_LABEL_PREFIX} · 서현`);
  });
  it("stationPhotosFor matches with or without the 역 suffix", () => {
    const st = named({ kind: "station", target: "station:서현역" });
    assert.equal(stationPhotosFor("서현", { items: [st] }).length, 1);
    assert.equal(stationPhotosFor("미금", { items: [st] }).length, 0);
  });
  it("uses street photos third with the disclaimer label", () => {
    const manifest = { items: [{
      title: "File:Street.jpg", thumb_url: "https://example.invalid/s.jpg",
      page_url: "https://example.invalid/sp", author: "B", license: "CC BY 4.0",
      categories: ["Streets"], lat: 37.3901, lon: 127.1001 }] };
    const { slots } = selectPhotosForHome(HOME, { manifest }, new Set());
    assert.equal(slots.length, 1);
    assert.equal(slots[0].slot, "street");
    assert.equal(slots[0].label, STREET_LABEL);
    assert.equal(STREET_LABEL, PHOTOS_DISCLAIMER);
  });
  it("falls back to our 3D thumbnail or a map, never an unrelated photo", () => {
    const empty = selectPhotosForHome(HOME, {}, new Set());
    assert.equal(empty.slots.length, 0);
    assert.equal(empty.fallback, "thumbnail-3d");
    assert.equal(fallbackLabelFor("thumbnail-3d"), "우리 3D 미리보기");
    const noScene = selectPhotosForHome({ ...HOME, scene: null }, {}, new Set());
    assert.equal(noScene.fallback, "map");
    assert.equal(fallbackLabelFor("map"), "위치 지도");
  });
  it("filters people photos out of named items", () => {
    const item = named({ description: "portrait of a person" });
    const { slots, fallback } = selectPhotosForHome(HOME, { named: { items: [item] } }, new Set());
    assert.equal(slots.length, 0);
    assert.equal(fallback, "thumbnail-3d");
  });
  it("uses each photo at most once per candidate list", () => {
    const shared = named();
    const deps = { named: { items: [shared] }, manifest: { items: [] } };
    const out = selectPhotosForList([HOME, { ...HOME, id: "h2" }], deps);
    assert.equal(out[0].photos.slots.length, 1);
    assert.equal(out[1].photos.slots.length, 0);
    assert.equal(out[1].photos.fallback, "thumbnail-3d");
  });
});
