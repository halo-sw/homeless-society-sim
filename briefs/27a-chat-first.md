# Stage 27a — Chat first: one conversation, a work panel that opens on request (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section applies: no git, no full suite, no build, no exploring). Branch `chat-27`. First edit within 3 tool calls. Read only the line ranges quoted here. When the named tests pass, stop.

## Why
Product decision (user, 2026-10-31, `docs/product.md`): Ithaca is a conversation with Muse. No landing page, no mode tabs. The first screen is the conversation only. The map / compare / result panel opens only after the customer asks for something. Today `/` shows a landing page, the top bar has a 대화 / 살아 보기 / 동네 둘러보기 switch, the map panel is always on, and the first sentence opens a six-step form.

## Changes

### 1. `/` opens the conversation — `web/src/chat/urls.js:14-21`
```js
export function routeForSearch(search) {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(search || "");
  if (q.has("chat")) return "chat";
  if (q.get("mode") === "sim") return "sim"; // ?tour=demo rides along (?mode=sim&tour=demo)
  if (q.has("mode") || q.has("tour")) return "tour";
  if (q.has("area") || q.has("time") || q.has("lens") || q.has("shot")) return "tour";
  return "landing";
}
```
Last line → `return "chat";`. Deep links (`?mode=sim…`, `?area=…`) keep working. Leave `landing.jsx` in place (its exports are reused below).

### 2. Empty first screen instead of the greeting — `web/src/ui/chat.jsx`
- In the mount effect (around `chat.jsx:1640-1676`) two places push the greeting: `pushMsg({ id: "greeting", role: "assistant", kind: "text", content: GREETING });` — in the `initial.listing === "1"` branch and as the last statement. Remove both pushes (keep the listing card push). A fresh visit now has `messages.length === 0`.
- Add and export `ChatEmpty({ onSend, onListing, onExample })` in `chat.jsx`, rendered **instead of** `<ChatLayout …>` when `messages.length === 0 && !busy`:
  - Heading (level 2): `어떤 집을 고민 중이세요?`
  - Supporting text: `말로 하면 Muse가 실거래와 출근길을 확인하고, 원하면 그 집에서 30일 살아 봐요.`
  - The same `ChatComposer` (onSubmit = `onSend`, placeholder `예: 판교로 출근해요. 전세 2억 이하로 혼자 살 집 찾아 줘`).
  - Three buttons, exported as `EMPTY_STARTERS`:
    1. `{ id: "find", label: "출근지로 집 찾기" }` → fills the composer with `판교로 출근해요. 전세 2억 이하로 혼자 살 집 찾아 줘` (does not send).
    2. `{ id: "listing", label: "본 매물 붙여 넣기" }` → `chipAction("매물 글 붙여 넣기")`.
    3. `{ id: "example", label: "예시로 써 보기" }` → `setExampleId("single-firstjob")`, push the system line `exampleLine("single-firstjob")`, then `send(EXAMPLE_PROMPTS[0].prompt)` (import `EXAMPLE_PROMPTS`, `COVERAGE_AREAS` from `./landing.jsx`).
  - One supporting line: `다루는 지역: ` + `COVERAGE_AREAS.join(" · ")`.
  - Wrap in `<div className="ui-chat-empty">`. CSS in `web/src/ui/ui.css` (append near the 19a chat shell rules, `ui.css:633`): centered column, `max-width: 720px; margin: 12vh auto 0; padding: 0 16px; gap: 16px;` buttons in a wrapping row.
- Hide `.ui-chat-chips` (the 추천 질문 row, `chat.jsx:1795-1800`) while `messages.length === 0`.

