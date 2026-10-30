# Stage 27e2 — chat screen renders (brief for Muse)

Agent mode, rules in `AGENTS.md`. Branch `chat-27`. One edit, one test, stop.

`App()` (`web/src/ui/app.jsx`, `if (!state.ready) return null;`) renders nothing until `store.ready` is true. `bootTour` sets it at `web/src/main.js:979` (`store.set({ tourPlaying: player.playing, ready: true });`). The new `bootChat()` (27c1, `grep -n "function bootChat" web/src/main.js`) never sets it, so `/` stays blank (orchestrator: #ui-root has only theme wrappers after 15 s).

Fix: in `bootChat()`, change `store.set({ mode: "chat", area: { id: areaId, label: areaId } });` to also set `ready: true`.

Test: in `web/tests/scene-panel-27c1.test.js` add one case that reads `web/src/main.js` as text, slices the `function bootChat` body (up to the next `\n}\n`), and asserts it contains `ready: true`.

Run only:
```
cd web && node --test tests/scene-panel-27c1.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```
