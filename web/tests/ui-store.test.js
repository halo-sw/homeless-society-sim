import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStore, INITIAL_STATE, store } from "../src/ui/store.js";

describe("ui store", () => {
  it("starts from the initial state", () => {
    const s = createStore();
    assert.equal(s.getState().mode, "tour");
    assert.equal(s.getState().ready, false);
    assert.equal(s.getState().consultOpen, false);
    assert.deepEqual(Object.keys(s.getState()).sort(), Object.keys(INITIAL_STATE).sort());
  });

  it("accepts constructor overrides", () => {
    const s = createStore({ mode: "sim", home: "B" });
    assert.equal(s.getState().mode, "sim");
    assert.equal(s.getState().home, "B");
  });

  it("merges patches and notifies subscribers once", () => {
    const s = createStore();
    const seen = [];
    const unsub = s.subscribe((state) => seen.push(state.playing));
    s.set({ playing: false });
    s.set({ playing: false }); // unchanged: no notify
    assert.deepEqual(seen, [false]);
    assert.equal(s.getState().playing, false);
    unsub();
    s.set({ playing: true });
    assert.deepEqual(seen, [false]);
  });

  it("ignores unknown keys and non-object patches", () => {
    const s = createStore();
    let calls = 0;
    s.subscribe(() => calls++);
    s.set({ nope: 1 });
    s.set(null);
    assert.equal("nope" in s.getState(), false);
    assert.equal(calls, 0);
  });

  it("registers and calls scene actions", () => {
    const s = createStore();
    const calls = [];
    s.registerActions({
      setDay: (d) => calls.push(["setDay", d]),
      toggle: () => calls.push(["toggle"]),
    });
    assert.equal(s.hasAction("setDay"), true);
    assert.equal(s.hasAction("missing"), false);
    s.act("setDay", 3);
    s.act("toggle");
    assert.deepEqual(calls, [["setDay", 3], ["toggle"]]);
    assert.throws(() => s.act("missing"), /unknown action/);
    s.registerActions({ bad: 42 }); // non-functions are skipped
    assert.equal(s.hasAction("bad"), false);
  });

  it("exposes one shared page store", () => {
    assert.equal(typeof store.getState, "function");
    assert.equal(typeof store.act, "function");
  });
});
