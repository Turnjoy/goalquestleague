create or replace function public.refresh_unassigned_club_standing(
  player_id_input uuid,
  league_input text,
  division_input text,
  season_year_input integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.standings s
  set player_name = coalesce(
        nullif(p.manager_handle, ''),
        nullif(p.gamertag, ''),
        p.full_name,
        'Player'
      ),
      team_name = coalesce(
        nullif(p.custom_team_name, ''),
        nullif(p.squad_name, ''),
        nullif(p.gamertag, ''),
        'eFootball Team'
      )
  from public.profiles p
  where p.id = player_id_input
    and s.player_id = p.id
    and s.league_name = league_input
    and s.division = division_input
    and s.season = season_year_input
    and not exists (
      select 1
      from public.season_club_assignments a
      join public.league_clubs c on c.id = a.club_id
      where a.player_id = p.id
        and a.season_year = season_year_input
        and c.league_name = league_input
        and c.division = division_input
    );
end;
$$;

create or replace function public.recalculate_club_standings_after_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_club public.league_clubs%rowtype;
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_club_standings(old.club_id, old.season_year, old.player_id);
    select * into old_club from public.league_clubs where id = old.club_id;
    perform public.refresh_unassigned_club_standing(
      old.player_id, old_club.league_name, old_club.division, old.season_year
    );
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.club_id is distinct from new.club_id
       or old.season_year is distinct from new.season_year then
      perform public.recalculate_club_standings(old.club_id, old.season_year, old.player_id);
      select * into old_club from public.league_clubs where id = old.club_id;
      perform public.refresh_unassigned_club_standing(
        old.player_id, old_club.league_name, old_club.division, old.season_year
      );
      perform public.recalculate_club_standings(new.club_id, new.season_year);
    else
      perform public.recalculate_club_standings(
        new.club_id,
        new.season_year,
        case when old.player_id is distinct from new.player_id then old.player_id else null end
      );
      if old.player_id is distinct from new.player_id then
        select * into old_club from public.league_clubs where id = old.club_id;
        perform public.refresh_unassigned_club_standing(
          old.player_id, old_club.league_name, old_club.division, old.season_year
        );
      end if;
    end if;
    return new;
  end if;

  perform public.recalculate_club_standings(new.club_id, new.season_year);
  return new;
end;
$$;

create or replace function public.broadcast_season_club_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_scope record;
begin
  if tg_op = 'INSERT' then
    for changed_scope in
      select distinct c.league_name, c.division
      from new_assignments a
      join public.league_clubs c on c.id = a.club_id
    loop
      perform realtime.send(
        '{}'::jsonb,
        'club_assignments_changed',
        'club-assignments:' || changed_scope.league_name || ':' || changed_scope.division,
        true
      );
    end loop;
  elsif tg_op = 'DELETE' then
    for changed_scope in
      select distinct c.league_name, c.division
      from old_assignments a
      join public.league_clubs c on c.id = a.club_id
    loop
      perform realtime.send(
        '{}'::jsonb,
        'club_assignments_changed',
        'club-assignments:' || changed_scope.league_name || ':' || changed_scope.division,
        true
      );
    end loop;
  else
    for changed_scope in
      select distinct scopes.league_name, scopes.division
      from (
        select c.league_name, c.division
        from old_assignments a
        join public.league_clubs c on c.id = a.club_id
        union
        select c.league_name, c.division
        from new_assignments a
        join public.league_clubs c on c.id = a.club_id
      ) scopes
    loop
      perform realtime.send(
        '{}'::jsonb,
        'club_assignments_changed',
        'club-assignments:' || changed_scope.league_name || ':' || changed_scope.division,
        true
      );
    end loop;
  end if;

  return null;
end;
$$;

drop trigger if exists broadcast_club_assignment_insert on public.season_club_assignments;
create trigger broadcast_club_assignment_insert
  after insert on public.season_club_assignments
  referencing new table as new_assignments
  for each statement
  execute function public.broadcast_season_club_assignment_change();

drop trigger if exists broadcast_club_assignment_update on public.season_club_assignments;
create trigger broadcast_club_assignment_update
  after update on public.season_club_assignments
  referencing old table as old_assignments new table as new_assignments
  for each statement
  execute function public.broadcast_season_club_assignment_change();

drop trigger if exists broadcast_club_assignment_delete on public.season_club_assignments;
create trigger broadcast_club_assignment_delete
  after delete on public.season_club_assignments
  referencing old table as old_assignments
  for each statement
  execute function public.broadcast_season_club_assignment_change();

drop policy if exists "club_assignment_broadcast_read" on realtime.messages;
create policy "club_assignment_broadcast_read"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() like 'club-assignments:%'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_approved is true
          and p.status = 'active'
          and p.league_name = split_part(realtime.topic(), ':', 2)
          and p.division = split_part(realtime.topic(), ':', 3)
      )
    )
  );

revoke all on function public.refresh_unassigned_club_standing(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.broadcast_season_club_assignment_change()
  from public, anon, authenticated;
