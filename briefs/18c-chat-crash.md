# Stage 18c — The chat screen crashes (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Small change. First edit within 4 tool calls.

The orchestrator opened the chat on the laptop GPU (2026-10-30 14:28) via landing → "1인 사회초년생" chip, and directly via `/?chat=판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하&example=single-firstjob`. In both cases the whole chat UI disappeared and only the 3D scene was left on screen. Console:

```
ReferenceError: cardHi is not defined
    at CardMsg (src/ui/chat.jsx:1110:23)
An error occurred in the <CardMsg> component.
```

`CardMsg` reads `cardHi` at `chat.jsx:586` (`highlightId={cardHi}`), but `cardHi` is state inside `ChatScreen` (`:702`) and is never passed to `CardMsg`. The 18 tests never render `CardMsg` with a candidates message, so the suite stayed green.

## Fix
1. Pass the highlight state (and the hover setter, if the card→pin hover needs it) into `CardMsg` as props. Check every other identifier that 18 moved between components the same way: grep the 18 diffs (`5fd1ee1 984eefd 16b8b31 1c7fb4f`) for names used outside their scope.
2. Add a React error boundary around each chat message and around the stage map. A failing card shows "이 카드를 그리지 못했어요 · 다시 시도" with its error message in small text. The rest of the chat keeps working.
3. Add a render smoke test (jsx-loader / react-dom/server or the existing jsdom path) that renders `ChatScreen`'s message list. It must cover one message of every kind the chat produces, with realistic data: profile, intake, candidates (6 cards, 2 picked, one highlighted), the simulation result in done state, listing, tab and tour. It must assert no throw. Use the example `single-firstjob` data where it exists.
4. Commit `18c: chat renders again + error boundaries + render smoke test`.

## End
- `cd web && npm test 2>&1 | tail -6` and `npx vite build 2>&1 | tail -2`.
- Append a short "18c" section to `briefs/18-RESULT.md`.
- Commit.
