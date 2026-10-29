import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PHOTOS_DISCLAIMER, PHOTOS_LIMIT, PHOTOS_RADIUS_M, THUMB_H, THUMB_W,
  haversineM, photoCreditLine, photoExcluded, photoPreferred, photosNear,
  sceneThumbnail, clearThumbnailCache, thumbnailSceneSpec,
} from "../src/places/photos.js";

function photo(over = {}) {
  return {
    title: "File:Sample street.jpg", thumb_url: "https://example.invalid/t.jpg",
    page_url: "https://example.invalid/p", author: "Example",
    license: "CC BY-SA 4.0", categories: ["Streets"], lat: 37.39, lon: 127.1,
    ...over,
  };
}

describe("photosNear", () => {
  const MANIFEST = {
    items: [
      photo({ title: "File:Station front.jpg", categories: ["Railway stations"],
        lat: 37.3901, lon: 127.1001 }),
      photo({ title: "File:Park walk.jpg", categories: ["Parks"],
        lat: 37.3902, lon: 127.1002 }),
      photo({ title: "File:Wedding portrait.jpg",
        categories: ["Portrait photographs"], lat: 37.3901, lon: 127.1001 }),
      photo({ title: "File:Noodle dish.jpg", categories: ["Food"],
        lat: 37.3901, lon: 127.1001 }),
      photo({ title: "File:Office interior.jpg", categories: ["Interiors"],
        lat: 37.3901, lon: 127.1001 }),
      photo({ title: "File:Shop logo.png", categories: ["Logos"],
        lat: 37.3901, lon: 127.1001 }),
      photo({ title: "File:Far skyline.jpg", categories: ["Skylines"],
        lat: 37.5, lon: 127.2 }),
    ],
  };

  it("keeps place subjects, drops portraits/food/interiors/logos", () => {
    const out = photosNear(127.1, 37.39, MANIFEST);
    const titles = out.map((p) => p.title);
    assert.ok(titles.includes("File:Station front.jpg"));
    assert.ok(titles.includes("File:Park walk.jpg"));
    assert.ok(!titles.some((t) => /Wedding|Noodle|interior|logo/i.test(t)));
    assert.ok(!titles.includes("File:Far skyline.jpg"));
  });

  it("prefers streets/parks/stations/apartments/skylines", () => {
    assert.equal(photoPreferred(photo({ categories: ["Railway stations"] })), true);
    assert.equal(photoPreferred(photo({ categories: ["Parks"] })), true);
    assert.equal(photoPreferred(photo({ categories: ["Apartment buildings"] })), true);
    assert.equal(photoExcluded(photo({ categories: ["Portrait photographs"] })), true);
    assert.equal(photoExcluded(photo({ title: "File:Concert night.jpg" })), true);
  });

  it("carries attribution and the not-this-listing note", () => {
    assert.equal(PHOTOS_DISCLAIMER, "주변 사진 · 이 매물 사진이 아니에요");
    assert.equal(PHOTOS_RADIUS_M, 700);
    assert.equal(PHOTOS_LIMIT, 6);
    const out = photosNear(127.1, 37.39, MANIFEST, { limit: 1 });
    assert.equal(out[0].credit, "사진: Example, CC BY-SA 4.0, Wikimedia Commons");
    assert.match(out[0].page_url, /^https/);
    assert.ok(Number.isFinite(out[0].distance_m));
    assert.equal(
      photoCreditLine({ author: "", license: "" }),
      "사진: 작자 미상, 저작권 정보 없음, Wikimedia Commons");
  });

  it("measures metres, not degrees", () => {
    assert.ok(haversineM(127.1, 37.39, 127.1001, 37.3901) < 20);
    assert.ok(haversineM(127.1, 37.39, 127.2, 37.5) > 10000);
  });
});

describe("sceneThumbnail", () => {
  const AREA = {
    buildings: [
      { id: "b1", height_m: 30, residential: "apartment",
        geometry: { type: "Polygon",
          coordinates: [[[127.1, 37.39], [127.101, 37.39], [127.101, 37.391], [127.1, 37.391], [127.1, 37.39]]] } },
      { id: "b2", height_m: 12, residential: "none",
        geometry: { type: "Polygon",
          coordinates: [[[127.102, 37.392], [127.103, 37.392], [127.103, 37.393], [127.102, 37.393], [127.102, 37.392]]] } },
    ],
  };

  it("derives a 640x400 massing spec from footprints", () => {
    assert.equal(THUMB_W, 640);
    assert.equal(THUMB_H, 400);
    const spec = thumbnailSceneSpec(AREA);
    assert.equal(spec.boxes.length, 2);
    assert.equal(spec.width, 640);
    assert.equal(spec.height, 400);
    assert.ok(spec.frame.maxX > spec.frame.minX);
    assert.equal(thumbnailSceneSpec({ buildings: [] }), null);
  });

  it("renders once and caches the data URL in memory", async () => {
    clearThumbnailCache();
    let loads = 0;
    let builds = 0;
    const deps = {
      loadArea: async () => { loads++; return AREA; },
      createRenderer: async () => ({
        dispose: () => {},
        buildMassing: (spec) => { builds++; return `data:image/png,${spec.boxes.length}`; },
      }),
    };
    const first = await sceneThumbnail("st-테스트", deps);
    const second = await sceneThumbnail("st-테스트", deps);
    assert.equal(first, "data:image/png,2");
    assert.equal(second, first);
    assert.equal(loads, 1);
    assert.equal(builds, 1);
    clearThumbnailCache();
  });

  it("returns null for empty areas", async () => {
    clearThumbnailCache();
    const out = await sceneThumbnail("st-빈", {
      loadArea: async () => ({ buildings: [] }),
      createRenderer: async () => { throw new Error("must not render"); },
    });
    assert.equal(out, null);
    clearThumbnailCache();
  });
});
