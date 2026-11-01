create table if not exists public.league_clubs (
  id uuid primary key default gen_random_uuid(),
  league_name text not null,
  division text not null,
  club_number integer not null check (club_number between 1 and 20),
  club_name text not null,
  created_at timestamptz not null default now(),
  unique (league_name, division, club_number),
  unique (league_name, division, club_name)
);

insert into public.league_clubs (league_name, division, club_number, club_name)
values
  ('Apex Football League', 'Premier', 1, 'Blackwood Athletic FC'),
  ('Apex Football League', 'Premier', 2, 'Kingsport Borough FC'),
  ('Apex Football League', 'Premier', 3, 'Ironclad City FC'),
  ('Apex Football League', 'Premier', 4, 'Oakridge Rangers FC'),
  ('Apex Football League', 'Premier', 5, 'Silverstream Rovers FC'),
  ('Apex Football League', 'Premier', 6, 'Redford Wanderers FC'),
  ('Apex Football League', 'Premier', 7, 'Highland Albion FC'),
  ('Apex Football League', 'Premier', 8, 'Northgate Town FC'),
  ('Apex Football League', 'Premier', 9, 'Portside Victoria FC'),
  ('Apex Football League', 'Premier', 10, 'St. Jude’s Athletic FC'),
  ('Apex Football League', 'Premier', 11, 'Eastbridge City FC'),
  ('Apex Football League', 'Premier', 12, 'Westvale Rangers FC'),
  ('Apex Football League', 'Premier', 13, 'Stonefield Rovers FC'),
  ('Apex Football League', 'Premier', 14, 'Greensborough Albion FC'),
  ('Apex Football League', 'Premier', 15, 'Ashford United FC'),
  ('Apex Football League', 'Premier', 16, 'Millwall Heights FC'),
  ('Apex Football League', 'Premier', 17, 'Crestview Town FC'),
  ('Apex Football League', 'Premier', 18, 'Southwood Athletic FC'),
  ('Apex Football League', 'Premier', 19, 'Riverside Borough FC'),
  ('Apex Football League', 'Premier', 20, 'Oldcastle City FC'),
  ('Diamond Elite League', 'Elite', 1, 'Sterling City FC'),
  ('Diamond Elite League', 'Elite', 2, 'Kensington Athletic FC'),
  ('Diamond Elite League', 'Elite', 3, 'Belmont Wanderers FC'),
  ('Diamond Elite League', 'Elite', 4, 'Crownpoint Town FC'),
  ('Diamond Elite League', 'Elite', 5, 'Crystalwood Rovers FC'),
  ('Diamond Elite League', 'Elite', 6, 'Sovereign Hill Athletic FC'),
  ('Diamond Elite League', 'Elite', 7, 'Royal Oak City FC'),
  ('Diamond Elite League', 'Elite', 8, 'Grandview Borough FC'),
  ('Diamond Elite League', 'Elite', 9, 'Golden Gate Albion FC'),
  ('Diamond Elite League', 'Elite', 10, 'Richmond United FC'),
  ('Diamond Elite League', 'Elite', 11, 'Victoria Park FC'),
  ('Diamond Elite League', 'Elite', 12, 'Silverton Town FC'),
  ('Diamond Elite League', 'Elite', 13, 'Monarch Hill Rangers FC'),
  ('Diamond Elite League', 'Elite', 14, 'Highbury Athletic FC'),
  ('Diamond Elite League', 'Elite', 15, 'Diamond Coast FC'),
  ('Diamond Elite League', 'Elite', 16, 'Kingsley Wanderers FC'),
  ('Diamond Elite League', 'Elite', 17, 'Fairfield Albion FC'),
  ('Diamond Elite League', 'Elite', 18, 'Gilded Valley Town FC'),
  ('Diamond Elite League', 'Elite', 19, 'Mayfair Borough FC'),
  ('Diamond Elite League', 'Elite', 20, 'Belgrave City FC')
on conflict (league_name, division, club_number)
do update set club_name = excluded.club_name;

create table if not exists public.season_club_assignments (
  season_year integer not null,
  club_id uuid not null references public.league_clubs(id) on delete restrict,
  player_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (season_year, club_id),
  unique (season_year, player_id)
);

