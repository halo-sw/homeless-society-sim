import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, normalize } from "node:path";
import { resolveDataPath } from "../vite.config.js";

const DIR = normalize("/tmp/data-build");

describe("14b data path", () => {
  it("decodes percent-encoded Korean area ids", () => {
    const { rel, full } = resolveDataPath(DIR,
      "/st-%EA%B0%80%EC%B2%9C%EB%8C%80/area.json");
    assert.equal(rel, normalize("st-가천대/area.json"));
    assert.equal(full, join(DIR, normalize("st-가천대/area.json")));
  });
  it("accepts raw Korean and strips the query", () => {
    const { rel } = resolveDataPath(DIR, "/st-잠실/scene.json?x=1");
    assert.equal(rel, normalize("st-잠실/scene.json"));
  });
  it("normalizes NFD input to NFC filenames", () => {
    const nfd = "st-가천대".normalize("NFD");
    const { rel } = resolveDataPath(DIR, `/${encodeURIComponent(nfd)}/area.json`);
    assert.equal(rel, normalize("st-가천대/area.json"));
  });
  it("rejects traversal and absolute paths with 403", () => {
    for (const url of [
      "/../secret.json",
      "/st-x/../../etc/passwd",
      "/%2e%2e/%2e%2e/x.json",
      "/st-%EA%B0%80%EC%B2%9C%EB%8C%80/%2e%2e/area.json",
      "/%2Fetc%2Fpasswd",
    ]) {
      assert.throws(() => resolveDataPath(DIR, url),
        (e) => e.code === 403, url);
    }
  });
  it("returns 400 on a malformed URI", () => {
    assert.throws(() => resolveDataPath(DIR, "/st-%E0%A4%A/area.json"),
      (e) => e.code === 400);
    assert.throws(() => resolveDataPath(DIR, "/%"),
      (e) => e.code === 400);
  });
});
