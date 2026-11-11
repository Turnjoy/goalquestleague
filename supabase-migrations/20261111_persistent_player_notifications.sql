alter table public.season_calendars
  add column if not exists stop_date date;

alter table public.fixtures
  add column if not exists season_stop_date date;

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
  on public.notifications
  for select
  to authenticated
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
  select
    n.id,
    n.event_type,
    n.message,
    n.created_at,
    n.read_at,
    (
      select count(*)
      from public.notifications unread
      where unread.user_id = (select auth.uid())
        and unread.read_at is null
    )
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
  where id = notification_id_input
    and user_id = (select auth.uid());
end;
$$;

revoke all on function public.get_my_notifications() from public, anon;
grant execute on function public.get_my_notifications() to authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

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
  select
    p.id,
    event.event_key,
    event.event_type,
    event.message
  from pg_catalog.jsonb_to_recordset(events_input)
    as event(league_name text, event_key text, event_type text, message text)
  join public.profiles p
    on p.league_name = event.league_name
   and p.is_approved is true
   and p.status = 'active'
   and p.is_admin is false
  where event.event_key is not null
    and event.event_type is not null
    and event.message is not null
  on conflict (user_id, event_key) do nothing;
end;
$$;

revoke all on function public.insert_league_notification_events(jsonb)
  from public, anon, authenticated;

create or replace function public.notify_club_manager_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  events jsonb;
begin
  if tg_op = 'INSERT' then
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'league_name', c.league_name,
          'event_key', 'club-manager:' || pg_catalog.gen_random_uuid()::text,
          'event_type', 'club_manager_changed',
          'message', c.club_name || chr(8217) || 's manager has been changed to '
            || coalesce(
              nullif(p.manager_handle, ''),
              nullif(p.gamertag, ''),
              nullif(p.full_name, ''),
              nullif(p.email, '')
            ) || '.'
        )
      ),
      '[]'::jsonb
    )
    into events
    from new_assignments a
    join public.league_clubs c on c.id = a.club_id
    join public.profiles p on p.id = a.player_id
    where coalesce(
      nullif(p.manager_handle, ''),
      nullif(p.gamertag, ''),
      nullif(p.full_name, ''),
      nullif(p.email, '')
    ) is not null;
  else
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'league_name', c.league_name,
          'event_key', 'club-manager:' || pg_catalog.gen_random_uuid()::text,
          'event_type', 'club_manager_changed',
          'message', c.club_name || chr(8217) || 's manager has been changed to '
            || coalesce(
              nullif(p.manager_handle, ''),
              nullif(p.gamertag, ''),
              nullif(p.full_name, ''),
              nullif(p.email, '')
            ) || '.'
        )
      ),
      '[]'::jsonb
    )
    into events
    from old_assignments old_assignment
    join new_assignments new_assignment
      on new_assignment.season_year = old_assignment.season_year
     and new_assignment.club_id = old_assignment.club_id
    join public.league_clubs c on c.id = new_assignment.club_id
    join public.profiles p on p.id = new_assignment.player_id
    where new_assignment.player_id is not null
      and (
        old_assignment.player_id is distinct from new_assignment.player_id
        or old_assignment.club_id is distinct from new_assignment.club_id
        or old_assignment.season_year is distinct from new_assignment.season_year
      )
      and coalesce(
        nullif(p.manager_handle, ''),
        nullif(p.gamertag, ''),
        nullif(p.full_name, ''),
        nullif(p.email, '')
      ) is not null;
  end if;

  perform public.insert_league_notification_events(events);
  return null;
end;
$$;

drop trigger if exists notify_club_manager_insert on public.season_club_assignments;
create trigger notify_club_manager_insert
  after insert on public.season_club_assignments
  referencing new table as new_assignments
  for each statement
  execute function public.notify_club_manager_changes();

drop trigger if exists notify_club_manager_update on public.season_club_assignments;
create trigger notify_club_manager_update
  after update on public.season_club_assignments
  referencing old table as old_assignments new table as new_assignments
  for each statement
  execute function public.notify_club_manager_changes();

