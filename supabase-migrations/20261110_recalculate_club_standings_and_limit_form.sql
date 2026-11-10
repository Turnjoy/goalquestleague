do $$
begin
  if exists (
    select 1
    from public.standings
    group by league_name, division, season, player_id
    having count(*) > 1
  ) then
    raise exception 'Cannot add league-scoped standings identity: duplicate league/division/season/player rows exist';
  end if;
end;
$$;

alter table public.standings
  drop constraint if exists standings_division_season_player_id_key;
alter table public.standings
  add constraint standings_league_division_season_player_id_key
  unique (league_name, division, season, player_id);

create or replace function public.recalculate_standings_for_division(
  division_input text,
  league_input text,
  season_input integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.standings s
  set played = 0,
      won = 0,
      draw = 0,
      lost = 0,
      goals_for = 0,
      goals_against = 0,
      form = ''
  where s.division = division_input
    and s.league_name = league_input
    and s.season = season_input
    and not exists (
      select 1
      from public.season_club_assignments a
      join public.league_clubs assigned_club on assigned_club.id = a.club_id
      where a.player_id = s.player_id
        and a.season_year = season_input
        and assigned_club.league_name = league_input
        and assigned_club.division = division_input
    );

  with participant_matches as (
    select
      participant.player_id,
      f.id as fixture_id,
      coalesce(f.played_at, f.fixture_date, f.created_at) as match_date,
      f.matchweek,
      f.fixture_date,
      participant.goals_for,
      participant.goals_against,
      case
        when participant.goals_for > participant.goals_against then 'W'
        when participant.goals_for = participant.goals_against then 'D'
        else 'L'
      end as result
    from public.fixtures f
    cross join lateral (
      values
        (f.home_player_id, f.home_club_id, f.home_score, f.away_score),
        (f.away_player_id, f.away_club_id, f.away_score, f.home_score)
    ) as participant(player_id, club_id, goals_for, goals_against)
    where f.division = division_input
      and f.league_name = league_input
      and coalesce(
        f.season_year,
        extract(year from coalesce(f.fixture_date, f.played_at, f.created_at))::integer
      ) = season_input
      and f.status = 'completed'
      and f.home_score is not null
      and f.away_score is not null
      and participant.club_id is null
      and not exists (
        select 1
        from public.season_club_assignments a
        join public.league_clubs assigned_club on assigned_club.id = a.club_id
        where a.player_id = participant.player_id
          and a.season_year = season_input
          and assigned_club.league_name = league_input
          and assigned_club.division = division_input
      )
  ),
  player_totals as (
    select
      player_id,
      count(*)::integer as played,
      (count(*) filter (where result = 'W'))::integer as won,
      (count(*) filter (where result = 'D'))::integer as draw,
      (count(*) filter (where result = 'L'))::integer as lost,
      sum(goals_for)::integer as goals_for,
      sum(goals_against)::integer as goals_against
    from participant_matches
    group by player_id
  ),
  player_forms as (
    select
      player_id,
      string_agg(result, '' order by match_date, matchweek, fixture_date, fixture_id) as form
    from (
      select
        player_id,
        fixture_id,
        match_date,
        matchweek,
        fixture_date,
        result,
        row_number() over (
          partition by player_id
          order by match_date desc, matchweek desc, fixture_date desc, fixture_id desc
        ) as recent_rank
      from participant_matches
    ) recent_matches
    where recent_rank <= 5
    group by player_id
  )
  update public.standings s
  set played = totals.played,
      won = totals.won,
      draw = totals.draw,
      lost = totals.lost,
      goals_for = totals.goals_for,
      goals_against = totals.goals_against,
      form = coalesce(forms.form, '')
  from player_totals totals
  left join player_forms forms on forms.player_id = totals.player_id
  where s.player_id = totals.player_id
    and s.division = division_input
  and s.league_name = league_input
  and s.season = season_input;
end;
$$;

create or replace function public.recalculate_club_standings(
  club_id_input uuid,
  season_year_input integer,
  previous_player_id_input uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  club_row public.league_clubs%rowtype;
  assigned_player_id uuid;
  assigned_player_name text;
  goals_played integer;
  goals_won integer;
  goals_drawn integer;
  goals_lost integer;
  total_goals_for integer;
  total_goals_against integer;
  recent_form text;
begin
  if club_id_input is null or season_year_input is null then
    return;
  end if;

  select * into club_row
  from public.league_clubs
  where id = club_id_input;
  if not found then
    raise exception 'Club % does not exist', club_id_input;
  end if;

  select a.player_id
  into assigned_player_id
  from public.season_club_assignments a
  where a.club_id = club_id_input
    and a.season_year = season_year_input;

  if previous_player_id_input is not null
     and previous_player_id_input is distinct from assigned_player_id then
    update public.standings
    set played = 0,
        won = 0,
        draw = 0,
        lost = 0,
        goals_for = 0,
        goals_against = 0,
        form = ''
    where player_id = previous_player_id_input
      and league_name = club_row.league_name
      and division = club_row.division
      and season = season_year_input;
  end if;

  if assigned_player_id is null then
    return;
  end if;

  select coalesce(nullif(p.manager_handle, ''), nullif(p.gamertag, ''), p.full_name, 'Player')
  into assigned_player_name
  from public.profiles p
  where p.id = assigned_player_id;

  with club_matches as (
    select
      f.id as fixture_id,
      coalesce(f.played_at, f.fixture_date, f.created_at) as match_date,
      f.matchweek,
      f.fixture_date,
      side.goals_for,
      side.goals_against,
      case
        when side.goals_for > side.goals_against then 'W'
        when side.goals_for = side.goals_against then 'D'
        else 'L'
      end as result
    from public.fixtures f
    cross join lateral (
      values
        (f.home_club_id, f.home_score, f.away_score),
        (f.away_club_id, f.away_score, f.home_score)
    ) as side(club_id, goals_for, goals_against)
    where side.club_id = club_id_input
      and coalesce(
        f.season_year,
        extract(year from coalesce(f.fixture_date, f.played_at, f.created_at))::integer
      ) = season_year_input
      and f.status = 'completed'
      and f.home_score is not null
      and f.away_score is not null
  )
  select
    count(*)::integer,
    (count(*) filter (where result = 'W'))::integer,
    (count(*) filter (where result = 'D'))::integer,
    (count(*) filter (where result = 'L'))::integer,
    coalesce(sum(goals_for), 0)::integer,
    coalesce(sum(goals_against), 0)::integer,
    coalesce((
      select string_agg(
        latest.result,
        ''
        order by latest.match_date, latest.matchweek, latest.fixture_date, latest.fixture_id
      )
      from (
        select result, match_date, matchweek, fixture_date, fixture_id
        from club_matches
        order by match_date desc, matchweek desc, fixture_date desc, fixture_id desc
        limit 5
      ) latest
    ), '')
  into goals_played, goals_won, goals_drawn, goals_lost,
       total_goals_for, total_goals_against, recent_form
  from club_matches;

  insert into public.standings (
    division,
    league_name,
    season,
    player_id,
    player_name,
    team_name,
    played,
    won,
    draw,
    lost,
    goals_for,
    goals_against,
    form
  )
  values (
    club_row.division,
    club_row.league_name,
    season_year_input,
    assigned_player_id,
    assigned_player_name,
    club_row.club_name,
    goals_played,
    goals_won,
    goals_drawn,
    goals_lost,
    total_goals_for,
    total_goals_against,
    recent_form
  )
  on conflict (league_name, division, season, player_id) do update
  set league_name = excluded.league_name,
      player_name = excluded.player_name,
      team_name = excluded.team_name,
      played = excluded.played,
      won = excluded.won,
      draw = excluded.draw,
      lost = excluded.lost,
      goals_for = excluded.goals_for,
      goals_against = excluded.goals_against,
      form = excluded.form;
end;
$$;

create or replace function public.recalculate_fixture_standings_for_row(
  fixture_row public.fixtures
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  season_value integer;
begin
  if fixture_row.status <> 'completed'
     or fixture_row.home_score is null
     or fixture_row.away_score is null then
    return;
  end if;

  season_value := coalesce(
    fixture_row.season_year,
    extract(year from coalesce(
      fixture_row.fixture_date,
      fixture_row.played_at,
      fixture_row.created_at
    ))::integer
  );

  if fixture_row.home_club_id is null or fixture_row.away_club_id is null then
    perform public.recalculate_standings_for_division(
      fixture_row.division,
      fixture_row.league_name,
      season_value
    );
  end if;
  if fixture_row.home_club_id is not null then
    perform public.recalculate_club_standings(fixture_row.home_club_id, season_value);
  end if;
  if fixture_row.away_club_id is not null
     and fixture_row.away_club_id is distinct from fixture_row.home_club_id then
    perform public.recalculate_club_standings(fixture_row.away_club_id, season_value);
  end if;
end;
$$;

create or replace function public.recalculate_fixture_standings_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_fixture_standings_for_row(old);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'completed' and (
      new.status <> 'completed'
      or old.division is distinct from new.division
      or old.league_name is distinct from new.league_name
      or old.season_year is distinct from new.season_year
      or old.home_player_id is distinct from new.home_player_id
      or old.away_player_id is distinct from new.away_player_id
      or old.home_club_id is distinct from new.home_club_id
      or old.away_club_id is distinct from new.away_club_id
    ) then
      perform public.recalculate_fixture_standings_for_row(old);
    end if;
  end if;

  perform public.recalculate_fixture_standings_for_row(new);
  return new;
end;
$$;

drop trigger if exists recalculate_standings_on_fixture_result_change
  on public.fixtures;
create trigger recalculate_standings_on_fixture_result_change
  after insert or delete or update of
    status,
    home_score,
    away_score,
    played_at,
    fixture_date,
    matchweek,
    season_year,
    league_name,
    division,
    home_player_id,
    away_player_id,
    home_club_id,
    away_club_id
  on public.fixtures
  for each row
  execute function public.recalculate_fixture_standings_after_change();

create or replace function public.dispute_fixture_score(
  fixture_id_input uuid,
  reason_input text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_row public.fixtures%rowtype;
begin
  select * into fixture_row
  from public.fixtures
  where id = fixture_id_input
  for update;
  if not found then
    raise exception 'Fixture not found';
  end if;
  if not public.is_admin()
     and fixture_row.away_player_id is distinct from auth.uid()
     and not exists (
       select 1
       from public.season_club_assignments a
       where a.season_year = coalesce(
         fixture_row.season_year,
         extract(year from coalesce(
           fixture_row.fixture_date,
           fixture_row.played_at,
           fixture_row.created_at
         ))::integer
       )
         and a.club_id = fixture_row.away_club_id
         and a.player_id = auth.uid()
     ) then
    raise exception 'Only the away club player or admin can dispute this score';
  end if;
  if fixture_row.status <> 'pending_confirmation' then
    raise exception 'Fixture is not pending confirmation';
  end if;
  if nullif(btrim(reason_input), '') is null then
    raise exception 'A dispute reason is required';
  end if;

  update public.fixtures
  set status = 'disputed',
      dispute_reason = btrim(reason_input)
  where id = fixture_id_input;
end;
$$;

create or replace function public.recalculate_club_standings_after_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_club_standings(old.club_id, old.season_year, old.player_id);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.club_id is distinct from new.club_id
       or old.season_year is distinct from new.season_year then
      perform public.recalculate_club_standings(old.club_id, old.season_year, old.player_id);
    end if;
    perform public.recalculate_club_standings(
      new.club_id,
      new.season_year,
      case when old.player_id is distinct from new.player_id then old.player_id else null end
    );
    return new;
  end if;

  perform public.recalculate_club_standings(new.club_id, new.season_year);
  return new;
end;
$$;

drop trigger if exists recalculate_club_standings_on_assignment_change
  on public.season_club_assignments;
create trigger recalculate_club_standings_on_assignment_change
  after insert or delete or update of club_id, season_year, player_id
  on public.season_club_assignments
  for each row
  execute function public.recalculate_club_standings_after_assignment_change();

create or replace function public.admin_save_season_club_assignments(
  p_league_name text,
  p_division text,
  p_season_year integer,
  p_assignments jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_clubs integer;
  submitted_clubs integer;
  unique_clubs integer;
  assigned_players integer;
  unique_players integer;
  changed boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_season_year is null or p_season_year < 2000 or p_season_year > 2200 then
    raise exception 'Season year is invalid';
  end if;
  if pg_catalog.jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception 'Season assignments must be sent as an array';
  end if;

  perform 1
  from public.league_clubs c
  where c.league_name = p_league_name and c.division = p_division
  order by c.club_number
  for update;

  select count(*) into configured_clubs
  from public.league_clubs c
  where c.league_name = p_league_name and c.division = p_division;
  if configured_clubs <> 20 then
    raise exception 'This league division does not have exactly 20 configured clubs';
  end if;

  select
    count(*),
    count(distinct x.club_id),
    count(x.player_id),
    count(distinct x.player_id)
  into submitted_clubs, unique_clubs, assigned_players, unique_players
  from pg_catalog.jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid);

  if submitted_clubs <> configured_clubs or unique_clubs <> configured_clubs then
    raise exception 'Submit one assignment row for each of the 20 clubs';
  end if;
  if assigned_players <> unique_players then
    raise exception 'A player can only be assigned to one club per season';
  end if;
  if exists (
    select 1
    from (
      select c.id
      from public.league_clubs c
      where c.league_name = p_league_name and c.division = p_division
    ) c
    full join pg_catalog.jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)
      on x.club_id = c.id
    where c.id is null or x.club_id is null
  ) then
    raise exception 'Assignments must contain exactly the clubs in the selected league division';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)
    left join public.profiles p on p.id = x.player_id
    where x.player_id is not null
      and (
        p.id is null
        or p.is_approved is distinct from true
        or p.status <> 'active'
        or p.is_admin is distinct from false
      )
  ) then
    raise exception 'Select only active, approved players';
  end if;

  select exists (
    select 1
    from public.league_clubs c
    left join public.season_club_assignments a
      on a.club_id = c.id and a.season_year = p_season_year
    left join pg_catalog.jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)
      on x.club_id = c.id
    where c.league_name = p_league_name
      and c.division = p_division
      and a.player_id is distinct from x.player_id
  ) into changed;

  if changed then
    delete from public.season_club_assignments a
    using public.league_clubs c
    where a.club_id = c.id
      and a.season_year = p_season_year
      and c.league_name = p_league_name
      and c.division = p_division;

    insert into public.season_club_assignments (season_year, club_id, player_id, assigned_by)
    select p_season_year, x.club_id, x.player_id, auth.uid()
    from pg_catalog.jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)
    where x.player_id is not null;

    update public.profiles p
    set league_name = p_league_name,
        division = p_division
    from pg_catalog.jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)
    where p.id = x.player_id
      and x.player_id is not null
      and (
        p.league_name is distinct from p_league_name
        or p.division is distinct from p_division
      );
  end if;

  update public.standings s
  set team_name = coalesce(
    nullif(p.custom_team_name, ''),
    nullif(p.squad_name, ''),
    nullif(p.gamertag, ''),
    'eFootball Team'
  )
  from public.profiles p
  where p.id = s.player_id
    and s.league_name = p_league_name
    and s.division = p_division
    and s.season = p_season_year
    and not exists (
      select 1
      from public.season_club_assignments a
      join public.league_clubs c on c.id = a.club_id
      where a.season_year = p_season_year
        and a.player_id = p.id
        and c.league_name = p_league_name
        and c.division = p_division
    );

  insert into public.standings (
    division, league_name, season, player_id, player_name, team_name
  )
  select
    c.division,
    c.league_name,
    a.season_year,
    p.id,
    coalesce(nullif(p.manager_handle, ''), nullif(p.gamertag, ''), p.full_name, 'Player'),
    c.club_name
  from public.season_club_assignments a
  join public.league_clubs c on c.id = a.club_id
  join public.profiles p on p.id = a.player_id
  where a.season_year = p_season_year
    and c.league_name = p_league_name
    and c.division = p_division
  on conflict (league_name, division, season, player_id) do update
    set player_name = excluded.player_name,
        team_name = excluded.team_name;
