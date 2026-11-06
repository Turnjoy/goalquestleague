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

Before deploying the club-assignment feature, run `supabase-migrations/20261103_seed_league_clubs_and_season_assignments.sql`, `supabase-migrations/20261104_save_season_club_assignments.sql`, and then `supabase-migrations/20261105_backfill_active_player_standings.sql` in the Supabase SQL Editor, in order. They seed the permanent Apex Premier and Diamond Elite clubs, add season-by-season player assignments, and install the assignment and club-fixture RPCs. The follow-up migration enables the Save Assignments button, syncs the assigned club name to standings, and backfills the current-season standings for all active, approved players. Existing profile data and previous fixtures are preserved.
