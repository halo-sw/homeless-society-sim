# Stage 27b3 — Muse never loses what the customer said; faster find_homes (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section: no git, no full suite, no build, no exploring). Branch `chat-27` (27a–27c2 are in). First edit within 3 tool calls. Read only the line ranges quoted here (use `grep -n` when numbers moved). When the named tests pass, stop.

## Why
Orchestrator ran the live agent (dev server, Muse Spark 1.3) with "판교로 출근하는 신입이에요. 전세 2억 이하로 혼자 살 집 찾아 줘" twice:
- Run 1: `extract_profile` resolved 판교, but the `profile` Muse passed to `find_homes` lost it. The candidates were 강동 빌라 with "판교까지 승차 시간 미확인", which is wrong for this customer.
- Run 2: Muse passed the full extract and the candidates were right (판교푸르지오월드마크, SG타워, 백현마을2단지 …).

So the tool must not depend on the model copying the profile. Also, `find_homes` took 16.5 s, most of it loading up to 12 box areas one by one (`boxesForHomes`, `web/src/consult/tools-search.js:115-127`). The turn took 29 s in total.

## Changes

### 1. One profile per conversation — `web/src/consult/tools-search.js`
- `extract_profile` (`tools-search.js:95-112`): when `args` carries no profile, use `session.context && session.context.profile` as `current`, so turns accumulate. After a successful extract, `session.lastProfile = r.profile`.
- Export `mergeProfiles(...profiles)`: field by field over `PROFILE_FIELDS`. A later profile's field wins only when its `value` is not `null` / `undefined` / empty array. Exception: `workplaces` from a later profile never replaces an earlier one that has a `resolved` entry unless the later one also has a `resolved` entry. Returns a profile with every field present (same empty-field shape as `profileFromArgs`, `tools-search.js:42-51`).
- `find_homes`, `find_public_rentals` and `build_scenario` (`tools-search.js:129`, `:170`, `:195`) use `mergeProfiles(session.context && session.context.profile, session.lastProfile, profileFromArgs(args))` instead of `profileFromArgs(args)`. Fail only when the merged profile has no value at all.
- `find_homes` returns `profile_used`: the merged profile, so the UI and Muse see the values the search actually used.

### 2. Faster find_homes — `tools-search.js:115-159`
- `boxesForHomes(session, homes, max)`: load at most `max` areas (pass `limit`, default 6, not 12), all at once with `Promise.all` (each wrapped so one failure leaves that box out, as today).
- Pass only the first `limit` prelim candidates to it.

### 3. The chat sends its profile — `web/src/ui/chat.jsx` `askAgent` (`grep -n "work_open: workOpen"`)
Add `profile: st.profile || null` to the context object. The server reads it as `session.context.profile` (27c2 put `context` on the session). `formatAgentContext` (`web/src/consult/agent.js:187`) prints nothing extra for it.

## Tests — new `web/tests/agent-profile-27b3.test.js`
- `mergeProfiles(extract, modelCopy)`: `extract.workplaces` resolved to 판교, `modelCopy.workplaces` `{ value: null }` → merged keeps 판교. `modelCopy.depositMax` 2억 overrides `extract.depositMax` null. A later `workplaces` with an unresolved entry does not replace a resolved one; a later resolved one does.
- `find_homes` through `callTool` with a session whose `lastProfile` has a resolved workplace and `args.profile` without workplaces: build a session the way existing find_homes tests do (`grep -ln "find_homes" web/tests/*.test.js`, reuse its fixture loaders). `profile_used.workplaces` is resolved. If no such fixture exists, test `mergeProfiles` only plus a unit test that `boxesForHomes` is called with at most `limit` homes (stub `session.loadArea` and count calls).
- `boxesForHomes` with 8 homes, `max` 6 and one `loadArea` that throws → 5 boxes, no throw.

Run only:
```
cd web && node --test tests/agent-profile-27b3.test.js tests/agent-stream-27b.test.js tests/neighborhood-27c2.test.js 2>&1 | tail -15
```
