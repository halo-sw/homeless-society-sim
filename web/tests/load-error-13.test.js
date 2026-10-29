import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { explainLoadError, FEATURE_KO } from "../src/load-error.js";

describe("explainLoadError", () => {
  it("names the file and pipeline command when not built", () => {
    const e = explainLoadError({ feature: "rentals",
      cause: "not-built", detail: { file: "region/housing.json",
        command: ".venv/bin/python -m pipeline housing" } });
    assert.match(e.title, /공공임대/);
    assert.match(e.body, /region\/housing.json/);
    assert.match(e.body, /pipeline housing/);
    assert.match(e.body, /민간 매물 후보/);
    assert.ok(e.tech.length > 0);
  });
  it("names the HTTP status for http errors", () => {
    const e = explainLoadError({ feature: "model",
      cause: "http", detail: { status: 429, message: "rate limited" } });
    assert.match(e.title, /429/);
    assert.match(e.body, /429/);
  });
  it("explains the public-housing endpoint change", () => {
    const e = explainLoadError({ feature: "rentals",
      cause: "endpoint-changed",
      detail: { url: "https://public-housing-map.vercel.app/api/v1",
        status: 404, since: "2026-10-29" } });
    assert.match(e.body, /404/);
    assert.match(e.body, /2026-10-29/);
  });
  it("points at the model panel when the key is missing", () => {
    const e = explainLoadError({ feature: "model",
      cause: "no-key", detail: { provider: "Meta" } });
    assert.match(e.body, /모델 패널/);
    assert.match(e.body, /Meta/);
  });
  it("names the uncovered region", () => {
    const e = explainLoadError({ feature: "rentals",
      cause: "not-covered", detail: { region: "하남 위례" } });
    assert.match(e.title, /자료가 없어요/);
    assert.match(e.body, /하남 위례/);
  });
  it("covers parse errors and timeouts", () => {
    const p = explainLoadError({ feature: "photos",
      cause: "parse", detail: { file: "commons-photos.json" } });
    assert.match(p.body, /commons-photos.json/);
    const t = explainLoadError({ feature: "model",
      cause: "timeout", detail: { ms: 60000 } });
    assert.match(t.body, /60초/);
  });
  it("covers every feature without the generic line", () => {
    for (const feature of Object.keys(FEATURE_KO)) {
      const e = explainLoadError({ feature, cause: "unknown", detail: {} });
      assert.ok(!/불러오지 못했어요$/.test(e.title) || e.body.length > 10);
      assert.ok(e.title.length > 0 && e.body.length > 0 && e.tech.length > 0);
    }
  });
});
