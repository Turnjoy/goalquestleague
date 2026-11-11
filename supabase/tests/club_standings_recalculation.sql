begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  first_player_id uuid := gen_random_uuid();
  second_player_id uuid := gen_random_uuid();
  replacement_player_id uuid := gen_random_uuid();
  form_player_id uuid := gen_random_uuid();
  legacy_player_id uuid := gen_random_uuid();
  league_value text := 'Club standings test ' || gen_random_uuid()::text;
  other_league_value text := 'Other league ' || gen_random_uuid()::text;
  season_value integer := 2020;
  club_home uuid;
  club_away uuid;
  club_form uuid;
  club_empty uuid;
  first_fixture_id uuid;
  legacy_fixture_id uuid;
  pending_fixture_id uuid;
  fixture_snapshot jsonb;
  standing_row public.standings%rowtype;
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.standings'::regclass
      and c.conname = 'standings_league_division_season_player_id_key'
      and pg_catalog.pg_get_constraintdef(c.oid)
        = 'UNIQUE (league_name, division, season, player_id)'
  ) then
    raise exception 'League-scoped standings unique constraint is missing';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.season_club_assignments'::regclass
      and c.contype = 'u'
      and pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (season_year, player_id)'
  ) then
    raise exception 'Season assignments must remain limited to one club per player';
  end if;
  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.recalculate_club_standings(uuid,integer,uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.recalculate_fixture_standings_after_change()',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.recalculate_standings_for_division(text,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'API roles can execute an internal standings helper';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid in (
      'public.recalculate_standings_for_division(text,text,integer)'::regprocedure,
      'public.recalculate_club_standings(uuid,integer,uuid)'::regprocedure,
      'public.recalculate_fixture_standings_for_row(public.fixtures)'::regprocedure,
      'public.recalculate_fixture_standings_after_change()'::regprocedure,
      'public.recalculate_club_standings_after_assignment_change()'::regprocedure,
      'public.auto_create_player_standing()'::regprocedure,
      'public.dispute_fixture_score(uuid,text)'::regprocedure,
      'public.admin_save_season_club_assignments(text,text,integer,jsonb)'::regprocedure,
      'public.confirm_fixture_score(uuid)'::regprocedure,
      'public.admin_resolve_dispute(uuid,integer,integer,text)'::regprocedure,
      'public.admin_reassign_player_with_team(uuid,text,text,uuid)'::regprocedure,
      'public.admin_lift_ban(uuid,text)'::regprocedure
    )
      and (p.proconfig is null or not p.proconfig @> array['search_path=""'])
  ) then
    raise exception 'A SECURITY DEFINER standings helper does not pin an empty search_path';
  end if;
  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.admin_save_season_club_assignments(text,text,integer,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated users cannot execute the admin-checked assignment RPC';
  end if;

  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (admin_id, 'authenticated', 'authenticated', admin_id::text || '@club-standings.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Standings Admin","manager_handle":"standings-admin","custom_team_name":"Admin Test Team","whatsapp_number":"2348012345678"}', now(), now()),
    (first_player_id, 'authenticated', 'authenticated', first_player_id::text || '@club-standings.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"First Player","manager_handle":"first-player","custom_team_name":"First Test Team","whatsapp_number":"2348012345678"}', now(), now()),
    (second_player_id, 'authenticated', 'authenticated', second_player_id::text || '@club-standings.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Second Player","manager_handle":"second-player","custom_team_name":"Second Test Team","whatsapp_number":"2348012345678"}', now(), now()),
    (replacement_player_id, 'authenticated', 'authenticated', replacement_player_id::text || '@club-standings.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Replacement Player","manager_handle":"replacement-player","custom_team_name":"Replacement Test Team","whatsapp_number":"2348012345678"}', now(), now()),
    (form_player_id, 'authenticated', 'authenticated', form_player_id::text || '@club-standings.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Form Player","manager_handle":"form-player","custom_team_name":"Form Test Team","whatsapp_number":"2348012345678"}', now(), now()),
    (legacy_player_id, 'authenticated', 'authenticated', legacy_player_id::text || '@club-standings.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Legacy Player","manager_handle":"legacy-player","custom_team_name":"Legacy Test Team","whatsapp_number":"2348012345678"}', now(), now());

  insert into public.profiles (
    id, email, gamertag, league_name, division, is_admin, is_approved, status
  )
  values
    (admin_id, admin_id::text || '@club-standings.test', 'standings-admin', league_value, 'Test Tier', true, true, 'active'),
    (first_player_id, first_player_id::text || '@club-standings.test', 'first-player', league_value, 'Test Tier', false, true, 'active'),
    (second_player_id, second_player_id::text || '@club-standings.test', 'second-player', league_value, 'Test Tier', false, true, 'active'),
    (replacement_player_id, replacement_player_id::text || '@club-standings.test', 'replacement-player', league_value, 'Test Tier', false, true, 'active'),
    (form_player_id, form_player_id::text || '@club-standings.test', 'form-player', league_value, 'Test Tier', false, true, 'active'),
    (legacy_player_id, legacy_player_id::text || '@club-standings.test', 'legacy-player', league_value, 'Test Tier', false, true, 'active')
  on conflict (id) do update
  set league_name = excluded.league_name,
      division = excluded.division,
      is_admin = excluded.is_admin,
      is_approved = excluded.is_approved,
      status = excluded.status;

  insert into public.standings (
    division, league_name, season, player_id, player_name, team_name
  )
  values
    ('Test Tier', league_value, season_value, legacy_player_id, 'Legacy Player', 'Legacy Test Team'),
    ('Test Tier', other_league_value, season_value, legacy_player_id, 'Legacy Player', 'Legacy Test Team');

  insert into public.fixtures (
    division, league_name, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team,
    home_score, away_score, status, fixture_date, played_at
  )
  values
    ('Test Tier', league_value, season_value, 1, legacy_player_id, first_player_id, 'Legacy Test Team', 'First Test Team', 1, 0, 'completed', '2020-03-01', '2020-03-01'),
    ('Test Tier', other_league_value, season_value, 1, legacy_player_id, first_player_id, 'Legacy Test Team', 'First Test Team', 8, 0, 'completed', '2020-03-02', '2020-03-02'),
    ('Test Tier', league_value, season_value, 2, legacy_player_id, first_player_id, 'Legacy Test Team', 'First Test Team', 2, 1, 'completed', '2020-03-02', '2020-03-02'),
    ('Test Tier', league_value, season_value, 3, first_player_id, legacy_player_id, 'First Test Team', 'Legacy Test Team', 1, 1, 'completed', '2020-03-02', '2020-03-02'),
    ('Test Tier', league_value, season_value, 4, legacy_player_id, first_player_id, 'Legacy Test Team', 'First Test Team', 0, 1, 'completed', '2020-03-02', '2020-03-02'),
    ('Test Tier', league_value, season_value, 5, first_player_id, legacy_player_id, 'First Test Team', 'Legacy Test Team', 2, 0, 'completed', '2020-03-02', '2020-03-02');
  perform public.recalculate_standings_for_division('Test Tier', league_value, season_value);
  select * into standing_row from public.standings
  where player_id = legacy_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if (standing_row.played, standing_row.goals_for, standing_row.goals_against, standing_row.form)
     is distinct from (5, 4, 5, 'WWDLL') then
    raise exception 'Standings recalculation included fixtures from another league';
  end if;
  select * into standing_row from public.standings
  where player_id = legacy_player_id
    and division = 'Test Tier'
    and league_name = other_league_value
    and season = season_value;
  if (standing_row.played, standing_row.goals_for, standing_row.goals_against)
     is distinct from (1, 8, 0) then
    raise exception 'League-scoped standings identity mixed separate leagues';
  end if;

  insert into public.league_clubs (league_name, division, club_number, club_name)
  select
    league_value,
    'Test Tier',
    club_number,
    case club_number
      when 1 then 'Home test club'
      when 2 then 'Away test club'
      when 3 then 'Form test club'
      when 4 then 'Empty test club'
      else 'Test club ' || club_number::text
    end
  from generate_series(1, 20) as clubs(club_number);

  select id into club_home from public.league_clubs
  where league_name = league_value and division = 'Test Tier' and club_number = 1;
  select id into club_away from public.league_clubs
  where league_name = league_value and division = 'Test Tier' and club_number = 2;
  select id into club_form from public.league_clubs
  where league_name = league_value and division = 'Test Tier' and club_number = 3;
  select id into club_empty from public.league_clubs
  where league_name = league_value and division = 'Test Tier' and club_number = 4;

  insert into public.season_club_assignments (season_year, club_id, player_id)
  values
    (season_value, club_home, first_player_id),
    (season_value, club_away, second_player_id),
    (season_value, club_form, form_player_id),
    (season_value, club_empty, replacement_player_id);

  select * into standing_row
  from public.standings
  where player_id = replacement_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if (standing_row.played, standing_row.form, standing_row.team_name)
     is distinct from (0, '', 'Empty test club') then
    raise exception 'New assignment did not create an empty club standing';
  end if;

  insert into public.fixtures (
    division, league_name, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team,
    home_club_id, away_club_id, home_score, away_score, status, fixture_date, played_at
  )
  values (
    'Test Tier', league_value, season_value, 1,
    first_player_id, second_player_id, 'Home test club', 'Away test club',
    club_home, club_away, 2, 0, 'completed', '2020-01-01', '2020-01-01'
  )
  returning id into first_fixture_id;

  insert into public.fixtures (
    division, league_name, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team,
    home_club_id, away_club_id, home_score, away_score, status, fixture_date, played_at
  )
  values
    ('Test Tier', league_value, season_value, 2, second_player_id, first_player_id, 'Away test club', 'Home test club', club_away, club_home, 1, 3, 'completed', '2020-01-02', '2020-01-02'),
    ('Test Tier', league_value, season_value, 3, first_player_id, second_player_id, 'Home test club', 'Away test club', club_home, club_away, 1, 1, 'completed', '2020-01-03', '2020-01-03'),
    ('Test Tier', league_value, season_value, 4, first_player_id, second_player_id, 'Home test club', 'Away test club', club_home, club_away, 9, 0, 'scheduled', '2020-01-04', '2020-01-04'),
    ('Test Tier', league_value, season_value, 5, first_player_id, second_player_id, 'Home test club', 'Away test club', club_home, club_away, 9, 0, 'disputed', '2020-01-05', '2020-01-05'),
    ('Test Tier', league_value, season_value, 6, first_player_id, second_player_id, 'Home test club', 'Away test club', club_home, club_away, 9, 0, 'cancelled', '2020-01-06', '2020-01-06'),
    ('Test Tier', league_value, season_value, 7, first_player_id, second_player_id, 'Home test club', 'Away test club', club_home, club_away, null, null, 'completed', '2020-01-07', '2020-01-07');

  select * into standing_row
  from public.standings
  where player_id = replacement_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if standing_row.played <> 0 or coalesce(standing_row.form, 'not-empty') <> '' then
    raise exception 'Empty club should start with zero played and empty form';
  end if;

  perform public.recalculate_club_standings(club_home, season_value);
  perform public.recalculate_club_standings(club_away, season_value);
  select * into standing_row from public.standings
  where player_id = first_player_id and division = 'Test Tier' and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw, standing_row.lost,
      standing_row.goals_for, standing_row.goals_against, standing_row.form)
     is distinct from (3, 2, 1, 0, 6, 2, 'WWD') then
    raise exception 'Home/away club results or excluded fixture statuses were calculated incorrectly';
  end if;
  select * into standing_row from public.standings
  where player_id = second_player_id and division = 'Test Tier' and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw, standing_row.lost,
      standing_row.goals_for, standing_row.goals_against, standing_row.form)
     is distinct from (3, 0, 1, 2, 2, 6, 'LLD') then
    raise exception 'Away-side club results were calculated incorrectly';
  end if;

  insert into public.fixtures (
    division, league_name, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team, status, fixture_date
  )
  values (
    'Test Tier', league_value, season_value, 9,
    first_player_id, second_player_id, 'Legacy home', 'Legacy away',
    'scheduled', '2020-01-09'
  )
  returning id into legacy_fixture_id;

  update public.standings set penalty_points = 2
  where player_id = first_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.admin_save_season_club_assignments(
    league_value,
    'Test Tier',
    season_value,
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'club_id', c.id,
          'player_id',
          case c.club_number
            when 1 then replacement_player_id
            when 2 then second_player_id
            when 3 then form_player_id
            else null
          end
        )
        order by c.club_number
      )
      from public.league_clubs c
      where c.league_name = league_value and c.division = 'Test Tier'
    )
  );

  if not exists (
    select 1
    from public.fixtures f
    where f.id = first_fixture_id
      and f.home_player_id = first_player_id
      and f.away_player_id = second_player_id
      and f.home_club_id = club_home
      and f.away_club_id = club_away
  ) then
    raise exception 'Season reassignment rewrote a historical club fixture';
  end if;

  select * into standing_row from public.standings
  where player_id = first_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw, standing_row.lost,
      standing_row.goals_for, standing_row.goals_against, standing_row.form,
      standing_row.penalty_points, standing_row.team_name)
     is distinct from (0, 0, 0, 0, 0, 0, '', 2, 'First Test Team') then
    raise exception 'Transferred player stats were not cleared or penalty points changed';
  end if;
  select * into standing_row from public.standings
  where player_id = replacement_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw, standing_row.lost,
      standing_row.goals_for, standing_row.goals_against, standing_row.form)
     is distinct from (3, 2, 1, 0, 6, 2, 'WWD') then
    raise exception 'Newly assigned player did not inherit club season statistics';
  end if;

  perform public.admin_reassign_player_with_team(
    replacement_player_id,
    'Test Tier',
    'Replacement reassigned team',
    first_player_id
  );
  if not exists (
    select 1
    from public.fixtures f
    where f.id = legacy_fixture_id
      and f.home_player_id = replacement_player_id
      and f.home_club_id is null
  ) then
    raise exception 'Legacy individual fixture was not inherited during player reassignment';
  end if;
  if not exists (
    select 1
    from public.fixtures f
    where f.id = first_fixture_id
      and f.home_player_id = first_player_id
      and f.home_club_id = club_home
      and f.away_player_id = second_player_id
      and f.away_club_id = club_away
  ) then
    raise exception 'Player reassignment rewrote a club-backed fixture';
  end if;

  update public.standings set penalty_points = 7
  where player_id = replacement_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;

  update public.fixtures set home_score = 0, away_score = 5
  where id = first_fixture_id;
  select * into standing_row from public.standings
  where player_id = replacement_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw, standing_row.lost,
      standing_row.goals_for, standing_row.goals_against, standing_row.form,
      standing_row.penalty_points)
     is distinct from (3, 1, 1, 1, 4, 7, 'LWD', 7) then
    raise exception 'Direct completed-score correction did not recalculate home-club standings';
  end if;
  select * into standing_row from public.standings
  where player_id = second_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw, standing_row.lost,
      standing_row.goals_for, standing_row.goals_against, standing_row.form)
     is distinct from (3, 1, 1, 1, 7, 4, 'WLD') then
    raise exception 'Direct completed-score correction did not recalculate away-club standings';
  end if;

  update public.fixtures set status = 'pending_confirmation'
  where id = first_fixture_id;
  perform set_config('request.jwt.claim.sub', second_player_id::text, true);
  perform public.dispute_fixture_score(first_fixture_id, 'Test score dispute');
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.admin_resolve_dispute(first_fixture_id, 2, 1, 'Resolved test score');
  select * into standing_row from public.standings
  where player_id = replacement_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw, standing_row.lost,
      standing_row.goals_for, standing_row.goals_against, standing_row.form,
      standing_row.penalty_points)
     is distinct from (3, 2, 1, 0, 6, 3, 'WDW', 7) then
    raise exception 'Admin dispute resolution did not recalculate standings or preserve penalty points';
  end if;
  select * into standing_row from public.standings
  where player_id = second_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw, standing_row.lost,
      standing_row.goals_for, standing_row.goals_against, standing_row.form)
     is distinct from (3, 0, 1, 2, 3, 6, 'LDL') then
    raise exception 'Admin dispute resolution did not recalculate opponent standings';
  end if;

  insert into public.fixtures (
    division, league_name, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team,
    home_club_id, away_club_id, home_score, away_score, status, fixture_date
  )
  values (
    'Test Tier', league_value, season_value, 8,
    replacement_player_id, second_player_id, 'Home test club', 'Away test club',
    club_home, club_away, 1, 0, 'pending_confirmation', '2020-01-08'
  )
  returning id into pending_fixture_id;
  perform set_config('request.jwt.claim.sub', second_player_id::text, true);
  perform public.confirm_fixture_score(pending_fixture_id);
  select * into standing_row from public.standings
  where player_id = replacement_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if standing_row.played <> 4 then
    raise exception 'Confirming a fixture did not recalculate both clubs';
  end if;
  select * into standing_row from public.standings
  where player_id = second_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if standing_row.played <> 4 then
    raise exception 'Confirming a fixture did not recalculate the away club';
  end if;

  perform public.recalculate_club_standings(club_form, season_value);
  select * into standing_row from public.standings
  where player_id = form_player_id and division = 'Test Tier' and season = season_value;
  if standing_row.played <> 0 or standing_row.form <> '' then
    raise exception 'Zero-match form should be empty';
  end if;

  insert into public.fixtures (
    division, league_name, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team,
    home_club_id, away_club_id, home_score, away_score, status, fixture_date, played_at
  )
  values (
    'Test Tier', league_value, season_value, 1,
    form_player_id, second_player_id, 'Form test club', 'Away test club',
    club_form, club_away, 2, 1, 'completed', '2020-02-01', '2020-02-01'
  );
  perform public.recalculate_club_standings(club_form, season_value);
  select * into standing_row from public.standings
  where player_id = form_player_id and division = 'Test Tier' and season = season_value;
  if standing_row.played <> 1 or standing_row.form <> 'W' then
    raise exception 'One-match form should contain exactly one result';
  end if;

  insert into public.fixtures (
    division, league_name, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team,
    home_club_id, away_club_id, home_score, away_score, status, fixture_date, played_at
  )
  select
    'Test Tier', league_value, season_value, match_number,
    case when match_number % 2 = 1 then form_player_id else second_player_id end,
    case when match_number % 2 = 1 then second_player_id else form_player_id end,
    'Form test club', 'Away test club',
    case when match_number % 2 = 1 then club_form else club_away end,
    case when match_number % 2 = 1 then club_away else club_form end,
    case match_number
      when 2 then 2 when 3 then 1 when 4 then 1 when 5 then 0
      else 1
    end,
    case match_number
      when 2 then 1 when 3 then 1 when 4 then 3 when 5 then 2
      else 1
    end,
    'completed',
    '2020-02-02'::timestamptz,
    '2020-02-02'::timestamptz
  from generate_series(2, 5) as matches(match_number);

  perform public.recalculate_club_standings(club_form, season_value);
  select * into standing_row from public.standings
  where player_id = form_player_id and division = 'Test Tier' and season = season_value;
  if standing_row.played <> 5 or standing_row.form <> 'WLDWL' then
    raise exception 'Five-match form should preserve all results oldest-to-newest';
  end if;

  insert into public.fixtures (
    division, league_name, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team,
    home_club_id, away_club_id, home_score, away_score, status, fixture_date, played_at
  )
  select
    'Test Tier', league_value, season_value, match_number,
    case when match_number % 2 = 1 then form_player_id else second_player_id end,
    case when match_number % 2 = 1 then second_player_id else form_player_id end,
    'Form test club', 'Away test club',
    case when match_number % 2 = 1 then club_form else club_away end,
    case when match_number % 2 = 1 then club_away else club_form end,
    case match_number when 7 then 3 else 1 end,
    case match_number when 7 then 1 else 1 end,
    'completed',
    ('2020-02-01'::date + (match_number - 1))::timestamptz,
    ('2020-02-01'::date + (match_number - 1))::timestamptz
  from generate_series(6, 7) as matches(match_number);

  perform public.recalculate_club_standings(club_form, season_value);
  select * into standing_row from public.standings
  where player_id = form_player_id and division = 'Test Tier' and season = season_value;
  if standing_row.played <> 7 or standing_row.form <> 'DWLDW' then
    raise exception 'Form longer than five matches should contain only the latest five results';
  end if;

  perform public.recalculate_club_standings(club_form, season_value);
  select * into standing_row from public.standings
  where player_id = form_player_id and division = 'Test Tier' and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw, standing_row.lost,
      standing_row.form)
     is distinct from (7, 3, 2, 2, 'DWLDW') then
    raise exception 'Repeated recalculation should be idempotent';
  end if;
  if (standing_row.points, standing_row.goal_difference) is distinct from (11, 2) then
    raise exception 'Generated points and goal difference should follow recalculated totals';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) order by f.id)
  into fixture_snapshot
  from public.fixtures f
  where f.league_name = league_value
    and f.season_year = season_value;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  delete from public.season_club_assignments
  where season_year = season_value
    and club_id = club_form;

  select * into standing_row
  from public.standings
  where player_id = form_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw, standing_row.lost,
      standing_row.goals_for, standing_row.goals_against, standing_row.form,
      standing_row.team_name)
     is distinct from (0, 0, 0, 0, 0, 0, '', 'Form Test Team') then
    raise exception 'Direct assignment removal did not clear standings and restore the player team';
  end if;

  perform public.admin_save_season_club_assignments(
    league_value,
    'Test Tier',
    season_value,
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'club_id', c.id,
          'player_id',
          case c.club_number
            when 2 then second_player_id
            else null
          end
        )
        order by c.club_number
      )
      from public.league_clubs c
      where c.league_name = league_value and c.division = 'Test Tier'
    )
  );

  if exists (
    select 1
    from public.season_club_assignments a
    where a.season_year = season_value
      and a.club_id in (club_form, club_home)
  ) then
    raise exception 'Removed player assignments still exist';
  end if;
  select * into standing_row from public.standings
  where player_id = replacement_player_id
    and division = 'Test Tier'
    and league_name = league_value
    and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw, standing_row.lost,
      standing_row.goals_for, standing_row.goals_against, standing_row.form,
      standing_row.team_name)
     is distinct from (0, 0, 0, 0, 0, 0, '', 'Replacement reassigned team') then
    raise exception 'RPC assignment removal did not clear standings and restore the player team';
  end if;
  if fixture_snapshot is distinct from (
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) order by f.id)
    from public.fixtures f
    where f.league_name = league_value
      and f.season_year = season_value
  ) then
    raise exception 'Removing an assignment rewrote historical fixtures';
  end if;
end;
$$;

rollback;
