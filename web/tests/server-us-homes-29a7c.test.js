// Stage 29a7c — the server finds US homes too (live path merges us-menlo).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHomesLoader } from "../src/consult/server.js";

function fakeRead(files) {
  return async (kind, rel) => {
    const key = `${kind}/${rel}`;
    if (!(key in files)) throw new Error("not found: " + rel);
    return files[key];
  };
}

const KR = { id: "kr-1", region: "gangnam" };

describe("server loadHomes merges summary regions", () => {
  it("appends us-menlo homes missing from the index", async () => {
    const read = fakeRead({
      "data/homes-index.json": JSON.stringify({ homes: [{ ...KR }] }),
      "data/homes/summary.json": JSON.stringify({ regions: { gangnam: {}, "us-menlo": {} } }),
      "data/homes/us-menlo.json": JSON.stringify({ homes: [{ id: "us-1" }, { id: "us-2", region: "us-menlo" }] }),
      "data/homes/gangnam.json": JSON.stringify({ homes: [{ id: "kr-extra", region: "gangnam" }] }),
    });
    const index = await createHomesLoader(read)();
    assert.equal(index.homes.length, 3);
    const us = index.homes.filter((h) => h.id.startsWith("us-"));
    assert.equal(us.length, 2);
    for (const h of us) assert.equal(h.region, "us-menlo");
  });

  it("a missing summary narrows coverage, never throws", async () => {
    const read = fakeRead({
      "data/homes-index.json": JSON.stringify({ homes: [{ ...KR }] }),
    });
    const index = await createHomesLoader(read)();
    assert.equal(index.homes.length, 1);
  });
});
