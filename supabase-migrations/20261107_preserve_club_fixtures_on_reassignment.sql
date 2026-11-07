update public.fixtures f
set home_club_id = coalesce(
      f.home_club_id,
      (
        select c.id
        from public.league_clubs c
        where c.league_name = f.league_name
          and c.division = f.division
          and lower(btrim(c.club_name)) = lower(btrim(f.home_team))
      )
    ),
    away_club_id = coalesce(
      f.away_club_id,
      (
        select c.id
        from public.league_clubs c
        where c.league_name = f.league_name
          and c.division = f.division
          and lower(btrim(c.club_name)) = lower(btrim(f.away_team))
      )
    )
where (f.home_club_id is null or f.away_club_id is null)
  and (
    exists (
      select 1
      from public.league_clubs c
      where c.league_name = f.league_name
        and c.division = f.division
        and lower(btrim(c.club_name)) = lower(btrim(f.home_team))
    )
    or exists (
      select 1
      from public.league_clubs c
      where c.league_name = f.league_name
        and c.division = f.division
        and lower(btrim(c.club_name)) = lower(btrim(f.away_team))
    )
  );

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

  if changed then
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

    update public.fixtures f
    set home_player_id = a.player_id
    from public.season_club_assignments a
    where f.home_club_id = a.club_id
      and a.season_year = p_season_year
      and f.league_name = p_league_name
      and f.division = p_division
      and coalesce(f.season_year, extract(year from f.fixture_date)::integer) = p_season_year
      and f.status = 'scheduled'
      and f.home_player_id is distinct from a.player_id;

    update public.fixtures f
    set away_player_id = a.player_id
    from public.season_club_assignments a
    where f.away_club_id = a.club_id
      and a.season_year = p_season_year
      and f.league_name = p_league_name
      and f.division = p_division
      and coalesce(f.season_year, extract(year from f.fixture_date)::integer) = p_season_year
      and f.status = 'scheduled'
      and f.away_player_id is distinct from a.player_id;
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

drop policy if exists "fixtures_select_participant_or_admin" on public.fixtures;
create policy "fixtures_select_participant_or_admin" on public.fixtures
  for select using (
    public.is_admin()
    or (home_club_id is null and home_player_id = auth.uid())
    or (away_club_id is null and away_player_id = auth.uid())
    or exists (
      select 1
      from public.season_club_assignments a
      where a.player_id = auth.uid()
        and a.season_year = coalesce(
          fixtures.season_year,
          extract(year from coalesce(fixtures.played_at, fixtures.fixture_date, now()))::integer
        )
        and a.club_id in (fixtures.home_club_id, fixtures.away_club_id)
    )
  );

drop policy if exists "fixtures_home_submit" on public.fixtures;
drop policy if exists "fixtures_admin_update" on public.fixtures;
create policy "fixtures_admin_update" on public.fixtures
  for update using (public.is_admin())
  with check (public.is_admin());

create or replace function public.dispute_fixture_score(
  fixture_id_input uuid,
  reason_input text
)
returns void
language plpgsql
security definer
set search_path = public
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
         extract(year from coalesce(fixture_row.played_at, fixture_row.fixture_date, now()))::integer
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

revoke all on function public.dispute_fixture_score(uuid, text) from public, anon;
grant execute on function public.dispute_fixture_score(uuid, text) to authenticated;

create or replace function public.confirm_fixture_score(fixture_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture_row public.fixtures%rowtype;
  season_value integer;
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
         extract(year from coalesce(fixture_row.played_at, fixture_row.fixture_date, now()))::integer
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

  season_value := coalesce(fixture_row.season_year, extract(year from coalesce(fixture_row.played_at, now()))::integer);
  perform public.recalculate_standings_for_division(fixture_row.division, season_value);
end;
$$;

grant execute on function public.confirm_fixture_score(uuid) to authenticated;
grant select, update on public.fixtures to authenticated;

notify pgrst, 'reload schema';
