begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  first_manager_id uuid := gen_random_uuid();
  replacement_manager_id uuid := gen_random_uuid();
  second_manager_id uuid := gen_random_uuid();
  form_manager_id uuid := gen_random_uuid();
  league_value text := 'Permanent club test ' || gen_random_uuid()::text;
  season_value integer := extract(year from now())::integer;
  club_ids uuid[];
  completed_fixture_ids uuid[];
  fixture_snapshot jsonb;
  standing_row public.standings%rowtype;
  award_result jsonb;
  invalid_direct_assignment_rejected boolean := false;
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.season_club_assignments'::regclass
      and c.contype = 'u'
      and pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (season_year, player_id)'
  ) then
    raise exception 'A manager can only manage one club in a season';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'standings_club_season_key'
  ) then
    raise exception 'Club standings are not uniquely identified by club and season';
  end if;

  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (admin_id, 'authenticated', 'authenticated', admin_id::text || '@permanent-club.test', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Club Test Admin","manager_handle":"club-test-admin","whatsapp_number":"2348012345678"}', now(), now()),
    (first_manager_id, 'authenticated', 'authenticated', first_manager_id::text || '@permanent-club.test', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"First Manager","manager_handle":"first-manager","whatsapp_number":"2348012345678"}', now(), now()),
    (replacement_manager_id, 'authenticated', 'authenticated', replacement_manager_id::text || '@permanent-club.test', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Replacement Manager","manager_handle":"replacement-manager","whatsapp_number":"2348012345678"}', now(), now()),
    (second_manager_id, 'authenticated', 'authenticated', second_manager_id::text || '@permanent-club.test', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Second Manager","manager_handle":"second-manager","whatsapp_number":"2348012345678"}', now(), now()),
    (form_manager_id, 'authenticated', 'authenticated', form_manager_id::text || '@permanent-club.test', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Form Manager","manager_handle":"form-manager","whatsapp_number":"2348012345678"}', now(), now());

  if exists (
    select 1
    from public.profiles
    where id in (first_manager_id, replacement_manager_id, second_manager_id, form_manager_id)
      and (
        division <> 'Trial'
        or club_id is not null
        or manager_status <> 'unassigned'
        or custom_team_name is not null
      )
  ) then
    raise exception 'Registration did not create an unassigned Trial manager without a custom team';
  end if;

  update public.profiles
  set is_approved = true,
      is_admin = (id = admin_id)
  where id in (admin_id, first_manager_id, replacement_manager_id, second_manager_id, form_manager_id);
  if exists (
    select 1 from public.profiles
    where id in (first_manager_id, replacement_manager_id, second_manager_id, form_manager_id)
      and (division <> 'Trial' or club_id is not null or manager_status <> 'unassigned')
  ) then
    raise exception 'Approval moved a new manager out of Trial before club assignment';
  end if;

  insert into public.league_clubs (league_name, division, club_number, club_name)
  select league_value, 'Trial', club_number, 'Permanent Club ' || club_number::text
  from generate_series(1, 20) as clubs(club_number);
  select array_agg(id order by club_number)
  into club_ids
  from public.league_clubs
  where league_name = league_value and division = 'Trial';

  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  perform public.admin_save_season_club_assignments(
    league_value,
    'Trial',
    season_value,
    (
      select jsonb_agg(
        jsonb_build_object(
          'club_id', c.id,
          'player_id',
          case c.club_number
            when 1 then first_manager_id
            when 2 then second_manager_id
            when 3 then form_manager_id
            else null
          end
        )
        order by c.club_number
      )
      from public.league_clubs c
      where c.league_name = league_value and c.division = 'Trial'
    )
  );

  if not exists (
    select 1 from public.profiles
    where id = first_manager_id
      and club_id = club_ids[1]
      and manager_status = 'appointed'
      and division = 'Trial'
  ) then
    raise exception 'Assignment did not appoint the manager to the permanent club';
  end if;
  begin
    update public.profiles
    set club_id = club_ids[4]
    where id = first_manager_id;
  exception when raise_exception then
    invalid_direct_assignment_rejected :=
      sqlerrm = 'A manager can only be appointed through the current season club assignment';
  end;
  if not invalid_direct_assignment_rejected then
    raise exception 'A direct profile write bypassed the season club assignment';
  end if;

  insert into public.fixtures (
    division, league_name, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team,
    home_club_id, away_club_id, home_score, away_score, status, fixture_date, played_at
  )
  values
    ('Trial', league_value, season_value, 1, first_manager_id, second_manager_id,
     'Permanent Club 1', 'Permanent Club 2', club_ids[1], club_ids[2], 2, 0,
     'completed', make_date(season_value, 1, 1), make_date(season_value, 1, 1)),
    ('Trial', league_value, season_value, 2, second_manager_id, first_manager_id,
     'Permanent Club 2', 'Permanent Club 1', club_ids[2], club_ids[1], 1, 3,
     'completed', make_date(season_value, 1, 2), make_date(season_value, 1, 2)),
    ('Trial', league_value, season_value, 3, first_manager_id, second_manager_id,
     'Permanent Club 1', 'Permanent Club 2', club_ids[1], club_ids[2], 1, 1,
     'completed', make_date(season_value, 1, 3), make_date(season_value, 1, 3)),
    ('Trial', league_value, season_value, 4, first_manager_id, second_manager_id,
     'Permanent Club 1', 'Permanent Club 2', club_ids[1], club_ids[2], 9, 0,
     'scheduled', make_date(season_value, 1, 4), null);

  insert into public.fixtures (
    division, league_name, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team,
    home_club_id, away_club_id, home_score, away_score, status, fixture_date, played_at
  )
  values (
    'Trial', league_value, season_value, 1, form_manager_id, second_manager_id,
    'Permanent Club 3', 'Permanent Club 2', club_ids[3], club_ids[2], 2, 1,
    'completed', make_date(season_value, 2, 1), make_date(season_value, 2, 1)
  );
  insert into public.fixtures (
    division, league_name, season_year, matchweek,
    home_player_id, away_player_id, home_team, away_team,
    home_club_id, away_club_id, home_score, away_score, status, fixture_date, played_at
  )
  select
    'Trial', league_value, season_value, match_number,
    case when match_number % 2 = 1 then form_manager_id else second_manager_id end,
    case when match_number % 2 = 1 then second_manager_id else form_manager_id end,
    'Permanent Club 3', 'Permanent Club 2',
    case when match_number % 2 = 1 then club_ids[3] else club_ids[2] end,
    case when match_number % 2 = 1 then club_ids[2] else club_ids[3] end,
    case match_number
      when 2 then 2 when 3 then 1 when 4 then 1 when 5 then 0
      when 7 then 3 else 1
    end,
    case match_number
      when 2 then 1 when 3 then 1 when 4 then 3 when 5 then 2
      when 7 then 1 else 1
    end,
    'completed',
    make_date(season_value, 2, match_number),
    make_date(season_value, 2, match_number)
  from generate_series(2, 7) as matches(match_number);

  perform public.recalculate_club_standings(club_ids[1], season_value);
  select * into standing_row
  from public.standings
  where club_id = club_ids[1] and season = season_value;
  if (standing_row.player_id, standing_row.player_name, standing_row.team_name,
      standing_row.played, standing_row.won, standing_row.draw,
      standing_row.lost, standing_row.goals_for, standing_row.goals_against,
      standing_row.form, standing_row.points, standing_row.goal_difference)
     is distinct from (null, 'Permanent Club 1', 'Permanent Club 1',
       3, 2, 1, 0, 6, 2, 'WWD', 7, 4) then
    raise exception 'Club results were not calculated and stored under club_id';
  end if;
  select * into standing_row
  from public.standings
  where club_id = club_ids[3] and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw,
      standing_row.lost, standing_row.goals_for, standing_row.goals_against,
      standing_row.form)
     is distinct from (7, 3, 2, 2, 11, 9, 'DWLDW') then
    raise exception 'Club form did not retain only the five most recent valid results';
  end if;

  select jsonb_agg(to_jsonb(f) order by f.id)
  into fixture_snapshot
  from public.fixtures f
  where f.home_club_id = club_ids[1]
    and f.status = 'completed';

  award_result := public.admin_award_club_trophy(
    club_ids[1], 'Permanent Club Test Cup', season_value
  );
  if award_result->>'awarded' <> 'true' then
    raise exception 'Trophy award did not return a newly awarded result';
  end if;
  if not exists (
    select 1 from public.club_trophies
    where club_id = club_ids[1]
      and trophy_name = 'Permanent Club Test Cup'
      and season = season_value
  ) or not exists (
    select 1 from public.manager_trophies
    where user_id = first_manager_id
      and club_id = club_ids[1]
      and trophy_name = 'Permanent Club Test Cup'
      and season = season_value
  ) then
    raise exception 'Trophy award did not create both club and active-manager records';
  end if;
  award_result := public.admin_award_club_trophy(
    club_ids[1], 'Permanent Club Test Cup', season_value
  );
  if award_result->>'awarded' <> 'false'
     or (select count(*) from public.club_trophies where club_id = club_ids[1]) <> 1
     or (select count(*) from public.manager_trophies where club_id = club_ids[1]) <> 1 then
    raise exception 'Retrying a trophy award created duplicate cabinet records';
  end if;

  perform public.admin_save_season_club_assignments(
    league_value,
    'Trial',
    season_value,
    (
      select jsonb_agg(
        jsonb_build_object(
          'club_id', c.id,
          'player_id',
          case c.club_number
            when 1 then replacement_manager_id
            when 2 then second_manager_id
            when 3 then form_manager_id
            else null
          end
        )
        order by c.club_number
      )
      from public.league_clubs c
      where c.league_name = league_value and c.division = 'Trial'
    )
  );

  if not exists (
    select 1 from public.profiles
    where id = first_manager_id
      and club_id is null
      and manager_status = 'unassigned'
      and division = 'Trial'
  ) or not exists (
    select 1 from public.profiles
    where id = replacement_manager_id
      and club_id = club_ids[1]
      and manager_status = 'appointed'
  ) then
    raise exception 'Reassignment did not sack the former manager and appoint the replacement';
  end if;

  if fixture_snapshot is distinct from (
    select jsonb_agg(to_jsonb(f) order by f.id)
    from public.fixtures f
    where f.home_club_id = club_ids[1]
      and f.status = 'completed'
  ) then
    raise exception 'Changing a manager rewrote completed historical fixtures';
  end if;

  select * into standing_row
  from public.standings
  where club_id = club_ids[1] and season = season_value;
  if (standing_row.played, standing_row.won, standing_row.draw,
      standing_row.lost, standing_row.goals_for, standing_row.goals_against,
      standing_row.form, standing_row.points, standing_row.goal_difference)
     is distinct from (3, 2, 1, 0, 6, 2, 'WWD', 7, 4) then
    raise exception 'Replacing the manager reset or transferred the club standings';
  end if;
  if exists (
    select 1 from public.standings
    where player_id in (first_manager_id, replacement_manager_id)
      and club_id is null
      and season = season_value
      and (played <> 0 or won <> 0 or draw <> 0 or lost <> 0)
  ) then
    raise exception 'A manager inherited club results as personal standings';
  end if;

  if not exists (
    select 1 from public.manager_trophies
    where user_id = first_manager_id
    and club_id = club_ids[1]
    and trophy_name = 'Permanent Club Test Cup'
    and season = season_value
  ) or exists (
    select 1 from public.manager_trophies
    where user_id = replacement_manager_id
    and club_id = club_ids[1]
    and trophy_name = 'Permanent Club Test Cup'
    and season = season_value
  ) then
    raise exception 'Manager trophy history was transferred during replacement';
  end if;
  if jsonb_array_length(public.get_club_trophies(club_ids[1])) <> 1
     or jsonb_array_length(public.get_manager_trophies(first_manager_id)) <> 1
     or jsonb_array_length(public.get_manager_trophies(replacement_manager_id)) <> 0 then
    raise exception 'Trophy JSON APIs did not preserve the separate cabinets';
  end if;

  award_result := public.admin_award_club_trophy(
    club_ids[1], 'Permanent Club Test Cup', season_value + 1
  );
  if award_result->>'awarded' <> 'true' then
    raise exception 'Replacement manager could not receive a later club trophy';
  end if;
  if not exists (
    select 1 from public.club_trophies
    where club_id = club_ids[1]
    and trophy_name = 'Permanent Club Test Cup'
    and season = season_value + 1
  ) or not exists (
    select 1 from public.manager_trophies
    where user_id = replacement_manager_id
    and club_id = club_ids[1]
    and trophy_name = 'Permanent Club Test Cup'
    and season = season_value + 1
  ) then
    raise exception 'Later trophy did not credit the replacement manager and club';
  end if;

  award_result := public.admin_award_club_trophy(
    club_ids[1], 'Permanent Club Test Cup', season_value + 1
  );
  if award_result->>'awarded' <> 'false'
     or (select count(*) from public.club_trophies where club_id = club_ids[1]) <> 2
     or (select count(*) from public.manager_trophies where club_id = club_ids[1]) <> 2 then
    raise exception 'Retrying a trophy award created duplicate cabinet records';
  end if;

  if jsonb_array_length(public.get_club_trophies(club_ids[1])) <> 2
     or jsonb_array_length(public.get_manager_trophies(replacement_manager_id)) <> 1 then
    raise exception 'Trophy JSON APIs did not return the expected cabinet records';
  end if;
end;
$$;

rollback;
