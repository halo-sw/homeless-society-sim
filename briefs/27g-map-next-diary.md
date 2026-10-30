# Stage 27g — Map shows right after the search; no raw [[다음]]; diary spans the month and matches the card (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section: no git, no full suite, no build, no exploring). Branch `chat-27` (27a–27f are in). First edit within 3 tool calls. Read only the line ranges quoted here (use `grep -n` when numbers moved). When the named tests pass, stop.

## Why
Second real-Muse walkthrough after 27f. 3D 동네 opens, the diary is written and checked ("✓ 문장 8개 모두 기록과 대조"), one bubble per turn, the thread follows. Remaining:

1. **The map stays on its placeholder after Muse finds homes.** The right panel says "대화에서 조건을 말하면 후보 지역이 여기에 표시돼요." while 6 candidates are in the chat. `StageArea` (`grep -n "export function StageArea" web/src/ui/chat.jsx`) shows `ChatMap` only when `map.regions` is non-empty; regions come from `dataRef.current.regionsDoc`, which only `ensureData` (`grep -n "async function ensureData"`) fills. The rules path and `handleRun` call it; the Muse path never does, so the map appears only after a run. `dataRef` is a ref, so filling it does not re-render.
2. **`[[다음: …]]` shows as raw text** at the end of the bubble: "찜이 완료되었습니다. … [[다음: 살아 봐 줘 | 비교해 줘 | 출근길 보여 줘]]". 27f's prompt says "줄바꿈 없이", so Muse put the marker on the same line, and `splitSuggestions` (`web/src/consult/agent.js:95-106`) only matches a marker on its own last line.
3. **The diary only covers days 1–2 and contradicts the card.** All 8 lines were 1일째/2일째 (출근 11분, 출근 11분, 장보기, 공원 …). The summary said "B집은 출근에 13분" (one day's commute) while the card says 출퇴근 편도 B 12분 (the 30-day average, `totals.one_way_min`). Cause: when facts exceed `maxFacts`, `runDigest` (`web/src/diary/digest.js:155-190`) takes each kind's queue from the front, i.e. the earliest days; and the summary check allows any fact number.

## Changes

### 1. Map data on the Muse path — `web/src/ui/chat.jsx`
- Add `const [dataTick, setDataTick] = useState(0);` next to the `workOpen` state.
- A `useEffect` on `[workOpen]`: when `workOpen` is true and `!dataRef.current`, call `ensureData(null).then(() => setDataTick((t) => t + 1)).catch(() => {})`.
- In `askAgent`, after `appendToolCards(out.messages)`: if any tool message in `out.messages` parses to `{ ok: true, candidates: [...] }` and `!dataRef.current`, do the same `ensureData(null).then(() => setDataTick((t) => t + 1))` (do not await it).
- `dataTick` only needs to cause a re-render; it does not have to be read elsewhere.

### 2. Marker anywhere at the end — `web/src/consult/agent.js`
- `splitSuggestions`: match the marker at the very end of the text, on its own line or after text on the same line: `/\[\[\s*(?:다음|Next)\s*:\s*([^\]]+?)\s*\]\]\s*$/`. `text` is everything before the marker, trimmed. Keep the current behaviour for the own-line case. A marker in the middle of the text (followed by more text) is still not split.
- `SYSTEM_PROMPT`, the line starting `"답은 2~3문장"`: change `줄바꿈 없이 짧게` to `본문은 짧게` and `마지막 줄에는` to `본문 다음 새 줄에`.
- Client safety net — `web/src/ui/chat.jsx` `turnBubble`: run the chosen `content` through the same split (import `splitSuggestions` from `../consult/agent.js` if that import is already used in this file, else copy the regex into a local `stripNextMarker`) so a stray marker never reaches the screen.

### 3. Diary over the whole month, summary from totals — `web/src/diary/digest.js`, `web/src/consult/diary.js`
- `runDigest`, over-cap branch: per kind, instead of `q.shift()` from the earliest day, take an evenly spaced sample across the kind's sorted list (indices `Math.round(i * (n - 1) / (k - 1))` for a per-kind quota `k`), always including, for `commute`, the fact with the most minutes. Keep "every kind represented" and the `maxFacts` cap. Mark that longest commute fact: its `text_ko` ends with ` (30일 중 가장 오래)` and `numbers` gains `30`.
- `DIARY_PROMPT` (`diary.js:5-10`):
  - in 1): add `줄은 한 달에 걸쳐 고른다: 첫 주·중간·마지막 주에서 고루, 같은 종류는 집마다 2줄까지. 가장 오래 걸린 출근, 혼잡, 늦은 귀가처럼 눈에 띄는 날을 먼저 쓴다.`
  - in 2): replace `숫자는 totals와 facts에 있는 것만.` with `숫자는 totals에 있는 것만 쓴다(출근은 totals.one_way_min = 30일 평균 편도). 하루치 숫자를 대표값처럼 쓰지 않는다.`
- `checkDiary`: the summary's allowed numbers are the totals values only (drop the facts' numbers from `allowed`).
- `fallbackSummary` (`diary.js:90-96`) already uses totals; keep it.

## Tests — new `web/tests/map-next-diary-27g.test.js`
- `splitSuggestions("찜했어요. [[다음: 살아 봐 줘 | 비교해 줘]]")` → text `찜했어요.`, suggestions `["살아 봐 줘","비교해 줘"]`. Own-line form still works. `"a [[다음: x]] b"` → not split.
- `turnBubble({ reply: "좋아요. [[다음: 살아 봐 줘]]", messages: [] }).content === "좋아요."`.
- `runDigest` on a fake run (build the smallest `run` object the digest reads, or reuse the fixture approach in `web/tests/diary-27d.test.js`) with 30 commute facts and `maxFacts: 6`: the picked commute facts' days span from ≤ day 2 to ≥ day 25, and the longest commute is included with `30일 중 가장 오래`. If building such a run is not practical, export the sampling helper (`spreadPick(list, k, mustInclude)`) and test it directly on 30 items.
- `checkDiary` with a summary using a fact-only number (e.g. 13 when totals.one_way_min is 12) → `summaryOk === false`; with 12 → true.
- Source check: `chat.jsx` contains `setDataTick` and calls `ensureData(null)` in an effect on `workOpen`.

Run only:
```
cd web && node --test tests/map-next-diary-27g.test.js tests/walkthrough-27f.test.js tests/diary-27d.test.js tests/agent-stream-27b.test.js tests/chat-muse-27b2.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
