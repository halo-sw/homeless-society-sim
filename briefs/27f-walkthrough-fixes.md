# Stage 27f — Fixes from the first real-Muse walkthrough (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section: no git, no full suite, no build, no exploring). Branch `chat-27` (27a–27e2 are in). First edit within 3 tool calls. Read only the line ranges quoted here (use `grep -n` when numbers moved). When the named tests pass, stop.

## Why
The orchestrator ran the real product (dev server, Muse Spark 1.3): "판교로 출근하는 신입이에요. 전세 2억 이하로 혼자 살 집 찾아 줘" → "1번이랑 2번 찜해 줘" → "1번 동네는 어때?" → "두 집에서 살아 봐 줘". Find, pick and run work. Six things break the product for a first-time user:

1. **3D 동네 never opens.** Muse called `open_panel({panel:"tour", candidate_id:"home-000374"})` and said "3D 동네를 열어 두었습니다", `uiActions` reached the client, but nothing opened. Cause: `store.set` drops keys not in `INITIAL_STATE` (`web/src/ui/store.js:88-96`, `if (!(key in INITIAL_STATE)) continue;`), and `pendingScene` (27c2) was never added. The subscription in `chat.jsx` (`grep -n "pendingScene = useSyncExternalStore"`) never fires.
2. **The diary never appears.** `POST /api/consult {task:"diary"}` returned 500 `judge: provider reply truncated (finish_reason="length")`. Muse Spark spends tokens on reasoning; `maxTokens: 2000` (`web/src/consult/diary.js:119` and `:141`) is too small. When it fails the card shows nothing and no message follows, so the conversation stalls right after Muse said "결과를 전해드립니다".
3. **One turn shows 2–3 bubbles and 2–3 "확인한 것 1가지" rows.** `askAgent` pushes every assistant message of the turn (`grep -n "for (const m of appended)" web/src/ui/chat.jsx`): the pre-tool line ("판교 출근 전세집을 찾아드릴게요."), the reply, and, when the guard corrected it, the corrected reply again (`web/src/consult/agent.js:336-337`). Example: "1번 천사의도시Ⅱ와 2번 오라타워를 찜했습니다…" then "찜이 완료되었습니다…".
4. **The thread does not follow new messages.** The message list (`.astryx-chat-message-list` inside `.ui-chat-thread`) keeps its old `scrollTop` (measured: top 715 of max 910 after turn 2), so the newest reply is below the fold.
5. **Stale button text** in the candidate card (`web/src/ui/chat.jsx:323-328`): "지도 아래 ‘이 집들로 30일 살아 보기’를 눌러 주세요" — the product is chat-first now (`docs/product.md`).
6. **Replies are long and number-dense** (the first reply listed six homes with 4 numbers each and a source tag after every number). The candidate card already shows these.

## Changes

### 1. Store key — `web/src/ui/store.js`
Add `pendingScene: null, // 27c2: Muse's open_panel scene effect, consumed by the chat` to `INITIAL_STATE`.

