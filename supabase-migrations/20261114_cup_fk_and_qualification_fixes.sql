-- Fix cup club foreign keys and qualification function
-- The cup tables referenced league_clubs by uuid but had no FK constraints,
-- which broke PostgREST relationship embeds (league_clubs (*)) used by cupApi.js.
-- get_qualified_clubs_for_cup also queried public.league_club_standings,
-- a table that does not exist; club standings live in public.standings.

alter table public.cup_participants
  add constraint cup_participants_club_id_fkey
  foreign key (club_id) references public.league_clubs(id) on delete restrict;

alter table public.cup_fixtures
  add constraint cup_fixtures_home_club_id_fkey
    foreign key (home_club_id) references public.league_clubs(id) on delete restrict,
  add constraint cup_fixtures_away_club_id_fkey
    foreign key (away_club_id) references public.league_clubs(id) on delete restrict;

alter table public.cup_standings
  add constraint cup_standings_club_id_fkey
  foreign key (club_id) references public.league_clubs(id) on delete restrict;

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
  select * into cup_record
  from public.cup_competitions
  where name = cup_name;

  if not found then
    raise exception 'Cup not found: %', cup_name;
  end if;

  qualification_criteria := cup_record.qualification_criteria;

  if qualification_criteria->>'qualification_type' = 'league_positions' then
    return query
    with eligible_leagues as (
      select distinct c.league_name
      from public.league_clubs c
      where qualification_criteria->'leagues' = '["all"]'::jsonb
         or c.league_name = any(
              array(select jsonb_array_elements_text(qualification_criteria->'leagues'))
            )
    ),
    ranked as (
      select
        c.id as club_id,
        c.club_name,
        c.league_name,
        row_number() over (
          partition by c.league_name
          order by
            coalesce(s.points, 0) desc,
            coalesce(s.goal_difference, 0) desc,
            coalesce(s.goals_for, 0) desc,
            coalesce(s.played, 0) desc,
            c.club_number,
            c.id
        ) as qualification_position
      from public.league_clubs c
      join eligible_leagues el on el.league_name = c.league_name
      left join public.standings s
        on s.club_id = c.id
        and s.season = season_year
    )
    select
      r.club_id,
      r.club_name,
      r.league_name,
      r.qualification_position::int,
      r.league_name || ' position ' || r.qualification_position
    from ranked r
    where r.qualification_position = any(
      array(select jsonb_array_elements_text(qualification_criteria->'positions'))::int[]
    )
    order by r.league_name, r.qualification_position;
  end if;

  if qualification_criteria->>'qualification_type' = 'cup_winners' then
    -- Cup-winner qualification (Quest Super Cup) is resolved once the
    -- source cups have completed; no winners are recorded yet.
    return query select null::uuid, null::text, null::text, null::int, null::text limit 0;
  end if;

  return;
end;
$$;

notify pgrst, 'reload schema';
