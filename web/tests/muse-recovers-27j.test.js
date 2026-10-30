// 27j: one slow Muse turn never ends the conversation — retry next turn,
// and the rules path always answers (SSR, no DOM, no data/build needed).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

describe("27j Muse recovers after a slow turn", () => {
  let routeTurn;
  let localNoAnswerLine;

  before(async () => {
    ({ routeTurn, localNoAnswerLine } = await import("../src/ui/chat.jsx"));
  });

  it("routes to the agent until 3 straight failures", () => {
    assert.equal(routeTurn({ live: true, museFails: 0 }), "agent");
    assert.equal(routeTurn({ live: true, museFails: 2 }), "agent");
    assert.equal(routeTurn({ live: true, museFails: 3 }), "local");
    assert.equal(routeTurn({ live: false }), "local");
    assert.equal(routeTurn({ live: true, museDown: true }), "local");
  });

  it("always answers on the rules path", () => {
    assert.ok(localNoAnswerLine("1번이랑 2번 찜해 줘").includes("담기"));
    assert.ok(localNoAnswerLine("1번 동네는 어때?").includes("3D 미리보기"));
    assert.ok(localNoAnswerLine("두 집에서 살아 봐 줘").includes("30일 살아 보기"));
    assert.ok(localNoAnswerLine("안녕").includes("잠시 뒤"));
  });

  it("relays longer and retries Muse next turn", () => {
    const relay = readFileSync(new URL("../../relay/build.mjs", import.meta.url), "utf8");
    assert.ok(relay.includes("maxDuration: 300"));
    const chat = readFileSync(new URL("../src/ui/chat.jsx", import.meta.url), "utf8");
    assert.ok(chat.includes("Muse가 이어받아요"));
    assert.ok(!chat.includes("setMuseDown(true)"));
  });
});

describe("27j2 counts replies with a ref", () => {
  let answeredSince;

  before(async () => {
    ({ answeredSince } = await import("../src/ui/chat.jsx"));
  });

  it("answeredSince compares reply counts", () => {
    assert.equal(answeredSince(3, 2), true);
    assert.equal(answeredSince(2, 2), false);
  });

  it("send uses the ref, not the lagging stateRef", () => {
    const chat = readFileSync(new URL("../src/ui/chat.jsx", import.meta.url), "utf8");
    assert.ok(!chat.includes("const before = stateRef.current.messages.length"));
    assert.ok(chat.includes("replyCountRef.current += 1"));
    assert.ok(chat.includes("answeredSince(replyCountRef.current, repliesBefore)"));
  });
});
