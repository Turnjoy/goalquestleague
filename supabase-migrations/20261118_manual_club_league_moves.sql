begin;

-- Manual moves update the permanent club row. Fixtures, season assignments, and
-- standings keep their existing club IDs and historical league/division values.
create table if not exists public.club_league_move_audit (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.league_clubs(id) on delete restrict,
  move_type text not null check (move_type in ('promote', 'relegate')),
  reason text not null check (reason in ('manager_availability', 'punishment', 'other', 'season_end')),
  reason_details text,
  previous_league text not null,
  previous_division text not null,
  new_league text not null,
  new_division text not null,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint club_league_move_reason_details_check
    check (reason <> 'other' or nullif(btrim(reason_details), '') is not null)
);

create index if not exists club_league_move_audit_club_created_idx
  on public.club_league_move_audit (club_id, created_at desc);

-- A full destination can still be handled without deleting clubs: the admin
-- explicitly chooses the club moving in the opposite direction. Deferral lets
-- the existing per-division club-number uniqueness remain valid for that swap.
alter table public.league_clubs
  drop constraint if exists league_clubs_league_name_division_club_number_key;
alter table public.league_clubs
  add constraint league_clubs_league_name_division_club_number_key
  unique (league_name, division, club_number) deferrable initially immediate;

alter table public.club_league_move_audit enable row level security;

drop policy if exists club_league_move_audit_admin_read
  on public.club_league_move_audit;
create policy club_league_move_audit_admin_read
  on public.club_league_move_audit
  for select using (public.is_admin());
grant select on public.club_league_move_audit to authenticated;

create or replace function public.admin_move_club_league(
  p_club_id uuid,
  p_new_league text,
  p_new_division text,
  p_move_type text,
  p_reason text,
  p_reason_details text default null,
  p_counterpart_club_id uuid default null
)
returns public.league_clubs
language plpgsql
security definer
set search_path = ''
as $$
declare
  club_row public.league_clubs%rowtype;
  counterpart_row public.league_clubs%rowtype;
  destination_number integer;
  previous_league_value text;
  previous_division_value text;
  destination_count integer;
  selected_action text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_move_type is null or p_move_type not in ('promote', 'relegate') then
    raise exception 'Move type must be promote or relegate';
  end if;
  if p_reason is null or p_reason not in ('manager_availability', 'punishment', 'other', 'season_end') then
    raise exception 'Choose a valid move reason';
  end if;
  if p_reason = 'other' and nullif(btrim(p_reason_details), '') is null then
    raise exception 'Describe the reason for an other move';
  end if;
  if nullif(btrim(p_new_league), '') is null
     or nullif(btrim(p_new_division), '') is null then
    raise exception 'A destination league and division are required';
  end if;

  select * into club_row
  from public.league_clubs
  where id = p_club_id
  for update;
  if not found then
    raise exception 'Club not found';
  end if;
  if club_row.league_name = btrim(p_new_league)
     and club_row.division = btrim(p_new_division) then
    raise exception 'The club is already in that league and division';
  end if;

  -- Serialize moves into the same destination and retain the existing
  -- 20-club/club-number convention used by fixture generation.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(btrim(p_new_league) || ':' || btrim(p_new_division), 0)
  );
  if not exists (
    select 1 from public.league_clubs c
    where c.league_name = btrim(p_new_league)
      and c.division = btrim(p_new_division)
  ) then
    raise exception 'Destination league division is not configured';
  end if;
  select count(*) into destination_count
  from public.league_clubs c
  where c.league_name = btrim(p_new_league)
    and c.division = btrim(p_new_division);
  if destination_count >= 20 and p_counterpart_club_id is null then
    raise exception 'Destination is full; choose a club to move in the opposite direction';
  end if;
  if p_counterpart_club_id is not null then
    select * into counterpart_row
    from public.league_clubs
    where id = p_counterpart_club_id
    for update;
    if not found
       or counterpart_row.league_name <> btrim(p_new_league)
       or counterpart_row.division <> btrim(p_new_division) then
      raise exception 'The selected counterpart is not in the destination division';
    end if;
    if p_move_type = 'promote' then
      selected_action := 'relegate';
    else
      selected_action := 'promote';
    end if;
  end if;

  if p_counterpart_club_id is null then
    select slot_number into destination_number
    from generate_series(1, 20) as slot(slot_number)
    where not exists (
      select 1 from public.league_clubs c
      where c.league_name = btrim(p_new_league)
        and c.division = btrim(p_new_division)
        and c.club_number = slot.slot_number
    )
    order by slot_number
    limit 1;
    if destination_number is null then
      raise exception 'Destination division has no available club number';
    end if;
  end if;

  previous_league_value := club_row.league_name;
  previous_division_value := club_row.division;
  if p_counterpart_club_id is not null then
    set constraints league_clubs_league_name_division_club_number_key deferred;
    update public.league_clubs
    set league_name = case when id = p_club_id then btrim(p_new_league) else previous_league_value end,
        division = case when id = p_club_id then btrim(p_new_division) else previous_division_value end,
        club_number = case when id = p_club_id then counterpart_row.club_number else club_row.club_number end
    where id in (p_club_id, p_counterpart_club_id);
    select * into club_row from public.league_clubs where id = p_club_id;
  else
    update public.league_clubs
    set league_name = btrim(p_new_league),
        division = btrim(p_new_division),
        club_number = destination_number
    where id = p_club_id
    returning * into club_row;
  end if;

  insert into public.club_league_move_audit (
    club_id, move_type, reason, reason_details,
    previous_league, previous_division, new_league, new_division, admin_id
  ) values (
    club_row.id, p_move_type, p_reason, nullif(btrim(p_reason_details), ''),
    previous_league_value, previous_division_value,
    club_row.league_name, club_row.division, auth.uid()
  );
  if p_counterpart_club_id is not null then
    insert into public.club_league_move_audit (
      club_id, move_type, reason, reason_details,
      previous_league, previous_division, new_league, new_division, admin_id
    ) values (
      counterpart_row.id, selected_action, p_reason,
      nullif(btrim(p_reason_details), ''),
      counterpart_row.league_name, counterpart_row.division,
      previous_league_value, previous_division_value, auth.uid()
    );
  end if;
  return club_row;
