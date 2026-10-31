# Stage 30g — lot-number homes get a readable name everywhere; the replay button sits in the chip row (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Keyless run, Korean, "판교 출근, 혼자 살아요, 전세 3억 이하" → "1번이랑 2번 담아 줘" → "살아 봐 줘".

### 1. Names that are just a lot number
- **Scale.** 3,541 of 18,096 homes in `data/build/homes/*.json` have a `name` that is only a lot number, e.g. `home-000005` `"(647)"`: an 오피스텔 in bundang with `station: { station: "판교", walk_minutes: 5 }`, `pnu: "4113510900106470000"`, and no `dong` field.
- **Where the fix is used today.** `displayNameFor` (`web/src/homes.js` ~548, stage 21a) makes a readable name, but only `candidate-card.jsx` calls it. Everywhere else the raw name shows:
  - the pick tray: `A (647) × · B SG타워 ×`;
  - the pick confirmation: `A (647), B SG타워를 찜했어요…`;
  - the 30-day result line: `A (647)는 출근 편도 평균 5분…`;
  - map pills and labels, and the diary / compare names.
- **The fallback is wrong too.** Without `dong`, `displayNameFor` uses `candidate.region`, which is an English id ("bundang"), so the result would read "bundang 오피스텔 (647)".

### 2. The "기록된 대화 보기" button
- **Where it sits.** 29a6 renders it in `<div className="ui-chat-fallback">` after `</ChatLayout>` (`web/src/ui/chat.jsx`, `grep -n "ui-chat-fallback"`). That puts it **below the composer**, at the very bottom of the chat section.
- **What goes wrong.** At 1440 × 900 it is cut off at the bottom edge. On phones it would sit under the composer.

## Change
1. **`displayNameFor`** (`web/src/homes.js`) — when the name is a bare lot number:
   - if `dong` exists: `{dong} {kind} ({lot})` (today's form);
   - else if `station.station` exists: `{station}역 근처 {kind} ({lot})`, e.g. `판교역 근처 오피스텔 (647)`;
   - else: `{kind} ({lot})`.
   - **Never use `region`**: it is an English id. Keep it pure. Real names pass through unchanged.
2. **Use it everywhere a home name is shown to the customer.**
   - Find the call sites: `grep -rn "\.name\b" web/src/ui web/src/chat web/src/consult/guards.js web/src/diary | grep -i "home\|cand\|pick"`, then pick the ones that render a home's name. These include:
     - the pick tray chips;
     - the rule-mode pick confirmation (`web/src/chat/intent.js` `rulePickFallback`, and wherever the chat builds the `A …, B …를 찜했어요` line);
     - the simulation result / compare names;
     - map pills / labels (`web/src/chatmap.js`, `labels3d.js` `homeDisplayName`).
   - Where a component gets only the name string, pass the candidate or apply `displayNameFor` where the candidate is known.
   - Do **not** change `src/consult/tools*.js` result payloads. The server text Muse sees keeps the raw name plus fields. Exception: if the live `actionConfirmation` (`src/consult/guards.js`) builds the confirmation from names, it may call `displayNameFor`.
3. **Replay button:**
   - Move it out of `.ui-chat-fallback` into the suggestion chip row above the composer, as the **first** chip, using the same chip component as the other chips in that row. Keep the same condition and the same `openReplay`.
   - Remove the `.ui-chat-fallback` block, and its CSS if it becomes unused.
   - It must be fully visible at 1440 × 900 and at 390 × 664.

## Test — `web/tests/lot-names-30g.test.js`
- `displayNameFor`:
  - `{ name: "(647)", kind: "오피스텔", region: "bundang", station: { station: "판교" } }` → `판교역 근처 오피스텔 (647)`;
  - with `dong: "삼평동"` → `삼평동 오피스텔 (647)`;
  - with no dong and no station → `오피스텔 (647)`;
  - `{ name: "SG타워" }` → `SG타워`;
  - the output never contains `bundang`.
- The tray and the rule pick confirmation use `displayNameFor`. Assert through SSR of the tray with a lot-number candidate, or through the exported helper that builds the confirmation.
- `chat.jsx`: no `ui-chat-fallback` render. The chip row includes `기록된 대화 보기` when the fallback condition holds; test through the exported chip-builder if there is one, else on the source.
- Keep green: `tests/rule-picks-30c.test.js`, `tests/keyless-30b.test.js`, `tests/judge-path-29a6.test.js`, and every `tests/*21a*`, `tests/cand*`, `tests/tray*`, `tests/chatmap*`, `tests/labels*`, `tests/homes*` file.

Run only:
```
cd web && node --test tests/lot-names-30g.test.js tests/rule-picks-30c.test.js tests/keyless-30b.test.js tests/judge-path-29a6.test.js $(ls tests | grep -E '21a|^cand|^tray|^chatmap|^labels|^homes' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks it in a real browser.

## Do not touch
`src/engine/**`, `src/i18n/**`, `src/consult/tools*.js`, `pipeline/**`, `relay/**`, `data/`, `README*`, `Dockerfile`, `.github/**`, `landing-page.jsx`.

## Final message
Changed files, one line each, then any new Korean strings. Nothing else.
