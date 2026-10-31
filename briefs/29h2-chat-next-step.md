# Stage 29h2 — The chat always ends on the next move: Muse's words after the cards, next-step buttons in the thread (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
The founder, on the live chat (2026-10-31): "채팅하면 자연스럽게 대화에서 그 다음 인터렉션으로 이어져야하는데, 지금 그러지 않는 것 같아." Replayed by the orchestrator (Meta HQ, 2 people, rent cap, live Muse):

1. **Muse's question lands above the cards.** Muse answers "Here are 6 homes… which two should I save?" and the 6 candidate cards appear **below** that sentence, so the thread ends on a wall of cards. Cause, `web/src/ui/chat.jsx:2303-2309` — the text bubble is pushed first, the tool cards after it:
   ```js
   const bubble = turnBubble(out);
   // 26t: …
   pushMsg({ role: "assistant", kind: "text", content: bubble.content || "",
     tool_calls: bubble.tool_calls, suggestions: [...suggestions],
     fromModel: !out.fallback });
   appendToolCards(out.messages);
   ```
2. **The next move is hidden.** The next-step buttons live in a collapsed composer drawer "이어서 해 볼 것 (2)" (`suggestionDrawerFor`, `chat.jsx:1320-1349`, passed as `drawer={suggestionDrawer}` at `chat.jsx:~2948`). When Muse sends no suggestions, the fallback for a US profile is the two sort chips (`CHAT_CHIPS_US`, `chat.jsx:1171`), which do not move the story forward (pick → live 30 days → look at the result).

## Change — `web/src/ui/chat.jsx` (+ small CSS, + en.js)

### 1. Order (`chat.jsx:2303-2309`)
Call `appendToolCards(out.messages)` **before** the text `pushMsg`, so the turn reads: cards, then Muse's words (and its tool rows / sources, which `AssistantMsg` renders under the text). Nothing else in that block moves.

### 2. Pure helper `nextStepChips` (export it; place it right after `chipsForLatest`, `chat.jsx:~1306`)
```js
// 29h2: the next move, from the thread's state. Stage chip first, then
// Muse's suggestions on the latest assistant text, at most 4, no repeats.
export function nextStepChips({ messages = [], picks = [], currency = null } = {})
```
- Find the latest assistant message whose `kind` is `"candidates"` or `"simulation"` (scan from the end).
  - `simulation` with `data.status === "done"` → stage chips `["출근길 보여 줘", "한 달에 얼마 들어?", "동네 걸어 보기"]`.
  - `candidates` with at least 2 candidates (`data.result.candidates`): `picks.length >= 2` → `["두 집에서 살아 봐 줘"]`; else `["1번, 2번 담아 줘"]`.
  - otherwise, or none found → `chatChipsFor(currency)` (today's rule chips).
- Then append the latest assistant message's `suggestions` (via the same scan `chipsForLatest` does), drop duplicates, cap at 4.
- Return `{ chips, live }` where `live` is `false` only when the result is exactly the rule chips from `chatChipsFor` (those go to `chipAction`); everything else is sent as a message.

### 3. Render the next steps **in the thread**, after the last message
Inside `<ThreadList>` (`chat.jsx:~2960-2988`), after the `busy` bubble, add — only when `!busy`, `messages.length > 0` and no replay is playing (`!(replayId && replaying)`):
```jsx
<div className="ui-next-steps" role="group" aria-label="다음으로 해 볼 것">
  {showReplay && <Button size="sm" variant="secondary" label={REPLAY_CHIP_LABEL} onClick={openReplay} />}
  {chips.map((c) => <Button key={c} size="sm" variant="secondary" label={c}
     onClick={() => (live ? send(sendTextFor(c)) : chipAction(c))} />)}
</div>
```
- `showReplay = replayChipVisible({ museFails, messages, replayId })` (`chat.jsx:1311-1316`, unchanged).
- `sendTextFor(c)`: `currentLang() === "en" ? (translateExact(c) || c) : c` — the user's bubble shows the words in the page's language (both are already imported, `chat.jsx:110-111`). Export it as a pure helper too.
- Stop passing the drawer: remove `drawer={suggestionDrawer}` from `ChatComposer` and the `suggestionDrawer` const (`chat.jsx:2872-2876`). Keep the `suggestionDrawerFor` function and its export as is (older tests import it); `drawerOpen` state may stay unused-free — delete it only if nothing else reads it.

### 4. CSS (`web/src/ui/ui.css`, next to `.ui-chat-chips` at `:349`)
`.ui-next-steps { display: flex; flex-wrap: wrap; gap: var(--ui-s8); padding-top: var(--ui-s4); } .ui-next-steps > * { flex: none; }` — it starts at the same left edge as the message list (no extra side padding).

### 5. `web/src/i18n/en.js`
Add `"1번, 2번 담아 줘": "Save 1 and 2"` and `"다음으로 해 볼 것": "Next steps"` next to the existing chip strings (`en.js:260-265`).

## Test — new `web/tests/next-step-29h2.test.js`
- `nextStepChips` — candidates message with 6 candidates, `picks: []` → `chips[0] === "1번, 2번 담아 줘"`, `live === true`; same with `picks: ["a","b"]` → `chips[0] === "두 집에서 살아 봐 줘"`; a later `simulation` message with `data.status: "done"` → chips start with `"출근길 보여 줘"`; latest text message with `suggestions: ["x","출근길 보여 줘"]` after a done simulation → no duplicates, length ≤ 4, contains `"x"`; empty thread, `currency: "USD"` → `chips` deep-equals `chatChipsFor("USD")` and `live === false`.
- `readChatIntent("1번, 2번 담아 줘", { candidateCount: 6 })` and `readChatIntent("Save 1 and 2", { candidateCount: 6 })` (from `web/src/chat/intent.js`) both read as a pick of `[1, 2]` — the chip works on the rule path too.
- Source order: in `chat.jsx`, inside the block that contains `const bubble = turnBubble(out);`, the index of `appendToolCards(out.messages);` is lower than the index of `pushMsg({ role: "assistant", kind: "text", content: bubble.content`.
- `chat.jsx` contains `className="ui-next-steps"` and no longer contains `drawer={suggestionDrawer}`; `ui.css` has a `.ui-next-steps` rule with `flex-wrap: wrap`; `en.js` maps `"1번, 2번 담아 줘"` to `"Save 1 and 2"`.

Run only:
```
cd web && node --test tests/next-step-29h2.test.js $(grep -ln "suggestionDrawer\|chipsForLatest\|drawer=\|turnBubble\|이어서 해 볼 것" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Update older pins only where they assert the drawer is passed to the composer or starts collapsed (32a2) — they now assert the in-thread `.ui-next-steps` row instead — or the text-before-cards order.

## Do not touch
`consult.jsx`, `candidate-card.jsx`, the engine, relay, recordings, `suggestionDrawerFor`'s body, `briefs/`.

## Final message
Changed files, one line each. Nothing else.