end;
$$;

revoke all on function public.admin_move_club_league(uuid, text, text, text, text, text, uuid)
  from public, anon;
grant execute on function public.admin_move_club_league(uuid, text, text, text, text, text, uuid)
  to authenticated;

create table if not exists public.club_season_movement_runs (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null check (season_year between 2000 and 2200),
  lower_league text not null,
  lower_division text not null,
  upper_league text not null,
  upper_division text not null,
  promoted_club_ids uuid[] not null,
  relegated_club_ids uuid[] not null,
  completed_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz not null default now(),
  constraint club_season_movement_distinct_divisions
    check ((lower_league, lower_division) <> (upper_league, upper_division)),
  constraint club_season_movement_once_per_pair
    unique (season_year, lower_league, lower_division, upper_league, upper_division)
);

alter table public.club_season_movement_runs enable row level security;
drop policy if exists club_season_movement_runs_admin_read
  on public.club_season_movement_runs;
create policy club_season_movement_runs_admin_read
  on public.club_season_movement_runs
  for select using (public.is_admin());
grant select on public.club_season_movement_runs to authenticated;

create or replace function public.admin_complete_club_season(
  p_season_year integer,
  p_lower_league text,
  p_lower_division text,
  p_upper_league text,
  p_upper_division text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  promoted_ids uuid[];
  relegated_ids uuid[];
  pair_index integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_season_year is null or p_season_year < 2000 or p_season_year > 2200 then
    raise exception 'Season year is invalid';
  end if;
  if (p_lower_league, p_lower_division) = (p_upper_league, p_upper_division) then
    raise exception 'Choose two different league divisions';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_season_year::text || ':' || p_lower_league || ':' || p_lower_division || ':' || p_upper_league || ':' || p_upper_division,
      0
    )
  );
  if exists (
    select 1 from public.club_season_movement_runs r
    where r.season_year = p_season_year
      and r.lower_league = p_lower_league and r.lower_division = p_lower_division
      and r.upper_league = p_upper_league and r.upper_division = p_upper_division
  ) then
    raise exception 'The 3-up/3-down movement has already run for this season and division pair';
  end if;

  if not exists (
    select 1 from public.season_calendars sc
    where sc.season_year = p_season_year and sc.division = p_lower_division
      and sc.stop_date is not null and sc.stop_date <= current_date
  ) or not exists (
    select 1 from public.season_calendars sc
    where sc.season_year = p_season_year and sc.division = p_upper_division
      and sc.stop_date is not null and sc.stop_date <= current_date
  ) then
    raise exception 'Both selected seasons must have reached their configured stop date';
  end if;
  if (
    select count(*) from public.league_clubs c
    where c.league_name = p_lower_league and c.division = p_lower_division
  ) <> 20 or (
    select count(*) from public.league_clubs c
    where c.league_name = p_upper_league and c.division = p_upper_division
  ) <> 20 then
    raise exception 'Both divisions must contain exactly 20 permanent clubs';
  end if;
  if (
    select count(distinct s.club_id)
    from public.standings s
    join public.league_clubs c on c.id = s.club_id
    where s.season = p_season_year
      and c.league_name = p_lower_league and c.division = p_lower_division
  ) <> 20 or (
    select count(distinct s.club_id)
    from public.standings s
    join public.league_clubs c on c.id = s.club_id
    where s.season = p_season_year
      and c.league_name = p_upper_league and c.division = p_upper_division
  ) <> 20 then
    raise exception 'All 20 clubs in both divisions must have season standings';
  end if;
  if not exists (
    select 1 from public.fixtures f
    where f.league_name = p_lower_league and f.division = p_lower_division
      and f.season_year = p_season_year
  ) or not exists (
    select 1 from public.fixtures f
    where f.league_name = p_upper_league and f.division = p_upper_division
      and f.season_year = p_season_year
  ) then
    raise exception 'Both divisions must have season fixtures before completion';
  end if;
  if exists (
    select 1 from public.fixtures f
    where f.season_year = p_season_year
      and ((f.league_name = p_lower_league and f.division = p_lower_division)
        or (f.league_name = p_upper_league and f.division = p_upper_division))
      and f.status not in ('completed', 'cancelled')
  ) then
    raise exception 'All fixtures must be completed or cancelled before automatic movement';
  end if;

  -- Reuse the standings directory's ranking fields: points, goal difference,
  -- goals for, and played; club number resolves any remaining tie.
  select array_agg(r.id order by r.points desc, r.goal_difference desc,
                    r.goals_for desc, r.played desc, r.club_number, r.id)
  into promoted_ids
  from (
    select c.id, c.club_number,
      coalesce(s.points, 0) as points,
      coalesce(s.goal_difference, 0) as goal_difference,
      coalesce(s.goals_for, 0) as goals_for,
      coalesce(s.played, 0) as played
    from public.league_clubs c
    left join public.standings s on s.club_id = c.id and s.season = p_season_year
    where c.league_name = p_lower_league and c.division = p_lower_division
    order by points desc, goal_difference desc, goals_for desc, played desc, c.club_number, c.id
    limit 3
  ) r;
  select array_agg(r.id order by r.points asc, r.goal_difference asc,
                    r.goals_for asc, r.played asc, r.club_number desc, r.id)
  into relegated_ids
  from (
    select c.id, c.club_number,
      coalesce(s.points, 0) as points,
      coalesce(s.goal_difference, 0) as goal_difference,
      coalesce(s.goals_for, 0) as goals_for,
      coalesce(s.played, 0) as played
    from public.league_clubs c
    left join public.standings s on s.club_id = c.id and s.season = p_season_year
    where c.league_name = p_upper_league and c.division = p_upper_division
    order by points asc, goal_difference asc, goals_for asc, played asc, c.club_number desc, c.id
    limit 3
  ) r;

  insert into public.club_season_movement_runs (
    season_year, lower_league, lower_division, upper_league, upper_division,
    promoted_club_ids, relegated_club_ids, completed_by
  ) values (
    p_season_year, p_lower_league, p_lower_division, p_upper_league, p_upper_division,
    promoted_ids, relegated_ids, auth.uid()
  );

  for pair_index in 1..3 loop
    perform public.admin_move_club_league(
      promoted_ids[pair_index], p_upper_league, p_upper_division,
      'promote', 'season_end', 'Automatic 3-up/3-down for season ' || p_season_year::text,
      relegated_ids[pair_index]
    );
  end loop;

  return jsonb_build_object(
    'season_year', p_season_year,
    'promoted_club_ids', promoted_ids,
    'relegated_club_ids', relegated_ids,
    'promoted', 3,
    'relegated', 3
  );
end;
$$;

revoke all on function public.admin_complete_club_season(integer, text, text, text, text)
  from public, anon;
grant execute on function public.admin_complete_club_season(integer, text, text, text, text)
  to authenticated;

commit;
