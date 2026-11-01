# GoalQuest deployment

The website is a Vite application hosted on Cloudflare Pages. Supabase provides authentication and database access directly to the frontend. The screenshot-processing Node service has been removed.

## Cloudflare Pages

- Framework preset: Vite
- Build command: `npm run build`
- Build output: `dist`
- Production variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

## Local development

Copy `.env.example` to `.env`, set the public Supabase URL and anon key, then run `npm run dev`. Use `npm test` and `npm run build` for repository checks.
