# Stage 18f — Chat map: real subway tracks, no overlapping tags (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Small change. First edit within 4 tool calls.

The orchestrator walked 18e on the laptop GPU (2026-10-30 15:00). The map now shows the workplace pin, numbered candidate pins, price tags and commute legs with minutes ("10.4분", "12.3분"). The result card, scrolling and the one commute number all work. Three things are left:

1. **Subway lines are a tangle of long straight lines across the whole map.** `buildChatMap` (`web/src/chatmap.js:200`) joins `line.stops` in array order. In `data/build/region/network.json` that order is alphabetical (가천대, 강남구청, …), not route order.
   - Draw each line from its `patterns[].geometry`, the real track polyline (`meta.edge_methods.geometry` = 678 edges). If a pattern has no geometry, fall back to `patterns[].stops` order, never to `line.stops`.
   - Draw one pattern per direction (one is enough when both directions share a track).
   - Station dots stay from `stops`.
   - Test, on the real network shape: consecutive points of every drawn line are ≤ 3 km apart, and the total drawn length of a line is within 15 % of its pattern's `distance_km`.
2. **Price tags overlap.** Candidates 5 and 6 sit almost on the same spot, so "전세 1억 9,500만 원" covers "전세 1억 9,800만 원" and pin 5 is hidden under pin 6.
   - Add simple label placement: try right, left, above, below; if all collide, offset with a short leader line.
   - Pins that are closer than 18 px fan out slightly around their true point, with a thin line back to it.
   - Test: no two tag boxes intersect for the `single-firstjob` candidates at 1440×900 and 390×844.
3. A card reads "판교까지 약 12.3분 (걷기 3.8분 · 지하철 8.5분) · 추정 (살아 보기 전) ● 추정". "추정" appears twice. Keep the single "추정 (살아 보기 전)".

End: `cd web && npm test 2>&1 | tail -6` and `npx vite build 2>&1 | tail -2`. Append an "18f" section to `briefs/18-RESULT.md`. Commit `18f: real subway tracks, non-overlapping tags, one 추정`.
