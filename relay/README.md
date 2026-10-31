# Ithaca relay (23a)

One Vercel serverless function so the static public site can use Muse
chat and the VWorld map tiles. Keys stay in the relay's own env, never
in the browser.

What it serves:

- `GET /api/tiles/...`, `GET /api/aerial/...` — VWorld tiles, streamed,
  never stored (`Cache-Control: no-store`), clipped to the simulated area.
- `POST /api/consult` — Muse chat over HTTP-read public data. Without
  the BYOK header only provider `"meta"` is allowed.
- `GET /api/model/status` — key presence as booleans only.

Env (names only, set on the deploy, never in code):

- `META_API_KEY` (`MODEL_API_KEY` also works), `VWORLD_KEY`, `HOUSING_API_KEY`
- `ALLOWED_ORIGINS` (comma list)
- `DATA_BASE_URL` (public data root)

Build with `node relay/build.mjs`, then deploy `relay/dist`.

Region: the function runs in Seoul (`icn1` in the written
`vercel.json`) because VWorld refuses requests from outside Korea.
The relay is deployed by the orchestrator with `vercel deploy --prod`
from `relay/dist`.

Limits (in memory, per instance): consult 20 per 10 min and 100 per day
per client, 600 per day overall; tiles 4000 per hour per client. Over a
limit the relay answers 429 with `Retry-After`.
