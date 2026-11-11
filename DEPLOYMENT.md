# GoalQuest deployment

The website is a Vite application hosted on Cloudflare Pages. Supabase provides authentication and database access directly to the frontend. The screenshot-processing Node service has been removed.

## Cloudflare Pages

- Framework preset: Vite
- Build command: `npm run build`
- Build output: `dist`
- Production variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

## Local development

Copy `.env.example` to `.env`, set the public Supabase URL and anon key, then run `npm run dev`. Use `npm test` and `npm run build` for repository checks.

## Docker

Build the production image with the public Supabase settings used by the frontend:

```sh
docker build \
  --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=your_supabase_anon_key \
  -t goalquest-league .
```

Run it with `docker run --rm -p 8080:80 goalquest-league` and open `http://localhost:8080`. These `VITE_` values are included in the client-side build and must not contain service-role keys or other secrets.

## Database migration

Before deploying the club-assignment and notification features, run `supabase-migrations/20261103_seed_league_clubs_and_season_assignments.sql`, `supabase-migrations/20261104_save_season_club_assignments.sql`, `supabase-migrations/20261105_backfill_active_player_standings.sql`, `supabase-migrations/20261106_allow_cross_tier_club_assignments.sql`, `supabase-migrations/20261107_fix_team_name_validation.sql`, `supabase-migrations/20261107_preserve_club_fixtures_on_reassignment.sql`, `supabase-migrations/20261110_recalculate_club_standings_and_limit_form.sql`, `supabase-migrations/20261110_reliable_club_assignment_refresh.sql`, and `supabase-migrations/20261111_persistent_player_notifications.sql` in the Supabase SQL Editor, in order. The team-name validation migration requires `club_name_blacklist` to have been created and populated by the squad-system migrations. These migrations seed the permanent Apex Premier and Diamond Elite clubs, add season-by-season player assignments, and install the assignment and club-fixture RPCs. The follow-up migrations enable the Save Assignments button, sync the assigned club name to standings, backfill the current-season standings for all active, approved players, allow assignment across league divisions without blocking saves when scores or disputes exist, permit custom team names without revalidating unchanged names during unrelated profile updates, preserve fixtures when assigned players change, refresh standings and team names when assignments change, and notify authorized clients to refetch assignment-dependent data. The latest migration adds private persistent notifications for active players in affected leagues when a club manager changes or a season fixture calendar is successfully generated, plus owner-only notification read/mark-as-read access. These migrations also restrict score submission to admins while retaining player score confirmation and disputes through RPCs. Existing fixture dates, matchweeks, statuses, and recorded scores remain intact.
