# Stage 19j — "1999999999999998181분 남음" (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Small. First edit within 3 tool calls. Commit, then stop.

## Bug
On a custom run, `?mode=sim&home=A&day=3&t=17:48&follow=1&custom=…` shows:
- now line: "장보기 중 · 천사의도시Ⅱ오피스텔 → GS25 (걸어서 0.19999999999998181분 남음)";
- hero: "1999999999999998181분 남음".

Causes:
- `web/src/nowcard.js:137` computes `remain = Math.max(0, trip.arrive_min - Math.floor(minute))`. Custom-run `arrive_min` is fractional, so `remain` is a float.
- `nowcard.js:203` does the same with `left = Math.max(0, away.end_min - m)`.
- `web/src/ui/app.jsx:378` reads the hero number with `/(\d+)분 남음/`, which picks up the digits after the decimal point.

## Fix
- In `nowcard.js`, use `Math.ceil` for `remain` and `left`, and also for `banner.minutesLeft` if it can be fractional.
  - `remain <= 0` and `left <= 0` keep their "곧 도착" path.
  - A value between 0 and 1 shows "1분 남음".
- In `app.jsx:378`, use `/(\d+(?:\.\d+)?)분 남음/` and `Math.ceil(Number(m[1]))`. Apply the same to the `(\d+)분 머묾` regex below it.
- Grep `web/src/nowcard.js` and `web/src/ui/app.jsx` for other `${…}분` built from `*_min` arithmetic without rounding, and round those too.

## Test — `web/tests/remain-19j.test.js`
- A nowcard for a trip with `depart_min: 1060.4`, `arrive_min: 1068.2` at minute 1068: the now text contains "1분 남음" and matches no `/\d+\.\d+분/`.
- At minute 1063: "6분 남음".
- `heroBig`-equivalent: export the hero helper from `app.jsx` if needed. For `now: "… (걸어서 0.2분 남음)"`, it returns "1분 남음".

Run:
```
cd web && node --test tests/remain-19j.test.js tests/nowcard*.test.js 2>&1 | tail -8
```

Commit `19j: minutes left are whole minutes (ceil), hero reads decimals safely`. Then stop.
