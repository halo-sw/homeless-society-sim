# Stage 26s — English mode for chat-first Muse: diary in English, model text not re-translated (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no build. Branch `ithaca-17` (chat-27 is merged in). Stop when this part is done.

## Found by the orchestrator
The site has an English mode (`?lang=en`, `src/i18n/`). The DOM layer (`src/i18n/dom.js`) translates every text node that contains Hangul, unless an ancestor has `data-no-i18n`.
1. `src/consult/agent.js:289` already tells Muse "Answer in plain English" when `context.lang === "en"`. But the chat-27 diary writer (`src/consult/diary.js` `writeDiary`) has no language input. Its prompt asks for Korean diary lines and a Korean summary, so English readers get Korean diary text that the DOM layer then romanizes word by word.
2. Muse's English replies may contain Korean in parentheses ("Gangnam Stn (강남역)", as the agent.js rule asks). The DOM layer sees Hangul and re-translates the whole English sentence through the Korean→English table, which can mangle it.
   - No reply bubble carries `data-no-i18n` today: `grep -rn data-no-i18n src` finds only `lang-toggle.jsx`.

## Change
1. **Diary language:**
   - pass the UI language from the client through the server to `writeDiary`. Follow how `context.lang` reaches `agent.js`: find where the client sets it (`src/ui/consult-client.js` / `chat.jsx`) and where `server.js` hands it to the agent;
   - when `lang === "en"`, append one English instruction to the diary prompt: write every diary line and the summary in plain English; the facts, ids, numbers and every other rule stay the same; place and home names are romanized with the Korean once in parentheses;
   - `checkDiary` must still pass English lines whose numbers come from the facts (`23 min`, `07:41`, `₩660,000`). Check its number extraction handles English text and comma-grouped won, and add a case if it does not;
   - Korean mode is byte-identical to today.
2. **Model-written text is not re-translated:**
   - in English mode, the bubble elements that show Muse-written text get `data-no-i18n`: the reply body, the diary lines and the diary summary;
   - rule-mode fallback replies (Korean templates, shown when Muse is unreachable) and every UI label stay translatable. Only text that came from the model is marked;
   - find the bubble components in `src/ui/chat.jsx` / `src/ui/consult.jsx` (`AssistantMsg`).

## Test — `web/tests/english-muse-26s.test.js`
- The diary prompt builder (export it if it is inline): with `lang: "en"` it contains `plain English`; with `lang: "ko"` or none it is identical to today (pin the string's length or hash first, before you edit).
- `checkDiary` accepts an English line that cites a fact id and uses that fact's numbers (`Day 3: the commute took 23 min, left at 07:41.`), and still rejects a number not in the facts.
- SSR: an assistant message flagged as model-written, rendered in English mode, has `data-no-i18n` on its text wrapper. A rule-mode message does not.
- Keep green: every `tests/*diary*`, `tests/*consult*`, `tests/*agent*`, `tests/*27*` file that exists.

Run:
```
cd web && node --test tests/english-muse-26s.test.js $(ls tests | grep -E 'diary|consult|agent|27' | grep -v 26s | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**` (the orchestrator owns the phrase tables), `pipeline/**`, `relay/**`, `data/`. No `text-overflow: ellipsis`. No keys.

## Final message
Changed files, one line each. Nothing else.
