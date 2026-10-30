# Stage 19i — "3D로 보기" opens the moment it sits next to (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Small. First edit within 3 tool calls. Commit, then stop.

## Bug
On the result card, the row "3일차 17:48 (A) 장보기 A 7번 vs B 3번 · 3D로 보기 →" opened `?mode=sim&home=A&day=1&t=07:49&follow=1&custom=…`, which is day 1 07:49, not day 3 17:48.

The cause is two pieces of code:
- **`chat.jsx:1160-1161`** keeps only `{ home, when_ko, text_ko }` from `pickMoments`:
  ```js
  momentTexts = pickMoments(runs[labels[0]], runs[labels[1]], { max: 3 })
    .map((m) => ({ home: m.home, when_ko: m.when_ko, text_ko: m.text_ko }));
  ```
- **`chat.jsx:529`** then links each row to `moments.find((m) => m.label === t.home)`. That is the per-home *first outing* (`firstMomentOfRun`, `chat.jsx:777-783`), not this moment.

## Fix
1. Keep `day`, `minute` and `agent` in `momentTexts` (`engine/moments.js` moments carry `day`, `minute`, `agent`; `when_ko` is built by `whenKo(day, minute)` at `moments.js:32`). Check `dayLabel` to see whether `day` is 0- or 1-based. `simMomentUrl` wants the 1-based day shown to the customer ("3일차" → `day=3`).
2. In the row, build the URL from the moment itself:
   ```js
   simMomentUrl({ custom, scenario, home: t.home, day: <1-based day>, t: hhmm(t.minute), follow: <1-based index of t.agent among that run's household agents, else 1> })
   ```
   Fall back to the old `moments.find(...)` only when `t.day` / `t.minute` are missing (older recorded payloads).
3. The demo (file) path builds `momentTexts` too. Grep `pickMoments(` in `web/src/ui/` and apply the same change there.

## Test — `web/tests/moment-links-19i.test.js`
- A pure helper `momentRowUrl(t, { custom, scenario, runs })` (export it from `chat.jsx`):
  - `{ home: "A", day: <the day that renders "3일차">, minute: 1068, agent: "h1" }` → URL with `home=A`, `day=3`, `t=17%3A48` (or `t=17:48`, whichever `URLSearchParams` gives), `follow=1`;
  - missing `day` → falls back to the first-outing moment.
- Run `node --test tests/moment-links-19i.test.js tests/result-table-19d.test.js tests/chat-render-18c.test.js 2>&1 | tail -8`.

Commit `19i: result-card 3D links open their own moment (day, time, person)`. Then stop.
