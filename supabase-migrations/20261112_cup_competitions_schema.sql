-- Cup & Tournament System Schema
-- Isolated from league operations with club-based architecture

-- Cup competition types
do $$ begin
  create type public.cup_status as enum ('unconfigured', 'draft_preview', 'active', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.cup_format as enum ('knockout', 'group_stage_knockout');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.knockout_format as enum ('single_match', 'two_legged');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.group_format as enum ('single_round_robin', 'home_away');
exception when duplicate_object then null;
end $$;

-- Main cup competitions table
create table if not exists public.cup_competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name text not null,
  description text,
  cup_format public.cup_format not null default 'knockout',
  qualification_criteria jsonb not null, -- Stores qualification rules
  status public.cup_status not null default 'unconfigured',
  current_round text,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  is_system_competition boolean not null default false -- For the 7 pre-seeded competitions
);

-- Cup configuration template
create table if not exists public.cup_configurations (
  id uuid primary key default gen_random_uuid(),
  cup_id uuid not null references public.cup_competitions(id) on delete cascade,
  season_year int not null,
  
  -- Timeline settings
  start_date timestamptz,
  end_date timestamptz,
  match_deadlines jsonb, -- Round-by-round deadlines
  
  -- Group stage settings
  has_group_stage boolean not null default false,
  number_of_groups int,
  group_format public.group_format,
  teams_advance_per_group int,
  
  -- Knockout settings
  knockout_format public.knockout_format not null default 'single_match',
  final_format public.knockout_format not null default 'single_match',
  
  -- Draft management
  is_draft boolean not null default true,
  draft_fixtures jsonb, -- Stores generated fixtures in draft state
  draft_bracket jsonb, -- Stores bracket visualization data
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  activated_at timestamptz,
  activated_by uuid references public.profiles(id),
  
  unique (cup_id, season_year)
);

-- Cup participants (club-based)
create table if not exists public.cup_participants (
  id uuid primary key default gen_random_uuid(),
  cup_config_id uuid not null references public.cup_configurations(id) on delete cascade,
  club_id uuid not null,
  qualification_source text, -- e.g., 'Apex Football League position 1-8'
  qualification_rank int, -- Their qualifying position
  group_assignment text, -- A, B, C, etc. if group stage
  eliminated_at timestamptz,
  final_position int,
  created_at timestamptz not null default now(),
  unique (cup_config_id, club_id)
);

-- Cup fixtures (isolated from league fixtures)
create table if not exists public.cup_fixtures (
  id uuid primary key default gen_random_uuid(),
  cup_config_id uuid not null references public.cup_configurations(id) on delete cascade,
  
  -- Fixture identification
  round_name text not null, -- e.g., 'Group A', 'Round of 16', 'Final'
  match_number int,
  group_letter text, -- For group stage matches
  
  -- Teams (club-based)
  home_club_id uuid not null,
  away_club_id uuid not null,
  
  -- Match details
  fixture_date timestamptz,
  deadline timestamptz,
  venue text,
  status text not null default 'scheduled', -- scheduled, in_progress, completed, cancelled
  
  -- Scores
  home_score int,
  away_score int,
  home_extra_time_score int,
  away_extra_time_score int,
  home_penalty_shootout int,
  away_penalty_shootout int,
  
  -- Two-legged fixtures
  is_first_leg boolean default false,
  is_second_leg boolean default false,
  first_leg_id uuid references public.cup_fixtures(id),
  aggregate_home_score int,
  aggregate_away_score int,
  
  -- Match metadata
  played_at timestamptz,
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  constraint different_teams check (home_club_id <> away_club_id),
  constraint non_negative_scores check (
    (home_score is null or home_score >= 0) and
    (away_score is null or away_score >= 0) and
    (home_extra_time_score is null or home_extra_time_score >= 0) and
    (away_extra_time_score is null or away_extra_time_score >= 0) and
    (home_penalty_shootout is null or home_penalty_shootout >= 0) and
    (away_penalty_shootout is null or away_penalty_shootout >= 0)
  )
);

