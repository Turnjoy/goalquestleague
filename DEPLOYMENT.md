# GoalQuest deployment

The existing Vite website stays on Cloudflare Pages. Only the Node.js squad screenshot API (`server.js`) runs on Render. Supabase remains the database and authentication provider. The website continues to access Supabase directly for its existing features.

## Cloudflare Pages

- Framework preset: Vite
- Build command: `npm run build`
- Build output: `dist`
- Production variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optionally `VITE_VISION_API_URL` (or its `VITE_API_URL` compatibility alias) set to the Render service origin without a path. When neither API URL variable is set in production, the frontend falls back to `https://goalquestleague.onrender.com`.
- Do not add Gemini credentials to Cloudflare Pages or any `VITE_` variable.

For local development, leave `VITE_VISION_API_URL` empty; Vite proxies `/api` to `http://127.0.0.1:3001`.

## Render web service

Create a Web Service from this repository. Use the repository root as the root directory, `npm ci` as the build command, and `npm run server` as the start command. Select a Node runtime compatible with the package's `engines` (currently no native system OCR package is required by this API path; Sharp is installed from npm). Set the health check path to `/api/health`. Render supplies `PORT`; the server binds to `0.0.0.0`.

Set these Render environment variables:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-only Google Gemini credential |
| `GEMINI_PRIMARY_MODEL` | Image-capable Gemini model available to this API key/project |
| `GEMINI_FALLBACK_MODEL` | Optional independently available image-capable fallback model |
| `FRONTEND_ORIGIN` | Exact Cloudflare Pages production origin; comma-separated additional exact origins if needed |
| `SUPABASE_URL` | Existing Supabase project URL |
| `SUPABASE_ANON_KEY` | Existing public/anon key, used only to verify user sessions |
| `GEMINI_BATCH_SIZE` | Initial batch maximum, defaults to 15 and is capped at 15 |
| `GEMINI_SMALL_BATCH_SIZE` | Split batch maximum, defaults to 8 and is capped at 8 |
| `GEMINI_RETRY_LIMIT` | Attempts per temporary failure, defaults to 2 |
| `GEMINI_MAX_CALLS` | Total provider-call ceiling, defaults to 24 |
| `GEMINI_PROCESSING_TIMEOUT_MS` | Pipeline time budget, defaults to 260000 ms |

`GEMINI_MODEL` remains accepted as a compatibility alias for `GEMINI_PRIMARY_MODEL`. Do not choose model identifiers by guess; configure models listed as image capable and available to the project's selected Gemini API. A fallback model does not imply separate quota. No service-role key is required or accepted by this feature.

The health endpoint is `GET /api/health`. The screenshot endpoint is `POST /api/extract-squad`; requests require the signed-in Supabase user's bearer token. Uploaded images are validated and processed in memory and are not stored on Render's ephemeral disk.

## Processing and limitations

Inventory images are split into two initial batches (at most 15 each), extracted independently, and retained after success. Recoverable failures are split into batches of at most 8, with fallback model attempts only for eligible errors. Tactical matching runs separately using the tactical screenshot and structured inventory candidates. The response retains the registration page's `success`, `squad`, `players`, and `stats` fields. Unmatched/ambiguous records remain marked for review.

The endpoint is synchronous. The frontend request timeout is 320 seconds and the server's default pipeline budget is 260 seconds. Provider latency and the hosting proxy's request duration can still cause a timeout; if that happens, the browser reports an incomplete attempt and the user can retry. No durable job queue or screenshot persistence is configured. No live Gemini success is implied by mocked tests; verify model access and quota with the deployment's own credentials.

## Local run and checks

Copy `.env.example` to `.env`, set Supabase and Gemini values, then run `npm run dev:all`. Use `npm test` and `npm run build` for repository checks.