alter table public.fixtures
  add column if not exists league_name text not null default 'Apex Football League',
  add column if not exists season_year integer,
  add column if not exists home_club_id uuid references public.league_clubs(id) on delete set null,
  add column if not exists away_club_id uuid references public.league_clubs(id) on delete set null;

create index if not exists idx_league_clubs_division
  on public.league_clubs (league_name, division, club_number);
create index if not exists idx_season_club_assignments_player
  on public.season_club_assignments (season_year, player_id);
create index if not exists idx_fixtures_league_season
  on public.fixtures (league_name, division, season_year);

alter table public.league_clubs enable row level security;
alter table public.season_club_assignments enable row level security;

drop policy if exists "league_clubs_read" on public.league_clubs;
create policy "league_clubs_read" on public.league_clubs
  for select using (true);

drop policy if exists "league_clubs_admin_manage" on public.league_clubs;
create policy "league_clubs_admin_manage" on public.league_clubs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "season_club_assignments_read" on public.season_club_assignments;
create policy "season_club_assignments_read" on public.season_club_assignments
  for select using (public.is_admin() or player_id = auth.uid());

drop policy if exists "season_club_assignments_admin_manage" on public.season_club_assignments;
create policy "season_club_assignments_admin_manage" on public.season_club_assignments
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.league_clubs to authenticated;
grant select on public.season_club_assignments to authenticated;

create or replace function public.admin_assign_season_club(
  p_club_id uuid,
  p_season_year integer,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  club_row public.league_clubs%rowtype;
  player_row public.profiles%rowtype;
  previous_player_id uuid;
  assignment_exists boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_season_year < 2000 or p_season_year > 2200 then
    raise exception 'Season year is invalid';
  end if;

  select * into club_row
  from public.league_clubs
  where id = p_club_id;
  if not found then
    raise exception 'Club not found';
  end if;

  select player_id into previous_player_id
  from public.season_club_assignments
  where season_year = p_season_year and club_id = p_club_id;
  assignment_exists := found;
  if assignment_exists and previous_player_id is not distinct from p_player_id then
    return;
  end if;
  if not assignment_exists and p_player_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.fixtures
    where league_name = club_row.league_name
      and division = club_row.division
      and (
        season_year = p_season_year
        or (season_year is null and extract(year from fixture_date)::integer = p_season_year)
      )
      and status not in ('scheduled', 'cancelled')
  ) then
    raise exception 'Season assignments cannot be changed after scores or disputes exist';
  end if;

  delete from public.fixtures
  where league_name = club_row.league_name
    and division = club_row.division
    and (
      season_year = p_season_year
      or (season_year is null and extract(year from fixture_date)::integer = p_season_year)
    )
    and status in ('scheduled', 'cancelled');

  if p_player_id is null then
    delete from public.season_club_assignments
    where season_year = p_season_year and club_id = p_club_id;
  else
    select * into player_row
    from public.profiles
    where id = p_player_id
      and league_name = club_row.league_name
      and division = club_row.division
      and is_approved = true
      and status = 'active'
      and is_admin = false;
    if not found then
      raise exception 'Select an active, approved player from this league and division';
    end if;

    delete from public.season_club_assignments
    where season_year = p_season_year
      and player_id = p_player_id
      and club_id <> p_club_id;

    insert into public.season_club_assignments (season_year, club_id, player_id, assigned_by)
    values (p_season_year, p_club_id, p_player_id, auth.uid())
    on conflict (season_year, club_id) do update
      set player_id = excluded.player_id,
          assigned_by = excluded.assigned_by,
          assigned_at = now();
  end if;

  delete from public.standings s
  where s.league_name = club_row.league_name
    and s.division = club_row.division
    and s.season = p_season_year
    and not exists (
      select 1
      from public.season_club_assignments a
      join public.league_clubs c on c.id = a.club_id
      where a.season_year = p_season_year
        and a.player_id = s.player_id
        and c.league_name = club_row.league_name
        and c.division = club_row.division
    );
end;
$$;

revoke all on function public.admin_assign_season_club(uuid, integer, uuid) from public, anon;
grant execute on function public.admin_assign_season_club(uuid, integer, uuid) to authenticated;