-- Cup standings (for group stages)
create table if not exists public.cup_standings (
  id uuid primary key default gen_random_uuid(),
  cup_config_id uuid not null references public.cup_configurations(id) on delete cascade,
  group_letter text not null,
  club_id uuid not null,
  
  -- Group stage stats
  played int not null default 0,
  won int not null default 0,
  draw int not null default 0,
  lost int not null default 0,
  goals_for int not null default 0,
  goals_against int not null default 0,
  goal_difference int generated always as (goals_for - goals_against) stored,
  points int not null default 0,
  position int,
  
  advanced boolean not null default false,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  unique (cup_config_id, group_letter, club_id)
);

-- Enable Row Level Security
alter table public.cup_competitions enable row level security;
alter table public.cup_configurations enable row level security;
alter table public.cup_participants enable row level security;
alter table public.cup_fixtures enable row level security;
alter table public.cup_standings enable row level security;

-- RLS Policies
create policy "competitions_public_read" on public.cup_competitions
  for select using (true);

create policy "competitions_admin_write" on public.cup_competitions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "configurations_public_read" on public.cup_configurations
  for select using (not is_draft); -- Only active configs visible to public

create policy "configurations_admin_write" on public.cup_configurations
  for all using (public.is_admin()) with check (public.is_admin());

create policy "participants_public_read" on public.cup_participants
  for select using (
    exists (
      select 1 from public.cup_configurations 
      where id = cup_config_id and not is_draft
    )
  );

create policy "participants_admin_write" on public.cup_participants
  for all using (public.is_admin()) with check (public.is_admin());

create policy "fixtures_public_read" on public.cup_fixtures
  for select using (
    exists (
      select 1 from public.cup_configurations 
      where id = cup_config_id and not is_draft
    )
  );

create policy "fixtures_admin_write" on public.cup_fixtures
  for all using (public.is_admin()) with check (public.is_admin());

create policy "standings_public_read" on public.cup_standings
  for select using (
    exists (
      select 1 from public.cup_configurations 
      where id = cup_config_id and not is_draft
    )
  );

create policy "standings_admin_write" on public.cup_standings
  for all using (public.is_admin()) with check (public.is_admin());

-- Helper function to update updated_at
create or replace function public.update_cup_updated_at()
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

-- Add triggers
create trigger update_competitions_updated_at
  before update on public.cup_competitions
  for each row execute function public.update_cup_updated_at();

create trigger update_configurations_updated_at
  before update on public.cup_configurations
  for each row execute function public.update_cup_updated_at();

create trigger update_fixtures_updated_at
  before update on public.cup_fixtures
  for each row execute function public.update_cup_updated_at();

create trigger update_standings_updated_at
  before update on public.cup_standings
  for each row execute function public.update_cup_updated_at();

-- Function to pre-seed the 7 system competitions
create or replace function public.seed_system_cup_competitions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  insert into public.cup_competitions (name, display_name, description, qualification_criteria, cup_format, is_system_competition)
  values
    (
      'quest_champions_league',
      'Quest Champions League',
      'Premier club competition featuring top 8 teams from each league',
      '{"qualification_type": "league_positions", "leagues": ["all"], "positions": [1,2,3,4,5,6,7,8]}'::jsonb,
      'group_stage_knockout',
      true
    ),
    (
      'quest_europa_league',
      'Quest Europa League',
      'Secondary club competition featuring teams positioned 9-16 from each league',
      '{"qualification_type": "league_positions", "leagues": ["all"], "positions": [9,10,11,12,13,14,15,16]}'::jsonb,
      'group_stage_knockout',
      true
    ),
    (
      'quest_super_cup',
      'Quest Super Cup',
      'Annual match between Quest Champions League winner and Quest Europa League winner',
      '{"qualification_type": "cup_winners", "cups": ["quest_champions_league", "quest_europa_league"]}'::jsonb,
      'knockout',
      true
    ),
    (
      'universal_cup',
      'Universal Cup',
      'Elite competition featuring top 4 teams from each league',
      '{"qualification_type": "league_positions", "leagues": ["all"], "positions": [1,2,3,4]}'::jsonb,
      'knockout',
      true
    ),
    (
      'club_world_cup',
      'Club World Cup',
      'Global competition featuring top 16 teams from each league',
      '{"qualification_type": "league_positions", "leagues": ["all"], "positions": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]}'::jsonb,
      'group_stage_knockout',
      true
    ),
    (
      'apex_premier_cup',
      'Apex Premier Cup',
      'Exclusive competition for Apex Football League top 16 teams',
      '{"qualification_type": "league_positions", "leagues": ["Apex Football League"], "positions": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]}'::jsonb,
      'knockout',
      true
    ),
    (
      'diamond_elite_cup',
      'Diamond Elite Cup',
      'Exclusive competition for Diamond Elite League top 16 teams',
      '{"qualification_type": "league_positions", "leagues": ["Diamond Elite League"], "positions": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]}'::jsonb,
      'knockout',
      true
    )
  on conflict (name) do nothing;
