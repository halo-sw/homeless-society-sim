// Stage 21b — first-user flow polish after the 21a walk.
// - the one-way sentence reads off the displayed (rounded) numbers;
// - map pills collide-greedily (회사 + A/B always win) or cluster;
// - station names only for in-view stations; dong names at most 4;
// - the chat shows 고객님 상황 once after intake, no bare 후보 찾기.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

let React;
let renderToString;
let CardMsg;
let nextChatMessages;
let IntakeFlowCard;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ CardMsg, nextChatMessages, IntakeFlowCard } =
    await import("../src/ui/chat.jsx"));
});

import { oneWaySentence, NO_WORKPLACE_COMMUTE_KO } from "../src/verify/numbers.js";
import { layoutMapPills, layoutStationLabels, pickDongLabels,
  fitMapView, MAP_FIT_MARGIN } from "../src/chatmap.js";

const STATIONS = ["강남", "성수", "판교", "잠실", "제기동", "정자", "미금"];
const FIRST_SENTENCE = "강남역으로 출근해요. 혼자 살고 전세 3억 이하, 역 가까운 오피스텔이면 좋겠어요";

const boxHit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w
  && a.y < b.y + b.h && b.y < a.y + a.h;

function handlersFor(extra = {}) {
  const noop = () => {};
  return { onChip: noop, onSort: noop, picks: [], onTogglePick: noop,
    onPreview3D: noop, onJeonse: noop, onRun: noop, onDetail: noop,
    onHover: noop, photoDeps: {}, destName: "강남", onAsk: noop,
    onIntakeAnswer: noop, onIntakeSkip: noop, onHouseholdAdd: noop,
    onHouseholdRemove: noop, onFindHomes: noop,
    intake: extra.intake || null, household: extra.household || null,
    profile: extra.profile || null, exampleId: null, ...extra };
}

describe("21b one-way sentence from displayed numbers", () => {
  it("4.6 vs 5.4 (shown 5 and 5) reads 거의 같아요", () => {
    const s = oneWaySentence({ A: 4.6, B: 5.4 });
    assert.ok(s.includes("거의 같아요 (차이 1분 미만)"), s);
  });
  it("11.2 vs 14.4 (shown 11 and 14) reads B가 3분", () => {
    assert.equal(oneWaySentence({ A: 11.2, B: 14.4 }), "B가 편도 평균 3분 더 걸려요");
  });
  it("missing values never read 같아요", () => {
    for (const ow of [null, undefined, {}, { A: null, B: 20 },
      { A: 20, B: NaN }, { A: NaN, B: NaN }, { A: 0, B: 0 }]) {
      const s = oneWaySentence(ow);
      assert.ok(!s.includes("같아요"), `${JSON.stringify(ow)} → ${s}`);
      assert.equal(s, NO_WORKPLACE_COMMUTE_KO);
    }
  });
});

describe("21b map pill placement (pure)", () => {
  it("eight pills within 30 px never stack, or fold into a cluster", () => {
    const items = Array.from({ length: 8 }, (_, i) => (
      { id: `p${i}`, kind: "pill", x: 300 + i * 3, y: 200, w: 80, h: 24, rank: 2 }));
    const laid = layoutMapPills(items, 640, 420);
    // Every pill is placed or folded into a cluster.
    const folded = new Set();
    for (const l of laid) {
      if (l.kind === "cluster") for (const mb of l.members || []) folded.add(mb.id);
    }
    const placedIds = new Set(laid.filter((l) => l.kind !== "cluster").map((l) => l.id));
    for (const p of items) {
      assert.ok(placedIds.has(p.id) || folded.has(p.id), p.id);
    }
    // No two boxes overlap — unless leftovers folded into a cluster.
    const boxes = laid.map((l) => l.box);
    let overlap = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxHit(boxes[i], boxes[j])) overlap = true;
      }
    }
    const hasCluster = laid.some((l) => l.kind === "cluster");
    assert.ok(!overlap || hasCluster, "stacked pills without a cluster");
  });
  it("the 회사 pill and the A/B pills are always placed", () => {
    const items = [
      { id: "work", kind: "work", x: 320, y: 210, w: 110, h: 26, rank: 0 },
      { id: "a", kind: "pill", x: 320, y: 210, w: 80, h: 24, rank: 1 },
      { id: "b", kind: "pill", x: 322, y: 212, w: 80, h: 24, rank: 1 },
      { id: "c", kind: "pill", x: 324, y: 208, w: 80, h: 24, rank: 2 },
      { id: "d", kind: "pill", x: 318, y: 212, w: 80, h: 24, rank: 2 },
      { id: "e", kind: "pill", x: 321, y: 209, w: 80, h: 24, rank: 2 },
    ];
    const laid = layoutMapPills(items, 640, 420);
    const byId = new Map(laid.map((l) => [l.id, l]));
    for (const id of ["work", "a", "b"]) {
      assert.ok(byId.has(id), `${id} placed`);
      assert.notEqual(byId.get(id).kind, "cluster", `${id} never folded`);
    }
  });
});

describe("21b station-name placement (pure)", () => {
  it("returns names only for stations inside the bbox", () => {
    const out = layoutStationLabels([
      { name: "강남", x: 100, y: 100 },
      { name: "역삼", x: -10, y: 100 },
      { name: "선릉", x: 700, y: 100 },
      { name: "삼성", x: 100, y: 500 },
    ], 640, 420);
    assert.deepEqual(out.map((l) => l.name), ["강남"]);
  });
});

