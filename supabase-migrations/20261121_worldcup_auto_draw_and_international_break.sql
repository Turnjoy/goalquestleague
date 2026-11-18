begin;

alter table public.world_cup_countries
  add column if not exists continent text;

update public.world_cup_countries
set continent = case country_code
  when 'CHL' then 'South America'
  when 'AUT' then 'Europe'
  when 'UKR' then 'Europe'
  when 'GRC' then 'Europe'
  when 'WAL' then 'Europe'
  when 'POL' then 'Europe'
  when 'RSA' then 'Africa'
  when 'KEN' then 'Africa'
  when 'CMR' then 'Africa'
  when 'GHA' then 'Africa'
  when 'NGA' then 'Africa'
  when 'SEN' then 'Africa'
  when 'EGY' then 'Africa'
  when 'MAR' then 'Africa'
  when 'DZA' then 'Africa'
  when 'JPN' then 'Asia'
  when 'CHN' then 'Asia'
  when 'QAT' then 'Asia'
  when 'KSA' then 'Asia'
  when 'NPL' then 'Asia'
  when 'AUS' then 'Oceania'
  when 'CAN' then 'North America'
  when 'MEX' then 'North America'
  when 'CRI' then 'North America'
  when 'COL' then 'South America'
  when 'PRT' then 'Europe'
  when 'ESP' then 'Europe'
  when 'ITA' then 'Europe'
  when 'HRV' then 'Europe'
  when 'FRA' then 'Europe'
  when 'BEL' then 'Europe'
  when 'ENG' then 'Europe'
  when 'NLD' then 'Europe'
  when 'DEU' then 'Europe'
  when 'DNK' then 'Europe'
  when 'SWE' then 'Europe'
  when 'NOR' then 'Europe'
  when 'BRA' then 'South America'
  when 'ARG' then 'South America'
  when 'URY' then 'South America'
  else 'Unknown'
end;

