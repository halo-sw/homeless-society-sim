# Stage 29c1b — Life events that say something on real runs (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here. Stop when the named tests pass.

## Why
The orchestrator ran 29c1's `lifeEvents` (`web/src/engine/life-events.js`) on the real 30-day runs in `data/build/sim/*-A.json` / `*-B.json`:
```
demo-two-homes            (no rows)
persona-dual-income-child 앉아서 간 출근: A 0/44일 · B 0/0일 (실측 혼잡도 34% 이하)
persona-newlywed-couple   앉아서 간 출근: A 0/44일 · B 0/0일 (실측 혼잡도 34% 이하)
persona-single-firstjob   앉아서 간 출근: A 0/22일 · B 0/0일 (실측 혼잡도 34% 이하)
```
Facts from those runs:
- Morning boarding congestion is 63–93 % (measured, 서울교통공사), so 0 seated days is true. But home B (Bundang, 신분당선) has **no measured legs at all** and prints `0/0일` — that reads like "never got a seat".
- The household never arrives home after 22:00 (latest home arrival 20:54–21:11), so `late_home` is always empty.
- Every home arrival is a walking trip `{ from: { kind: "poi", label: "잠실" }, to: { kind: "home" }, purpose: "commute", arrive_min, minutes, distance_m }`; e.g. A: 12 min / 923 m from 잠실 station, B: 17 min / 1,299 m from 판교. Runs carry `meta.start_date` (`"2026-11-02"`) and `meta.area` (`"songpa-jamsil"`, US runs `"us-menlo"`).
- In November it is dark by ~17:25 in Seoul, so almost every walk home from work is after dark. That walk — how long, how far, how often — is the thing you only learn by living there.

## Change — `web/src/engine/life-events.js` (+ its lines and the English patterns)
1. **seated**: when a home has `measured === 0`, keep the row if the other home has measured days, and print that side as `혼잡도 자료 없음` instead of `0/0일`. Line: `앉아서 간 출근: A 0/44일 · B 혼잡도 자료 없음 (실측 34% 이하일 때)`.
2. **New `dark_walk` row** (replaces `late_home` as the always-shown walk row; keep `late_home` but only emit it when a side has `count > 0`):
   - Sunset table (minutes after midnight, mid-month, local time): Seoul `[1060, 1090, 1115, 1140, 1165, 1190, 1195, 1170, 1130, 1085, 1045, 1035]` (Jan…Dec; 한국천문연구원 일몰 시각 근사), Menlo Park `[1035, 1065, 1150, 1170, 1195, 1215, 1215, 1190, 1150, 1105, 1020, 1010]`. Month from `run.meta.start_date` (default 11 when missing); table by `run.meta.area` starting with `us-` → Menlo Park, else Seoul. Export `sunsetMinFor(meta)`.
   - Per run: household trips with `to.kind === "home"`, `purpose === "commute"`, `arrive_min >= sunset` (use `arrive_min` when present, else `depart_min + minutes`). `count`, `avgMin` (rounded mean of `minutes`), `avgM` (rounded mean `distance_m`, to 10 m), `from` = the most common `from.label`.
   - Row `{ kind: "dark_walk", sunset: "17:25", a: { count, avgMin, avgM, from }, b: {…}, source: "기록 · 해 지는 시각 가정", evidence: { a: { type: "trip", id }, b: … } }`. Omit only when both counts are 0.
   - Line: `해 진 뒤 걸어서 퇴근: A 44번 · 잠실역에서 평균 12분(920m) · B 44번 · 판교역에서 평균 17분(1.3km) · 해 지는 시각 17:25 기준`. Distance under 1,000 m as `920m`, else one decimal `1.3km`. Append `역` to `from` only when it does not already end in `역`.
3. Row order in the card: `dark_walk`, `seated`, `late_home`.
4. English patterns in `web/src/i18n/en.js` for both new line shapes: `Walked home from work after dark: A 44 times · avg 12 min (920 m) from Jamsil Station · B 44 times · avg 17 min (1.3 km) from Pangyo Station · sunset 17:25`, and seated with `no crowding data` for `혼잡도 자료 없음` (`Got a seat on the way to work: A 0/44 days · B no crowding data (measured ≤ 34%)`). Station names go through the existing station-name translation (romanized as elsewhere).

## Test — update `web/tests/life-events-29c1.test.js`
- `sunsetMinFor({ start_date: "2026-11-02", area: "songpa-jamsil" }) === 1045`; `{ start_date: "2026-11-02", area: "us-menlo" }` → 1020; `{}` → 1045.
- Synthetic runs: A has 3 commute home trips arriving 18:00 (12 min, 923 m, from `잠실`), B 2 arriving 18:10 (17 min, 1299 m, from `판교`) and one arriving 16:00 → `dark_walk` counts 3 / 2; line contains `잠실역에서 평균 12분(920m)` and `판교역에서 평균 17분(1.3km)`.
- seated with B unmeasured → line contains `B 혼잡도 자료 없음`; no `0/0일` anywhere.
- `late_home` absent when both 0.
- Existing English pattern test updated for the new lines.

Run only:
```
cd web && node --test tests/life-events-29c1.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -8
```

## Do not touch
`chat.jsx` (it already renders whatever rows/lines come back), engine files other than `life-events.js`, recordings.

## Final message
Changed files, one line each. Nothing else.
