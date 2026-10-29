# Stage 13e3 — The centre stage fell below the thread (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents. Do not explore.** The first edit should land within 5 tool calls.

## 1. Stage and drawer must sit beside the thread
- GPU measurement after `990df93` (13e2 item 1), at 1440×900:
  - `.ui-chat-thread` 0,48 440×852 (good)
  - `.ui-chat-stage` 0,900 **1440×0**
  - `.ui-orb` 1440×0
  - `.ui-chat-drawer` 0,900 0×852
- The centre is blank white.
- Cause: the new rule in `web/src/ui/ui.css` (13e2-1 block, around line 553) `.ui-chat [class*="astryx-layout-content"] > * { display: flex; flex-direction: column; … }` hits `.ui-chat-main`, which must be a **row** (thread 440 | stage flex 1 | drawer 0–360).
- Fix: in the same block, add `.ui-chat [class*="astryx-layout-content"] > .ui-chat-main { flex-direction: row; }`, or narrow the `> *` rule so it skips `.ui-chat-main`. Keep the thread's own scroll exactly as it is now; the GPU confirmed it works.
- Extend the CSS-text test: `.ui-chat-main` resolves to `flex-direction: row`.
- Commit `13e3: stage beside thread`.

## 2. Landing footer line is unreadable
- On the landing page, the line under the four example cards (regions list + "데이터 출처") is light grey on the blurred map: nearly invisible.
- Give it the same readable colour as the subtitle above the input (`.ui-landing-body p` uses `rgba(255,255,255,0.88)`), or put it on the same light chip as the cards.
- Commit `13e3: landing footer readable`.

## End
- Run `cd web && npx vite build 2>&1 | tail -3` and `cd web && npm test 2>&1 | tail -6`.
- Append a short "13e3" section to `briefs/13e-RESULT.md`.
- Commit.
