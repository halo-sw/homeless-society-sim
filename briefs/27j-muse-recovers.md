# Stage 27j — One slow Muse turn never ends the conversation (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section: no git, no full suite, no build, no exploring). Branch `chat-27`. First edit within 3 tool calls. Read only the line ranges quoted here (use `grep -n` when numbers moved). When the named tests pass, stop.

## Why
First cold test of the public site (GitHub Pages + relay on Vercel): the first turn ran 66 s, the relay log says `Vercel Runtime Timeout Error: Task timed out after 60 seconds`. The chat then showed "Muse 연결이 안 돼서 규칙으로 답했어요" with the rules answer — fine — but:
- `askAgent`'s catch calls `setMuseDown(true)` (`grep -n "setMuseDown(true)" web/src/ui/chat.jsx`), and `routeTurn({ live, museDown })` (`grep -n "export function routeTurn"`) then routes **every later message** to the rules path. Muse never gets another chance in that conversation.
- On the rules path, "1번이랑 2번 찜해 줘", "1번 동네는 어때?" and "두 집에서 살아 봐 줘" each produced **no reply at all**: the user's bubble and nothing after it.
A second try a minute later took 13 s and worked. So failures are occasional (cold start + slow model), and the product must recover from them.

## Changes

### 1. Relay time limit — `relay/build.mjs`
`functions: { "api/relay.js": { maxDuration: 60 } }` → `maxDuration: 300`. Update the comment above it if it states 60.

### 2. Try Muse again on the next message — `web/src/ui/chat.jsx`
- Replace the boolean with a failure count: `const [museFails, setMuseFails] = useState(0);` (drop `museDown` state). On a successful `askAgent` turn, `setMuseFails(0)`; in the catch, `setMuseFails((n) => n + 1)`.
- `routeTurn({ live, museFails = 0, museDown })`: `"agent"` when `live` and `museFails < 3`; else `"local"`. Keep accepting `museDown: true` as meaning 3+ failures so old callers/tests keep working.
- The catch's system line becomes `Muse 답이 늦어서 이번엔 규칙으로 답했어요. 다시 말하면 Muse가 이어받아요` (after the 3rd straight failure: `Muse 연결이 계속 안 돼서 규칙으로 이어 갈게요`).

### 3. The rules path always answers — `web/src/ui/chat.jsx` `send`
- Before routing, remember `const before = stateRef.current.messages.length` (or the existing equivalent; follow how `stateRef` mirrors `messages`).
- After the local branch (everything except the `askAgent` branch) finishes, if no message with `role !== "user"` was added since `before`, push one assistant text from a new exported pure helper `localNoAnswerLine(text)`:
  - contains `찜` → `찜은 후보 카드의 ‘담기’로 할 수 있어요.`
  - contains `동네` → `동네는 후보 카드의 3D 미리보기에서 볼 수 있어요.`
  - contains `살아` → `두 곳을 담으면 지도 아래 ‘이 집들로 30일 살아 보기’로 시작할 수 있어요.`
  - otherwise → `이 요청은 Muse가 다시 연결되면 할 수 있어요. 잠시 뒤 다시 말씀해 주세요.`
  (These point at the buttons because on the rules path nobody else can act on the words.)

## Tests — new `web/tests/muse-recovers-27j.test.js`
- `routeTurn`: `{ live: true, museFails: 0 }` → agent; `museFails: 2` → agent; `museFails: 3` → local; `{ live: false }` → local; `{ live: true, museDown: true }` → local (old shape).
- `localNoAnswerLine("1번이랑 2번 찜해 줘")` contains `담기`; `"1번 동네는 어때?"` contains `3D 미리보기`; `"두 집에서 살아 봐 줘"` contains `30일 살아 보기`; `"안녕"` contains `잠시 뒤`.
- Source checks: `relay/build.mjs` contains `maxDuration: 300`; `chat.jsx` contains `Muse가 이어받아요` and no longer contains `setMuseDown(true)`.
- Update `web/tests/chat-muse-27b2.test.js:35-37` only if it breaks (it should not: the old `museDown` shape still works).

Run only:
```
cd web && node --test tests/muse-recovers-27j.test.js tests/chat-muse-27b2.test.js tests/walkthrough-27f.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -10
```
