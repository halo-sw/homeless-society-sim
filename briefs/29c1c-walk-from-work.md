# Stage 29c1c — Dark-walk line when the whole commute is on foot (brief for Muse)

Agent mode, rules in `AGENTS.md`. Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Stop when the named test passes.

## Why
On the real run `data/build/sim/demo-two-homes-B.json` the household walks the whole way from work: the home trips come `from: { id: "workplace:h1", kind: "poi", label: "직장 (가정: 판교역 인근)" }`. `lifeEventLines` in `web/src/engine/life-events.js` then prints `B 32번 · 직장 (가정: 판교역 인근)역에서 평균 17분(1.3km)`.

## Change — `web/src/engine/life-events.js` and `web/src/i18n/en.js`
- When the most common `from.id` starts with `workplace:`, the side reads `B 32번 · 직장에서 걸어서 평균 17분(1.3km)` (no station name, no `역`). Keep the `from` field on the row but add `fromKind: "work"` vs `"station"`.
- English pattern for that side: `B 32 times · avg 17 min (1.3 km) walking from work`.

## Test — append to `web/tests/life-events-29c1.test.js`
Synthetic B with home trips `from: { id: "workplace:h1", label: "직장 (가정: 판교역 인근)" }` → line contains `직장에서 걸어서 평균` and not `가정: 판교역 인근)역`.

Run only:
```
cd web && node --test tests/life-events-29c1.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -8
```

## Final message
Changed files, one line each. Nothing else.
