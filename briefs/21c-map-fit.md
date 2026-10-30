# Stage 21c — Map: two regressions from 21b, and fit close (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17` (HEAD 6b8f284). Small. First edit within 4 tool calls. Commit, then stop.

## 1. Two older pins now fail. They are real regressions, so fix the code, not the pins.
- `tests/walk-19g.test.js:100`, "ChatMap draws no leader for one pin, leaders for a close pair": an **isolated** pill now gets a leader line. Only a pill that was moved by collision avoidance gets a leader.
- `tests/walk-19g.test.js:115`, "ChatMap names the 회사 pill but not the station": the 21b station names now label the **workplace station** too, so its name shows twice next to "회사 · 강남". Skip the station that the 회사 pill stands for. It keeps its dot.

## 2. Fit close
On the GPU, the six 강남역 candidates and the 회사 pill all lie within about 400 m, but the map shows about 5 km. The pills then crowd into one spot with long leaders.

Fix `fitMapView` (or the call in chatmap):
- Fit the bbox of the candidates plus the 회사 point with the existing insets.
- Allow zooming in until the bbox fills the view, with a minimum view width of about 1.2 km so a few streets and stations still show.
- Keep the current behaviour when the bbox is wider than the view.

## Tests — add to `web/tests/flow-21b.test.js`
- `fitMapView` for a 400 m bbox gives a view width between 1.0 and 1.6 km.
- For a 6 km bbox, the bbox is fully inside the view.

Run:
```
cd web && node --test tests/walk-19g.test.js tests/flow-21b.test.js tests/chatmap*.test.js 2>&1 | tail -8 && npx vite build 2>&1 | tail -2
```

Commit `21c: leaders only for moved pills, no duplicate workplace station name, map fits close candidates`. Then stop.
