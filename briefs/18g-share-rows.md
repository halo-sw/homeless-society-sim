# Stage 18g — Two wrong share-card rows on a custom run (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Two small edits plus tests. Do not explore; the causes are below. Run only the named test files.

The orchestrator captured 18f on the laptop GPU (2026-10-30 15:05). Flow: 1인 example → 천사의도시Ⅱ오피스텔 + 시그마 3 → 30일 → A 3D → A·B 비교 → 결과 공유. Everything matched except two rows of the share card:
- "하루 출퇴근 시간 16분 / 21분", while the result card says "출퇴근 편도 11분 / 14분".
- "걸어서 10분 안 편의시설 수 0곳 / 0곳 (장보기 0 · 병원 0 · 역 0)", although 천사의도시Ⅱ is a 3.8-minute walk from 미금역.

## 1. `compare.one_way` is missing on the sim screen
`web/src/main.js:2770-2776` (`paintCompare`, custom-run branch):
```js
    if (customRecord) {
      const labs = (customRecord.labels || []).slice(0, 2);
      if (labs.length === 2 && customRecord.runs[labs[0]] && customRecord.runs[labs[1]]) {
        store.set({ compareLoading: false,
          compare: compareRuns(customRecord.runs[labs[0]], customRecord.runs[labs[1]]) });
        return;
      }
    }
```
The chat sets `compare.one_way = oneWayByLabel(...)` (`chat.jsx:1142`). This branch does not, so `share.js:101-114` falls back to the old per-day row.

Change: build the compare, then set `cmp.one_way = oneWayByLabel(Object.fromEntries(labs.map((l) => [l, customRecord.runs[l]])))` (import from `./verify/numbers.js`). Do the same in the file/demo branch below it when both runs are loaded, so the demo shows the same row.

## 2. Convenience counts are zeros instead of "unknown"
In `web/src/money/quality.js:80-85`, `qualityCard` resolves the home with `resolveHome(area, { ...home, complex_name: run.meta.complex }, router)`. That passes no lon/lat, so a coordinate-anchored home (officetels, `run.meta.home_anchor.method !== "complex"`) throws and `resolved` becomes `null`. Then `:106-107` returns `{ grocery: 0, park: 0, clinic: 0, station: 0, … }`.

Change:
- When `run.meta.home_node` is set and the router knows it, use `resolved = { nodeId: run.meta.home_node }` first. Otherwise call `resolveHome` as today.
- When it is still unresolved, set `convenience: null`, not zeros.
- In `share.js:225-238` (`convText`), a `null` `qol_convenience` shows "아직 계산하지 못했어요" with no "장보기 0 …" note. Check that the other readers of `qol_convenience` (grep `qol_convenience` in `web/src/ui/`) accept `null`.

## Tests
- `web/tests/share-18g.test.js`:
  - (a) a compare built the way `paintCompare` builds it for a custom record carries `one_way` equal to `oneWayByLabel`, and `shareRows` then labels the row "출퇴근 편도 (문 앞→회사)";
  - (b) `qualityCard` on a run with `meta.home_node` set and `meta.complex` absent from `area.complexes` returns non-null convenience, with the counts from that node;
  - (c) an unresolvable home gives `convenience: null`, and the share row reads "아직 계산하지 못했어요".
- Run `node --test web/tests/share-18g.test.js web/tests/share.test.js web/tests/share-load.test.js 2>&1 | tail -15`.

Commit `18g: one_way on the sim compare, convenience from the run's home node`. Then stop. The orchestrator runs the full suite and writes the notes.
