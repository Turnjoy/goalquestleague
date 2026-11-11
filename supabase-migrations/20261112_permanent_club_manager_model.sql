alter table public.profiles
  add column if not exists manager_status text not null default 'unassigned',
  add column if not exists club_id uuid references public.league_clubs(id) on delete set null;

alter table public.profiles
  drop constraint if exists profiles_manager_status_check;
alter table public.profiles
  add constraint profiles_manager_status_check
  check (manager_status in ('unassigned', 'appointed'));

create unique index if not exists profiles_one_current_manager_per_club
  on public.profiles (club_id)
  where club_id is not null;

create or replace function public.enforce_profile_club_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  club_row public.league_clubs%rowtype;
begin
  if new.club_id is null then
    if tg_op = 'UPDATE' and old.club_id is not null then
      if exists (
        select 1
        from public.season_club_assignments a
        where a.player_id = new.id
          and a.club_id = old.club_id
          and a.season_year = extract(year from now())::integer
      ) then
        raise exception 'Remove the current season club assignment before unassigning its manager';
      end if;
      new.division := 'Trial';
    end if;
    new.manager_status := 'unassigned';
    return new;
  end if;

  if not exists (
    select 1
    from public.season_club_assignments a
    where a.player_id = new.id
      and a.club_id = new.club_id
      and a.season_year = extract(year from now())::integer
  ) then
    raise exception 'A manager can only be appointed through the current season club assignment';
  end if;

  select * into club_row
  from public.league_clubs
  where id = new.club_id;
  if not found then
    raise exception 'Club % does not exist', new.club_id;
  end if;

  if tg_op = 'UPDATE' and old.club_id is not distinct from new.club_id
     and (new.league_name is distinct from club_row.league_name
       or new.division is distinct from club_row.division) then
    raise exception 'A manager league and division must match their appointed club';
  end if;

  new.league_name := club_row.league_name;
  new.division := club_row.division;
  new.manager_status := 'appointed';
  return new;
end;
$$;

drop trigger if exists enforce_profile_club_assignment
  on public.profiles;
create trigger enforce_profile_club_assignment
  before insert or update of club_id, manager_status, league_name, division
  on public.profiles
  for each row execute function public.enforce_profile_club_assignment();

alter table public.standings
  add column if not exists club_id uuid references public.league_clubs(id) on delete restrict;
alter table public.standings
  alter column player_id drop not null;

create unique index if not exists standings_club_season_key
  on public.standings (club_id, season)
  where club_id is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  full_name_value text := nullif(btrim(new.raw_user_meta_data->>'full_name'), '');
  manager_handle_value text := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'manager_handle'), ''),
    nullif(btrim(new.raw_user_meta_data->>'gamertag'), '')
  );
  whatsapp_number_value text := regexp_replace(
    coalesce(new.raw_user_meta_data->>'whatsapp_number', ''),
    '[^0-9]',
    '',
    'g'
  );
