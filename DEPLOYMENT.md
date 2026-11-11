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

Before deploying, run the schema migrations in `supabase-migrations/` through `20261112_permanent_club_manager_model.sql` in order in the Supabase SQL Editor. The club-assignment base list is `20261103_seed_league_clubs_and_season_assignments.sql`, `20261104_save_season_club_assignments.sql`, `20261105_backfill_active_player_standings.sql`, `20261106_allow_cross_tier_club_assignments.sql`, `20261107_fix_team_name_validation.sql`, `20261107_preserve_club_fixtures_on_reassignment.sql`, `20261110_recalculate_club_standings_and_limit_form.sql`, `20261110_reliable_club_assignment_refresh.sql`, `20261111_persistent_player_notifications.sql`, and `20261112_permanent_club_manager_model.sql`; apply any earlier prerequisite schema and squad-system migrations first. The new manager model keeps account approval status separate from manager appointment: new managers are unassigned in Trial, and their current club is stored on the profile as `club_id`. Club standings are stored by `club_id`, so changing a manager does not transfer or reset the club's records. Trophy-award RPCs create idempotent club and active-manager cabinet records. Trophy JSON can be read with `GET /rest/v1/rpc/get_club_trophies?club_id_input=<uuid>` or `GET /rest/v1/rpc/get_manager_trophies?manager_id_input=<uuid>`; award trophies with the admin-only `admin_award_club_trophy` RPC. The project has no separate `/api` server, so these Supabase PostgREST RPC routes are its backend API. Notification persistence, read access, Broadcast authorization, and fixture/assignment behavior are described above. Existing completed fixtures and recorded scores remain intact.