end;
$$;

create or replace function public.auto_create_player_standing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_admin is true then
    delete from public.standings where player_id = new.id;
    return new;
  end if;
  if new.is_approved is distinct from true or new.status <> 'active' then
    return new;
  end if;

  update public.standings s
  set player_name = coalesce(new.manager_handle, new.gamertag, new.full_name, 'Player'),
      team_name = coalesce(
        (
          select c.club_name
          from public.season_club_assignments a
          join public.league_clubs c on c.id = a.club_id
          where a.player_id = new.id
            and a.season_year = s.season
            and c.league_name = s.league_name
            and c.division = s.division
        ),
        nullif(new.custom_team_name, ''),
        nullif(new.squad_name, ''),
        'eFootball Team'
      )
  where s.player_id = new.id;

  if old.division is distinct from new.division
     or old.league_name is distinct from new.league_name then
    delete from public.standings
    where player_id = new.id
      and season = extract(year from now())::integer
      and division = old.division
      and league_name = old.league_name;
  end if;

  insert into public.standings (
    division, league_name, season, player_id, player_name, team_name
  )
  values (
    new.division,
    new.league_name,
    extract(year from now())::integer,
    new.id,
    coalesce(new.manager_handle, new.gamertag, new.full_name, 'Player'),
    coalesce(
      (
        select c.club_name
        from public.season_club_assignments a
        join public.league_clubs c on c.id = a.club_id
        where a.player_id = new.id
          and a.season_year = extract(year from now())::integer
          and c.league_name = new.league_name
          and c.division = new.division
      ),
      nullif(new.custom_team_name, ''),
      nullif(new.squad_name, ''),
      'eFootball Team'
    )
  )
  on conflict (league_name, division, season, player_id) do update
    set player_name = excluded.player_name,
        team_name = excluded.team_name;
  return new;
