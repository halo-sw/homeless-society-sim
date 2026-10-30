# Stage 26y — Muse's find_homes finds the Menlo Park homes (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (public site and dev, 2026-10-31)
English, Muse connected: "I work at Meta HQ in Menlo Park, renting alone, up to $5,000 a month". This is the example that the README "Judge in 2 minutes" tells judges to click.

- **`extract_profile` is right:** Meta HQ resolved to the place, region `us-menlo`, currency USD, `monthlyMax` 5000.
- **`find_homes` returns 3 Seoul homes** (선일빌딩 in Songpa and others, "monthly rent ₩132.3M/0 won"), shown next to the Meta HQ pin.
  - `profile_used` in the tool result is the correct USD profile.
  - Muse then told the user "Menlo Park is still being prepared… all areas are in Seoul". That is false.
- **Cause:**
  - the server's `loadHomes` (`src/consult/server.js` ~195) reads only `data/homes-index.json`, the Korean index;
  - the browser rule flow loads per-region files `data/homes/<id>.json` (`HOMES_REGION_URL`, `src/chat/engine.js:25`), including `us-menlo`;
  - the browser also limits a USD search to `us-menlo` (`src/ui/chat.jsx` ~1326);
  - the server tool has neither. When the relay is down, the rule flow finds the 6 Coleman Avenue homes correctly.

## Change
1. **`src/consult/server.js`:** add `loadUsHomes()`.
   - It reads `read("data", "homes/us-menlo.json")` once (cached) and returns `doc.homes` (or `[]` if the file is missing).
   - Pass it to the tools next to `loadHomes`.
   - The relay uses the same `readText` HTTP reader, so no relay change should be needed. Check `relay/handler.js` passes nothing that blocks a new `data/homes/...` path.
2. **`src/consult/tools-search.js` `find_homes` (and `find_public_rentals` if it has the same issue):**
   - When the merged profile is US — `currency.value === "USD"`, a workplace resolved with `region` starting `us-`, or `args.regions` naming `us-menlo` — search **only** the US homes, with `regions: ["us-menlo"]` or the equivalent the browser uses.
   - Otherwise search the Korean index as today, and never return a US home for a KRW profile.
   - Keep the same `findHomesCore` call. It already handles USD homes (26c–26e): place commute by bike/walk, Zillow ZIP estimate.
3. **Honest empty result:** if the profile is US and the US file is missing or empty, `find_homes` fails with a clear message ("US homes are not available on this server"). It must not fall back to Korean homes.

## Test — `web/tests/server-us-homes-26y.test.js`
Build the tool session the way the existing server/tool tests do (find one that calls `find_homes` with a fake `loadHomes`). Provide a fake Korean index with 2 Seoul homes, and a fake US list with 2 homes copied in shape from `data/homes/us-menlo.json`. Read 1–2 entries from the real file if it is present under `web/public/data/homes/`; otherwise write the minimal shape `findHomesCore` needs for a USD home.
- A USD Meta HQ profile, from the real `extract_profile` on the sentence above → every candidate has `currency === "USD"` (or the US marker the code uses), and no candidate has a Korean `region`.
- A KRW Pangyo profile → no USD candidate.
- A USD profile with `loadUsHomes` returning `[]` → `ok === false` with the message above.
- `createConsultHandler` with a `readText` stub: `homes/us-menlo.json` is requested only when a US search happens.
- Keep green: every `tests/us-26*`, `tests/consult*`, `tests/server*`, `tests/search*`, `tests/relay*` file and `tests/english-profile-26x.test.js`.

Run only:
```
cd web && node --test tests/server-us-homes-26y.test.js tests/english-profile-26x.test.js $(ls tests | grep -E '^(us-26|consult|server|search|relay)' | grep -v 26y | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**`, `src/ui/**`, `pipeline/**`, `data/`, `README*`. Do not change `findHomesCore` scoring or sorting.

## Final message
Changed files, one line each. Nothing else.