begin
  if nullif(btrim(new.email), '') is null
     or full_name_value is null
     or manager_handle_value is null
     or length(manager_handle_value) < 3
     or whatsapp_number_value !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'Registration requires a valid email, full name, manager handle (at least 3 characters), and international WhatsApp number';
  end if;

  insert into public.profiles (
    id,
    email,
    gamertag,
    efootball_username,
    full_name,
    whatsapp_number,
    manager_handle,
    division,
    manager_status,
    club_id
  )
  values (
    new.id,
    new.email,
    manager_handle_value,
    manager_handle_value,
    full_name_value,
    whatsapp_number_value,
    manager_handle_value,
    'Trial',
    'unassigned',
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.place_approved_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_approved is true
     and old.is_approved is distinct from true
     and new.club_id is null then
    update public.profiles
    set division = 'Trial',
        manager_status = 'unassigned'
    where id = new.id
      and (division is distinct from 'Trial' or manager_status is distinct from 'unassigned');
  end if;
  return new;
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
    delete from public.standings
    where player_id = new.id and club_id is null;
    return new;
  end if;

  if new.club_id is not null then
    delete from public.standings
    where player_id = new.id
      and club_id is null
      and season = extract(year from now())::integer;
    return new;
  end if;

  if new.is_approved is distinct from true or new.status <> 'active' then
    return new;
  end if;

  update public.standings s
  set player_name = coalesce(
        nullif(new.manager_handle, ''),
        nullif(new.gamertag, ''),
        new.full_name,
        'Manager'
      ),
      team_name = coalesce(
        nullif(new.gamertag, ''),
        nullif(new.manager_handle, ''),
        'Unassigned'
      )
  where s.player_id = new.id
    and s.club_id is null;

  if old.division is distinct from new.division
     or old.league_name is distinct from new.league_name then
    delete from public.standings
    where player_id = new.id
      and club_id is null
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
    coalesce(nullif(new.manager_handle, ''), nullif(new.gamertag, ''), new.full_name, 'Manager'),
    coalesce(nullif(new.gamertag, ''), nullif(new.manager_handle, ''), 'Unassigned')
  )
  on conflict (league_name, division, season, player_id) do update
    set player_name = excluded.player_name,
        team_name = excluded.team_name;
  return new;
end;
$$;

drop trigger if exists on_profile_division_assigned on public.profiles;
create trigger on_profile_division_assigned
  after update of division, is_approved, is_admin, league_name, manager_handle,
    gamertag, full_name, club_id, manager_status
  on public.profiles
  for each row execute function public.auto_create_player_standing();

create or replace function public.sync_profile_current_club(player_id_input uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_assignment record;
begin
  select a.club_id, c.league_name, c.division
  into current_assignment
  from public.season_club_assignments a
  join public.league_clubs c on c.id = a.club_id
  where a.player_id = player_id_input
    and a.season_year = extract(year from now())::integer;

  if found then
    update public.profiles
    set club_id = current_assignment.club_id,
        manager_status = 'appointed',
        league_name = current_assignment.league_name,
        division = current_assignment.division
    where id = player_id_input;
  else
    update public.profiles
    set club_id = null,
        manager_status = 'unassigned',
        division = 'Trial'
    where id = player_id_input
      and club_id is not null;
  end if;
end;
$$;

create or replace function public.sync_current_club_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.season_year = extract(year from now())::integer then
      perform public.sync_profile_current_club(new.player_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.season_year = extract(year from now())::integer then
      perform public.sync_profile_current_club(old.player_id);
    end if;
    return old;
  end if;

  if old.season_year = extract(year from now())::integer then
    perform public.sync_profile_current_club(old.player_id);
  end if;
  if new.season_year = extract(year from now())::integer
     and (old.player_id is distinct from new.player_id
       or old.season_year is distinct from new.season_year) then
    perform public.sync_profile_current_club(new.player_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_current_club_assignment_change
  on public.season_club_assignments;
create trigger sync_current_club_assignment_change
  after insert or update or delete on public.season_club_assignments
  for each row execute function public.sync_current_club_assignment();

update public.profiles p
set club_id = a.club_id,
    manager_status = 'appointed',
    league_name = c.league_name,
    division = c.division
from public.season_club_assignments a
join public.league_clubs c on c.id = a.club_id
where a.player_id = p.id
  and a.season_year = extract(year from now())::integer;

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
  played_value integer;
  won_value integer;
  draw_value integer;
  lost_value integer;
  goals_for_value integer;
  goals_against_value integer;
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

  delete from public.standings s
  where s.club_id is null
    and s.league_name = club_row.league_name
    and s.division = club_row.division
    and s.season = season_year_input
    and (
      (previous_player_id_input is not null and s.player_id = previous_player_id_input)
      or exists (
        select 1
        from public.season_club_assignments a
        where a.club_id = club_id_input
          and a.season_year = season_year_input
          and a.player_id = s.player_id
      )
    )
    and s.team_name = club_row.club_name;

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
        recent.result,
        ''
        order by recent.match_date, recent.matchweek, recent.fixture_date, recent.fixture_id
      )
      from (
        select result, match_date, matchweek, fixture_date, fixture_id
        from club_matches
        order by match_date desc, matchweek desc, fixture_date desc, fixture_id desc
        limit 5
      ) recent
    ), '')
  into played_value, won_value, draw_value, lost_value,
       goals_for_value, goals_against_value, recent_form
  from club_matches;

  insert into public.standings (
    division, league_name, season, player_id, club_id,
    player_name, team_name, played, won, draw, lost,
    goals_for, goals_against, form
  )
  values (
    club_row.division, club_row.league_name, season_year_input, null, club_id_input,
    club_row.club_name, club_row.club_name, played_value, won_value, draw_value, lost_value,
    goals_for_value, goals_against_value, recent_form
  )
  on conflict (club_id, season) where club_id is not null do update
  set division = excluded.division,
      league_name = excluded.league_name,
      player_id = null,
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

