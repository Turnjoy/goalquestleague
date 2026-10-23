# Squad screenshot processing

The registration UI keeps its existing `/api/extract-squad` request and response contract. The browser sends up to 30 inventory screenshots and one tactical screenshot to the Node.js API, with the signed-in user's Supabase access token. The API validates image format, dimensions, and byte limits, then prepares images in memory.

Gemini extracts inventory cards in two initial batches of at most 15 images. Successful work is retained; recoverable failures are split into groups of at most 8, and eligible failures may use the configured fallback model. The tactical screenshot is sent in a separate matching request with the candidate names and card evidence. Names are accepted only from the returned candidate set. Unmatched and ambiguous players are returned for review. No OCR or perceptual hash is used as the player identity source.

Images are not written to Render's local disk or persisted to Supabase Storage. Gemini credentials stay in the Node server environment. Configure the variables and Render/Cloudflare deployment as described in [DEPLOYMENT.md](./DEPLOYMENT.md). Mock tests do not verify live model availability, credentials, or quota.

For local development, set `.env` values and run `npm run dev:all`. The Vite `/api` proxy sends requests to the local Node server. The health endpoint is `GET /api/health`.