end;
$$;

-- Function to get qualified clubs for a competition
create or replace function public.get_qualified_clubs_for_cup(
  cup_name text,
  season_year int
)
returns table (
  club_id uuid,
  club_name text,
  league_name text,
  qualification_position int,
  qualification_source text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cup_record public.cup_competitions%rowtype;
  qualification_criteria jsonb;
begin
  -- Get cup details
  select * into cup_record
  from public.cup_competitions
  where name = cup_name;
  
  if not found then
    raise exception 'Cup not found: %', cup_name;
  end if;
  
  qualification_criteria := cup_record.qualification_criteria;
  
  -- Handle league position qualifications
  if qualification_criteria->>'qualification_type' = 'league_positions' then
    return query
    select 
      lc.club_id,
      lc.club_name,
      lc.league_name,
      row_number() over (partition by lc.league_name order by lc.position) as qualification_position,
      lc.league_name || ' position ' || lc.position as qualification_source
    from public.league_club_standings lc
    where lc.season_year = season_year
      and (qualification_criteria->'leagues' = '["all"]'::jsonb or lc.league_name = any(ARRAY(select jsonb_array_elements_text(qualification_criteria->'leagues'))))
      and lc.position = any(ARRAY(select jsonb_array_elements_text(qualification_criteria->'positions'))::int[])
    order by lc.league_name, lc.position;
  end if;
  
  -- Handle cup winner qualifications
  if qualification_criteria->>'qualification_type' = 'cup_winners' then
    -- This would require tracking cup winners - simplified for now
    return query select null::uuid, null::text, null::text, null::int, null::text limit 0;
  end if;
  
  return;
end;
$$;

-- Function to create cup configuration
create or replace function public.create_cup_configuration(
  cup_name text,
  season_year int,
  config_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cup_id uuid;
  config_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  
  -- Get cup ID
  select id into cup_id
  from public.cup_competitions
  where name = cup_name;
  
  if not found then
    raise exception 'Cup not found: %', cup_name;
  end if;
  
  -- Create configuration
  insert into public.cup_configurations (
    cup_id, season_year, start_date, end_date, match_deadlines,
    has_group_stage, number_of_groups, group_format, teams_advance_per_group,
    knockout_format, final_format, created_by
  )
  values (
    cup_id, season_year,
    (config_data->>'start_date')::timestamptz,
    (config_data->>'end_date')::timestamptz,
    config_data->'match_deadlines',
    (config_data->>'has_group_stage')::boolean,
    (config_data->>'number_of_groups')::int,
    config_data->>'group_format'::public.group_format,
    (config_data->>'teams_advance_per_group')::int,
    config_data->>'knockout_format'::public.knockout_format,
    config_data->>'final_format'::public.knockout_format,
    auth.uid()
  )
  returning id into config_id;
  
  -- Update cup status
  update public.cup_competitions
  set status = 'draft_preview'
  where id = cup_id;
  
  return config_id;
end;
$$;

-- Function to auto-qualify clubs for a cup
create or replace function public.auto_qualify_clubs_for_cup(
  config_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cup_name text;
  season_year int;
  qualified_count int;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  
  -- Get cup details
  select 
    c.name, 
    cfg.season_year
  into cup_name, season_year
  from public.cup_configurations cfg
  join public.cup_competitions c on cfg.cup_id = c.id
  where cfg.id = config_id;
  
  -- Insert qualified clubs
  insert into public.cup_participants (cup_config_id, club_id, qualification_source, qualification_rank)
  select 
    config_id,
    club_id,
    qualification_source,
    qualification_position
  from public.get_qualified_clubs_for_cup(cup_name, season_year)
  on conflict (cup_config_id, club_id) do nothing;
  
  -- Get count
  select count(*) into qualified_count
  from public.cup_participants
  where cup_config_id = config_id;
  
  return qualified_count;
end;
$$;

-- Function to generate group stage fixtures
create or replace function public.generate_cup_group_fixtures(config_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  config_record public.cup_configurations%rowtype;
  group_participants record;
  teams_in_group uuid[];
  fixture_count int := 0;
  match_number int := 1;
  i int;
  j int;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  
  -- Get configuration
  select * into config_record
  from public.cup_configurations
  where id = config_id;
  
  if not config_record.has_group_stage then
    raise exception 'This cup does not have a group stage';
  end if;
  
  -- Generate fixtures for each group
  for group_participants in 
    select group_letter, array_agg(club_id order by qualification_rank) as clubs
    from public.cup_participants
    where cup_config_id = config_id
      and group_assignment is not null
    group by group_letter
  loop
    teams_in_group := group_participants.clubs;
    
    -- Generate round-robin fixtures
    if config_record.group_format = 'single_round_robin' then
      for i in 1..array_length(teams_in_group, 1) loop
        for j in (i + 1)..array_length(teams_in_group, 1) loop
          insert into public.cup_fixtures (
            cup_config_id, round_name, group_letter, match_number,
            home_club_id, away_club_id
          )
          values (
            config_id, 
            'Group ' || group_participants.group_letter,
            group_participants.group_letter,
            match_number,
            teams_in_group[i],
            teams_in_group[j]
          );
          
          fixture_count := fixture_count + 1;
          match_number := match_number + 1;
        end loop;
      end loop;
    else -- Home & Away
      for i in 1..array_length(teams_in_group, 1) loop
        for j in 1..array_length(teams_in_group, 1) loop
          if i <> j then
            insert into public.cup_fixtures (
              cup_config_id, round_name, group_letter, match_number,
              home_club_id, away_club_id
            )
            values (
              config_id, 
              'Group ' || group_participants.group_letter,
              group_participants.group_letter,
              match_number,
              teams_in_group[i],
              teams_in_group[j]
            );
            
            fixture_count := fixture_count + 1;
            match_number := match_number + 1;
          end if;
        end loop;
      end loop;
    end if;
    
    -- Initialize group standings
    for i in 1..array_length(teams_in_group, 1) loop
      insert into public.cup_standings (cup_config_id, group_letter, club_id)
      values (config_id, group_participants.group_letter, teams_in_group[i])
      on conflict (cup_config_id, group_letter, club_id) do nothing;
    end loop;
  end loop;
  
  return fixture_count;
end;
$$;

-- Function to activate cup configuration
create or replace function public.activate_cup_configuration(config_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  
  update public.cup_configurations
  set 
    is_draft = false,
    activated_at = now(),
    activated_by = auth.uid()
  where id = config_id;
  
  -- Update cup status
  update public.cup_competitions
  set status = 'active'
  where id = (select cup_id from public.cup_configurations where id = config_id);
end;
$$;

-- Grant permissions
grant execute on function public.seed_system_cup_competitions() to authenticated;
grant execute on function public.get_qualified_clubs_for_cup(text, int) to authenticated;
grant execute on function public.create_cup_configuration(text, int, jsonb) to authenticated;
grant execute on function public.auto_qualify_clubs_for_cup(uuid) to authenticated;
grant execute on function public.generate_cup_group_fixtures(uuid) to authenticated;
grant execute on function public.activate_cup_configuration(uuid) to authenticated;