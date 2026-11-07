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

Before deploying the club-assignment feature, run `supabase-migrations/20261103_seed_league_clubs_and_season_assignments.sql`, `supabase-migrations/20261104_save_season_club_assignments.sql`, `supabase-migrations/20261105_backfill_active_player_standings.sql`, `supabase-migrations/20261106_allow_cross_tier_club_assignments.sql`, `supabase-migrations/20261107_fix_team_name_validation.sql`, and then `supabase-migrations/20261107_preserve_club_fixtures_on_reassignment.sql` in the Supabase SQL Editor, in order. The team-name validation migration requires `club_name_blacklist` to have been created and populated by the squad-system migrations. These migrations seed the permanent Apex Premier and Diamond Elite clubs, add season-by-season player assignments, and install the assignment and club-fixture RPCs. The follow-up migrations enable the Save Assignments button, sync the assigned club name to standings, backfill the current-season standings for all active, approved players, allow assignment across league divisions without blocking saves when scores or disputes exist, permit custom team names without revalidating unchanged names during unrelated profile updates, preserve fixtures when assigned players change, and restrict score submission to admins while retaining player score confirmation and disputes through RPCs. Existing fixture dates, matchweeks, statuses, and recorded scores remain intact.