do $$
declare
  function_definition text;
  profile_assignment_start integer;
  profile_assignment_end integer;
  standings_block_start integer;
  standings_block_end integer;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.admin_save_season_club_assignments(text,text,integer,jsonb)'::pg_catalog.regprocedure
  );
  function_definition := pg_catalog.replace(function_definition, chr(13), '');
  profile_assignment_start := pg_catalog.strpos(
    function_definition,
    'update public.profiles p'
  );
  if profile_assignment_start = 0 then
    raise exception 'Could not safely update the season assignment RPC profile update';
  end if;
  if pg_catalog.strpos(
    function_definition,
    'if p_season_year = extract(year from now())::integer then'
  ) = 0 then
    profile_assignment_end := profile_assignment_start
      + pg_catalog.strpos(
        pg_catalog.substr(function_definition, profile_assignment_start),
        ';'
      ) - 1;
    function_definition := pg_catalog.substr(function_definition, 1, profile_assignment_start - 1)
      || E'if p_season_year = extract(year from now())::integer then\n'
      || pg_catalog.substr(
        function_definition,
        profile_assignment_start,
        profile_assignment_end - profile_assignment_start + 1
      )
      || E'\nend if;'
      || pg_catalog.substr(function_definition, profile_assignment_end + 1);
  end if;

  standings_block_start := pg_catalog.strpos(function_definition, 'update public.standings s');
  if standings_block_start > 0 then
    standings_block_end := standings_block_start
      + pg_catalog.strpos(
        pg_catalog.substr(function_definition, standings_block_start),
        E'\nend;\n$function$'
      ) - 1;
    if standings_block_end < standings_block_start then
      raise exception 'Could not find the end of the manager-owned standings block';
    end if;
    function_definition := pg_catalog.substr(function_definition, 1, standings_block_start - 1)
      || pg_catalog.substr(function_definition, standings_block_end);
  end if;
  execute function_definition;
end;
$$;

do $$
declare
  fixture_season record;
begin
  for fixture_season in
    select club_id, season_year
    from (
      select f.home_club_id as club_id,
        coalesce(f.season_year, extract(year from coalesce(f.fixture_date, f.played_at, f.created_at))::integer) as season_year
      from public.fixtures f
      where f.home_club_id is not null
      union
      select f.away_club_id as club_id,
        coalesce(f.season_year, extract(year from coalesce(f.fixture_date, f.played_at, f.created_at))::integer) as season_year
      from public.fixtures f
      where f.away_club_id is not null
    ) club_fixtures
  loop
    perform public.recalculate_club_standings(
      fixture_season.club_id,
      fixture_season.season_year
    );
  end loop;
end;
$$;

create table if not exists public.club_trophies (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.league_clubs(id) on delete restrict,
  trophy_name text not null check (length(btrim(trophy_name)) > 0),
  season integer not null,
  created_at timestamptz not null default now(),
  unique (club_id, trophy_name, season)
);

