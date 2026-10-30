# Stage 27c1 — Fast chat boot; 3D scenes open inside the work panel (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section: no git, no full suite, no build, no exploring). Branch `chat-27` (27a, 27b1, 27b2 are in). First edit within 3 tool calls. Read only the line ranges quoted here (use `grep -n` when numbers moved). When the named tests pass, stop.

## Why
`docs/product.md`: features open inside the conversation's work panel, never as separate pages. Today every "3D로 보기 →" and "3D 미리보기" does `window.location.href = …`, leaving the chat. And the chat route waits for a full 3D world it never shows: `bootTour("chat")` (`web/src/main.js:784-866`) fetches the area and scene and runs `buildWorld` before `mountUI()`. A first-time visitor waits 10–25 s on a blank page (orchestrator measurement on the public site).

## Changes

### 1. Chat boots without the 3D world — `web/src/main.js`
- Dispatcher at the end of `main.js` (`grep -n "routeForSearch(location.search)"`):
```js
  const route = routeForSearch(location.search);
  if (route === "sim") bootSim();
  else bootTour(route); // tour | landing | chat (same scene, own UI)
```
  → `if (route === "sim") bootSim(); else if (route === "chat") bootChat(); else bootTour(route);`
- New `function bootChat()` next to `bootTour`, doing only what `bootTour` does for the chat UI (`main.js:855-866`): `mountUI(); registerCommonActions(); store.set({ mode: "chat", area: { id: areaId, label: areaId } }); document.title = "Ithaca — 대화"; registerChatActions();` then remove `#loading` and add `clear` to `#fade` exactly as `main.js:865-866`. No `fetchArea`, no `fetchScene`, no `buildWorld`.
- Export a pure `bootKindFor(route)` from `web/src/chat/urls.js` → `"sim" | "chat" | "tour"` and use it in the dispatcher.

### 2. Embed mode for sim / tour pages — `web/src/chat/urls.js`, `web/src/ui/app.jsx`
- `urls.js`: `simMomentQuery` (`urls.js:75-82`) and `simMomentUrl` accept `embed = false`; when true add `embed=1`. Add `tourUrl({ area, embed = false })` → `appUrl("area=<area>[&embed=1]")`, and `isEmbed(search)` → `true` when `embed=1`. Export `withoutEmbed(url)` (drops the `embed` param) for the "새 창으로" link.
- `app.jsx` `App()` (`app.jsx:1023-1081`): `const embed = typeof window !== "undefined" && isEmbed(window.location.search);`. When `embed`:
  - tour branch: no `.ui-topbar` block and no `AgentTourCard`; keep `MapTools`, `CaptionCard`, `AttrLine`;
  - sim branch: no `.ui-sim13-top`, no `IntroCard`, no `DemoTour`, no `ShareDialog`, no `AgentTourCard`; the drawer (`.ui-sim13-drawer`) is not rendered; keep `MapTools`, `SimCredit`, `TimelineBar`.
  - add `data-embed="1"` on the root element so CSS can give the stage the full height.

### 3. Scene frame in the chat work panel — `web/src/ui/chat.jsx`
- New state `scene` (`{ url, title } | null`) next to `workOpen`.
- Export `SceneFrame({ scene, onBack, onClose })`: a `<section className="ui-chat-scene" aria-label="3D 장면">` with a header row (title text; ghost `Button` `지도로` → `onBack`; ghost `Button` `새 창으로` → `window.open(withoutEmbed(scene.url), "_blank", "noopener")`; `IconButton` `작업판 닫기` → `onClose`) and `<iframe className="ui-chat-scene-frame" src={scene.url} title={scene.title} allow="fullscreen" />`.
- In the render (`grep -n "<StageArea"`): when `workOpen && scene`, render `SceneFrame` instead of `StageArea` and do not render `PicksTray`; `onBack` → `setScene(null)`; `onClose` → `setScene(null); setWorkOpen(false); setView("chat")`.
- `handlers` gets `onScene: (s) => { setScene(s); setWorkOpen(true); setView("work"); }`.
- `handlePreview3D` (`grep -n "function handlePreview3D"`): replace the navigation with `handlers.onScene({ url: tourUrl({ area: candidate.scene, embed: true }), title: \`${candidate.name} 동네\` })` (call the same setters directly; keep the `if (!candidate.scene) return;`).
- Moment rows (`grep -n "3D로 보기 →"`, inside `ResultSummary`, `chat.jsx:387`): replace `window.location.href = url;` with `onScene && onScene({ url: <same url built with embed: true>, title: \`${t.when_ko} · ${t.home}\` })`. Thread an `onScene` prop: `CardMsg` → `SimulationCard({ data, example, onRetry, onScene })` (`chat.jsx:506`, render at `chat.jsx:771` passes `handlers.onScene`) → `ResultSummary({ data, onScene })` (`chat.jsx:571`). `momentRowUrl` (`chat.jsx:889`) takes `embed` and passes it to `simMomentUrl`.
- CSS (`web/src/ui/ui.css`, near the 19a shell rules): `.ui-chat-scene { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; height: 100%; background: var(--ui-page); }`, header row `display:flex; align-items:center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--ui-border);`, `.ui-chat-scene-frame { flex: 1 1 auto; width: 100%; border: 0; }`. Under the `< 1100px` rule the scene shows when `view === "work"` (same as `.ui-chat-stage`, `ui.css:684-685`).

## Tests — new `web/tests/scene-panel-27c1.test.js` (SSR loader like `web/tests/topbar-13f.test.js:1-30`)
- `bootKindFor("chat")` → `"chat"`, `"sim"` → `"sim"`, `"tour"` → `"tour"`.
- `simMomentUrl({ custom: "c1", home: "B", day: 3, t: "18:26", embed: true })` contains `mode=sim`, `custom=c1`, `embed=1`; without `embed` it has no `embed`. `tourUrl({ area: "pangyo", embed: true })` contains `area=pangyo` and `embed=1`. `isEmbed("?embed=1")` true, `isEmbed("")` false. `withoutEmbed(<embed url>)` has no `embed`.
- `renderToString(<SceneFrame scene={{ url: "/x?embed=1", title: "판교 동네" }} onBack={()=>{}} onClose={()=>{}} />)` contains `<iframe`, `판교 동네`, `지도로`, `새 창으로`, `작업판 닫기`.
- `momentRowUrl({ home: "A", day: 2, minute: 500, agent: "m1" }, { custom: "c1", embed: true })` contains `embed=1`.

Run only:
```
cd web && node --test tests/scene-panel-27c1.test.js tests/chat-first-27a.test.js tests/chat-engine-12b.test.js tests/chat-muse-27b2.test.js 2>&1 | tail -15
```