end;
$$;

create or replace function public.confirm_fixture_score(fixture_id_input uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_row public.fixtures%rowtype;
begin
  select * into fixture_row
  from public.fixtures
  where id = fixture_id_input
  for update;
  if not found then
    raise exception 'Fixture not found';
  end if;
  if not public.is_admin()
     and fixture_row.away_player_id is distinct from auth.uid()
     and not exists (
       select 1
       from public.season_club_assignments a
       where a.season_year = coalesce(
         fixture_row.season_year,
         extract(year from coalesce(fixture_row.fixture_date, fixture_row.played_at, fixture_row.created_at))::integer
       )
         and a.club_id = fixture_row.away_club_id
         and a.player_id = auth.uid()
     ) then
    raise exception 'Only the away club player or admin can confirm this score';
  end if;
  if fixture_row.status <> 'pending_confirmation' then
    raise exception 'Fixture is not pending confirmation';
  end if;

  update public.fixtures
  set status = 'completed', played_at = now()
  where id = fixture_id_input
  returning * into fixture_row;

end;
$$;

create or replace function public.admin_resolve_dispute(
  fixture_id_input uuid,
  home_score_input integer,
  away_score_input integer,
  notes_input text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_row public.fixtures%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.fixtures
  set home_score = home_score_input,
      away_score = away_score_input,
      status = 'completed',
      dispute_reason = null,
      played_at = now()
  where id = fixture_id_input
  returning * into fixture_row;
  if not found then
    raise exception 'Fixture not found';
  end if;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (auth.uid(), 'resolve_dispute', fixture_row.away_player_id, notes_input);

end;
$$;

create or replace function public.admin_reassign_player_with_team(
  player_id_input uuid,
  division_input text,
  team_name_input text,
  inherit_from_player_id_input uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_player public.profiles%rowtype;
  source_player public.profiles%rowtype;
  affected_season record;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if nullif(btrim(division_input), '') is null
     or nullif(btrim(team_name_input), '') is null then
    raise exception 'A valid division and team name are required';
  end if;

  select * into target_player
  from public.profiles
  where id = player_id_input
  for update;
  if not found then
    raise exception 'Player to reassign was not found';
  end if;

  if inherit_from_player_id_input is not null
     and inherit_from_player_id_input is distinct from player_id_input then
    select * into source_player
    from public.profiles
    where id = inherit_from_player_id_input
    for update;
    if not found then
      raise exception 'Player to inherit from was not found';
    end if;
  end if;

  update public.profiles
  set division = division_input,
      custom_team_name = team_name_input
  where id = player_id_input;

  if inherit_from_player_id_input is not null
     and inherit_from_player_id_input is distinct from player_id_input then
    update public.fixtures
    set home_player_id = player_id_input
    where home_player_id = inherit_from_player_id_input
      and home_club_id is null;
    update public.fixtures
    set away_player_id = player_id_input
    where away_player_id = inherit_from_player_id_input
      and away_club_id is null;

    for affected_season in
      select old_s.division, old_s.league_name, old_s.season
      from public.standings old_s
      where old_s.player_id = inherit_from_player_id_input
        and not exists (
          select 1
          from public.season_club_assignments a
          where a.player_id = inherit_from_player_id_input
            and a.season_year = old_s.season
        )
    loop
      insert into public.standings (
        division, league_name, season, player_id, player_name, team_name,
        played, won, draw, lost, goals_for, goals_against, penalty_points, form
      )
      select
        old_s.division,
        old_s.league_name,
        old_s.season,
        player_id_input,
        coalesce(
          nullif(target_player.manager_handle, ''),
          nullif(target_player.gamertag, ''),
          target_player.full_name,
          'Player'
        ),
        team_name_input,
        old_s.played,
        old_s.won,
        old_s.draw,
        old_s.lost,
        old_s.goals_for,
        old_s.goals_against,
        old_s.penalty_points,
        old_s.form
      from public.standings old_s
      where old_s.player_id = inherit_from_player_id_input
        and old_s.division = affected_season.division
        and old_s.league_name = affected_season.league_name
        and old_s.season = affected_season.season
      on conflict (league_name, division, season, player_id) do nothing;

      delete from public.standings old_s
      where old_s.player_id = inherit_from_player_id_input
        and old_s.division = affected_season.division
        and old_s.league_name = affected_season.league_name
        and old_s.season = affected_season.season;

      perform public.recalculate_standings_for_division(
        affected_season.division,
        affected_season.league_name,
        affected_season.season
      );
    end loop;
  end if;
end;
$$;

create or replace function public.admin_lift_ban(
  player_id_input uuid,
  new_division_input text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  banned_row public.banned_users%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into banned_row
  from public.banned_users
  where player_id = player_id_input;
  if not found then
    raise exception 'Player is not in banned users table';
  end if;

  delete from public.banned_users
  where player_id = player_id_input;

  update public.profiles
  set status = 'active',
      is_approved = true,
      division = coalesce(new_division_input, banned_row.original_division)
  where id = player_id_input;

  insert into public.standings (
    division, league_name, season, player_id, player_name, team_name
  )
  select
    p.division,
    p.league_name,
    extract(year from now())::integer,
    p.id,
    coalesce(p.manager_handle, p.gamertag, p.full_name, 'Player'),
    coalesce(
      nullif(p.custom_team_name, ''),
      nullif(p.squad_name, ''),
      'eFootball Team'
    )
  from public.profiles p
  where p.id = player_id_input
  on conflict (league_name, division, season, player_id) do update
    set player_name = excluded.player_name,
        team_name = excluded.team_name;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (
    auth.uid(),
    'lift_ban',
    player_id_input,
    'Reinstated to division: ' || coalesce(new_division_input, banned_row.original_division)
  );
end;
$$;

drop function if exists public.recalculate_standings_for_division(text, integer);
revoke all on function public.recalculate_standings_for_division(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.recalculate_fixture_standings_for_row(public.fixtures)
  from public, anon, authenticated;
revoke all on function public.recalculate_fixture_standings_after_change()
  from public, anon, authenticated;
revoke all on function public.recalculate_club_standings(uuid, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.recalculate_club_standings_after_assignment_change()
  from public, anon, authenticated;
revoke all on function public.auto_create_player_standing()
  from public, anon, authenticated;
revoke all on function public.dispute_fixture_score(uuid, text)
  from public, anon, authenticated;
revoke all on function public.admin_save_season_club_assignments(text, text, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.confirm_fixture_score(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_resolve_dispute(uuid, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.admin_reassign_player_with_team(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_lift_ban(uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_fixture_score(uuid) to authenticated;
grant execute on function public.dispute_fixture_score(uuid, text) to authenticated;
grant execute on function public.admin_save_season_club_assignments(text, text, integer, jsonb)
  to authenticated;
grant execute on function public.admin_resolve_dispute(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_reassign_player_with_team(uuid, text, text, uuid) to authenticated;
grant execute on function public.admin_lift_ban(uuid, text) to authenticated;

notify pgrst, 'reload schema';
