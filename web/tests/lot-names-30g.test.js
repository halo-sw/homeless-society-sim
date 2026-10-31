// Stage 30g: lot-number homes read as names everywhere; the replay
// entry sits in the chip row above the composer.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const chatSrc = fs.readFileSync(path.join(here, "..", "src", "ui", "chat.jsx"), "utf8");

let displayNameFor;
let ruleTurnPlan;
let actionConfirmation;
let homeDisplayName;
let replayChipVisible;
let REPLAY_CHIP_LABEL;
let PicksTray;
let React;
let renderToString;
let regionWordsIn;
let REGION_NAME_ALIASES;
let regionsForNames;

before(async () => {
  ({ displayNameFor } = await import("../src/homes.js"));
  ({ regionWordsIn } = await import("../src/ui/chat.jsx"));
  ({ REGION_NAME_ALIASES, regionsForNames } = await import("../src/region-names.js"));
  ({ ruleTurnPlan } = await import("../src/chat/intent.js"));
  ({ actionConfirmation } = await import("../src/consult/guards.js"));
  ({ homeDisplayName } = await import("../src/labels3d.js"));
  ({ replayChipVisible, REPLAY_CHIP_LABEL, PicksTray } =
    await import("../src/ui/chat.jsx"));
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
});

const LOT = { id: "home-000005", name: "(647)", kind: "오피스텔",
  region: "bundang", station: { station: "판교", walk_minutes: 5 } };
const TOWER = { id: "home-000007", name: "SG타워", kind: "오피스텔", region: "bundang" };

describe("30g displayNameFor lot-number fallback", () => {
  it("station names the home when dong is missing", () => {
    assert.equal(displayNameFor(LOT), "판교역 근처 오피스텔 (647)");
  });
  it("dong still wins when present", () => {
    assert.equal(displayNameFor({ ...LOT, dong: "삼평동" }), "삼평동 오피스텔 (647)");
  });
  it("kind alone when neither dong nor station exists", () => {
    assert.equal(displayNameFor({ name: "(647)", kind: "오피스텔", region: "bundang" }),
      "오피스텔 (647)");
  });
  it("real names pass through unchanged", () => {
    assert.equal(displayNameFor(TOWER), "SG타워");
  });
  it("the English region id never shows", () => {
    for (const c of [LOT, { ...LOT, dong: "삼평동" },
      { name: "(647)", kind: "오피스텔", region: "bundang" }, TOWER]) {
      assert.ok(!String(displayNameFor(c)).includes("bundang"), JSON.stringify(c));
    }
  });
});

describe("30g names read everywhere", () => {
  it("the pick tray chips use the readable name", () => {
    const html = renderToString(React.createElement(PicksTray, {
      picks: [LOT.id, TOWER.id], candidates: [LOT, TOWER],
      gate: { ok: true }, onRun: () => {}, onRemove: () => {},
    }));
    assert.ok(html.includes("판교역 근처 오피스텔 (647)"), html.slice(0, 400));
    assert.ok(html.includes("SG타워"), "real name stays");
    assert.ok(!html.includes("bundang"), "no English region id");
  });
  it("the rule pick confirmation uses the readable name", () => {
    const plan = ruleTurnPlan({
      text: "1번이랑 2번 담아 줘", candidates: [LOT, TOWER], picks: [],
    });
    assert.ok(plan && plan.message, "a pick plan with a message");
    assert.ok(plan.message.includes("판교역 근처 오피스텔 (647)"), plan.message);
    assert.ok(plan.message.includes("SG타워"), plan.message);
    assert.ok(!plan.message.includes("bundang"), plan.message);
  });
  it("actionConfirmation uses the readable name", () => {
    const line = actionConfirmation(
      [{ ui: { action: "pick", ids: [LOT.id] }, candidates: [LOT] }]);
    assert.ok(line && line.includes("판교역 근처 오피스텔 (647)"), line);
  });
  it("3D labels use the readable name for a lot-number candidate", () => {
    assert.equal(homeDisplayName("(647)", null, LOT), "판교역 근처 오피스텔 (647)");
    assert.equal(homeDisplayName("SG타워", null, TOWER), "SG타워");
  });
});

describe("30g replay chip row", () => {
  it("no ui-chat-fallback render remains", () => {
    assert.ok(!chatSrc.includes("ui-chat-fallback"), "fallback block removed");
  });
  it("the chip row carries 기록된 대화 보기 as the first chip", () => {
    const row = chatSrc.slice(chatSrc.indexOf("ui-chat-chips"),
      chatSrc.indexOf("ui-chat-chips") + 1200);
    assert.ok(row.includes("REPLAY_CHIP_LABEL"), "replay rides the chip row");
    assert.ok(row.indexOf("REPLAY_CHIP_LABEL") < row.indexOf("chips.map"),
      "replay is the first chip");
    assert.equal(REPLAY_CHIP_LABEL, "기록된 대화 보기");
  });
});

describe("30g3 English area words load one area; station fallback", () => {
  it("find_homes walk station names the lot home", () => {
    assert.equal(displayNameFor({ name: "(647)", kind: "오피스텔",
      region: "bundang",
      commute: { walk: { station: "판교", known: true } } }),
    "판교역 근처 오피스텔 (647)");
  });
  it("English and Korean work sentences resolve to the same single area", () => {
    const en = regionsForNames(regionWordsIn(
      "I work in Pangyo, living alone, jeonse up to 300M won", REGION_NAME_ALIASES));
    const ko = regionsForNames(regionWordsIn(
      "판교로 출근해요, 혼자 살아요, 전세 3억 이하", REGION_NAME_ALIASES));
    assert.deepEqual(en, ko);
    assert.deepEqual(en, ["bundang"]);
    assert.deepEqual(ko, ["bundang"]);
  });
  it("near Jamsil resolves to songpa-gu", () => {
    assert.deepEqual(
      regionsForNames(regionWordsIn("near Jamsil", REGION_NAME_ALIASES)),
      ["songpa-gu"]);
  });
});

describe("30g replay chip row fallback", () => {
  it("the replay chip shows under the old fallback condition", () => {
    assert.equal(replayChipVisible({ museFails: 1, messages: [], replayId: null }), true);
    assert.equal(replayChipVisible({ museFails: 0, messages: [], replayId: null }), false);
    assert.equal(replayChipVisible({ museFails: 1, messages: [], replayId: "seoul-couple" }), false);
    const body = chatSrc.slice(chatSrc.indexOf("export function replayChipVisible"),
      chatSrc.indexOf("export function replayChipVisible") + 500);
    assert.ok(body.includes("STATIC_OFF_LINE"), "off notice still offers replay");
    assert.ok(body.includes("KEYLESS_LINE"), "keyless notice still offers replay");
  });
});
