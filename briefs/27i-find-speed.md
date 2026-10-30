# Stage 27i — find_homes in ~1 s instead of 14–31 s (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section: no git, no full suite, no build, no exploring). Branch `chat-27`. First edit within 3 tool calls. Read only the line ranges quoted here (use `grep -n` when numbers moved). When the named tests pass, stop.

## Why
On the live relay (Vercel, Seoul) the first chat turn takes 42–50 s and `find_homes` alone 31–37 s, close to the relay's 60 s limit. Locally the same tool takes 14.5 s. Downloads are ~2 s; the rest is CPU. A CPU profile of one `find_homes` call ("판교로 출근해요. 전세 2억 이하로 혼자 살 집 찾아 줘", 2,928 matching homes):

| self time | function |
|---|---|
| 4.1 s + 0.9 s + 0.9 s | `findPath` (`web/src/engine/journey.js:49`) and the `normalizeStation` / sort calls inside it |
| 3.2 s + 0.7 s | `groupMedianFor` / `thinDealNote` (`web/src/homes.js:96-121`) |
| 0.8 s + 0.4 s | `photosNear` / `haversineM` (`web/src/places/photos.js`) |

Causes, all in the per-home loop of `find_homes` (`web/src/homes.js:527-660`):
- `commuteSummary` (`homes.js:193`) calls `findPath(network, walk.station, dest, 2.0)` for every home. `findPath` rebuilds the stop map, the adjacency lists and the transfer edges from scratch each call, although there are only a few dozen distinct (station, destination) pairs.
- `thinDealNote` → `groupMedianFor` scans **all** index homes for every home with a single deal (O(n²)).
- `photosNear(...)` runs for every matching row, but only the `limit` rows that are returned are ever shown.

Results must stay identical (same rows, same order, same numbers) — this is a speed change only.

## Changes

### 1. `findPath` memo — `web/src/engine/journey.js`
- Split the graph build (stops map, `adj`, transfer edges, sorted lists, `byKey`) into `buildPathGraph(network, penaltyKm)`; cache it in a module-level `WeakMap` keyed by `network` → `Map(penaltyKm → graph)`.
- Cache results per graph: `Map(\`${normalizeStation(from)}>${normalizeStation(to)}\` → result)`. Return the cached object (callers only read it; if any caller mutates the result, return a structured clone instead — check with `grep -n "findPath(" web/src -r`).
- Same output as today for every input, including `null` when no start/goal stop exists.

### 2. Group medians once — `web/src/homes.js`
- Add `groupMedianIndex(homes)` → memoized per `homes` array (module `WeakMap`): one pass that collects medians into `Map(\`${kind}|${region}|${centerM2}|${tenureKey}\` → sorted array)` with the same filters as `groupMedianFor` (skip public rental homes, `median_won` finite and > 0; `wolse` reads `b.wolse.monthly`), then stores the median per key with the same even/odd rule.
- `groupMedianFor(args, homes)` returns `groupMedianIndex(homes).get(key) ?? null`. Keep its signature and export.

### 3. Photos only for returned rows — `web/src/homes.js` `find_homes`
- Build rows with `photos: []` placeholder; after `sortResults(...)` and the `limit` slice that produces the returned list (find where the returned `homes`/`candidates` array is cut to `limit`), fill `photos` with `photosNear(home.lon, home.lat, manifest, { limit: 6 })` for those rows only (when `manifest`). The returned objects must be the same as today.

## Tests — new `web/tests/find-speed-27i.test.js`
- `findPath` on the real network if `data/build/region/network.json` exists (skip otherwise, same pattern as `web/tests/engine-workplace.test.js:259-276`): call it twice for (`미금`, `판교`) and `assert.equal(a, b)` (same cached object), check `a.distanceKm > 0`, and a second network object (`structuredClone`) gives a deep-equal result.
- `groupMedianFor` on a small hand-made `homes` list (3–5 homes, two regions, one public rental `"…(임대)"` name that must be skipped, odd and even counts) returns the hand-computed medians; mutating nothing, calling twice gives the same values.
- `find_homes` on a hand-made index with 8 homes and a fake `photos` manifest (or reuse an existing find_homes fixture: `grep -ln "find_homes(" web/tests/*.test.js`): with `limit: 3`, the 3 returned rows carry photos and the result's other fields are unchanged versus `limit: 8`'s first 3 rows.
- Timing guard (only when real `data/build` exists): `find_homes` over the real `homes-index.json` with the 판교 profile from `web/tests/agent-profile-27b3.test.js` finishes in under 3000 ms.

Run only:
```
cd web && node --test tests/find-speed-27i.test.js tests/agent-profile-27b3.test.js tests/engine-workplace.test.js tests/landing-chat-12b.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
