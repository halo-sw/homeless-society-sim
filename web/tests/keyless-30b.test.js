// 30b: keyless servers say so — tri-state badge, no consult without a
// key, one notice per session (SSR, no DOM, no data/build needed).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

describe("30b keyless mode says so", () => {
  let museStatusLabel;
  let museStatusShort;
  let shouldCallMuse;
  let isNoKeyError;
  let pushKeylessNotice;
  let museLiveFromStatus;
  let KEYLESS_LINE;

  before(async () => {
    ({ museStatusLabel, museStatusShort } = await import("../src/ui/topbar.jsx"));
    ({ shouldCallMuse, isNoKeyError, pushKeylessNotice,
      museLiveFromStatus, KEYLESS_LINE } = await import("../src/ui/muse-status.js"));
  });

  it("badge has three states with exact strings", () => {
    assert.equal(museStatusLabel(true), "연결됨 · Muse Spark 1.3");
    assert.equal(museStatusLabel(false), "규칙 모드");
    assert.equal(museStatusLabel(null), "연결 확인 중");
    assert.equal(museStatusShort(true), "연결됨");
    assert.equal(museStatusShort(false), "규칙 모드");
    assert.equal(museStatusShort(null), "연결 확인 중");
  });

  it("derives museLive from the model status", () => {
    assert.equal(museLiveFromStatus(true, { meta: { hasServerKey: true } }), true);
    assert.equal(museLiveFromStatus(true,
      { meta: { hasServerKey: false }, baseten: { hasServerKey: false },
        recorded: { hasServerKey: true }, relay: true }), false);
    assert.equal(museLiveFromStatus(true, null), null);
    assert.equal(museLiveFromStatus(false, null), false);
  });

  it("never calls consult when keyless, may call when unknown", () => {
    assert.equal(shouldCallMuse({ museLive: false }), false);
    assert.equal(shouldCallMuse({ museLive: true }), true);
    assert.equal(shouldCallMuse({ museLive: null }), true);
  });

  it("classifies the 503 no-key error only", () => {
    assert.equal(isNoKeyError({ httpStatus: 503,
      message: "MODEL_API_KEY is not set on the dev server" }), true);
    assert.equal(isNoKeyError({ httpStatus: 503,
      message: "상담 서버 오류 (HTTP 503)" }), false);
    assert.equal(isNoKeyError({ httpStatus: 500, message: "boom" }), false);
    assert.equal(isNoKeyError({ message: "timeout" }), false);
  });

  it("pushes the keyless line once across two turns", () => {
    assert.equal(KEYLESS_LINE,
      "이 서버에는 Muse 키가 없어서 규칙으로 답해요. 숫자는 그대로 엔진이 계산해요");
    let step = pushKeylessNotice([], false);
    step = pushKeylessNotice(step.messages, step.noticed);
    const lines = step.messages.filter((m) => m.content === KEYLESS_LINE);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].role, "system");
  });
});
