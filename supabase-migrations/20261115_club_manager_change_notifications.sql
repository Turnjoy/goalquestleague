-- Fix club_manager_changed notifications to target the incoming manager
-- Previously notify_club_manager_changes() routed events through
-- insert_league_notification_events(), which broadcasts to EVERY approved
-- non-admin manager in the league and uses a random event_key, so the
-- unique(user_id, event_key) constraint could never deduplicate retries.
-- This migration notifies only the new manager, with a deterministic
-- event_key so repeated identical operations cannot duplicate.

create or replace function public.notify_club_manager_assignment(
  club_id_input uuid,
  season_year_input integer,
  player_id_input uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  club_name_value text;
  manager_name_value text;
begin
  if player_id_input is null then
    return;
  end if;

  select c.club_name into club_name_value
  from public.league_clubs c
  where c.id = club_id_input;
  if club_name_value is null then
    return;
  end if;

  select coalesce(
    nullif(btrim(p.manager_handle), ''),
    nullif(btrim(p.gamertag), ''),
    nullif(btrim(p.full_name), ''),
    nullif(btrim(p.email), '')
  ) into manager_name_value
  from public.profiles p
  where p.id = player_id_input;
  if manager_name_value is null then
    return;
  end if;

  insert into public.notifications (user_id, event_key, event_type, message)
  values (
    player_id_input,
    'club-manager:' || club_id_input::text || ':'
      || season_year_input::text || ':' || player_id_input::text,
    'club_manager_changed',
    club_name_value || chr(8217) || 's manager has been changed to '
      || manager_name_value || '.'
  )
  on conflict (user_id, event_key) do nothing;
end;
$$;

revoke all on function public.notify_club_manager_assignment(uuid, integer, uuid)
  from public, anon, authenticated;

create or replace function public.notify_club_manager_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_row record;
begin
  if tg_op = 'INSERT' then
    for changed_row in
      select a.club_id, a.season_year, a.player_id
      from new_assignments a
      where a.player_id is not null
    loop
      perform public.notify_club_manager_assignment(
        changed_row.club_id,
        changed_row.season_year,
        changed_row.player_id
      );
    end loop;
  elsif tg_op = 'UPDATE' then
    -- Manager changed on an existing assignment row (same club + season).
    for changed_row in
      select n.club_id, n.season_year, n.player_id
      from new_assignments n
      join old_assignments o
        on o.season_year = n.season_year
       and o.club_id = n.club_id
      where n.player_id is not null
        and o.player_id is distinct from n.player_id
    loop
      perform public.notify_club_manager_assignment(
        changed_row.club_id,
        changed_row.season_year,
        changed_row.player_id
      );
    end loop;

    -- Assignment row moved to a different club or season (PK changed).
    for changed_row in
      select n.club_id, n.season_year, n.player_id
      from new_assignments n
      where n.player_id is not null
        and not exists (
          select 1
          from old_assignments o
          where o.season_year = n.season_year
            and o.club_id = n.club_id
        )
    loop
      perform public.notify_club_manager_assignment(
        changed_row.club_id,
        changed_row.season_year,
        changed_row.player_id
      );
    end loop;
  end if;

  -- DELETE has no incoming manager, so no notification is created.
  return null;
end;
$$;

revoke all on function public.notify_club_manager_changes()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