describe("21b dong labels (pure)", () => {
  it("one centroid per dong, at most 4", () => {
    const pins = [
      { lon: 127.0, lat: 37.5, dong: "역삼동" },
      { lon: 127.002, lat: 37.501, dong: "역삼동" },
      { lon: 127.01, lat: 37.51, dong: "서초동" },
      { lon: 127.02, lat: 37.52, dong: "논현동" },
      { lon: 127.03, lat: 37.53, dong: "대치동" },
      { lon: 127.04, lat: 37.54, dong: "삼성동" },
    ];
    const out = pickDongLabels(pins);
    assert.equal(out.length, 4);
    assert.deepEqual(out.map((l) => l.text),
      ["역삼동", "서초동", "논현동", "대치동"]);
    assert.equal(out[0].lon, (127.0 + 127.002) / 2);
  });
});

describe("21b fit holds candidates and 회사 with padding", () => {
  it("every anchor lands inside the inset rectangle", () => {
    const inset = { top: 56, right: 24, bottom: 96, left: 24 };
    const focus = [
      { lon: 127.0276, lat: 37.4979 },
      { lon: 127.0300, lat: 37.5000 },
      { lon: 127.0250, lat: 37.4960 },
      { lon: 127.0280, lat: 37.5020 },
    ];
    const { toXY } = fitMapView(focus, 640, 420, MAP_FIT_MARGIN, inset);
    for (const p of focus) {
      const [x, y] = toXY(p.lon, p.lat);
      assert.ok(x >= inset.left && x <= 640 - inset.right, `x ${x}`);
      assert.ok(y >= inset.top && y <= 420 - inset.bottom, `y ${y}`);
    }
  });
});

describe("21b one 상황 card after intake", () => {
  it("pushing intake drops the standalone profile card", () => {
    let thread = [];
    thread = nextChatMessages(thread,
      { role: "user", kind: "text", content: FIRST_SENTENCE }, "u1");
    thread = nextChatMessages(thread,
      { role: "assistant", kind: "profile", replace: true, data: {} }, "m1");
    thread = nextChatMessages(thread,
      { role: "assistant", kind: "intake", replace: true, data: {} }, "m2");
    assert.deepEqual(thread.map((m) => m.kind), ["text", "intake"]);
    const again = nextChatMessages(thread,
      { role: "assistant", kind: "profile", replace: true, data: {} }, "m3");
    assert.equal(again.length, thread.length);
  });
  it("SSR render of the chat after intake shows 고객님 상황 once", async () => {
    const { extract_profile } = await import("../src/profile.js");
    const { intakeState0, household0 } = await import("../src/intake.js");
    const ex = extract_profile(FIRST_SENTENCE, null, { stations: STATIONS });
    assert.equal(ex.ok, true);
    const html = renderToString(React.createElement(CardMsg,
      { msg: { id: "m2", role: "assistant", kind: "intake", data: {} },
        handlers: handlersFor({ intake: intakeState0(),
          household: household0(), profile: ex.profile }), toolRows: {} }));
    const n = (html.match(/고객님 상황/g) || []).length;
    assert.equal(n, 1, "고객님 상황 renders once");
    assert.ok(html.includes("후보 찾기"), "intake keeps 후보 찾기 with a profile");
  });
describe("21c fitMapView zooms into close clusters", () => {
  it("a 400 m bbox gives a view width between 1.0 and 1.6 km", () => {
    const inset = { top: 56, right: 24, bottom: 96, left: 24 };
    const focus = [
      { lon: 127.0276, lat: 37.4979 },
      { lon: 127.0290, lat: 37.4985 },
      { lon: 127.0260, lat: 37.4970 },
      { lon: 127.0300, lat: 37.4995 },
      { lon: 127.0255, lat: 37.4965 },
      { lon: 127.0285, lat: 37.5000 },
      { lon: 127.0270, lat: 37.4975 },
    ];
    const { view, toXY } = fitMapView(focus, 640, 420, MAP_FIT_MARGIN, inset);
    const widthKm = view[2] * 111.32;
    assert.ok(widthKm >= 1.0 && widthKm <= 1.6, `view width ${widthKm} km`);
    for (const p of focus) {
      const [x, y] = toXY(p.lon, p.lat);
      assert.ok(x >= inset.left && x <= 640 - inset.right, `x ${x}`);
      assert.ok(y >= inset.top && y <= 420 - inset.bottom, `y ${y}`);
    }
  });
  it("a 6 km bbox stays fully inside the view", () => {
    const focus = [
      { lon: 127.00, lat: 37.47 },
      { lon: 127.06, lat: 37.52 },
    ];
    const { toXY } = fitMapView(focus, 640, 420, MAP_FIT_MARGIN, null);
    for (const p of focus) {
      const [x, y] = toXY(p.lon, p.lat);
      assert.ok(x >= 0 && x <= 640, `x ${x}`);
      assert.ok(y >= 0 && y <= 420, `y ${y}`);
    }
  });
});

  it("no bare 후보 찾기 card without content", async () => {
    const { intakeState0, household0 } = await import("../src/intake.js");
    const html = renderToString(React.createElement(IntakeFlowCard,
      { intake: intakeState0(), household: household0(), profile: null,
        handlers: handlersFor({ intake: intakeState0(), household: household0() }) }));
    assert.ok(!html.includes("후보 찾기"), "no bare find-homes button");
  });
});
