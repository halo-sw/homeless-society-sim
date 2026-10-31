# Stage 32a — the chat shell rebuilt on Astryx's ai-chat template: one surface, responsive widths, a resizable map panel, a full-map mode, a composer drawer, per-language live rows (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md` (Astryx components first, tokens, no raw hex/px, no `text-overflow: ellipsis`). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Read first
The customer asked us to build the chat the way Astryx's own `ai-chat` template does. It is a transcript beside a resizable artifact panel.
- Print it with the local CLI (no network): `cd web && npx --no-install astryx template ai-chat --skeleton` for the layout, and `npx --no-install astryx template ai-chat` for the source.
- Component docs: `npx --no-install astryx component ChatLayout ChatMessageList ChatComposer ChatComposerDrawer ChatMessageMetadata Badge Banner ResizeHandle --dense`.
- Follow its structure and component choices. Do **not** copy the file into the repo: our app is Vite + `web/src/ui/chat.jsx`, not `src/app`.

## Found by the orchestrator (real Chromium, replay `menlo-month` EN and live, 1000 / 1440 / 1920 px wide, plus the customer's screenshots)
1. **Chat only (no map yet), 1440:**
   - the thread is a 760 px column at x=340 painted `rgb(255,253,249)` on a page of `rgb(246,244,239)`, so a pale band runs top to bottom with odd margins on both sides;
   - messages are bottom-aligned, so a short conversation leaves the whole top empty.
   - At 1000 px the thread takes the full 1000 px with no max width, so lines run long.
2. **With the map:**
   - the thread is a fixed 490 px (1440) / 520 px (1920);
   - the suggestion chip row (`Show the commute`, `How much a month?`, `Walk the neighborhood`) is clipped at the panel edge;
   - before candidates arrive, the map's empty card ("…areas will show up here") sits under the filter row and legend, and the texts overlap.
3. **Live busy rows are broken in English.** The customer saw:
   - `✓ Sanghwang Ikgi · Peuropil Ikgi (1 Muleobom)`
   - `✓ home candidate Chatgi · 6 candidate homes …`
   - `✓ View open · : Map`

   **Cause:** `liveRowLine(row)` (`chat.jsx` ~1123) builds a Korean line (`✓ 상황 읽기 · 프로필 읽기(1개 물어봄)`). The DOM translator finds no exact entry and falls back to romanizing.

   **Korean is wrong too:** `화면 열기 · : 지도`. `stripToolLabel` strips the label `화면 열기` from the summary `화면 열기: 지도` and leaves `: 지도`.
4. **The replay notice** is a custom strip. **The sources line** (`Sources checked  Zillow ZORI  OSM (US)`) is loose text with wide gaps.

## Change (`web/src/ui/chat.jsx`, `web/src/ui/agent-float.js`, `web/src/ui/ui.css`; `consult.jsx` only where its tool/source rows render)
1. **Shell, as in the template:**
   - `Layout height="fill"` → `HStack`:
     - the chat (`ChatLayout` + `ChatMessageList` + `ChatComposer`);
     - when the stage is open, a `ResizeHandle` and the stage (map / scenes) as the artifact panel.
   - **One background:** the page and the thread use the same surface token; no band.
   - **Chat only:** the message list and composer sit in one centred column, max-width 760 px. Gutters are 16 px (≤ 480), 24 px (≤ 1024), and the column is centred above that. `ChatMessageList align="top"`, so a new conversation starts at the top.
   - **Chat + stage:**
     - the thread panel starts at `clamp(380px, 36%, 600px)` and is resizable between 320 px and 720 px with the `ResizeHandle` (mouse and keyboard);
     - remember the width per viewer in `localStorage`, every read/write in try/catch, and the page works without it;
     - the stage takes the rest.
   - **≤ 900 px:** keep today's two tabs (대화 / 지도·후보), with one breakpoint for all of it.
2. **Full-map mode.**
   - A button at the stage's top-right, next to the close ×, labelled `지도 크게 보기` (`aria-label` and `title`; an icon of two panels).
   - It hides the thread panel so the stage fills the width. The button then reads `대화 같이 보기`, and Esc also returns.
   - The pick tray and the map controls keep working in this mode.
   - Not shown at ≤ 900 px (the tabs already do this).
