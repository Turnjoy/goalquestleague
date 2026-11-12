-- Elite World Cup 2031/2032 Tournament Schema
-- This migration creates a completely independent tournament system
-- that does not interfere with existing league tables, fixtures, or standings

-- Create tournament-specific enums
do $$ begin
  create type public.world_cup_status as enum ('setup', 'group_stage', 'knockout_stage', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.world_cup_fixture_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.world_cup_knockout_round as enum ('opening_round', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final');
exception when duplicate_object then null;
end $$;

-- Main tournament configuration table
create table if not exists public.world_cup_tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  edition text not null, -- e.g., "2031/2032"
  status public.world_cup_status not null default 'setup',
  current_round public.world_cup_knockout_round,
  group_stage_start_date timestamptz,
  knockout_stage_start_date timestamptz,
  final_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  notes text
);

-- Country teams table (40 specific countries)
create table if not exists public.world_cup_countries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.world_cup_tournaments(id) on delete cascade,
  country_name text not null,
  country_code text not null, -- ISO 3-letter code
  flag_emoji text, -- e.g., 🇳🇬
  group_assignment text, -- A, B, C, D, E, F, G, H
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, country_name),
  unique (tournament_id, country_code)
);

-- Group assignments table (ensures exactly 5 teams per group)
create table if not exists public.world_cup_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.world_cup_tournaments(id) on delete cascade,
  group_letter text not null, -- A, B, C, D, E, F, G, H
  country_id uuid not null references public.world_cup_countries(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  unique (tournament_id, group_letter, country_id),
  check (group_letter in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'))
);

-- Manager appointments table with history tracking
create table if not exists public.world_cup_manager_appointments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.world_cup_tournaments(id) on delete cascade,
  country_id uuid not null references public.world_cup_countries(id) on delete cascade,
  manager_id uuid not null references public.profiles(id),
  source_club_id uuid, -- The club they manage in the league
  source_club_name text, -- Denormalized for display
  appointment_date timestamptz not null default now(),
  is_current boolean not null default true,
  appointed_by uuid references public.profiles(id),
  end_date timestamptz,
  end_reason text, -- 'replaced', 'resigned', 'tournament_ended'
  notes text,
  created_at timestamptz not null default now(),
  unique (tournament_id, country_id, manager_id, is_current)
);

-- Tournament fixtures table
create table if not exists public.world_cup_fixtures (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.world_cup_tournaments(id) on delete cascade,
  match_type text not null, -- 'group_stage' or 'knockout'
  knockout_round public.world_cup_knockout_round,
  group_letter text, -- For group stage matches
  home_country_id uuid not null references public.world_cup_countries(id),
  away_country_id uuid not null references public.world_cup_countries(id),
  match_number int, -- For ordering
  fixture_date timestamptz,
  venue text,
  status public.world_cup_fixture_status not null default 'scheduled',
  home_score int,
  away_score int,
  home_penalty_shootout int,
  away_penalty_shootout int,
  played_at timestamptz,
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint non_negative_scores check (
    (home_score is null or home_score >= 0) and
    (away_score is null or away_score >= 0) and
    (home_penalty_shootout is null or home_penalty_shootout >= 0) and
    (away_penalty_shootout is null or away_penalty_shootout >= 0)
  ),
  constraint different_teams check (home_country_id <> away_country_id)
);

-- Group standings table
create table if not exists public.world_cup_standings (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.world_cup_tournaments(id) on delete cascade,
  group_letter text not null,
  country_id uuid not null references public.world_cup_countries(id) on delete cascade,
  played int not null default 0,
  won int not null default 0,
  draw int not null default 0,
  lost int not null default 0,
  goals_for int not null default 0,
  goals_against int not null default 0,
  goal_difference int generated always as (goals_for - goals_against) stored,
  points int not null default 0,
  position int, -- Calculated position in group
  advanced boolean not null default false, -- Whether team advanced to knockout
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, group_letter, country_id),
  check (group_letter in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'))
);