revoke all on function public.notify_club_manager_changes()
  from public, anon, authenticated;

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
        where p.id = (select auth.uid())
          and p.is_approved is true
          and p.status = 'active'
          and p.league_name = split_part(realtime.topic(), ':', 2)
          and p.division = split_part(realtime.topic(), ':', 3)
      )
    )
  );

do $$
declare
  function_definition text;
  new_assignment_write text := E'    delete from public.season_club_assignments a\n    using public.league_clubs c\n    where a.club_id = c.id\n      and a.season_year = p_season_year\n      and c.league_name = p_league_name\n      and c.division = p_division\n      and not exists (\n        select 1\n        from pg_catalog.jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)\n        where x.club_id = c.id\n          and x.player_id = a.player_id\n      );\n\n    insert into public.season_club_assignments (season_year, club_id, player_id, assigned_by)\n    select p_season_year, x.club_id, x.player_id, auth.uid()\n    from pg_catalog.jsonb_to_recordset(p_assignments) as x(club_id uuid, player_id uuid)\n    where x.player_id is not null\n      and not exists (\n        select 1\n        from public.season_club_assignments a\n        where a.season_year = p_season_year\n          and a.club_id = x.club_id\n          and a.player_id = x.player_id\n      );';
  assignment_block_start integer;
  assignment_block_end integer;
  old_standings_conflict text := 'on conflict (division, season, player_id) do update';
  new_standings_conflict text := 'on conflict (league_name, division, season, player_id) do update';
  generation_return text := '  return json_build_object(';
  notification_start integer;
  generation_return_start integer;
  generation_return_with_notification text := E'  perform public.insert_league_notification_events(\n    pg_catalog.jsonb_build_array(\n      pg_catalog.jsonb_build_object(\n        ''league_name'', p_league_name,\n        ''event_key'', ''fixtures-generated:'' || pg_catalog.gen_random_uuid()::text,\n        ''event_type'', ''season_fixtures_available'',\n        ''message'', ''The fixtures for '' || p_division || '' '' || season_value::text\n          || '' are now available.''\n      )\n    )\n  );\n\n  return json_build_object(';
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.admin_save_season_club_assignments(text,text,integer,jsonb)'::pg_catalog.regprocedure
  );
  assignment_block_start := pg_catalog.strpos(
    function_definition,
    '    delete from public.season_club_assignments a'
  );
  assignment_block_end := assignment_block_start
    + pg_catalog.strpos(
      pg_catalog.substr(function_definition, assignment_block_start),
      '    update public.profiles p'
    ) - 1;
  if assignment_block_start = 0 or assignment_block_end < assignment_block_start then
    raise exception 'Could not safely update the installed season assignment RPC';
  end if;
  function_definition := pg_catalog.substr(function_definition, 1, assignment_block_start - 1)
    || new_assignment_write || E'\n\n'
    || pg_catalog.substr(function_definition, assignment_block_end);
  execute function_definition;

  function_definition := pg_catalog.pg_get_functiondef(
    'public.admin_generate_club_fixtures(text,text,date,date,date)'::pg_catalog.regprocedure
  );
  function_definition := pg_catalog.replace(function_definition, chr(13), '');
  notification_start := pg_catalog.strpos(
    function_definition,
    'perform public.insert_league_notification_events('
  );
  generation_return_start := pg_catalog.strpos(function_definition, generation_return);
  if notification_start > 0 and notification_start < generation_return_start then
    function_definition := pg_catalog.substr(function_definition, 1, notification_start - 1)
      || pg_catalog.substr(function_definition, generation_return_start);
  end if;
  if (
    pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, generation_return, ''))
  ) / pg_catalog.length(generation_return) <> 1 then
    raise exception 'Could not safely update the installed fixture generation RPC';
  end if;
  function_definition := pg_catalog.replace(
    function_definition,
    generation_return,
    generation_return_with_notification
  );
  if pg_catalog.strpos(function_definition, old_standings_conflict) <> 0 then
    function_definition := pg_catalog.replace(
      function_definition,
      old_standings_conflict,
      new_standings_conflict
    );
  end if;
  execute function_definition;
end;
$$;
