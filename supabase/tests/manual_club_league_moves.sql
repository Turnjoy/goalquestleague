begin;

do $$
declare
  admin_user_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  league_a text := 'Manual move test A ' || gen_random_uuid()::text;
  league_b text := 'Manual move test B ' || gen_random_uuid()::text;
  season_value integer := extract(year from now())::integer;
  source_club uuid;
  destination_club uuid;
  assignment_club uuid;
  fixture_id uuid;
  fixture_snapshot jsonb;
  standings_snapshot jsonb;
  manager_league_before text;
  move_result public.league_clubs%rowtype;
  denied boolean := false;
  lower_division_value text;
  upper_division_value text;
  lower_clubs uuid[];
  upper_clubs uuid[];
  season_result jsonb;
  completion_rejected boolean;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (admin_user_id, 'authenticated', 'authenticated', admin_user_id::text || '@move-test.invalid', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Move Test Admin","manager_handle":"move-test-admin","whatsapp_number":"2348012345001"}', now(), now()),
    (manager_id, 'authenticated', 'authenticated', manager_id::text || '@move-test.invalid', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Move Test Manager","manager_handle":"move-test-manager","whatsapp_number":"2348012345002"}', now(), now());

  update public.profiles
  set is_approved = true,
      is_admin = (id = admin_user_id)
  where id in (admin_user_id, manager_id);

  insert into public.league_clubs (league_name, division, club_number, club_name)
  values (league_a, 'Test Division', 1, 'Stable Source Club ' || admin_user_id::text)
  returning id into source_club;
  insert into public.league_clubs (league_name, division, club_number, club_name)
  values
    (league_a, 'Test Division', 2, 'Stable Reserve Club ' || admin_user_id::text),
    (league_b, 'Test Division', 1, 'Stable Destination Club ' || admin_user_id::text);
  insert into public.league_clubs (league_name, division, club_number, club_name)
  select league_b, 'Test Division', n, 'Full Destination Club ' || n::text || ' ' || admin_user_id::text
  from generate_series(2, 20) n;

  select id into destination_club
  from public.league_clubs
  where league_name = league_b and division = 'Test Division';
  assignment_club := source_club;

  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  insert into public.season_club_assignments (season_year, club_id, player_id, assigned_by)
  values (season_value, source_club, manager_id, admin_user_id);
  manager_league_before := (select league_name from public.profiles where id = manager_id);

  insert into public.fixtures (
    league_name, division, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team,
    status, home_club_id, away_club_id
  ) values (
    league_a, 'Test Division', season_value, 1,
    admin_user_id, manager_id, 'Source', 'Destination', 'scheduled', source_club, destination_club
  ) returning id into fixture_id;
  insert into public.standings (
    division, league_name, season, player_id, player_name, team_name, club_id
  ) values (
    'Test Division', league_a, season_value, manager_id, 'Move Test Manager', 'Stable Source Club', source_club
  ) on conflict (league_name, division, season, player_id) do update
    set club_id = excluded.club_id;
  select to_jsonb(f) into fixture_snapshot from public.fixtures f where f.id = fixture_id;
  select to_jsonb(s) into standings_snapshot from public.standings s where s.club_id = source_club and s.season = season_value;

  perform set_config('request.jwt.claim.sub', manager_id::text, true);
  begin
    perform public.admin_move_club_league(source_club, league_b, 'Test Division', 'promote', 'punishment', 'invalid non-admin attempt');
  exception when others then
    denied := true;
  end;
  if not denied then raise exception 'Non-admin was allowed to move a club'; end if;

  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  move_result := public.admin_move_club_league(source_club, league_b, 'Test Division', 'promote', 'punishment', 'manual incomplete-season test', destination_club);
  if move_result.id <> source_club
     or move_result.club_name <> (select club_name from public.league_clubs where id = source_club)
     or move_result.league_name <> league_b then
    raise exception 'Club identity or destination was not preserved';
  end if;
  if not exists (
    select 1 from public.season_club_assignments
    where season_year = season_value and club_id = assignment_club and player_id = manager_id
  ) then raise exception 'Manager assignment moved or was lost with the club'; end if;
  if (select league_name from public.profiles where id = manager_id) is distinct from manager_league_before then
    raise exception 'Club placement unexpectedly changed its manager profile placement';
  end if;
  if (select to_jsonb(f) from public.fixtures f where f.id = fixture_id) is distinct from fixture_snapshot then
    raise exception 'Club move modified a fixture';
  end if;
  if (select to_jsonb(s) from public.standings s where s.club_id = source_club and s.season = season_value) is distinct from standings_snapshot then
    raise exception 'Club move modified standings history';
  end if;
  if not exists (
    select 1 from public.club_league_move_audit
    where club_id = source_club and move_type = 'promote' and reason = 'punishment'
      and previous_league = league_a and new_league = league_b and admin_id = admin_user_id
  ) then raise exception 'Punishment move audit entry is missing or incorrect'; end if;
  if not exists (
    select 1 from public.club_league_move_audit
    where club_id = destination_club and move_type = 'relegate'
      and previous_league = league_b and new_league = league_a
  ) then raise exception 'The explicitly selected counterpart was not audited as relegated'; end if;

  -- Exercise the reverse manual action. It remains independent of season status.
  move_result := public.admin_move_club_league(source_club, league_a, 'Test Division', 'relegate', 'manager_availability');
  if move_result.league_name <> league_a then raise exception 'Manual relegation failed'; end if;
  if not exists (
    select 1 from public.club_league_move_audit
    where club_id = source_club and move_type = 'relegate' and reason = 'manager_availability'
      and previous_league = league_b and new_league = league_a
  ) then raise exception 'Relegation audit entry is missing'; end if;

  -- A completed season uses existing standings order to choose top/bottom
  -- three, while an incomplete season is rejected by the server.
  lower_division_value := 'Lower Test ' || admin_user_id::text;
  upper_division_value := 'Upper Test ' || admin_user_id::text;
  completion_rejected := false;
    insert into public.league_clubs (league_name, division, club_number, club_name)
    select league_a, lower_division_value, n, 'Auto Lower ' || n::text || ' ' || admin_user_id::text
    from generate_series(1, 20) n;
    insert into public.league_clubs (league_name, division, club_number, club_name)
    select league_b, upper_division_value, n, 'Auto Upper ' || n::text || ' ' || admin_user_id::text
    from generate_series(1, 20) n;
    select array_agg(id order by club_number) into lower_clubs
    from public.league_clubs where league_name = league_a and division = lower_division_value;
    select array_agg(id order by club_number) into upper_clubs
    from public.league_clubs where league_name = league_b and division = upper_division_value;

    insert into public.standings (
      division, league_name, season, player_id, player_name, team_name,
      played, won, goals_for, goals_against, club_id
    )
    select c.division, c.league_name, season_value, null, 'Auto standings', c.club_name,
      38, c.club_number, c.club_number * 2, 0, c.id
    from public.league_clubs c
    where (c.league_name = league_a and c.division = lower_division_value)
       or (c.league_name = league_b and c.division = upper_division_value);

    insert into public.season_calendars (
      division, season_year, season_start_date, season_end_date, stop_date,
      pre_season_window_start, pre_season_window_end,
      mid_season_window_start, mid_season_window_end,
      total_fixtures, expected_duration_days, is_finalized
    ) values (
      lower_division_value, season_value, current_date - 60, current_date - 2, current_date - 1,
      current_date - 61, current_date - 60, current_date - 30, current_date - 29,
      380, 60, true
    );
    insert into public.season_calendars (
      division, season_year, season_start_date, season_end_date, stop_date,
      pre_season_window_start, pre_season_window_end,
      mid_season_window_start, mid_season_window_end,
      total_fixtures, expected_duration_days, is_finalized
    ) values (
      upper_division_value, season_value, current_date - 60, current_date - 2, current_date - 1,
      current_date - 61, current_date - 60, current_date - 30, current_date - 29,
      380, 60, true
    );
    insert into public.fixtures (
      league_name, division, season_year, matchweek,
      home_player_id, away_player_id, home_team, away_team,
      home_score, away_score, status, home_club_id, away_club_id
    ) values
      (league_a, lower_division_value, season_value, 1, admin_user_id, manager_id,
       'Lower one', 'Lower two', null, null, 'scheduled', lower_clubs[1], lower_clubs[2]),
      (league_b, upper_division_value, season_value, 1, admin_user_id, manager_id,
       'Upper one', 'Upper two', 0, 0, 'completed', upper_clubs[1], upper_clubs[2]);

    begin
      perform public.admin_complete_club_season(
        season_value, league_a, lower_division_value, league_b, upper_division_value
      );
    exception when others then
      completion_rejected := true;
    end;
    if not completion_rejected then raise exception 'Season movement ran before all fixtures were complete'; end if;

    update public.fixtures
    set home_score = 2, away_score = 0, status = 'completed', played_at = now()
    where league_name = league_a and division = lower_division_value and season_year = season_value;
    season_result := public.admin_complete_club_season(
      season_value, league_a, lower_division_value, league_b, upper_division_value
    );
    if jsonb_array_length(season_result->'promoted_club_ids') <> 3
       or jsonb_array_length(season_result->'relegated_club_ids') <> 3 then
      raise exception 'Automatic season completion did not select exactly three clubs each way';
    end if;
    if (select count(*) from public.club_season_movement_runs
        where season_year = season_value and lower_league = league_a
          and lower_division = lower_division_value) <> 1 then
      raise exception 'Season movement completion history was not recorded once';
    end if;
end;
$$;

rollback;
