# Official education sources — adapter seam (stage 9a)

OSM gives school *locations* well and academies (학원) poorly. The
official rosters need API keys, so this stage ships the seam, not the
calls.

## Interface

`web/src/education-official.js`:

- `checkOfficialSource(source)` — validates `{id, needsKey,
  listSchools(), listAcademies()}`.
- `fixtureOfficialSource({id, schools, academies})` — serves
  caller-provided rows through the interface (no network, no key).
- `mergeOfficialEducation(osmView, rows, router, {homeNodeId,
  speed_mps})` — anchors coordinated rows to the walk graph (same
  ≤500 m reach rule as the engine) with graph minutes; rows without
  coordinates are listed as unplaced, never guessed.

Levels use the same vocabulary as `education.js`: `elementary` |
`middle` | `high` | `unknown`. Coordinates are WGS84 lon/lat or null.

## Future keyed sources

| Source | Data | Key |
|---|---|---|
| 학교알리미 | school info | needs key (later) |
| NEIS 학교·학원 정보 | schools + academies | needs key (later) |

A keyed source implements the same interface **server-side** (keys never
reach the browser, same rule as the consult server) and the views keep
working. Fixtures: `web/tests/fixtures/education-official-*.json`.

## What stays out of scope

School quality, test scores and 학군 rankings (AGENTS.md) — the
interface has no score, rank or verdict field, on purpose.
