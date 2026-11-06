create or replace function public.admin_save_season_club_assignments(
  p_league_name text,
  p_division text,
  p_season_year integer,
  p_assignments jsonb
)
returns void
language plpgsql
security definer
set search_path = public
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
  if jsonb_typeof(p_assignments) is distinct from 'array' then
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
  from jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid);

  if submitted_clubs <> configured_clubs or unique_clubs <> configured_clubs then
    raise exception 'Submit one assignment row for each of the 20 clubs';
  end if;
  if assigned_players <> unique_players then
    raise exception 'A player can only be assigned to one club per season';
  end if;
  if exists (
    select 1
    from (
      select id
      from public.league_clubs
      where league_name = p_league_name and division = p_division
    ) c
    full join jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)
      on x.club_id = c.id
    where c.id is null or x.club_id is null
  ) then
    raise exception 'Assignments must contain exactly the clubs in the selected league division';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)
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
    left join jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)
      on x.club_id = c.id
    where c.league_name = p_league_name
      and c.division = p_division
      and a.player_id is distinct from x.player_id
  ) into changed;

  if changed and exists (
    select 1
    from public.fixtures f
    where f.league_name = p_league_name
      and f.division = p_division
      and (
        f.season_year = p_season_year
        or (f.season_year is null and extract(year from f.fixture_date)::integer = p_season_year)
      )
      and f.status not in ('scheduled', 'cancelled')
  ) then
    raise exception 'Season assignments cannot be changed after scores or disputes exist';
  end if;

  if changed then
    delete from public.fixtures f
    where f.league_name = p_league_name
      and f.division = p_division
      and (
        f.season_year = p_season_year
        or (f.season_year is null and extract(year from f.fixture_date)::integer = p_season_year)
      )
      and f.status in ('scheduled', 'cancelled');

    delete from public.season_club_assignments a
    using public.league_clubs c
    where a.club_id = c.id
      and a.season_year = p_season_year
      and c.league_name = p_league_name
      and c.division = p_division;

    insert into public.season_club_assignments (season_year, club_id, player_id, assigned_by)
    select p_season_year, x.club_id, x.player_id, auth.uid()
    from jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)
    where x.player_id is not null;

    -- Move each assigned player into the club's league and division.
    update public.profiles p
    set league_name = p_league_name,
        division = p_division
    from jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)
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
    and s.season = p_season_year;

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
  on conflict (division, season, player_id) do update
    set league_name = excluded.league_name,
        player_name = excluded.player_name,
        team_name = excluded.team_name;
end;
$$;

revoke all on function public.admin_save_season_club_assignments(text, text, integer, jsonb) from public, anon;
grant execute on function public.admin_save_season_club_assignments(text, text, integer, jsonb) to authenticated;

notify pgrst, 'reload schema';
