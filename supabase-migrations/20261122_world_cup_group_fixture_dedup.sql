-- Remove accidental duplicate group fixtures and prevent them from returning.
-- Played or otherwise non-scheduled duplicate matches are preserved for manual review.
do $$
begin
  if exists (
    select 1
    from public.world_cup_fixtures f
    where f.match_type = 'group_stage'
      and exists (
        select 1 from public.world_cup_fixtures d
        where d.tournament_id = f.tournament_id
          and d.match_type = 'group_stage'
          and d.group_letter = f.group_letter
          and least(d.home_country_id, d.away_country_id) = least(f.home_country_id, f.away_country_id)
          and greatest(d.home_country_id, d.away_country_id) = greatest(f.home_country_id, f.away_country_id)
          and d.id <> f.id
      )
      and (f.status <> 'scheduled' or f.home_score is not null or f.away_score is not null)
  ) then
    raise exception 'Duplicate group fixtures include played/non-scheduled rows; resolve them manually before applying this migration';
  end if;
end $$;

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
delete from public.world_cup_fixtures f
using ranked r
where f.id = r.id and r.row_num > 1;

create unique index if not exists world_cup_group_fixture_pair_unique
  on public.world_cup_fixtures (
    tournament_id,
    group_letter,
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

  -- A rerun must not create another copy of a tournament's group schedule.
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
          tournament_id, match_type, group_letter,
          home_country_id, away_country_id, match_number
        ) values (
          tournament_id_input, 'group_stage', group_record.group_letter,
          countries_record.country_id, countries_record_2.country_id, match_number
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
