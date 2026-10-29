import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isIrrelevantPhoto, irrelevantReason,
  PEOPLE_KEYWORDS, EVENT_KEYWORDS, FOOD_KEYWORDS, INTERIOR_KEYWORDS,
  LOGO_DOC_KEYWORDS, OTHER_CITY_KEYWORDS,
} from "../src/places/photo-filter.js";

function photo(over = {}) {
  return {
    title: "File:Sample.jpg", description: "",
    categories: [], ...over,
  };
}

describe("photo relevance filter", () => {
  it("keeps the keyword lists in one file and non-empty", () => {
    for (const list of [PEOPLE_KEYWORDS, EVENT_KEYWORDS, FOOD_KEYWORDS,
      INTERIOR_KEYWORDS, LOGO_DOC_KEYWORDS, OTHER_CITY_KEYWORDS]) {
      assert.ok(Array.isArray(list) && list.length > 5);
    }
  });
  it("drops people and portraits (the 13-user-3 station photo case)", () => {
    const p = photo({ title: "File:Gangnam station concourse.jpg",
      description: "a person sitting", categories: ["People"] });
    assert.equal(irrelevantReason(p, "station"), "people");
    assert.equal(isIrrelevantPhoto(p, "station"), true);
  });
  it("drops events, food, logos, documents", () => {
    assert.equal(irrelevantReason(photo({ title: "File:Street festival.jpg" })), "event");
    assert.equal(irrelevantReason(photo({ title: "File:Noodle dish.jpg" })), "food");
    assert.equal(irrelevantReason(photo({ title: "File:Company logo.svg" })), "logo-or-document");
    assert.equal(irrelevantReason(photo({ title: "File:Map screenshot.png" })), "logo-or-document");
  });
  it("drops other-city photos", () => {
    assert.equal(irrelevantReason(photo({ title: "File:Busan beach.jpg" })), "other-city");
    assert.equal(irrelevantReason(photo({ title: "File:부산역 광장.jpg" })), "other-city");
  });
  it("drops station interiors entirely (13e2: platforms/concourses out)", () => {
    assert.equal(irrelevantReason(photo({ title: "File:Living room interior.jpg" })), "interior");
    const platform = photo({ title: "File:Platform view.jpg",
      description: "empty platform", categories: ["Railway stations", "platform"] });
    assert.equal(irrelevantReason(platform, "station"), "station-interior");
    assert.equal(irrelevantReason(photo({ title: "File:대모산입구역 승강장.jpg" }),
      "station"), "station-interior");
    const crowd = photo({ title: "File:Platform crowd.jpg",
      description: "crowd of passengers" });
    assert.equal(irrelevantReason(crowd, "station"), "people");
    assert.equal(irrelevantReason(photo({ title: "File:대모산입구역 1번 출구.jpg",
      categories: ["Railway stations"] }), "station"), null);
  });
  it("13e2: new people words catch crowds, bare men only as a word", () => {
    assert.equal(irrelevantReason(photo({ title: "File:Station hall.jpg",
      description: "commuters waiting" }), "station"), "people");
    assert.equal(irrelevantReason(photo({ title: "File:Two men.jpg" }), "station"), "people");
    assert.equal(irrelevantReason(photo({ description: "열차를 기다리는 중" }),
      "station"), "people");
    assert.equal(irrelevantReason(photo({ title: "File:Apartments.jpg",
      categories: ["Apartment buildings"] }), "complex"), null);
  });
  it("keeps plain street/park/apartment photos", () => {
    assert.equal(isIrrelevantPhoto(photo({ title: "File:Maple street.jpg",
      categories: ["Streets"] })), false);
    assert.equal(isIrrelevantPhoto(photo({ title: "File:Park pond.jpg",
      categories: ["Parks"] })), false);
  });
});