### 2. Diary that does not stall — `web/src/consult/diary.js`, `web/src/ui/chat.jsx`
- `diary.js`: both `complete(...)` calls use `maxTokens: 8000`.
- `chat.jsx` `handleRun` diary block (`grep -n "27d: the diary follows"`): in both the `.catch` and the outer `catch`, after setting `diary: { status: "failed" }`, push one assistant text built by a new exported pure helper `diaryFallbackLine(oneWay, names)`:
  - `oneWay` is `compare.one_way` (`{ A: minutes, B: minutes }`, already on the payload's `compare`), `names` is `payload.names`.
  - Returns `다 살아 봤어요. A ${names.A}는 출근 편도 평균 ${a}분, B ${names.B}는 ${b}분이었어요. 일기는 이번에 못 썼어요.` (round the minutes; when a value is missing use `—`; with a C label add `C … ${c}분` before `이었어요`).
  - Same `suggestions` as the success message.
- While `status === "writing"`, the supporting text stays as it is.

### 3. One bubble per turn — `web/src/ui/chat.jsx` `askAgent`
Replace the loop that pushes each assistant message with:
- push the `system` messages as today;
- push **one** assistant text: `content` = `out.reply` when it is a non-empty string, else the last non-empty assistant `content` in `appended`; `tool_calls` = every `tool_calls` entry of every assistant message in `appended`, concatenated in order; `suggestions` as today.
Export the pure part as `turnBubble(out)` → `{ content, tool_calls }` for the test. `appendToolCards`, `mergeMoneyResults` and the `toolRows` mapping stay unchanged (they read `out.messages`).

### 4. Follow the conversation — `web/src/ui/chat.jsx`
- Export `scrollChatToEnd(root)` next to `scrollChatToSim` (`grep -n "export function scrollChatToSim"`): find `.astryx-chat-message-list` inside `root` (default `document.querySelector(".ui-chat-thread")`); if missing return `false`; set `scrollTop = scrollHeight`; return `true`. Guard every DOM access like `scrollChatToSim` does.
- In the chat component, a `useEffect` on `[messages.length, liveRows.length]` calls `soon(() => scrollChatToEnd())`, except when the last message is `kind: "simulation"` with `data.status === "done"` (that one keeps `scrollChatToSim`).

### 5. Card footer — `web/src/ui/chat.jsx:323-328`
- `picks.length < 2` → `마음에 드는 집을 2곳 담고 "살아 봐 줘"라고 말해 보세요`
- else → `"두 집에서 살아 봐 줘"라고 말하면 30일을 살아 봐요`

### 6. Shorter replies — `web/src/consult/agent.js` `SYSTEM_PROMPT`
- Replace the line starting `"답은 3문장 이내."` with: `"답은 2~3문장, 줄바꿈 없이 짧게. 후보·숫자 목록은 카드와 지도에 이미 있으니 문장으로 늘어놓지 않고 1~2곳만 짚는다. 마지막 줄에는 고객이 다음에 할 만한 요청 2~3개를 [[다음: 비교해 줘 | 출근길 보여 줘 | 살아 봐 줘]] 형식으로 쓴다(각 12자 이내, 고객 말투)."`
- In the line starting `"숫자는 읽기 쉽게 쓴다"`, replace `단위와 출처(그래프/실거래/공공임대/가정값/추정)를 항상 함께 밝힌다.` with `단위는 항상 쓰고, 출처(그래프/실거래/공공임대/가정값/추정)는 숫자마다 붙이지 말고 답 끝에 한 번만 괄호로 밝힌다.`
- In the line starting `"고객이 후보를 고르면"`, append: ` start_life_run을 부른 턴에는 "시작했어요. 다 살면 일기로 알려 드릴게요." 한 문장만 답한다(결과 숫자는 아직 없다).`
- If a test pins the old wording (`grep -rln "단위와 출처\|답은 3문장" web/tests`), update the pin to the new text.

## Tests — new `web/tests/walkthrough-27f.test.js`
- `createStore()` (`web/src/ui/store.js`): `store.set({ pendingScene: { type: "scene", panel: "tour" } })` → `getState().pendingScene.panel === "tour"`.
- `turnBubble({ reply: "최종", messages: [{ role: "assistant", content: "찾아볼게요", tool_calls: [{ id: "a" }] }, { role: "tool", content: "{}" }, { role: "assistant", content: "중간", tool_calls: [{ id: "b" }] }, { role: "assistant", content: "최종" }] })` → content `최종`, tool_calls ids `["a","b"]`. Without `reply` → the last non-empty assistant content.
- `diaryFallbackLine({ A: 11.2, B: 12 }, { A: "가", B: "나" })` → `다 살아 봤어요. A 가는 출근 편도 평균 11분, B 나는 12분이었어요. 일기는 이번에 못 썼어요.`; a missing B → contains `—`.
- `scrollChatToEnd` with no DOM (`globalThis.document` undefined) → `false`, no throw.
- Source checks: `diary.js` contains `maxTokens: 8000` and not `maxTokens: 2000`; `chat.jsx` does not contain `지도 아래 ‘이 집들로 30일 살아 보기’를 눌러 주세요`; `SYSTEM_PROMPT` contains `답 끝에 한 번만` and `일기로 알려 드릴게요`.

Run only:
```
cd web && node --test tests/walkthrough-27f.test.js tests/diary-27d.test.js tests/chat-muse-27b2.test.js tests/neighborhood-27c2.test.js tests/agent-stream-27b.test.js tests/consult-agent.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
