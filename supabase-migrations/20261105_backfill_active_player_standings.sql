insert into public.standings (
  division, league_name, season, player_id, player_name, team_name
)
select
  p.division,
  p.league_name,
  extract(year from now())::integer,
  p.id,
  coalesce(nullif(p.manager_handle, ''), nullif(p.gamertag, ''), p.full_name, 'Player'),
  coalesce(
    (
      select c.club_name
      from public.season_club_assignments a
      join public.league_clubs c on c.id = a.club_id
      where a.player_id = p.id
        and a.season_year = extract(year from now())::integer
        and c.league_name = p.league_name
        and c.division = p.division
    ),
    nullif(p.custom_team_name, ''),
    nullif(p.squad_name, ''),
    'eFootball Team'
  )
from public.profiles p
where p.is_admin = false
  and p.is_approved = true
  and p.status = 'active'
on conflict (division, season, player_id) do update
  set league_name = excluded.league_name,
      player_name = excluded.player_name,
      team_name = excluded.team_name;

notify pgrst, 'reload schema';