-- Knockout progression table
create table if not exists public.world_cup_knockout_progression (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.world_cup_tournaments(id) on delete cascade,
  round public.world_cup_knockout_round not null,
  country_id uuid not null references public.world_cup_countries(id) on delete cascade,
  fixture_id uuid references public.world_cup_fixtures(id),
  advanced_from_round public.world_cup_knockout_round, -- For tracking progression
  position_in_bracket int, -- For bracket visualization
  is_eliminated boolean not null default false,
  eliminated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tournament_id, round, country_id)
);

-- Enable Row Level Security
alter table public.world_cup_tournaments enable row level security;
alter table public.world_cup_countries enable row level security;
alter table public.world_cup_groups enable row level security;
alter table public.world_cup_manager_appointments enable row level security;
alter table public.world_cup_fixtures enable row level security;
alter table public.world_cup_standings enable row level security;
alter table public.world_cup_knockout_progression enable row level security;

-- RLS Policies: Public read for all tables, admin write for all tables

-- Tournament policies
create policy "tournaments_public_read" on public.world_cup_tournaments
  for select using (true);

create policy "tournaments_admin_write" on public.world_cup_tournaments
  for all using (public.is_admin()) with check (public.is_admin());

-- Countries policies
create policy "countries_public_read" on public.world_cup_countries
  for select using (true);

create policy "countries_admin_write" on public.world_cup_countries
  for all using (public.is_admin()) with check (public.is_admin());

-- Groups policies
create policy "groups_public_read" on public.world_cup_groups
  for select using (true);

create policy "groups_admin_write" on public.world_cup_groups
  for all using (public.is_admin()) with check (public.is_admin());

-- Manager appointments policies
create policy "appointments_public_read" on public.world_cup_manager_appointments
  for select using (true);

create policy "appointments_admin_write" on public.world_cup_manager_appointments
  for all using (public.is_admin()) with check (public.is_admin());

-- Fixtures policies
create policy "fixtures_public_read" on public.world_cup_fixtures
  for select using (true);

create policy "fixtures_admin_write" on public.world_cup_fixtures
  for all using (public.is_admin()) with check (public.is_admin());

-- Standings policies
create policy "standings_public_read" on public.world_cup_standings
  for select using (true);

create policy "standings_admin_write" on public.world_cup_standings
  for all using (public.is_admin()) with check (public.is_admin());

-- Knockout progression policies
create policy "progression_public_read" on public.world_cup_knockout_progression
  for select using (true);

create policy "progression_admin_write" on public.world_cup_knockout_progression
  for all using (public.is_admin()) with check (public.is_admin());

-- Helper function to update updated_at timestamp
create or replace function public.update_world_cup_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Add updated_at triggers to relevant tables
create trigger update_tournaments_updated_at
  before update on public.world_cup_tournaments
  for each row execute function public.update_world_cup_updated_at();

create trigger update_countries_updated_at
  before update on public.world_cup_countries
  for each row execute function public.update_world_cup_updated_at();

create trigger update_fixtures_updated_at
  before update on public.world_cup_fixtures
  for each row execute function public.update_world_cup_updated_at();

create trigger update_standings_updated_at
  before update on public.world_cup_standings
  for each row execute function public.update_world_cup_updated_at();

