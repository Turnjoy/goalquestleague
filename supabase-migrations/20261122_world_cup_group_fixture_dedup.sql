-- Convert duplicate group pairings into an explicit double round-robin.
-- Each team pair gets one first-leg and one reversed-home/away second-leg fixture.
alter table public.world_cup_fixtures
  add column if not exists leg smallint not null default 1;

do $$
begin
  if exists (
    select 1
    from public.world_cup_fixtures f
    where f.match_type = 'group_stage'
      and (f.status <> 'scheduled' or f.home_score is not null or f.away_score is not null)
      and exists (
        select 1 from public.world_cup_fixtures d
        where d.tournament_id = f.tournament_id
          and d.match_type = 'group_stage'
          and d.group_letter = f.group_letter
          and least(d.home_country_id, d.away_country_id) = least(f.home_country_id, f.away_country_id)
          and greatest(d.home_country_id, d.away_country_id) = greatest(f.home_country_id, f.away_country_id)
          and d.id <> f.id
      )
  ) then
    raise exception 'Duplicate group fixtures include played/non-scheduled rows; resolve them manually before applying this migration';
  end if;

  if exists (
    select 1
    from public.world_cup_fixtures
    where match_type = 'group_stage'
    group by tournament_id, group_letter,
      least(home_country_id, away_country_id),
      greatest(home_country_id, away_country_id)
    having count(*) > 2
  ) then
    raise exception 'A group pairing has more than two fixtures; review those rows before applying this migration';
  end if;
end $$;

-- Existing accidental copies become the second leg; reverse their venue order.
with ranked as (
  select id,
         row_number() over (
           partition by tournament_id, group_letter,
             least(home_country_id, away_country_id),
             greatest(home_country_id, away_country_id)
           order by match_number nulls last, created_at, id
         ) as row_num
  from public.world_cup_fixtures
  where match_type = 'group_stage'
)
update public.world_cup_fixtures f
set leg = case when r.row_num = 1 then 1 else 2 end,
    home_country_id = case when r.row_num = 2 then f.away_country_id else f.home_country_id end,
    away_country_id = case when r.row_num = 2 then f.home_country_id else f.away_country_id end
from ranked r
where f.id = r.id;

-- If a pairing only had one stored fixture, add its missing reversed return leg.
insert into public.world_cup_fixtures (
  tournament_id, match_type, group_letter, leg,
  home_country_id, away_country_id, match_number
)
select first_leg.tournament_id,
       'group_stage',
       first_leg.group_letter,
       2,
       first_leg.away_country_id,
       first_leg.home_country_id,
       coalesce(max_match.match_number, 0) + row_number() over (
         order by first_leg.tournament_id, first_leg.group_letter,
           first_leg.home_country_id, first_leg.away_country_id
       )
from public.world_cup_fixtures first_leg
cross join lateral (
  select max(match_number) as match_number
  from public.world_cup_fixtures
  where tournament_id = first_leg.tournament_id
) max_match
where first_leg.match_type = 'group_stage'
  and first_leg.leg = 1
  and not exists (
    select 1 from public.world_cup_fixtures return_leg
    where return_leg.tournament_id = first_leg.tournament_id
      and return_leg.group_letter = first_leg.group_letter
      and return_leg.match_type = 'group_stage'
      and return_leg.leg = 2
      and least(return_leg.home_country_id, return_leg.away_country_id) = least(first_leg.home_country_id, first_leg.away_country_id)
      and greatest(return_leg.home_country_id, return_leg.away_country_id) = greatest(first_leg.home_country_id, first_leg.away_country_id)
  );

create unique index if not exists world_cup_group_fixture_pair_leg_unique
  on public.world_cup_fixtures (
    tournament_id,
    group_letter,
    leg,
    least(home_country_id, away_country_id),
    greatest(home_country_id, away_country_id)
  )
  where match_type = 'group_stage';

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
  rows_added int := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  -- Do not regenerate a tournament that already has its group schedule.
  if exists (
    select 1 from public.world_cup_fixtures
    where tournament_id = tournament_id_input and match_type = 'group_stage'
  ) then
    return 0;
  end if;

  for group_record in
    select distinct group_letter
    from public.world_cup_groups
    where tournament_id = tournament_id_input
    order by group_letter
  loop
    for countries_record in
      select c.id as country_id
      from public.world_cup_countries c
      join public.world_cup_groups g on c.id = g.country_id
      where g.tournament_id = tournament_id_input
        and g.group_letter = group_record.group_letter
      order by c.id
    loop
      for countries_record_2 in
        select c.id as country_id
        from public.world_cup_countries c
        join public.world_cup_groups g on c.id = g.country_id
        where g.tournament_id = tournament_id_input
          and g.group_letter = group_record.group_letter
          and c.id > countries_record.country_id
        order by c.id
      loop
        insert into public.world_cup_fixtures (
          tournament_id, match_type, group_letter, leg,
          home_country_id, away_country_id, match_number
        ) values (
          tournament_id_input, 'group_stage', group_record.group_letter, 1,
          countries_record.country_id, countries_record_2.country_id, match_number
        ) on conflict do nothing;
        get diagnostics rows_added = row_count;
        fixture_count := fixture_count + rows_added;
        match_number := match_number + 1;

        insert into public.world_cup_fixtures (
          tournament_id, match_type, group_letter, leg,
          home_country_id, away_country_id, match_number
        ) values (
          tournament_id_input, 'group_stage', group_record.group_letter, 2,
          countries_record_2.country_id, countries_record.country_id, match_number
        ) on conflict do nothing;
        get diagnostics rows_added = row_count;
        fixture_count := fixture_count + rows_added;
        match_number := match_number + 1;
      end loop;
    end loop;
  end loop;

  insert into public.world_cup_standings (tournament_id, group_letter, country_id)
  select g.tournament_id, g.group_letter, g.country_id
  from public.world_cup_groups g
  where g.tournament_id = tournament_id_input
  on conflict (tournament_id, group_letter, country_id) do nothing;

  return fixture_count;
end;
$$;
