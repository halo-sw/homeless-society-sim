# Stage 29g2 — The map shows in a replay and after a reload (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
"Watch a recorded month" is the first thing a judge clicks. On the live site and locally (orchestrator, Chrome, 2026-10-31) the replay shows the candidate cards in the chat, but the work panel on the right shows only the empty card `서울·경기 동남부 / 대화에서 조건을 말하면 후보 지역이 여기에 표시돼요.` (`web/src/ui/chat.jsx:~3176-3186`), half covered by the filter chips. A request trace during `?replay=seoul-couple` shows **no** request for the regions doc or the subway network: `ensureData` (`chat.jsx:1539-1553`) is never called. The live path works because `runSearch` calls `ensureData(named)` (`:~1582-1593`, US → `["us-menlo"]`). The map reads `dataRef.current?.regionsDoc` / `network` (`:~2858-2861`), and `dataRef` is a ref, so after filling it something must bump `dataTick` (`:1448`; the 27g effect at `:1452-1456` tries `ensureData(null)` when `workOpen` turns true, but in the replay it does not take effect — do not rely on it).

The same happens after a page reload that restores a saved transcript (`loadTranscript` branch, `:~2496-2512`): candidates come back, the map stays empty.

## Change — `web/src/ui/chat.jsx`
1. New exported pure helper `regionsForDoc({ profile, candidatesData })` (put it next to other pure helpers in this file or in `web/src/chat/engine.js` if that is where region helpers live): USD profile (`currencyOf(profile) === "USD"`) or any candidate with `region === "us-menlo"` / `currency === "USD"` → `["us-menlo"]`; else the unique non-empty `candidate.region` values (e.g. `["gangnam"]`), or `null` when none.
2. One function `loadDataFor(doc)` inside the component: `ensureData(regionsForDoc(doc)).then(() => setDataTick((t) => t + 1)).catch(() => {})`.
3. Call it wherever `setCandidatesData(doc.candidatesData)` / `setCandidatesData(mem.candidatesData)` runs from a saved or recorded document: the replay timer (`:~2480`), `skipReplay` (`:~2370`), and the transcript restore (`:~2504`). Pass `{ profile: doc.profile, candidatesData: doc.candidatesData }` (or `mem`).
4. The empty card must not sit under the filter chips: when the stage has filters (`chips.length > 0`), give the empty-card wrapper top padding so it starts below the chip row (e.g. `paddingTop: 64`), or move it into the normal flow below the chips. Keep its text.

## Test — new `web/tests/replay-map-29g2.test.js`
- `regionsForDoc({ profile: { currency: { value: "USD" } }, candidatesData: null })` → `["us-menlo"]` (check how `currencyOf` reads the profile and build the profile accordingly).
- candidates `[{ region: "gangnam" }, { region: "gangnam" }, { region: "songpa" }]` → `["gangnam", "songpa"]`; `[{ region: "us-menlo", currency: "USD" }]` → `["us-menlo"]`; none → `null`.
- Source check: in `chat.jsx`, every line with `setCandidatesData(doc.candidatesData)` or `setCandidatesData(mem.candidatesData)` is followed within 4 lines by `loadDataFor(`.
- Load both recordings `web/public/recorded/menlo-month.json` and `seoul-couple.json`: `regionsForDoc(doc)` is `["us-menlo"]` and a non-empty Korean list respectively.

Run only:
```
cd web && node --test tests/replay-map-29g2.test.js $(grep -ln "recording\|replay" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
`chatmap.js`, map rendering, landing, engine files, recordings.

## Final message
Changed files, one line each. Nothing else.
