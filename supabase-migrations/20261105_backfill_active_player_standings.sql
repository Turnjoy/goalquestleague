with current_season as (
  select extract(year from now())::integer as season_year
)
insert into public.standings (
  division, league_name, season, player_id, player_name, team_name
)
select
  p.division,
  p.league_name,
  cs.season_year,
  p.id,
  coalesce(nullif(btrim(p.manager_handle), ''), nullif(btrim(p.gamertag), ''), p.full_name, 'Player'),
  coalesce(
    assignment.club_name,
    nullif(btrim(p.custom_team_name), ''),
    nullif(btrim(p.squad_name), ''),
    'eFootball Team'
  )
from public.profiles p
cross join current_season cs
left join lateral (
  select c.club_name
  from public.season_club_assignments a
  join public.league_clubs c on c.id = a.club_id
  where a.player_id = p.id
    and a.season_year = cs.season_year
    and c.league_name = p.league_name
    and c.division = p.division
  order by c.club_name
  limit 1
) assignment on true
where p.is_admin = false
  and p.is_approved = true
  and p.status = 'active'
on conflict (division, season, player_id) do update
  set league_name = excluded.league_name,
      player_name = excluded.player_name,
      team_name = excluded.team_name;

notify pgrst, 'reload schema';
