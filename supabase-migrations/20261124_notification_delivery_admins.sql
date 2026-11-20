-- Keep in-app notifications available and deliver league notices to admins too.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  event_type text not null check (
    event_type in ('club_manager_changed', 'season_fixtures_available')
  ),
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, event_key)
);

alter table public.notifications enable row level security;
drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;

create or replace function public.get_my_notifications()
returns table (
  id uuid,
  event_type text,
  message text,
  created_at timestamptz,
  read_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.event_type, n.message, n.created_at, n.read_at,
    (select count(*) from public.notifications unread
     where unread.user_id = (select auth.uid()) and unread.read_at is null)
  from public.notifications n
  where n.user_id = (select auth.uid())
  order by n.created_at desc, n.id desc
  limit 50;
$$;

create or replace function public.mark_notification_read(notification_id_input uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = notification_id_input and user_id = (select auth.uid());
end;
$$;

revoke all on function public.get_my_notifications() from public, anon;
grant execute on function public.get_my_notifications() to authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- Fixture availability is visible to active admins and eligible players.
create or replace function public.insert_league_notification_events(events_input jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(events_input) is distinct from 'array' then
    raise exception 'Notification events must be sent as an array';
  end if;

  insert into public.notifications (user_id, event_key, event_type, message)
  select p.id, event.event_key, event.event_type, event.message
  from pg_catalog.jsonb_to_recordset(events_input)
    as event(league_name text, event_key text, event_type text, message text)
  join public.profiles p
    on p.is_admin is true
    or (p.league_name = event.league_name
      and p.is_approved is true
      and p.is_admin is false)
  where p.status = 'active'
    and event.event_key is not null
    and event.event_type is not null
    and event.message is not null
  on conflict (user_id, event_key) do nothing;
end;
$$;
revoke all on function public.insert_league_notification_events(jsonb)
  from public, anon, authenticated;

-- Notify the incoming manager and active admins when a club assignment changes.
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
  assignment_event_key text;
begin
  if player_id_input is null then return; end if;

  select c.club_name into club_name_value
  from public.league_clubs c where c.id = club_id_input;
  if club_name_value is null then return; end if;

  select coalesce(
    nullif(btrim(p.manager_handle), ''),
    nullif(btrim(p.gamertag), ''),
    nullif(btrim(p.full_name), ''),
    nullif(btrim(p.email), '')
  ) into manager_name_value
  from public.profiles p where p.id = player_id_input;
  if manager_name_value is null then return; end if;

  assignment_event_key := 'club-manager:' || club_id_input::text || ':'
    || season_year_input::text || ':' || player_id_input::text;

  insert into public.notifications (user_id, event_key, event_type, message)
  values (
    player_id_input,
    assignment_event_key,
    'club_manager_changed',
    club_name_value || chr(8217) || 's manager has been changed to ' || manager_name_value || '.'
  ) on conflict (user_id, event_key) do nothing;

  insert into public.notifications (user_id, event_key, event_type, message)
  select p.id,
    'admin-' || assignment_event_key,
    'club_manager_changed',
    club_name_value || chr(8217) || 's manager assignment was updated to ' || manager_name_value || '.'
  from public.profiles p
  where p.is_admin is true and p.status = 'active' and p.id <> player_id_input
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
      from new_assignments a where a.player_id is not null
    loop
      perform public.notify_club_manager_assignment(
        changed_row.club_id, changed_row.season_year, changed_row.player_id);
    end loop;
  elsif tg_op = 'UPDATE' then
    for changed_row in
      select n.club_id, n.season_year, n.player_id
      from new_assignments n
      join old_assignments o on o.season_year = n.season_year and o.club_id = n.club_id
      where n.player_id is not null and o.player_id is distinct from n.player_id
    loop
      perform public.notify_club_manager_assignment(
        changed_row.club_id, changed_row.season_year, changed_row.player_id);
    end loop;

    for changed_row in
      select n.club_id, n.season_year, n.player_id
      from new_assignments n
      where n.player_id is not null
        and not exists (
          select 1 from old_assignments o
          where o.season_year = n.season_year and o.club_id = n.club_id)
    loop
      perform public.notify_club_manager_assignment(
        changed_row.club_id, changed_row.season_year, changed_row.player_id);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function public.notify_club_manager_changes() from public, anon, authenticated;

drop trigger if exists notify_club_manager_insert on public.season_club_assignments;
create trigger notify_club_manager_insert
  after insert on public.season_club_assignments
  referencing new table as new_assignments
  for each statement execute function public.notify_club_manager_changes();

drop trigger if exists notify_club_manager_update on public.season_club_assignments;
create trigger notify_club_manager_update
  after update on public.season_club_assignments
  referencing old table as old_assignments new table as new_assignments
  for each statement execute function public.notify_club_manager_changes();

-- Ensure the installed fixture-generation RPC actually emits a notification.
do $$
declare
  function_definition text;
  return_marker text := '  return json_build_object(';
  notification_return text := E'  perform public.insert_league_notification_events(\n'
    || E'    pg_catalog.jsonb_build_array(\n'
    || E'      pg_catalog.jsonb_build_object(\n'
    || E'        ''league_name'', p_league_name,\n'
    || E'        ''event_key'', ''fixtures-generated:'' || pg_catalog.gen_random_uuid()::text,\n'
    || E'        ''event_type'', ''season_fixtures_available'',\n'
    || E'        ''message'', ''The fixtures for '' || p_division || '' '' || season_value::text\n'
    || E'          || '' are now available.''\n'
    || E'      )\n'
    || E'    )\n'
    || E'  );\n\n'
    || return_marker;
  existing_notification integer;
  marker_count integer;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.admin_generate_club_fixtures(text,text,date,date,date)'::pg_catalog.regprocedure
  );
  function_definition := pg_catalog.replace(function_definition, chr(13), '');

  existing_notification := pg_catalog.strpos(
    function_definition,
    'perform public.insert_league_notification_events('
  );
  marker_count := (
    pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, return_marker, ''))
  ) / pg_catalog.length(return_marker);

  if existing_notification = 0 then
    if marker_count <> 1 then
      raise exception 'Could not safely add the fixture notification to the installed generation RPC';
    end if;
    function_definition := pg_catalog.replace(
      function_definition,
      return_marker,
      notification_return
    );
    execute function_definition;
  end if;
end;
$$;

notify pgrst, 'reload schema';
