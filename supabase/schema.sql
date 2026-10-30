create extension if not exists "pgcrypto";

do $$ begin
  create type public.profile_status as enum ('active', 'suspended', 'banned');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.fixture_status as enum ('scheduled', 'pending_confirmation', 'completed', 'disputed', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  gamertag text not null,
  full_name text,
  whatsapp_number text,
  efootball_username text,
  squad_name text,
  division text not null default 'Trial',
  is_admin boolean not null default false,
  is_approved boolean not null default false,
  status public.profile_status not null default 'active',
  payment_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.division_catalog (
  name text primary key,
  sort_order int not null unique,
  slot_limit int,
  is_open boolean not null default false
);

insert into public.division_catalog (name, sort_order, slot_limit, is_open)
values
  ('Elite', 1, 20, false),
  ('Premier', 2, 100, false),
  ('Championship', 3, 100, false),
  ('Challenger', 4, 100, false),
  ('Contender', 5, 100, false),
  ('Advanced', 6, 100, false),
  ('Intermediate', 7, 100, false),
  ('Foundation', 8, 100, false),
  ('Development', 9, 100, false),
  ('Rookie', 10, 80, false),
  ('Trial', 11, null, true)
on conflict (name) do update set
  sort_order = excluded.sort_order,
  slot_limit = excluded.slot_limit,
  is_open = excluded.is_open;

create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  division text not null,
  matchweek int not null,
  home_player_id uuid not null references public.profiles(id),
  away_player_id uuid not null references public.profiles(id),
  home_team text not null,
  away_team text not null,
  home_score int,
  away_score int,
  status public.fixture_status not null default 'scheduled',
  dispute_reason text,
  fixture_date timestamptz,
  played_at timestamptz,
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint non_negative_scores check (
    (home_score is null or home_score >= 0) and
    (away_score is null or away_score >= 0)
  )
);

create table if not exists public.standings (
  id uuid primary key default gen_random_uuid(),
  division text not null,
  season int not null,
  player_id uuid not null references public.profiles(id) on delete cascade,
  player_name text not null,
  team_name text not null,
  played int not null default 0,
  won int not null default 0,
  draw int not null default 0,
  lost int not null default 0,
  goals_for int not null default 0,
  goals_against int not null default 0,
  goal_difference int generated always as (goals_for - goals_against) stored,
  penalty_points int not null default 0,
  points int generated always as ((won * 3) + (draw * 1) - penalty_points) stored,
  form text,
  unique (division, season, player_id)
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id),
  action text not null,
  target_player_id uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.banned_users (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  player_name text not null,
  player_email text not null,
  original_division text not null,
  ban_reason text,
  banned_by uuid references public.profiles(id),
  banned_at timestamptz not null default now(),
  notes text,
  unique (player_id)
);

alter table public.profiles enable row level security;
alter table public.profiles add column if not exists efootball_username text;
alter table public.profiles add column if not exists squad_name text;
alter table public.fixtures enable row level security;
alter table public.standings enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.banned_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_admin = true
      and is_approved = true
      and status = 'active'
  );
$$;