### 3. The work panel opens on request — `web/src/ui/chat.jsx`
- New state next to `view` (`chat.jsx:941`): `const [workOpen, setWorkOpen] = useState(false);`
- Open it (`setWorkOpen(true)`) when: the candidates card is pushed (`chat.jsx:1183` and `chat.jsx:1518`), `handleRun` starts (`chat.jsx:1267`), `compareOpen` becomes true (small `useEffect` on `compareOpen`), and on restore when `mem.candidatesData` exists (`chat.jsx:1664`).
- Render `<StageArea …>`, `<PicksTray …>` and `<SidePanel …>` (`chat.jsx:1810-1858`) only when `workOpen`.
- `StageArea` (`chat.jsx:1905`): new prop `onClose`; inside `.ui-chat-stage-body` add an `IconButton` (label `작업판 닫기`, icon close, top-right, absolute) that calls it. Pass `onClose={() => setWorkOpen(false)}`.
- The candidates card gets one more button `지도에서 보기` that calls `handlers.onOpenWork` → `setWorkOpen(true)` (add `onOpenWork` to `handlers`, `chat.jsx:1700`; the button goes in `CandidatesCard`, `chat.jsx:268`, next to the sort control).
- Export `chatWorkAttr(workOpen)` → `"open" | "closed"`, put it on `.ui-chat-main` as `data-work`. CSS: `.ui-chat-main[data-work="closed"] .ui-chat-thread { width: 100%; max-width: 760px; margin: 0 auto; border-right: none; }`.
- Narrow screens: render the 대화 / 화면 `SegmentedControl` (`chat.jsx:1735-1741`) only when `workOpen`; when the panel closes, `setView("chat")`.

### 4. No mode tabs; Muse in the header — `web/src/ui/topbar.jsx:127-145`
```jsx
      <div className="ui-bar-left">
        <span className="ui-bar-title">Ithaca</span>
        <SegmentedControl label="화면 선택" value={mode}
          onChange={(v) => gotoMode(v, mode)} size="sm">
          {MODES.map((m) => (
            <SegmentedControlItem key={m.value} value={m.value} label={m.label} />
          ))}
        </SegmentedControl>
      </div>
```
- Remove this `SegmentedControl` (and `MODES` if unused; keep `gotoMode` exported).
- `mode === "chat"`: after the title show `Muse` and a Badge: `LIVE_API ? "연결됨 · Muse Spark 1.3" : "규칙 모드"` (import `LIVE_API` from `../paths.js`). Export the label function `museStatusLabel(live)` for the test.
- `mode !== "chat"` (sim / tour deep links): a ghost `Button` `← 대화로` that calls `gotoMode("chat", mode)`.

### 5. No six-step form after the first sentence — `web/src/ui/chat.jsx:1083-1091`
```js
    // 13: after the first message the guided intake pre-fills from the
    // extract and walks the six steps as inline answer cards.
    // 21b: one 상황 card — the intake card already shows the latest
    // profile, so no standalone profile card joins it.
    setIntake(prefillFromExtract(intake, { profile: prof }));
    pushMsg({ role: "assistant", kind: "intake", replace: true, data: {},
      tool_calls: [{ id: exId, name: "extract_profile" }] });
    await runSearch(prof, data, { sort: "commute" });
```
Replace with the USD path just above it (`chat.jsx:1076-1081`): push the `kind: "profile"` card (`replace: true`, same fields) and `await runSearch(prof, data, { sort: "commute" })`. Keep `setIntake(prefillFromExtract(…))` so later steps still have the values. Missing values stay as the profile card's "모르는 값" chips; nothing is asked as a form.

## Tests — new `web/tests/chat-first-27a.test.js` (SSR with `register("./jsx-loader.mjs", import.meta.url)` like `web/tests/topbar-13f.test.js:1-30`)
- `routeForSearch("")` is `"chat"`; `?mode=sim` → `"sim"`, `?area=x` → `"tour"`.
- `renderToString(<ChatEmpty onSend={()=>{}} onListing={()=>{}} onExample={()=>{}} />)` contains `어떤 집을 고민 중이세요?` and all three `EMPTY_STARTERS` labels, and `다루는 지역`.
- `chatWorkAttr(false)` is `"closed"`, `chatWorkAttr(true)` is `"open"`.
- `renderToString(<TopBar mode="chat" … />)` does not contain `동네 둘러보기` or `살아 보기`, contains `Muse`. `museStatusLabel(true)` is `연결됨 · Muse Spark 1.3`, `museStatusLabel(false)` is `규칙 모드`. `TopBar mode="sim"` contains `대화로`.
- `StageArea` with `onClose` renders a button labelled `작업판 닫기`.

Old pins this changes: `web/tests/chat-engine-12b.test.js:43` (`routeForSearch("")` was `"landing"`), and any pin in `web/tests/topbar-13f.test.js` on the mode switch labels or in `web/tests/first-user-21a.test.js` on the intake card after the first sentence. Update those lines only.

Run only:
```
cd web && node --test tests/chat-first-27a.test.js tests/chat-engine-12b.test.js tests/topbar-13f.test.js tests/first-user-21a.test.js 2>&1 | tail -15
```
