# Squad screenshot processing

The registration UI keeps its existing `/api/extract-squad` request and response contract. The browser sends up to 30 inventory screenshots and one tactical screenshot to the Node.js API, with the signed-in user's Supabase access token. The API validates image format, dimensions, and byte limits, then prepares images in memory.

The primary Gemini vision flow is attempted first. If it fails, or if no Gemini API key is configured, the server falls back to local Tesseract OCR and Sharp-based image processing. The local path reads names and card details from inventory screenshots, detects pitch cards from image pixels and OCR anchors, and cross-references pitch-card and inventory-card visual hashes. Unmatched and ambiguous players are returned for review; local matching does not make additional Gemini requests.

Images are not written to Render's local disk or persisted to Supabase Storage. Gemini credentials stay in the Node server environment. If Gemini is unavailable, the local pipeline returns the same response fields expected by the registration page, with uncertain matches marked for review. Configure the variables and Render/Cloudflare deployment as described in [DEPLOYMENT.md](./DEPLOYMENT.md). Mock tests do not verify live model availability, credentials, or quota.

For local development, set `.env` values and run `npm run dev:all`. The Vite `/api` proxy sends requests to the local Node server. The health endpoint is `GET /api/health`.
