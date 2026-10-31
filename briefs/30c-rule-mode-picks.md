# Stage 30c — rule mode understands "save 1 and 2" and "live in them" (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Setup: the 30a Docker layout, no keys, so `museLive === false` (30b). Every turn goes to `structuredFlow` (`grep -n "async function structuredFlow" web/src/ui/chat.jsx`). The tree now includes main's 29a stages (landing at `/`, the app at `?chat=`, recorded replay `?replay=`, the "0 of 2 picked" counter).

| Language | Typed after the candidate list | What happens |
|---|---|---|
| English | "Save 1 and 2" | nothing: no reply, and the counter stays at "0 of 2 picked" |
| English | "Live in both homes" | nothing |
| Korean | "1번이랑 2번 담아 줘" | nothing |

The candidate list itself tells the customer: "마음에 드는 집을 2곳 담고 \"살아 봐 줘\"라고 말해 보세요" (`grep -n '살아 봐 줘' web/src/ui/chat.jsx`). **So rule mode asks for a sentence it cannot handle.** The "Pick" buttons and the tray run button do work.

`structuredFlow` re-runs `extract_profile` on every turn. These sentences carry no profile values, so the turn ends silently.

This matters because the README's "Judge in 2 minutes" tells judges to type exactly "Save 1 and 2", then "Live in both homes". When the relay has no key or is down, that path must still work.

## Change
1. **A pure intent reader**, in a new `src/chat/intent.js`:
   `readChatIntent(text, { candidateCount }) → { type: "pick", numbers: [1,2] } | { type: "run" } | null`.
   - **Pick**, with the numbers being 1-based map numbers within `1..candidateCount`, 1 to 3 of them, unique:
     - English: "save 1 and 2", "pick 1, 3", "add 2 and 5", "1 and 2", "#1 #2";
     - Korean: "1번이랑 2번 담아 줘", "1, 3번 담아", "2번 5번 골라 줘", "1번 2번".
   - **Run:**
     - English: "live in both homes", "live in them", "live 30 days", "run it", "compare them";
     - Korean: "살아 봐 줘", "두 집에서 살아 봐", "30일 살아 봐", "비교해 줘".
   - **A pick and a run in one sentence** ("save 1 and 2 and live in them") returns `{ type: "pick", numbers, thenRun: true }`.
   - Anything that also carries profile values (a budget, a workplace, "전세", "$") returns `null`, so the profile flow keeps those turns.
2. **In `structuredFlow`**, before the extract step, when candidates are on screen:
   - **Pick:** use the same code path the "Pick" buttons use (the same state, the same tray). Push the same confirmation line the live path uses after `pick_homes`, i.e. `actionConfirmation` from `src/consult/guards.js` (read only) with the picked names. If that is awkward, push `"{A 이름}, {B 이름}을 담았어요. \"살아 봐 줘\"라고 하면 30일을 살아 봐요"`.
   - **Run:** with 2 or more picks, call the same `handleRun` the tray button calls. With fewer, push the existing gate text (`grep -n '비교할 집을' web/src/ui/chat.jsx`, or the 29a2 counter text if it replaced it).
   - **Pick with `thenRun`:** pick, then run.
   - These turns do not call `extract_profile` and do not change the profile.
3. **The same reader in the live path, as a fallback only:** when `museLive === false` (30b), or when the consult call fails, the turn goes to `structuredFlow`, so item 2 covers it. Do not change the live Muse path.
4. **Strings:** use Korean only, as everywhere in the UI. The orchestrator adds English rows to `src/i18n/en.js`. List every new Korean string you add in the final message.

5. **Two keyless details from the merge:**
   - **Header status.** `PoweredByMuse` (`src/ui/powered-by-muse.jsx`) shows `museModelLabel(live)`.
     - The top bar now passes `live={museLive === true}`, so an unknown status shows "규칙 모드" for a moment.
     - Make `museModelLabel` tri-state, like `museStatusLabel` in `topbar.jsx`: `true` → "Muse Spark 1.3", `false` → "규칙 모드", `null` → "연결 확인 중".
     - Then pass `live={museLive}` from `topbar.jsx`, and set `data-live` to "1" only for `true`.
   - **Keyless notice.** The 30b line `이 서버에는 Muse 키가 없어서 규칙으로 답해요. …` gets the same secondary sm button `기록된 대화 보기` that 29a6 added to the other fallback lines, with the same replay id choice.

## Test — `web/tests/rule-picks-30c.test.js`
- `readChatIntent` covers every example sentence above, in both languages, with `candidateCount: 6`.
- It returns `null` for:
  - "save 9 and 2" when `candidateCount` is 6 (out of range);
  - "I work at Meta HQ, up to $5,000";
  - "판교 출근, 전세 3억 이하";
  - "hello".
- "save 1 and 2 and live in them" gives `{ type: "pick", numbers: [1,2], thenRun: true }`.
- A rule-flow-level test, if `structuredFlow`'s branch is testable through an exported helper (e.g. `ruleTurnPlan({ text, candidates, picks })` returning the effects): the "pick" effect carries the candidate ids of map numbers 1 and 2; "run" with 0 picks gives the gate text.
- `museModelLabel(null)` → "연결 확인 중". The keyless notice message carries the replay button: assert through the helper that builds it, or on the `chat.jsx` source.
- Keep green: `tests/judge-path-29a6.test.js`, every `tests/*powered*` file, `tests/keyless-30b.test.js`, `tests/english-action-26x2.test.js`, `tests/phone-tray-26z2.test.js`, `tests/tray-money-26z.test.js`, and every `tests/chat*`, `tests/picks*`, `tests/intake*`, `tests/profile*` file.

Run only:
```
cd web && node --test tests/rule-picks-30c.test.js tests/judge-path-29a6.test.js $(ls tests | grep -i powered | sed 's#^#tests/#') tests/keyless-30b.test.js tests/english-action-26x2.test.js tests/phone-tray-26z2.test.js tests/tray-money-26z.test.js $(ls tests | grep -E '^(chat|picks|intake|profile)' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks it in a real browser without keys.

## Do not touch
`src/engine/**`, `src/i18n/**`, `src/consult/**` (read only), `src/chat/recording.js`, `web/public/recorded/**`, `pipeline/**`, `relay/**`, `data/`, `README*`, Docker files, `.github/**`.

## Final message
Changed files, one line each, then the list of new Korean strings. Nothing else.