3. **Suggestions go in a `ChatComposerDrawer`.**
   - The suggestion chips move into the composer's `drawer` slot: label `이어서 해 볼 것`, `count` = number of chips.
   - The chips wrap inside the drawer and are never clipped.
   - Keep the other session's mic button (`web/src/ui/voice-button.jsx`) exactly where it is in the composer.
4. **Message footer:**
   - the sources line becomes a `ChatMessageMetadata` footer, with each source name as a neutral `Badge`;
   - the "N things checked" disclosure stays as it is.
5. **Replay notice:** a `Banner` (info) with the same text and the same two actions (`Skip`/`건너뛰기`, `Try it yourself`/`직접 해 보기`).
6. **Live rows built per language:**
   - `liveRowLine(row, lang)`. Add `TOOL_ACTION_EN` next to `TOOL_ACTION_KO` in `agent-float.js`, one English label per key, short: e.g. `extract_profile: "Reading your situation"`, `find_homes: "Finding homes"`, `open_panel: "Opening a view"`.
   - **In EN:** the tail (the summary) is shown only when it has an exact translation. Export a `translateExact(text)` from the translator module that returns `null` instead of romanizing, and use it here; otherwise the row is the label alone.
   - The row node carries `data-no-i18n`.
   - Fix `stripToolLabel` so a leftover leading `:` / `·` and spaces are removed (`화면 열기: 지도` → `지도`).
   - The strings in `consult/agent.js` stay Korean; do not edit consult logic.
7. **Map empty state:**
   - while the map has no candidates, hide the filter chip row and the legend, so only the empty card shows at the top-left;
   - they appear with the first candidates.
8. Nothing else changes: messages, cards, map internals, the landing.

New strings (KO and EN): list them all in the final message. The orchestrator adds the EN ones to `src/i18n/en.js`; you only add `TOOL_ACTION_EN` in code.

## Test — `web/tests/chat-shell-32a.test.js`
- **`liveRowLine`:**
  - EN for `{ name: "extract_profile", summary: "프로필 읽기(1개 물어봄)" }` has no Hangul and no romanized syllables. Assert it contains no `Ikgi`/`Chatgi`/`Muleobom`, and equals `✓ Reading your situation` or that plus an exact translation.
  - KO `open_panel` with summary `화면 열기: 지도` → `✓ 화면 열기 · 지도`.
- **`TOOL_ACTION_EN`:** has every key of `TOOL_ACTION_KO`, and no value contains Hangul.
- **`translateExact`:** returns `null` for an unknown Korean string, and the table value for a known one.
- **SSR chat:**
  - chat-only renders a `ChatMessageList` with top alignment and no stage;
  - with a stage, renders a resize handle (`role="separator"` with `aria-valuenow` or the Astryx equivalent) and the `지도 크게 보기` button;
  - suggestions render inside the composer drawer (not a sibling row);
  - the replay notice renders through `Banner`;
  - sources render as `Badge`s inside the message metadata footer.
- **CSS:** no rule sets a different background on the thread than on the page body (assert the thread rule uses the same token as the page); no `ellipsis`.
- **Keep green:**
  - `tests/thread-edge-31d.test.js`, `tests/chat-hierarchy-31a.test.js`, `tests/map-tray-31b.test.js`, `tests/voice-29b.test.js`;
  - every test mentioning `liveRowLine`, `stripToolLabel`, `toolActionKo`, `StageArea`, `ChatLayout`, `ChatComposer`, `ui-chat-thread`, `ui-chat-main` or `replay`.
  - Update pins on the old DOM (e.g. the suggestion row, the replay strip), and name them.

Run only (**run it before you finish**):
```
cd web && node --test tests/chat-shell-32a.test.js tests/thread-edge-31d.test.js tests/chat-hierarchy-31a.test.js tests/map-tray-31b.test.js tests/voice-29b.test.js $(grep -lE "liveRowLine|stripToolLabel|toolActionKo|StageArea|ChatLayout|ChatComposer|ui-chat-thread|ui-chat-main|replay" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator re-checks in a real browser at 390 / 1000 / 1440 / 1920 px, KO + EN.

## Do not touch
- The map internals (`chatmap.jsx`, `chatmap.js`), except hiding the filter row / legend when empty (item 7).
- `candidate-card.jsx` (stage 32b), `landing-page.jsx`, `voice-button.jsx`, `src/engine/**`, `src/consult/**` logic, `src/i18n/en*.js` (you may add `translateExact` to the translator module itself), `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. New strings (KO and EN). Updated test files. Nothing else.