-- Function to initialize Elite World Cup 2031/2032
create or replace function public.initialize_elite_world_cup()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_id uuid;
  country_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  -- Create tournament
  insert into public.world_cup_tournaments (name, edition, status, created_by)
  values ('Elite World Cup', '2031/2032', 'setup', auth.uid())
  returning id into tournament_id;

  -- Insert the 40 specific countries
  insert into public.world_cup_countries (tournament_id, country_name, country_code, flag_emoji)
  values
    (tournament_id, 'Chile', 'CHL', '🇨🇱'),
    (tournament_id, 'Austria', 'AUT', '🇦🇹'),
    (tournament_id, 'Ukraine', 'UKR', '🇺🇦'),
    (tournament_id, 'Greece', 'GRC', '🇬🇷'),
    (tournament_id, 'Wales', 'WAL', '🏴󠁧󠁢󠁷󠁬󠁳󠁿'),
    (tournament_id, 'Poland', 'POL', '🇵🇱'),
    (tournament_id, 'South Africa', 'RSA', '🇿🇦'),
    (tournament_id, 'Kenya', 'KEN', '🇰🇪'),
    (tournament_id, 'Cameroon', 'CMR', '🇨🇲'),
    (tournament_id, 'Ghana', 'GHA', '🇬🇭'),
    (tournament_id, 'Nigeria', 'NGA', '🇳🇬'),
    (tournament_id, 'Senegal', 'SEN', '🇸🇳'),
    (tournament_id, 'Egypt', 'EGY', '🇪🇬'),
    (tournament_id, 'Morocco', 'MAR', '🇲🇦'),
    (tournament_id, 'Algeria', 'DZA', '🇩🇿'),
    (tournament_id, 'Japan', 'JPN', '🇯🇵'),
    (tournament_id, 'China', 'CHN', '🇨🇳'),
    (tournament_id, 'Qatar', 'QAT', '🇶🇦'),
    (tournament_id, 'Saudi Arabia', 'KSA', '🇸🇦'),
    (tournament_id, 'Nepal', 'NPL', '🇳🇵'),
    (tournament_id, 'Australia', 'AUS', '🇦🇺'),
    (tournament_id, 'Canada', 'CAN', '🇨🇦'),
    (tournament_id, 'Mexico', 'MEX', '🇲🇽'),
    (tournament_id, 'Costa Rica', 'CRI', '🇨🇷'),
    (tournament_id, 'Colombia', 'COL', '🇨🇴'),
    (tournament_id, 'Portugal', 'PRT', '🇵🇹'),
    (tournament_id, 'Spain', 'ESP', '🇪🇸'),
    (tournament_id, 'Italy', 'ITA', '🇮🇹'),
    (tournament_id, 'Croatia', 'HRV', '🇭🇷'),
    (tournament_id, 'France', 'FRA', '🇫🇷'),
    (tournament_id, 'Belgium', 'BEL', '🇧🇪'),
    (tournament_id, 'England', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'),
    (tournament_id, 'Netherlands', 'NLD', '🇳🇱'),
    (tournament_id, 'Germany', 'DEU', '🇩🇪'),
    (tournament_id, 'Denmark', 'DNK', '🇩🇰'),
    (tournament_id, 'Sweden', 'SWE', '🇸🇪'),
    (tournament_id, 'Norway', 'NOR', '🇳🇴'),
    (tournament_id, 'Brazil', 'BRA', '🇧🇷'),
    (tournament_id, 'Argentina', 'ARG', '🇦🇷'),
    (tournament_id, 'Uruguay', 'URY', '🇺🇾')
  on conflict (tournament_id, country_name) do nothing;

  return tournament_id;
end;
$$;

-- Function to assign country to group
create or replace function public.assign_country_to_group(
  tournament_id_input uuid,
  country_id_input uuid,
  group_letter_input text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count int;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if group_letter_input not in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H') then
    raise exception 'Invalid group letter';
  end if;

  -- Check if group already has 5 teams
  select count(*) into current_count
  from public.world_cup_groups
  where tournament_id = tournament_id_input
    and group_letter = group_letter_input;

  if current_count >= 5 then
    raise exception 'Group % already has 5 teams', group_letter_input;
  end if;

  -- Check if country is already assigned to a group
  if exists (
    select 1 from public.world_cup_groups
    where tournament_id = tournament_id_input
      and country_id = country_id_input
  ) then
    raise exception 'Country is already assigned to a group';
  end if;

  -- Assign country to group
  insert into public.world_cup_groups (tournament_id, group_letter, country_id, assigned_by)
  values (tournament_id_input, group_letter_input, country_id_input, auth.uid());

  -- Update country group assignment
  update public.world_cup_countries
  set group_assignment = group_letter_input
  where id = country_id_input;
end;
$$;

-- Function to appoint manager to country
create or replace function public.appoint_country_manager(
  tournament_id_input uuid,
  country_id_input uuid,
  manager_id_input uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  manager_profile public.profiles%rowtype;
  current_assignment public.season_club_assignments%rowtype;
  club_name text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  -- Check manager is active and approved
  select * into manager_profile
  from public.profiles
  where id = manager_id_input
    and is_approved = true
    and status = 'active';
  
  if not found then
    raise exception 'Manager must be active and approved';
  end if;

  -- Get current club assignment for current season
  select * into current_assignment
  from public.season_club_assignments
  where player_id = manager_id_input
    and season_year = extract(year from now())::int
  order by assigned_at desc
  limit 1;

  if not found then
    raise exception 'Manager must have a current club assignment';
  end if;

  -- Get club name
  select club_name into club_name
  from public.league_clubs
  where id = current_assignment.club_id;

  -- End current appointment for this country if exists
  update public.world_cup_manager_appointments
  set is_current = false,
      end_date = now(),
      end_reason = 'replaced'
  where tournament_id = tournament_id_input
    and country_id = country_id_input
    and is_current = true;

  -- Create new appointment
  insert into public.world_cup_manager_appointments (
    tournament_id, country_id, manager_id, source_club_id, 
    source_club_name, appointed_by
  )
  values (
    tournament_id_input, country_id_input, manager_id_input, 
    current_assignment.club_id, club_name, auth.uid()
  );
end;
$$;

-- Function to generate group stage fixtures
create or replace function public.generate_world_cup_group_fixtures(tournament_id_input uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  group_record record;
  countries_record record;
  countries_record_2 record;
  fixture_count int := 0;
  match_number int := 1;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  -- For each group
  for group_record in 
    select distinct group_letter 
    from public.world_cup_groups 
    where tournament_id = tournament_id_input
  loop
    -- Generate round-robin fixtures for this group
    for countries_record in 
      select c.id as country_id, c.country_name
      from public.world_cup_countries c
      join public.world_cup_groups g on c.id = g.country_id
      where g.tournament_id = tournament_id_input
        and g.group_letter = group_record.group_letter
    loop
      for countries_record_2 in 
        select c.id as country_id, c.country_name
        from public.world_cup_countries c
        join public.world_cup_groups g on c.id = g.country_id
        where g.tournament_id = tournament_id_input
          and g.group_letter = group_record.group_letter
          and c.id > countries_record.country_id
      loop
        insert into public.world_cup_fixtures (
          tournament_id, match_type, group_letter, 
          home_country_id, away_country_id, match_number
        )
        values (
          tournament_id_input, 'group_stage', group_record.group_letter,
          countries_record.country_id, countries_record_2.country_id, match_number
        );
        
        fixture_count := fixture_count + 1;
        match_number := match_number + 1;
      end loop;
    end loop;
  end loop;

  -- Initialize standings for all countries
  insert into public.world_cup_standings (tournament_id, group_letter, country_id)
  select 
    g.tournament_id, 
    g.group_letter, 
    g.country_id
  from public.world_cup_groups g
  on conflict (tournament_id, group_letter, country_id) do nothing;

  return fixture_count;
end;
$$;

-- Function to calculate group standings
create or replace function public.calculate_world_cup_group_standings(tournament_id_input uuid, group_letter_input text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Update standings based on completed fixtures
  update public.world_cup_standings s
  set
    played = stats.played,
    won = stats.won,
    draw = stats.draw,
    lost = stats.lost,
    goals_for = stats.goals_for,
    goals_against = stats.goals_against,
    points = stats.points
  from (
    select
      s.country_id,
      count(f.id)::int as played,
      sum(case when f.home_score > f.away_score then 1 else 0 end)::int as won,
      sum(case when f.home_score = f.away_score then 1 else 0 end)::int as draw,
      sum(case when f.home_score < f.away_score then 1 else 0 end)::int as lost,
      sum(case when s.country_id = f.home_country_id then f.home_score else f.away_score end)::int as goals_for,
      sum(case when s.country_id = f.home_country_id then f.away_score else f.home_score end)::int as goals_against,
      sum(
        case when f.home_score > f.away_score then 3
             when f.home_score = f.away_score then 1
             else 0 end
      )::int as points
    from public.world_cup_standings s
    join public.world_cup_fixtures f on (
      (f.home_country_id = s.country_id or f.away_country_id = s.country_id)
      and f.tournament_id = s.tournament_id
      and f.group_letter = s.group_letter
      and f.match_type = 'group_stage'
      and f.status = 'completed'
    )
    where s.tournament_id = tournament_id_input
      and s.group_letter = group_letter_input
    group by s.country_id
  ) stats
  where s.country_id = stats.country_id
    and s.tournament_id = tournament_id_input
    and s.group_letter = group_letter_input;

  -- Calculate positions
  update public.world_cup_standings s
  set position = positions.position
  from (
    select 
      country_id,
      row_number() over (
        order by points desc, goal_difference desc, goals_for desc
      ) as position
    from public.world_cup_standings
    where tournament_id = tournament_id_input
      and group_letter = group_letter_input
  ) positions
  where s.country_id = positions.country_id
    and s.tournament_id = tournament_id_input
    and s.group_letter = group_letter_input;
end;
$$;

-- Function to submit tournament fixture result
create or replace function public.submit_world_cup_fixture_result(
  fixture_id_input uuid,
  home_score_input int,
  away_score_input int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture_record public.world_cup_fixtures%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if home_score_input < 0 or away_score_input < 0 then
    raise exception 'Scores cannot be negative';
  end if;

  select * into fixture_record
  from public.world_cup_fixtures
  where id = fixture_id_input
  for update;

  if not found then
    raise exception 'Fixture not found';
  end if;

  if fixture_record.status = 'completed' then
    raise exception 'Fixture already completed';
  end if;

  update public.world_cup_fixtures
  set
    home_score = home_score_input,
    away_score = away_score_input,
    status = 'completed',
    played_at = now(),
    submitted_by = auth.uid(),
    submitted_at = now()
  where id = fixture_id_input;

  -- Recalculate group standings if this is a group stage match
  if fixture_record.match_type = 'group_stage' then
    perform public.calculate_world_cup_group_standings(
      fixture_record.tournament_id, 
      fixture_record.group_letter
    );
  end if;
end;
$$;

-- Function to generate knockout stage fixtures
create or replace function public.generate_world_cup_knockout_fixtures(tournament_id_input uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  group_winners uuid[];
  group_second_places uuid[];
  group_third_places uuid[];
  fixture_count int := 0;
  match_number int := 1;
  qualified_count int;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  -- Get top 3 teams from each group (positions 1, 2, 3)
  select array_agg(country_id order by position) into group_winners
  from public.world_cup_standings
  where tournament_id = tournament_id_input
    and position = 1;
    
  select array_agg(country_id order by position) into group_second_places
  from public.world_cup_standings
  where tournament_id = tournament_id_input
    and position = 2;
    
  select array_agg(country_id order by position) into group_third_places
  from public.world_cup_standings
  where tournament_id = tournament_id_input
    and position = 3;

  -- Validate we have exactly 8 teams in each category
  if array_length(group_winners, 1) <> 8 or 
     array_length(group_second_places, 1) <> 8 or 
     array_length(group_third_places, 1) <> 8 then
    raise exception 'Group stage must be completed with exactly 8 groups having 3 qualified teams each';
  end if;

  -- Mark qualified teams in standings
  update public.world_cup_standings
  set advanced = true
  where tournament_id = tournament_id_input
    and position <= 3;

  -- Generate opening knockout round (16 teams: 2nd and 3rd places)
  -- Pair 2nd places with 3rd places from different groups
  for i in 1..8 loop
    -- Simple pairing: 2nd place from group i vs 3rd place from group (i % 8) + 1
    declare
      home_team uuid := group_second_places[i];
      away_team uuid := group_third_places[((i % 8) + 1)];
    begin
      insert into public.world_cup_fixtures (
        tournament_id, match_type, knockout_round, 
        home_country_id, away_country_id, match_number
      )
      values (
        tournament_id_input, 'knockout', 'opening_round',
        home_team, away_team, match_number
      );
      
      fixture_count := fixture_count + 1;
      match_number := match_number + 1;
    end;
  end loop;

  -- Update tournament status
  update public.world_cup_tournaments
  set current_round = 'opening_round'
  where id = tournament_id_input;

  return fixture_count;
end;
$$;

-- Function to generate round of 16 fixtures
create or replace function public.generate_world_cup_round_of_16(tournament_id_input uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  group_winners uuid[];
  opening_round_winners uuid[];
  fixture_count int := 0;
  match_number int := 1;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  -- Get group winners (8 teams with byes)
  select array_agg(country_id order by position) into group_winners
  from public.world_cup_standings
  where tournament_id = tournament_id_input
    and position = 1;

  -- Get opening round winners
  select array_agg(
    case when home_score > away_score then home_country_id else away_country_id end
    order by match_number
  ) into opening_round_winners
  from public.world_cup_fixtures
  where tournament_id = tournament_id_input
    and knockout_round = 'opening_round'
    and status = 'completed';

  -- Validate we have 8 group winners and 8 opening round winners
  if array_length(group_winners, 1) <> 8 or array_length(opening_round_winners, 1) <> 8 then
    raise exception 'Opening round must be completed with 8 winners';
  end if;

  -- Generate round of 16: group winners vs opening round winners
  for i in 1..8 loop
    insert into public.world_cup_fixtures (
      tournament_id, match_type, knockout_round, 
      home_country_id, away_country_id, match_number
    )
    values (
      tournament_id_input, 'knockout', 'round_of_16',
      group_winners[i], opening_round_winners[i], match_number
    );
    
    fixture_count := fixture_count + 1;
    match_number := match_number + 1;
  end loop;

  -- Update tournament status
  update public.world_cup_tournaments
  set current_round = 'round_of_16'
  where id = tournament_id_input;

  return fixture_count;
end;
$$;

-- Function to generate quarter-final fixtures
create or replace function public.generate_world_cup_quarter_finals(tournament_id_input uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  round_of_16_winners uuid[];
  fixture_count int := 0;
  match_number int := 1;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  -- Get round of 16 winners
  select array_agg(
    case when home_score > away_score then home_country_id else away_country_id end
    order by match_number
  ) into round_of_16_winners
  from public.world_cup_fixtures
  where tournament_id = tournament_id_input
    and knockout_round = 'round_of_16'
    and status = 'completed';

  if array_length(round_of_16_winners, 1) <> 8 then
    raise exception 'Round of 16 must be completed with 8 winners';
  end if;

  -- Generate quarter-finals: 1vs8, 2vs7, 3vs6, 4vs5, etc.
  insert into public.world_cup_fixtures (
    tournament_id, match_type, knockout_round, 
    home_country_id, away_country_id, match_number
  )
  values
    (tournament_id_input, 'knockout', 'quarter_final', round_of_16_winners[1], round_of_16_winners[8], 1),
    (tournament_id_input, 'knockout', 'quarter_final', round_of_16_winners[2], round_of_16_winners[7], 2),
    (tournament_id_input, 'knockout', 'quarter_final', round_of_16_winners[3], round_of_16_winners[6], 3),
    (tournament_id_input, 'knockout', 'quarter_final', round_of_16_winners[4], round_of_16_winners[5], 4);

  fixture_count := 4;

  -- Update tournament status
  update public.world_cup_tournaments
  set current_round = 'quarter_final'
  where id = tournament_id_input;

  return fixture_count;
end;
$$;

-- Function to generate semi-final fixtures
create or replace function public.generate_world_cup_semi_finals(tournament_id_input uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  quarter_final_winners uuid[];
  fixture_count int := 0;
  match_number int := 1;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  -- Get quarter-final winners
  select array_agg(
    case when home_score > away_score then home_country_id else away_country_id end
    order by match_number
  ) into quarter_final_winners
  from public.world_cup_fixtures
  where tournament_id = tournament_id_input
    and knockout_round = 'quarter_final'
    and status = 'completed';

  if array_length(quarter_final_winners, 1) <> 4 then
    raise exception 'Quarter-finals must be completed with 4 winners';
  end if;

  -- Generate semi-finals: 1vs4, 2vs3
  insert into public.world_cup_fixtures (
    tournament_id, match_type, knockout_round, 
    home_country_id, away_country_id, match_number
  )
  values
    (tournament_id_input, 'knockout', 'semi_final', quarter_final_winners[1], quarter_final_winners[4], 1),
    (tournament_id_input, 'knockout', 'semi_final', quarter_final_winners[2], quarter_final_winners[3], 2);

  fixture_count := 2;

  -- Update tournament status
  update public.world_cup_tournaments
  set current_round = 'semi_final'
  where id = tournament_id_input;

  return fixture_count;
end;
$$;

-- Function to generate final and third-place fixtures
create or replace function public.generate_world_cup_final(tournament_id_input uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  semi_final_winners uuid[];
  semi_final_losers uuid[];
  fixture_count int := 0;
  match_number int := 1;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  -- Get semi-final results
  select 
    array_agg(
      case when home_score > away_score then home_country_id else away_country_id end
      order by match_number
    ),
    array_agg(
      case when home_score > away_score then away_country_id else home_country_id end
      order by match_number
    )
  into semi_final_winners, semi_final_losers
  from public.world_cup_fixtures
  where tournament_id = tournament_id_input
    and knockout_round = 'semi_final'
    and status = 'completed';

  if array_length(semi_final_winners, 1) <> 2 or array_length(semi_final_losers, 1) <> 2 then
    raise exception 'Semi-finals must be completed';
  end if;

  -- Generate third-place match
  insert into public.world_cup_fixtures (
    tournament_id, match_type, knockout_round, 
    home_country_id, away_country_id, match_number
  )
  values (
    tournament_id_input, 'knockout', 'third_place', 
    semi_final_losers[1], semi_final_losers[2], 1
  );

  -- Generate final
  insert into public.world_cup_fixtures (
    tournament_id, match_type, knockout_round, 
    home_country_id, away_country_id, match_number
  )
  values (
    tournament_id_input, 'knockout', 'final', 
    semi_final_winners[1], semi_final_winners[2], 2
  );

  fixture_count := 2;

  -- Update tournament status
  update public.world_cup_tournaments
  set current_round = 'final'
  where id = tournament_id_input;

  return fixture_count;
end;
$$;

-- Grant execute permissions on new functions
grant execute on function public.initialize_elite_world_cup() to authenticated;
grant execute on function public.assign_country_to_group(uuid, uuid, text) to authenticated;
grant execute on function public.appoint_country_manager(uuid, uuid, uuid) to authenticated;
grant execute on function public.generate_world_cup_group_fixtures(uuid) to authenticated;
grant execute on function public.calculate_world_cup_group_standings(uuid, text) to authenticated;
grant execute on function public.submit_world_cup_fixture_result(uuid, int, int) to authenticated;

-- Add audit log entry for tournament initialization
create or replace function public.log_world_cup_admin_action(
  action_text text,
  tournament_id uuid,
  target_id uuid,
  notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (auth.uid(), action_text, target_id, 
          'Tournament: ' || tournament_id::text || ' - ' || notes);
end;
$$;

grant execute on function public.log_world_cup_admin_action(text, uuid, uuid, text) to authenticated;