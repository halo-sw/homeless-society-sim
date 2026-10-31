# Stage 31i — candidate list: sort as text tabs, the price is the biggest thing on a card (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Why
The customer showed a common listing layout and asked for the same calm hierarchy:
- the count at the top;
- sort as a short row of text tabs (the active one in bold), not a dropdown;
- on each card, the name, then the price as the largest text, then one meta line, then tags and the action.

Our `CandidatesCard` (chat.jsx ~410, after 31a) still has:
- a ghost dropdown for sort (`HOME_SORT_KO` labels, e.g. `출퇴근 짧은 순`);
- a card price (`candidate-card.jsx`, row variant) at 15 / 600, barely larger than the 14 / 600 name.

## Change
1. **Sort tabs** (`CandidatesCard`):
   - Replace the `DropdownMenu` with a row of text buttons. Same `onSort`, same four keys (`HOME_SORTS`).
   - Short labels, a new export `HOME_SORT_SHORT_KO` in `src/homes.js`: `{ commute: "출근순", monthly: "비용순", deals: "거래순", priority: "우선순위순" }`. The full `HOME_SORT_KO` label goes in each tab's `title` and `aria-label`.
   - Active tab: 14 / 700 ink, `aria-pressed="true"`. Others: 14 / 400 `--ds-ink-2`.
   - Thin 1 px `--ds-line` vertical separators between tabs (CSS, not characters).
   - Each tab has a hit area of at least 32 px (40 px at ≤ 480 px).
   - **Row layout:**
     - title row = `집 후보 N곳` (card title) + `2곳 중 N곳 담음` (meta);
     - next row = the tabs on the left, `지도에서 보기` (secondary small) on the right;
     - the tabs wrap under each other before anything overflows.
     - With 0 candidates the row stays hidden (31a rule).
2. **Card price** (`candidate-card.jsx`, row variant only):
   - The price line is `--ds-t-20` / 700, tabular numbers.
   - The name stays 14 / 600. The meta line and commute line stay as they are (text unchanged, so the English translator still matches them).
   - Spacing: name → price 4 px, price → meta 4 px, meta → commute 4 px, commute → bottom 0.
   - The 담기 button stays top-right.
   - The card's thumbnail keeps its size; make sure the larger price does not push 담기 or wrap under the thumbnail at 390 px.
3. No raw hex/px in new CSS (tokens), no `text-overflow: ellipsis`.

New Korean strings: the four short labels (list them).

## Test — `web/tests/list-tabs-31i.test.js`
- **`HOME_SORT_SHORT_KO`:** has the four keys with the labels above.
- **SSR `CandidatesCard`** with 2 candidates, sort `monthly`:
  - 4 tab buttons;
  - the `비용순` one has `aria-pressed="true"` and the others `false`;
  - each has a `title` with the full `HOME_SORT_KO` label;
  - no `DropdownMenu` trigger with a `출퇴근 짧은 순` label.
- **CSS:** the row-variant price rule uses `--ds-t-20`; no `ellipsis`.
- **Keep green:** `tests/chat-hierarchy-31a.test.js`, `tests/thread-edge-31d.test.js`, and every test mentioning `CandidatesCard`, `CandidateCard`, `HOME_SORT`, `onSort` or `ui-cand`. Update pins on the old dropdown, and name them.

Run only (**run it before you finish**):
```
cd web && node --test tests/list-tabs-31i.test.js tests/chat-hierarchy-31a.test.js tests/thread-edge-31d.test.js $(grep -lE "CandidatesCard|CandidateCard|HOME_SORT|onSort|ui-cand" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
The map (`chatmap.jsx`, `StageArea`, map CSS), `landing-page.jsx`, `src/engine/**`, `src/i18n/**`, `src/consult/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Then the new Korean strings, and the test files you updated. Nothing else.
