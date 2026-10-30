# Stage 19a — Chat screen layout: two columns, one run button, panel on demand (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Do not explore beyond the files named here. First edit within 4 tool calls. Run only the named test files. Commit, then stop.

## Why
The user looked at the chat screen (1440×900) and said the UI does not feel improved. Today it has three columns: the thread (440 px), the map stage, and a 360 px right drawer. Problems:
- The same "이 집들로 30일 살아 보기" button appears **three times**: in the candidate list message (`chat.jsx:305-311`), sticky under the composer (`chat.jsx:1519-1532`), and in the drawer (`chat.jsx:1679-1681`).
- The drawer is mostly empty. It shows two names and the same button again, and it squeezes the map.
- The stage has a beige header strip that reads "판교 출근 · 후보 6곳 · 지역 9곳". The "지역 9곳" part means nothing to a customer.

The map's look is a separate brief (19b, `chatmap.jsx` / `chatmap.js`). **Do not touch those two files.**

## Target layout (≥ 1100 px)
```
┌ topbar ───────────────────────────────────────────────────────────┐
│ thread (clamp 400–520 px)  │ map stage (fills the rest)            │
│  messages                  │  [판교 출근 · 후보 6곳]  ← floating pill │
│  …                         │                         ┌ side panel ┐│
│                            │                         │ 자세히 /    ││
│                            │                         │ 비교 (380px)││
│  chips (one row, scroll)   │  ┌ picks tray ───────────┐│ only when ││
│  composer                  │  │ A 천사의…  B 시그마3  [이 집들로…]│ opened    ││
└────────────────────────────┴──┴───────────────────────┴───────────┘
```

## Changes

### 1. Thread width — `web/src/ui/ui.css:259-264`
`.ui-chat-thread { width: 440px … }` → `width: clamp(400px, 34vw, 520px)`. Also define `--ui-thread-w: clamp(400px, 34vw, 520px)` on `.ui-chat` and use it for the width, so the tray (below) can align to it.

### 2. Remove the drawer column; add `PicksTray` and `SidePanel` — `web/src/ui/chat.jsx:1645-1693`
Replace `DrawerArea` with two components. `web/tests/flow-18.test.js:70-90` imports `DrawerArea` and renders it; `web/tests/landing-chat-12b.test.js:118-140` renders `CandidatesCard`. Keep `DrawerArea` exported as a thin wrapper rendering `<PicksTray/>` + `<SidePanel/>`, and update those two tests' pins only where they expect a run button inside `CandidatesCard` or a drawer heading.

**`PicksTray({ picks, candidates, onRun, onRemove })`**
- Uses `runReadiness(picks, candidates)` (`chat.jsx:246`) for `picked`, `canRun` and `hint`.
- Renders nothing when `picked.length === 0`.
- Floats over the bottom of the map stage: `position:absolute; bottom:16px; left:calc(var(--ui-thread-w) + 16px); right:16px; max-width:680px; margin:0 auto`.
  - White card: `--ui-card`, radius `--ui-r-sheet`, shadow `--ui-shadow`, padding 12px 16px.
- **Left:** one chip per picked home: a letter disc "A"/"B" (22 px circle, ink background, white text), the home name (ellipsis at 160 px), and a small "×" ghost button (`aria-label="${name} 빼기"`) that calls `onRemove(candidate)` (wire it to `handleTogglePick`).
- **Right:** the **only** run button in the whole screen: `<Button label={RUN_BUTTON_LABEL} isDisabled={!canRun} onClick={onRun} />`, primary, default size.
- **Below the row,** when `!canRun`: the hint in supporting text. When exactly 1 picked, the hint is "한 곳 더 담으면 비교할 수 있어요".
- **< 1100 px:** `left:0; right:0; bottom:0; max-width:none; border-radius: var(--ui-r-sheet) var(--ui-r-sheet) 0 0`, so it sits above the composer area on both narrow tabs.

**`SidePanel({ detail, compareOpen, onClose, …same props DrawerArea took })`**
- Renders nothing unless `detail || state.compareOpen`.
- Absolute over the right edge of the stage: `top:12px; right:12px; bottom:12px; width:380px`.
  - Card background, radius `--ui-r-sheet`, shadow, `overflow-y:auto`.
  - Header row: title ("자세히" for detail, "비교" for compare) and a ghost "닫기" button.
- Body: the existing detail `CandidateCard` (from `DrawerArea`) or `<CompareCard state={state} />`.
- **Closing compare:** `store.set({ compareOpen: false })`.
- **< 1100 px:** bottom sheet: `left:0; right:0; top:auto; height:70%; width:auto`.

Render both inside `.ui-chat-main` after `StageArea` (`.ui-chat-main` gets `position: relative`). Delete the `.ui-chat-drawer*` rules at `ui.css:573-582`, `ui.css:587-592` and `ui.css:676`.

### 3. Delete the other two run buttons
- `chat.jsx:305-311` (end of `CandidatesCard`): replace the button + hint with a single supporting line:
  - `picks.length < 2`: "마음에 드는 집을 2곳 담으면 지도 아래에서 30일 살아 보기를 시작할 수 있어요"
  - otherwise: "지도 아래 ‘이 집들로 30일 살아 보기’를 눌러 주세요".
- `chat.jsx:1519-1532`: delete the sticky run block and the `.ui-chat-sticky-run` CSS (`ui.css:268`, rule ends a few lines below).
- `handleRun` stays as is (18d scroll-to-sim still applies).

### 4. Stage header → floating pill — `chat.jsx:1613-1643` (`StageArea`)
Remove the beige header `div` (the inline style at 1617). Inside `.ui-chat-stage-body`, render `contextLine` (without "지역 N곳") as a pill at `top:12px; left:12px`:
- card background, radius 999px, shadow, padding 6px 12px, 13 px, weight 600.
- With no context: "출근지를 말하면 후보가 지도에 표시돼요".

The empty-state card (no regions loaded yet) stays.

### 5. Chips row — `ui.css:265` and `chat.jsx:1513-1518`
- One line, `flex-wrap: nowrap; overflow-x: auto`, padding 8px 12px.
- Put the chips **above** the composer: move the chips `div` inside `ChatLayout` before the composer if `ChatLayout` accepts a node there. Otherwise keep the position and only make it a single row.

## Tests — `web/tests/chat-layout-19a.test.js`
Use the render pattern from `web/tests/chat-render-18c.test.js` (jsx-loader, `renderToString`, its `readyCandidate` fixture).
- (a) `PicksTray` with 2 ready picks renders `RUN_BUTTON_LABEL` exactly once, both names, letters A and B, and the button is not disabled.
- (b) `PicksTray` with 1 pick renders "한 곳 더 담으면 비교할 수 있어요" and a disabled button.
- (c) `PicksTray` with 0 picks renders "".
- (d) `CandidatesCard` with 6 candidates and 2 picks does **not** contain `RUN_BUTTON_LABEL`, and does contain "지도 아래".
- (e) `SidePanel` with `detail` set renders "자세히", "닫기" and the candidate name.
- (f) `StageArea` renders the context pill text and no "지역 9곳".

Run:
```
cd web && node --test tests/chat-layout-19a.test.js tests/chat-render-18c.test.js tests/flow-18.test.js tests/landing-chat-12b.test.js 2>&1 | tail -12
```
If an older test pins the drawer, the sticky button, or the in-list button, update that pin to the new contract and say so in the commit body.

Commit `19a: chat layout — two columns, one run button in a picks tray over the map, side panel on demand`. Then stop.