create or replace function public.assign_player_to_highest_available_division(player_id_input uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_division text;
begin
  select catalog.name into target_division
  from public.division_catalog catalog
  where catalog.slot_limit is null
    or (select count(*) from public.profiles p
        where p.division = catalog.name
          and p.is_approved = true
          and p.status = 'active'
          and p.id <> player_id_input) < catalog.slot_limit
  order by catalog.sort_order
  limit 1;

  target_division := coalesce(target_division, 'Trial');

  update public.profiles
  set division = target_division
  where id = player_id_input;

  return target_division;
end;
$$;

create or replace function public.admin_approve_player(player_id_input uuid, approved_input boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_division text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.profiles
  set is_approved = approved_input,
      status = case when approved_input then 'active'::public.profile_status else status end
  where id = player_id_input;

  if approved_input then
    assigned_division := public.assign_player_to_highest_available_division(player_id_input);
  end if;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (auth.uid(), case when approved_input then 'approve_player' else 'reject_player' end, player_id_input, coalesce(assigned_division, 'Approval removed'));

  return assigned_division;
end;
$$;

create or replace function public.admin_reject_player(player_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  player_row public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into player_row
  from public.profiles
  where id = player_id_input
  for update;

  if not found then
    raise exception 'Player not found';
  end if;
  if player_row.is_admin then
    raise exception 'Admin accounts cannot be rejected';
  end if;
  if player_row.is_approved then
    raise exception 'Only pending applicants can be rejected';
  end if;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (
    auth.uid(),
    'reject_player_delete',
    null,
    'Rejected and deleted pending account: ' || player_id_input::text
  );

  update public.admin_audit_logs
  set target_player_id = null
  where target_player_id = player_id_input;

  delete from public.fixtures f
  where f.home_player_id = player_id_input
     or f.away_player_id = player_id_input;

  delete from auth.users
  where id = player_id_input;

  if not found then
    raise exception 'Authentication account not found';
  end if;
end;
$$;
grant execute on function public.admin_reject_player(uuid) to authenticated;

create or replace function public.admin_reassign_player(player_id_input uuid, division_input text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  perform 1 from public.division_catalog where name = division_input;
  if not found then
    raise exception 'Unknown division: %', division_input;
  end if;

  update public.profiles set division = division_input where id = player_id_input;
  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (auth.uid(), 'reassign_player', player_id_input, 'Division: ' || division_input);
end;
$$;

create or replace function public.admin_reassign_player(division_input text, player_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_reassign_player(player_id_input, division_input);
end;
$$;

create or replace function public.place_approved_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_approved = true and (old.is_approved is distinct from true) then
    perform public.assign_player_to_highest_available_division(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_approved on public.profiles;
create trigger on_profile_approved
  after update of is_approved on public.profiles
  for each row execute function public.place_approved_player();

create or replace function public.auto_create_player_standing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_approved = true and new.status = 'active' then
    if old.division is distinct from new.division then
      delete from public.standings
      where player_id = new.id
        and season = extract(year from now())::int
        and division = old.division;
    end if;

    insert into public.standings (division, season, player_id, player_name, team_name)
    values (
      new.division,
      extract(year from now())::int,
      new.id,
      coalesce(new.gamertag, new.full_name, 'Player'),
      coalesce(new.squad_name, 'eFootball Team')
    )
    on conflict (division, season, player_id) do update
      set player_name = excluded.player_name,
          team_name = excluded.team_name,
          division = excluded.division;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_division_assigned on public.profiles;
create trigger on_profile_division_assigned
  after update of division, is_approved on public.profiles
  for each row execute function public.auto_create_player_standing();

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (
    id = auth.uid()
    and is_admin = false
    and is_approved = false
    and status = 'active'
  );

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "fixtures_select_participant_or_admin" on public.fixtures;
create policy "fixtures_select_participant_or_admin" on public.fixtures
  for select using (home_player_id = auth.uid() or away_player_id = auth.uid() or public.is_admin());

drop policy if exists "fixtures_home_submit" on public.fixtures;
create policy "fixtures_home_submit" on public.fixtures
  for update using (home_player_id = auth.uid() or away_player_id = auth.uid() or public.is_admin())
  with check (home_player_id = auth.uid() or away_player_id = auth.uid() or public.is_admin());

drop policy if exists "fixtures_admin_insert" on public.fixtures;
create policy "fixtures_admin_insert" on public.fixtures
  for insert with check (public.is_admin());

drop policy if exists "standings_select_active" on public.standings;
create policy "standings_select_active" on public.standings
  for select using (true);

drop policy if exists "standings_admin_write" on public.standings;
create policy "standings_admin_write" on public.standings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "audit_admin_select" on public.admin_audit_logs;
create policy "audit_admin_select" on public.admin_audit_logs
  for select using (public.is_admin());

drop policy if exists "audit_admin_insert" on public.admin_audit_logs;
create policy "audit_admin_insert" on public.admin_audit_logs
  for insert with check (public.is_admin());

drop policy if exists "banned_users_admin_select" on public.banned_users;
create policy "banned_users_admin_select" on public.banned_users
  for select using (public.is_admin());

drop policy if exists "banned_users_admin_insert" on public.banned_users;
create policy "banned_users_admin_insert" on public.banned_users
  for insert with check (public.is_admin());

drop policy if exists "banned_users_admin_delete" on public.banned_users;
create policy "banned_users_admin_delete" on public.banned_users
  for delete using (public.is_admin());

create or replace function public.recalculate_standings_for_division(division_input text, season_input int)
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
      p.player_id,
      count(f.id)::int as played,
      sum(case when p.gf > p.ga then 1 else 0 end)::int as won,
      sum(case when p.gf = p.ga then 1 else 0 end)::int as draw,
      sum(case when p.gf < p.ga then 1 else 0 end)::int as lost,
      sum(p.gf)::int as goals_for,
      sum(p.ga)::int as goals_against,
      string_agg(
        case when p.gf > p.ga then 'W' when p.gf = p.ga then 'D' else 'L' end,
        '' order by f.played_at desc
      ) as form
    from public.fixtures f
    cross join lateral (
      values
        (f.home_player_id, f.home_score, f.away_score),
        (f.away_player_id, f.away_score, f.home_score)
    ) as p(player_id, gf, ga)
    where f.division = division_input
      and extract(year from coalesce(f.played_at, f.fixture_date, now()))::int = season_input
      and f.status = 'completed'
      and f.home_score is not null
      and f.away_score is not null
    group by p.player_id
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
  season_value int;
begin
  select * into fixture_row from public.fixtures where id = fixture_id_input for update;
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

  season_value := extract(year from coalesce(fixture_row.played_at, now()))::int;
  perform public.recalculate_standings_for_division(fixture_row.division, season_value);
end;
$$;

create or replace function public.admin_resolve_dispute(
  fixture_id_input uuid,
  home_score_input int,
  away_score_input int,
  notes_input text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture_row public.fixtures%rowtype;
  season_value int;
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

  season_value := extract(year from coalesce(fixture_row.played_at, now()))::int;
  perform public.recalculate_standings_for_division(fixture_row.division, season_value);
end;
$$;

create or replace function public.admin_deduct_points(
  player_id_input uuid,
  division_input text,
  season_input int,
  penalty_points_input int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.standings
  set penalty_points = penalty_points + greatest(penalty_points_input, 0)
  where player_id = player_id_input
    and division = division_input
    and season = season_input;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (auth.uid(), 'deduct_points', player_id_input, 'Penalty points: ' || penalty_points_input);
end;
$$;

create or replace function public.generate_round_robin_fixtures(p_league_id uuid, p_division text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  players_record record;
  players_array uuid[];
  num_players int;
  num_rounds int;
  home_player_id uuid;
  away_player_id uuid;
  matchweek int
  fixture_count int;
  season int;
  team_name text;
  player_name text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  season := extract(year from now())::int;

  -- Get all active, approved players in the division
  select array_agg(id) into players_array
  from public.profiles
  where division = p_division
    and is_approved = true
    and status = 'active';

  players_array := coalesce(players_array, '{}'::uuid[]);
  num_players := array_length(players_array, 1);

  if num_players < 2 then
    raise exception 'Need at least 2 players to generate fixtures';
  end if;

  -- Clear existing fixtures for this division
  delete from public.fixtures
  where division = p_division
    and extract(year from coalesce(fixture_date, now()))::int = season;

  -- Generate round-robin fixtures
  num_rounds := num_players - 1;
  fixture_count := 0;

  for round_idx in 1..num_rounds loop
    for pair_idx in 1..(num_players / 2) loop
      home_player_id := players_array[pair_idx];
      away_player_id := players_array[num_players - pair_idx + 1];

      if home_player_id is not null and away_player_id is not null and home_player_id <> away_player_id then
        select gamertag, squad_name into player_name, team_name
        from public.profiles where id = home_player_id;

        insert into public.fixtures (
          division, matchweek, home_player_id, away_player_id,
          home_team, away_team, status, fixture_date
        ) values (
          p_division, round_idx, home_player_id, away_player_id,
          coalesce(team_name, 'eFootball Team'), coalesce(team_name, 'eFootball Team'),
          'scheduled', now() + (round_idx * interval '7 days')
        );

        fixture_count := fixture_count + 1;
      end if;
    end loop;

    -- Rotate players (keep first player fixed, rotate others)
    if num_players > 2 then
      players_array[2:num_players] := array_cat(
        array[players_array[num_players]],
        players_array[2:num_players-1]
      );
    end if;
  end loop;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (auth.uid(), 'generate_fixtures', null, 'Division: ' || p_division || ', Fixtures: ' || fixture_count);

  return json_build_object(
    'success', true,
    'division', p_division,
    'fixtures_generated', fixture_count,
    'players', num_players
  );
end;
$$;

create or replace function public.admin_reschedule_fixture(
  fixture_id_input uuid,
  new_date_input timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture_row public.fixtures%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into fixture_row from public.fixtures where id = fixture_id_input;
  if not found then
    raise exception 'Fixture not found';
  end if;

  update public.fixtures
  set fixture_date = new_date_input
  where id = fixture_id_input;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (auth.uid(), 'reschedule_fixture', fixture_row.home_player_id,
    'Fixture rescheduled to: ' || new_date_input);
end;
$$;

create or replace function public.admin_permanent_ban_player(
  player_id_input uuid,
  ban_reason_input text,
  notes_input text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  player_row public.profiles%rowtype;
  current_season int := extract(year from now())::int;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into player_row from public.profiles where id = player_id_input;
  if not found then
    raise exception 'Player not found';
  end if;

  -- Insert into banned_users table
  insert into public.banned_users (
    player_id, player_name, player_email, original_division,
    ban_reason, banned_by, notes
  ) values (
    player_id_input,
    coalesce(player_row.gamertag, player_row.full_name, 'Unknown'),
    player_row.email,
    player_row.division,
    ban_reason_input,
    auth.uid(),
    notes_input
  )
  on conflict (player_id) do update
  set player_name = excluded.player_name,
      player_email = excluded.player_email,
      original_division = excluded.original_division,
      ban_reason = excluded.ban_reason,
      banned_by = excluded.banned_by,
      notes = excluded.notes,
      banned_at = now();

  -- Delete from league_participants (standings)
  delete from public.standings s
  where s.player_id = player_id_input
    and s.season = current_season;

  -- Cancel all their fixtures
  update public.fixtures
  set status = 'cancelled'
  where (home_player_id = player_id_input or away_player_id = player_id_input)
    and status in ('scheduled', 'pending_confirmation');

  -- Update profile status to banned
  update public.profiles
  set status = 'banned', is_approved = false
  where id = player_id_input;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (auth.uid(), 'permanent_ban', player_id_input,
    'Reason: ' || coalesce(ban_reason_input, 'Not specified'));
end;
$$;
grant execute on function public.admin_permanent_ban_player(uuid, text, text) to authenticated;

create or replace function public.admin_lift_ban(
  player_id_input uuid,
  new_division_input text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  banned_row public.banned_users%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into banned_row from public.banned_users where player_id = player_id_input;
  if not found then
    raise exception 'Player is not in banned users table';
  end if;

  -- Remove from banned_users
  delete from public.banned_users where player_id = player_id_input;

  -- Update profile status and division
  update public.profiles
  set status = 'active',
      is_approved = true,
      division = coalesce(new_division_input, banned_row.original_division)
  where id = player_id_input;

  -- Recreate standing entry
  insert into public.standings (division, season, player_id, player_name, team_name)
  values (
    coalesce(new_division_input, banned_row.original_division),
    extract(year from now())::int,
    player_id_input,
    banned_row.player_name,
    'eFootball Team'
  )
  on conflict (division, season, player_id) do update
    set player_name = excluded.player_name,
        team_name = excluded.team_name;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (auth.uid(), 'lift_ban', player_id_input,
    'Reinstated to division: ' || coalesce(new_division_input, banned_row.original_division));
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, gamertag, efootball_username, squad_name, full_name, whatsapp_number)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'gamertag', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'efootball_username',
    new.raw_user_meta_data->>'squad_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'whatsapp_number'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email, gamertag, division, is_approved, status)
select
  au.id,
  au.email,
  split_part(au.email, '@', 1),
  'Trial',
  false,
  'active'::public.profile_status
from auth.users au
left join public.profiles p on p.id = au.id
where p.id is null;
