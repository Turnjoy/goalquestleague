# GoalQuest deployment

The website is a Vite application hosted on Cloudflare Pages. Supabase provides authentication and database access directly to the frontend. The screenshot-processing Node service has been removed.

## Cloudflare Pages

- Framework preset: Vite
- Build command: `npm run build`
- Build output: `dist`
- Production variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

## Local development

Copy `.env.example` to `.env`, set the public Supabase URL and anon key, then run `npm run dev`. Use `npm test` and `npm run build` for repository checks.

## Database migration

Before deploying the club-assignment feature, run `supabase-migrations/20261103_seed_league_clubs_and_season_assignments.sql` in the Supabase SQL Editor. It seeds the permanent Apex Premier and Diamond Elite clubs, adds season-by-season player assignments, and installs the assignment and club-fixture RPCs. Existing profile data and previous fixtures are preserved.
