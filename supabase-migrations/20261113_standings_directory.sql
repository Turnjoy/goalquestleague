create or replace function public.get_standings_directory(
  p_league_name text default null,
  p_division text default null,
  p_season integer default null
)
returns table (
  club_id uuid,
  club_number integer,
  club_name text,
  league_name text,
  division text,
  season integer,
  manager_name text,
  played integer,
  won integer,
  draw integer,
  lost integer,
  goals_for integer,
  goals_against integer,
  goal_difference integer,
  penalty_points integer,
  points integer,
  form text,
  has_standings boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with selected_season as (
    select coalesce(p_season, extract(year from now())::integer) as season_year
  ),
  filtered_clubs as (
    select c.*
    from public.league_clubs c
    where (p_league_name is null or c.league_name = p_league_name)
      and (p_division is null or c.division = p_division)
  )
  select
    c.id,
    c.club_number,
    c.club_name,
    c.league_name,
    c.division,
    ss.season_year,
    coalesce(
      nullif(btrim(p.manager_handle), ''),
      nullif(btrim(p.gamertag), ''),
      nullif(btrim(p.full_name), ''),
      'Unassigned'
    ),
    coalesce(s.played, 0),
    coalesce(s.won, 0),
    coalesce(s.draw, 0),
    coalesce(s.lost, 0),
    coalesce(s.goals_for, 0),
    coalesce(s.goals_against, 0),
    coalesce(s.goal_difference, 0),
    coalesce(s.penalty_points, 0),
    coalesce(s.points, 0),
    coalesce(s.form, ''),
    s.id is not null
  from filtered_clubs c
  cross join selected_season ss
  left join lateral (
    select standing.*
    from public.standings standing
    where standing.club_id = c.id
      and standing.season = ss.season_year
    order by
      standing.points desc,
      standing.goal_difference desc,
      standing.goals_for desc,
      standing.played desc,
      standing.id
    limit 1
  ) s on true
  left join public.season_club_assignments a
    on a.club_id = c.id
    and a.season_year = ss.season_year
  left join public.profiles p
    on p.id = a.player_id
  order by c.league_name, c.division, c.club_number, c.club_name, c.id;
$$;

create or replace function public.get_standings_filter_options()
returns table (
  league_name text,
  division text,
  season_year integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with season_options as (
    select c.league_name, c.division, s.season as season_year
    from public.league_clubs c
    join public.standings s on s.club_id = c.id

    union

    select c.league_name, c.division, a.season_year
    from public.league_clubs c
    join public.season_club_assignments a on a.club_id = c.id

    union

    select c.league_name, c.division, coalesce(
      f.season_year,
      extract(year from coalesce(f.fixture_date, f.played_at, f.created_at))::integer
    )
    from public.league_clubs c
    join public.fixtures f
      on f.home_club_id = c.id or f.away_club_id = c.id

    union

    select c.league_name, c.division, extract(year from now())::integer
    from public.league_clubs c
  )
  select league_name, division, season_year
  from season_options
  group by league_name, division, season_year
  order by league_name, division, season_year desc;
$$;

revoke all on function public.get_standings_directory(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_standings_filter_options()
  from public, anon, authenticated;
grant execute on function public.get_standings_directory(text, text, integer)
  to anon, authenticated;
grant execute on function public.get_standings_filter_options()
  to anon, authenticated;

notify pgrst, 'reload schema';
