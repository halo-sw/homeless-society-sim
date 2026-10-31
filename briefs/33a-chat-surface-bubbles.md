# Stage 33a — the conversation reads like a chat app: one background, real bubbles, a working card while Muse runs (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md` (Astryx first, tokens, no `text-overflow: ellipsis`). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

Docs: `cd web && npx --no-install astryx component ChatMessageBubble Spinner AppShell --dense`.

## Found by the orchestrator (real Chromium, 2000×1040, `?chat=&lang=en`, live message `미금역 근처 전세 찾아 주고 동네를 보여 줘`; the customer's screenshot shows the same)
The customer compared it with a chat app: one background, a centred column, rounded bubbles for both sides, the composer at the bottom. They asked for that, responsive at every width.

1. **Two backgrounds.** After the first message, the 760 px thread column is `--ui-page` (`#f6f4ef`), but both sides of it are white.
   - `elementsFromPoint(200,500)`: `div.astryx-layout-content` bg `rgb(255,255,255)` and `div.astryx-app-shell` bg `rgb(255,255,255)`. That is `AppShell variant="surface"` at `chat.jsx:2938–2940`.
   - While the chat is empty, `ui.css:855–861` makes them transparent (for the city backdrop). Once a message exists, they paint white.
2. **The working state is loose grey text.** `chat.jsx:3017–3031`: `<ChatMessageBubble variant="ghost">` with one `Text type="supporting"` per tool row (`✓ Reading your situation · …`, `✓ Finding homes`).
   - There is no Muse name, no spinner, no frame.
   - Under it, the whole column is empty for 20–40 s.
3. **Assistant text has no bubble.** `consult.jsx:99–101`: `<ChatMessageBubble variant="ghost">` around the Markdown. The reply is bare text on the page, while cards next to it are framed, so the thread reads as scattered pieces.
   - User bubbles are already `filled`, grey, on the right; keep them.

## Change
1. **One background** (`chat.jsx:2938`, `ui.css`).
   - The chat page is `--ui-page` edge to edge at every width, before and after the first message: `AppShell`, its layout content and `.ui-chat-thread` show no other colour.
   - Prefer an `AppShell` variant whose background is the page token. If none matches, scope one rule to `.ui-chat` that sets the shell and layout content to `var(--ui-page)`. In both cases the empty-state transparency in `ui.css:855–861` keeps working (the city backdrop still shows while empty).
   - `.ui-chat-thread` keeps `background: var(--ui-page)`. In chat-only mode it has no right border (it sits centred).
2. **Assistant text bubble** (`consult.jsx:99`): `variant="filled"`.
   - It sits on `--ui-card` (`--ds-surface`) with a 1 px `--ui-border` line and radius `--ui-r-card`, padding 12 / 16 px.
   - It is as wide as its text, up to the full message column.
   - `ToolRows` / `CiteRows` stay under it, outside the bubble, on the same left edge.
   - The `기록된 답변` label stays ghost.
   - Cards (`CardMsg`) do not change.
3. **Working card** (`chat.jsx:3017–3031`): the busy message becomes a filled bubble in the same style as item 2, with `name="Muse"`.
   - **Header row:** Astryx `Spinner` (small) + `Muse가 일하는 중` (EN through the table: `Muse is working`).
   - **Then one row per tool, as today** (`liveRowLine(row, currentLang())`, `data-no-i18n`):
     - a finished row keeps its `✓`;
     - the row still pending (`row.pending`) shows a small spinner instead of `✓`;
     - rows are 13 px `--ui-ink2`, 4 px apart.
   - With no rows yet: the header alone plus `Muse가 생각하는 중…`.
   - It never grows wider than the message column, and it never moves the composer.
4. **Column:**
   - **Chat only:** keep the centred `--ds-chat-col` (760 px) column, top-aligned list, composer at the bottom of the viewport inside the same column. Gutters are 24 px at ≤ 1024 and 16 px at ≤ 480 (`ui.css:900–905`, already there; check they still hold).
   - **Chat + stage:** unchanged.
5. **User bubble:** unchanged (filled, right, `keep-all`).

New strings (KO): `Muse가 일하는 중`. The orchestrator adds the EN.

## Test — new `web/tests/chat-surface-33a.test.js`
- **SSR the chat** with one user message and `busy` + two live rows (one done, one `pending`):
  - the busy bubble is `data-variant="filled"`, has the name `Muse`, a spinner element (Astryx `Spinner`'s role/class) and both rows;
  - the pending row has a spinner and no `✓`.
- **SSR `AssistantMsg`** with text: its bubble is `data-variant="filled"`.
- **CSS / source:** inside `.ui-chat`, no rule leaves the app shell or layout content white once the thread is not empty. Assert the new variant or rule, and that `ui.css:855–861` still exists.
- **Keep green:**
  - `tests/chat-shell-32a.test.js`, `tests/thread-edge-31d.test.js`, `tests/chat-hierarchy-31a.test.js`;
  - every test mentioning `AssistantMsg`, `ChatMessageBubble`, `ui-chat-thread`, `ui-chat-empty`, `liveRowLine` or `variant="ghost"`.
  - Re-point pins on the old ghost bubbles and name them.

Run only (**run it before you finish**):
```
cd web && node --test tests/chat-surface-33a.test.js tests/chat-shell-32a.test.js tests/thread-edge-31d.test.js tests/chat-hierarchy-31a.test.js $(grep -lE "AssistantMsg|ChatMessageBubble|ui-chat-thread|ui-chat-empty|liveRowLine|variant=\"ghost\"" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator re-checks in a real browser (live chat, 390 / 1000 / 1440 / 2000 px, KO + EN).

## Do not touch
The map, `candidate-card.jsx`, `landing-page.jsx`, `voice-button.jsx`, `src/engine/**`, `src/consult/**` logic, `src/i18n/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. New KO strings. Updated test files. Nothing else.