create or replace function public.auto_assign_world_cup_groups(tournament_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if (select count(*) from public.world_cup_countries where tournament_id=tournament_id_input and is_active=true) <> 40 then
    raise exception 'Automatic draw requires exactly 40 active countries';
  end if;
  if exists (
    select 1 from public.world_cup_countries
    where tournament_id=tournament_id_input and is_active=true
      and (continent is null or continent not in ('Europe','Africa','Asia','South America','North America','Oceania'))
  ) then
    raise exception 'All active countries must have a supported continent';
  end if;

  delete from public.world_cup_groups where tournament_id=tournament_id_input;
  update public.world_cup_countries set group_assignment=null where tournament_id=tournament_id_input;

  create temporary table _world_cup_group_order on commit drop as
  select group_letter,row_number() over (order by random()) as group_position
  from unnest(array['A','B','C','D','E','F','G','H']) as groups(group_letter);

  create temporary table _world_cup_draw_slots on commit drop as
  select g.group_letter,t.continent
  from _world_cup_group_order g
  join (
    select 1 as group_position,'Europe'::text as continent,3 as team_count
    union all select 1,'Africa',2
    union all select group_position,'Europe',2 from generate_series(2,8) group_position
    union all select group_position,'Africa',1 from generate_series(2,8) group_position
    union all select group_position,'Asia',1 from generate_series(2,6) group_position
    union all select group_position,'South America',1 from generate_series(2,6) group_position
    union all select 7,'North America',2
    union all select 8,'North America',1
    union all select 8,'Oceania',1
  ) t using (group_position)
  cross join lateral generate_series(1,t.team_count) as team_slot(slot_number);

  insert into public.world_cup_groups (tournament_id,group_letter,country_id,assigned_by)
  with ranked_countries as (
    select c.id,c.continent,
      row_number() over (partition by c.continent order by random()) as continent_position
    from public.world_cup_countries c
    where c.tournament_id=tournament_id_input and c.is_active=true
  ),
  ranked_slots as (
    select s.group_letter,s.continent,
      row_number() over (partition by s.continent order by random()) as continent_position
    from _world_cup_draw_slots s
  )
  select tournament_id_input,s.group_letter,c.id,auth.uid()
  from ranked_slots s
  join ranked_countries c using (continent,continent_position);

  get diagnostics assigned_count = row_count;

  update public.world_cup_countries c
  set group_assignment=g.group_letter
  from public.world_cup_groups g
  where g.tournament_id=tournament_id_input and g.country_id=c.id;

  if assigned_count <> 40 or exists (
    select 1
    from public.world_cup_groups wg
    join public.world_cup_countries wc on wc.id=wg.country_id
    where wg.tournament_id=tournament_id_input
    group by wg.tournament_id,wg.group_letter
    having count(*) <> 5
  ) or exists (
    select 1
    from public.world_cup_groups wg
    join public.world_cup_countries wc on wc.id=wg.country_id
    where wg.tournament_id=tournament_id_input
    group by wg.group_letter,wc.continent
    having count(*) > case when wc.continent='Europe' then 3 else 2 end
  ) then
    raise exception 'Automatic draw verification failed';
  end if;

  return jsonb_build_object('assigned',assigned_count,'groups',8);
end;
$$;

revoke all on function public.auto_assign_world_cup_groups(uuid) from public, anon;
grant execute on function public.auto_assign_world_cup_groups(uuid) to authenticated;

create table if not exists public.league_international_breaks (
  id bigint generated always as identity primary key,
  league_name text not null,
  division text not null,
  season_year integer not null,
  is_active boolean not null default false,
  started_at timestamptz,
  last_applied_date date,
  shifted_days integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (league_name,division,season_year)
);

alter table public.league_international_breaks enable row level security;

drop policy if exists "international_break_admin_all" on public.league_international_breaks;
create policy "international_break_admin_all"
  on public.league_international_breaks
  for all
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.sync_international_break(
  p_league_name text,
  p_division text,
  p_season_year integer,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  break_row public.league_international_breaks%rowtype;
  elapsed_days integer := 0;
  fixture_count integer := 0;
  calendar_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  insert into public.league_international_breaks
    (league_name,division,season_year,is_active,started_at,last_applied_date,shifted_days)
  values
    (p_league_name,p_division,p_season_year,p_active,
     case when p_active then now() else null end,
     case when p_active then current_date else null end,
     0)
  on conflict (league_name,division,season_year)
  do update set
    is_active=excluded.is_active,
    started_at=case when p_active and public.league_international_breaks.is_active=false
                    then now() else public.league_international_breaks.started_at end,
    last_applied_date=case when p_active and public.league_international_breaks.is_active=false
                           then current_date
                           else public.league_international_breaks.last_applied_date end,
    updated_at=now();

  select * into break_row
  from public.league_international_breaks
  where league_name=p_league_name and division=p_division and season_year=p_season_year;

  if p_active then
    elapsed_days := greatest(current_date - coalesce(break_row.last_applied_date,current_date),0);
    if elapsed_days > 0 then
      update public.fixtures
      set fixture_date=fixture_date + elapsed_days * interval '1 day',
          season_stop_date=season_stop_date + elapsed_days * interval '1 day'
      where league_name=p_league_name
        and division=p_division
        and coalesce(season_year,p_season_year)=p_season_year
        and status='scheduled';
      get diagnostics fixture_count=row_count;

      update public.season_calendars
      set stop_date=stop_date + elapsed_days
      where division=p_division and season_year=p_season_year;
      get diagnostics calendar_count=row_count;

      update public.league_international_breaks
      set shifted_days=shifted_days+elapsed_days,
          last_applied_date=current_date,
          updated_at=now()
      where id=break_row.id;
    end if;
  else
    update public.league_international_breaks
    set started_at=null,last_applied_date=null,updated_at=now()
    where id=break_row.id;
  end if;

  select * into break_row
  from public.league_international_breaks
  where id=break_row.id;

  return jsonb_build_object(
    'active',break_row.is_active,
    'shifted_days',break_row.shifted_days,
    'elapsed_days',elapsed_days,
    'fixtures_shifted',fixture_count,
    'calendars_shifted',calendar_count
  );
end;
$$;

revoke all on function public.sync_international_break(text,text,integer,boolean) from public, anon;
grant execute on function public.sync_international_break(text,text,integer,boolean) to authenticated;

commit;