create table if not exists public.manager_trophies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  club_id uuid not null references public.league_clubs(id) on delete restrict,
  trophy_name text not null check (length(btrim(trophy_name)) > 0),
  season integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, club_id, trophy_name, season)
);

alter table public.club_trophies enable row level security;
alter table public.manager_trophies enable row level security;

drop policy if exists "club_trophies_read" on public.club_trophies;
create policy "club_trophies_read"
  on public.club_trophies for select to anon, authenticated using (true);

drop policy if exists "manager_trophies_read" on public.manager_trophies;
create policy "manager_trophies_read"
  on public.manager_trophies for select to anon, authenticated using (true);

revoke all on public.club_trophies from public, anon, authenticated;
revoke all on public.manager_trophies from public, anon, authenticated;
grant select on public.club_trophies to anon, authenticated;
grant select on public.manager_trophies to anon, authenticated;

create or replace function public.get_club_trophies(club_id_input uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'club_id', t.club_id,
        'trophy_name', t.trophy_name,
        'season', t.season,
        'created_at', t.created_at
      )
      order by t.season desc, t.created_at desc, t.id
    ),
    '[]'::jsonb
  )
  from public.club_trophies t
  where t.club_id = club_id_input;
$$;

create or replace function public.get_manager_trophies(manager_id_input uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'user_id', t.user_id,
        'club_id', t.club_id,
        'trophy_name', t.trophy_name,
        'season', t.season,
        'created_at', t.created_at
      )
      order by t.season desc, t.created_at desc, t.id
    ),
    '[]'::jsonb
  )
  from public.manager_trophies t
  where t.user_id = manager_id_input;
$$;

create or replace function public.admin_award_club_trophy(
  club_id_input uuid,
  trophy_name_input text,
  season_input integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid;
  club_trophy_id uuid;
  manager_trophy_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if club_id_input is null
     or nullif(btrim(trophy_name_input), '') is null
     or season_input is null then
    raise exception 'Club, trophy name, and season are required';
  end if;

  select p.id
  into manager_id
  from public.profiles p
  where p.club_id = club_id_input
    and p.manager_status = 'appointed'
    and p.is_approved is true
    and p.status = 'active'
    and p.is_admin is false;
  if manager_id is null then
    raise exception 'The club must have an active approved manager before a trophy can be awarded';
  end if;

  insert into public.club_trophies (club_id, trophy_name, season)
  values (club_id_input, btrim(trophy_name_input), season_input)
  on conflict (club_id, trophy_name, season) do nothing
  returning id into club_trophy_id;

  if club_trophy_id is null then
    return jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  end if;

  insert into public.manager_trophies (user_id, club_id, trophy_name, season)
  values (manager_id, club_id_input, btrim(trophy_name_input), season_input)
  returning id into manager_trophy_id;

  return jsonb_build_object(
    'awarded', true,
    'club_trophy_id', club_trophy_id,
    'manager_trophy_id', manager_trophy_id,
    'club_id', club_id_input,
    'manager_id', manager_id,
    'trophy_name', btrim(trophy_name_input),
    'season', season_input
  );
end;
$$;

revoke all on function public.sync_profile_current_club(uuid)
  from public, anon, authenticated;
revoke all on function public.sync_current_club_assignment()
  from public, anon, authenticated;
revoke all on function public.enforce_profile_club_assignment()
  from public, anon, authenticated;
revoke all on function public.get_club_trophies(uuid)
  from public;
revoke all on function public.get_manager_trophies(uuid)
  from public;
revoke all on function public.admin_award_club_trophy(uuid, text, integer)
  from public, anon;
grant execute on function public.get_club_trophies(uuid)
  to anon, authenticated;
grant execute on function public.get_manager_trophies(uuid)
  to anon, authenticated;
grant execute on function public.admin_award_club_trophy(uuid, text, integer)
  to authenticated;

drop function if exists public.admin_reassign_player_with_team(uuid, text, text, uuid);

revoke all on function public.recalculate_club_standings(uuid, integer, uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