create or replace function public.admin_generate_club_fixtures(
  p_league_name text,
  p_division text,
  p_start_date date,
  p_end_date date,
  p_stop_date date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  club_ids uuid[];
  player_ids uuid[];
  club_names text[];
  club_count integer;
  assigned_count integer;
  pair_count integer;
  round_count integer;
  home_player_id uuid;
  away_player_id uuid;
  fixture_count integer := 0;
  scheduled_on date;
  season_value integer;
  round_index integer;
  pair_index integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_start_date is null or p_end_date is null or p_stop_date is null then
    raise exception 'Season start, end, and stop dates are required';
  end if;
  if p_end_date < p_start_date then
    raise exception 'Season end date must be on or after the start date';
  end if;
  if p_stop_date < p_end_date then
    raise exception 'Season stop date must be on or after the end date';
  end if;
  season_value := extract(year from p_start_date)::integer;

  select count(*) into club_count
  from public.league_clubs
  where league_name = p_league_name and division = p_division;
  if club_count <> 20 then
    raise exception 'This league division does not have exactly 20 configured clubs';
  end if;

  select
    count(*),
    count(a.player_id),
    array_agg(c.id order by c.club_number),
    array_agg(a.player_id order by c.club_number),
    array_agg(c.club_name order by c.club_number)
  into club_count, assigned_count, club_ids, player_ids, club_names
  from public.league_clubs c
  left join public.season_club_assignments a
    on a.club_id = c.id and a.season_year = season_value
  where c.league_name = p_league_name and c.division = p_division;

  if club_count <> 20 or assigned_count <> 20 then
    raise exception 'Assign one player to each of the 20 clubs for season % before generating fixtures', season_value;
  end if;
  if exists (
    select 1
    from public.league_clubs c
    join public.season_club_assignments a
      on a.club_id = c.id and a.season_year = season_value
    join public.profiles p on p.id = a.player_id
    where c.league_name = p_league_name
      and c.division = p_division
      and (
        p.league_name <> p_league_name
        or p.division <> p_division
        or p.is_approved is distinct from true
        or p.status <> 'active'
        or p.is_admin is distinct from false
      )
  ) then
    raise exception 'Every assigned player must remain active and approved in this league division';
  end if;

  if exists (
    select 1
    from public.fixtures
    where league_name = p_league_name
      and division = p_division
      and (
        season_year = season_value
        or (season_year is null and fixture_date::date between p_start_date and p_end_date)
      )
      and status not in ('scheduled', 'cancelled')
  ) then
    raise exception 'This season already has reported results or disputes; refusing to replace its fixtures';
  end if;

  insert into public.standings (
    division, league_name, season, player_id, player_name, team_name
  )
  select
    c.division,
    c.league_name,
    season_value,
    p.id,
    coalesce(nullif(p.manager_handle, ''), nullif(p.gamertag, ''), p.full_name, 'Player'),
    c.club_name
  from public.league_clubs c
  join public.season_club_assignments a
    on a.club_id = c.id and a.season_year = season_value
  join public.profiles p on p.id = a.player_id
  where c.league_name = p_league_name
    and c.division = p_division
  on conflict (division, season, player_id) do update
    set league_name = excluded.league_name,
        player_name = excluded.player_name,
        team_name = excluded.team_name;

  insert into public.season_calendars (
    division, season_year, season_start_date, season_end_date, stop_date,
    pre_season_window_start, pre_season_window_end,
    mid_season_window_start, mid_season_window_end,
    total_fixtures, expected_duration_days, is_finalized
  )
  values (
    p_division, season_value, p_start_date, p_end_date, p_stop_date,
    p_start_date - 14, p_start_date - 7,
    p_start_date + 60, p_start_date + 90,
    190, p_end_date - p_start_date, true
  )
  on conflict (division, season_year) do update
    set season_start_date = excluded.season_start_date,
        season_end_date = excluded.season_end_date,
        stop_date = excluded.stop_date,
        pre_season_window_start = excluded.pre_season_window_start,
        pre_season_window_end = excluded.pre_season_window_end,
        mid_season_window_start = excluded.mid_season_window_start,
        mid_season_window_end = excluded.mid_season_window_end,
        total_fixtures = excluded.total_fixtures,
        expected_duration_days = excluded.expected_duration_days,
        is_finalized = true;

  delete from public.fixtures
  where league_name = p_league_name
    and division = p_division
    and (
      season_year = season_value
      or (season_year is null and fixture_date::date between p_start_date and p_end_date)
    )
    and status in ('scheduled', 'cancelled');

  round_count := 19;
  pair_count := 10;

  for round_index in 1..round_count loop
    scheduled_on := p_start_date
      + ((p_end_date - p_start_date) * (round_index - 1) / greatest(round_count - 1, 1));

    for pair_index in 1..pair_count loop
      home_player_id := player_ids[pair_index];
      away_player_id := player_ids[21 - pair_index];

      insert into public.fixtures (
        division, matchweek, home_player_id, away_player_id,
        home_team, away_team, status, fixture_date, season_stop_date,
        league_name, season_year, home_club_id, away_club_id
      )
      values (
        p_division, round_index, home_player_id, away_player_id,
        club_names[pair_index], club_names[21 - pair_index],
        'scheduled', scheduled_on::timestamp at time zone 'UTC', p_stop_date,
        p_league_name, season_value, club_ids[pair_index], club_ids[21 - pair_index]
      );
      fixture_count := fixture_count + 1;
    end loop;

    player_ids[2:20] := array_cat(array[player_ids[20]], player_ids[2:19]);
    club_ids[2:20] := array_cat(array[club_ids[20]], club_ids[2:19]);
    club_names[2:20] := array_cat(array[club_names[20]], club_names[2:19]);
  end loop;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (
    auth.uid(),
    'generate_club_fixtures',
    null,
    'League: ' || p_league_name || ', division: ' || p_division
      || ', season: ' || season_value || ', fixtures: ' || fixture_count
      || ', date range: ' || p_start_date || ' to ' || p_end_date
  );

  return json_build_object(
    'success', true,
    'league', p_league_name,
    'division', p_division,
    'season_year', season_value,
    'fixtures_generated', fixture_count,
    'players', 20
  );
end;
$$;

revoke all on function public.admin_generate_club_fixtures(text, text, date, date, date) from public, anon;
grant execute on function public.admin_generate_club_fixtures(text, text, date, date, date) to authenticated;

create or replace function public.recalculate_standings_for_division(
  division_input text,
  season_input integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.standings s
  set
    played = stats.played,
    won = stats.won,
    draw = stats.draw,
    lost = stats.lost,
    goals_for = stats.goals_for,
    goals_against = stats.goals_against,
    form = stats.form
  from (
    select
      participant.player_id,
      count(f.id)::integer as played,
      sum(case when participant.gf > participant.ga then 1 else 0 end)::integer as won,
      sum(case when participant.gf = participant.ga then 1 else 0 end)::integer as draw,
      sum(case when participant.gf < participant.ga then 1 else 0 end)::integer as lost,
      sum(participant.gf)::integer as goals_for,
      sum(participant.ga)::integer as goals_against,
      string_agg(
        case when participant.gf > participant.ga then 'W'
             when participant.gf = participant.ga then 'D'
             else 'L' end,
        '' order by f.played_at desc
      ) as form
    from public.fixtures f
    cross join lateral (
      values
        (f.home_player_id, f.home_score, f.away_score),
        (f.away_player_id, f.away_score, f.home_score)
    ) as participant(player_id, gf, ga)
    where f.division = division_input
      and coalesce(f.season_year, extract(year from coalesce(f.played_at, f.fixture_date, now()))::integer) = season_input
      and f.status = 'completed'
      and f.home_score is not null
      and f.away_score is not null
    group by participant.player_id
  ) stats
  where s.player_id = stats.player_id
    and s.division = division_input
    and s.season = season_input;
end;
$$;

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
  if fixture_row.away_player_id <> auth.uid() and not public.is_admin() then
    raise exception 'Only the away player or admin can confirm this score';
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

create or replace function public.admin_resolve_dispute(
  fixture_id_input uuid,
  home_score_input integer,
  away_score_input integer,
  notes_input text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture_row public.fixtures%rowtype;
  season_value integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.fixtures
  set
    home_score = home_score_input,
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

  season_value := coalesce(fixture_row.season_year, extract(year from coalesce(fixture_row.played_at, now()))::integer);
  perform public.recalculate_standings_for_division(fixture_row.division, season_value);
end;
$$;

notify pgrst, 'reload schema';
