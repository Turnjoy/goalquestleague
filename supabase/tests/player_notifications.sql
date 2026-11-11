begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  second_admin_id uuid := gen_random_uuid();
  out_of_scope_id uuid := gen_random_uuid();
  inactive_id uuid := gen_random_uuid();
  unapproved_id uuid := gen_random_uuid();
  player_ids uuid[];
  fixture_player_ids uuid[];
  club_ids uuid[];
  notification_league text := 'Notification test league ' || gen_random_uuid()::text;
  other_league text := 'Other notification league ' || gen_random_uuid()::text;
  division_value text := 'Elite';
  notification_season integer := 2098;
  generation_result json;
  manager_notifications integer;
  fixture_notifications integer;
  fixture_topic_id uuid;
  other_topic_id uuid;
  own_notification_id uuid;
  other_notification_id uuid;
  player_index integer;
  retry_event_key text := 'notification-test-retry:' || gen_random_uuid()::text;
begin
  select array_agg(gen_random_uuid()) into player_ids
  from generate_series(1, 22);

  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (admin_id, 'authenticated', 'authenticated', admin_id::text || '@notifications.test', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Notification Admin","manager_handle":"notification-admin","custom_team_name":"Admin Team","whatsapp_number":"2348012345678"}', now(), now()),
    (second_admin_id, 'authenticated', 'authenticated', second_admin_id::text || '@notifications.test', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Second Notification Admin","manager_handle":"notification-admin-two","custom_team_name":"Admin Team Two","whatsapp_number":"2348012345678"}', now(), now()),
    (out_of_scope_id, 'authenticated', 'authenticated', out_of_scope_id::text || '@notifications.test', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Other League Player","manager_handle":"other-league-player","custom_team_name":"Other League Team","whatsapp_number":"2348012345678"}', now(), now()),
    (inactive_id, 'authenticated', 'authenticated', inactive_id::text || '@notifications.test', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Inactive Player","manager_handle":"inactive-player","custom_team_name":"Inactive Team","whatsapp_number":"2348012345678"}', now(), now()),
    (unapproved_id, 'authenticated', 'authenticated', unapproved_id::text || '@notifications.test', '', now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Unapproved Player","manager_handle":"unapproved-player","custom_team_name":"Unapproved Team","whatsapp_number":"2348012345678"}', now(), now());

  for player_index in 1..array_length(player_ids, 1) loop
    insert into auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      player_ids[player_index],
      'authenticated',
      'authenticated',
      player_ids[player_index]::text || '@notifications.test',
      '',
      now(),
      '{"provider":"email","providers":["email"]}',
      pg_catalog.jsonb_build_object(
        'full_name', 'Notification Player ' || player_index::text,
        'manager_handle', 'notification-player-' || player_index::text,
        'custom_team_name', 'Notification Team ' || player_index::text,
        'whatsapp_number', '2348012345678'
      ),
      now(),
      now()
    );
  end loop;

  update public.profiles
  set league_name = notification_league,
      division = division_value,
      is_approved = true,
      is_admin = false,
      status = 'active'
  where id = any(player_ids);
  update public.profiles
  set league_name = other_league,
      division = division_value,
      is_approved = true,
      is_admin = false,
      status = 'active'
  where id = out_of_scope_id;
  update public.profiles
  set league_name = notification_league,
      division = division_value,
      is_approved = true,
      is_admin = false,
      status = 'suspended'
  where id = inactive_id;
  update public.profiles
  set league_name = notification_league,
      division = division_value,
      is_approved = false,
      is_admin = false,
      status = 'active'
  where id = unapproved_id;
  update public.profiles
  set league_name = other_league,
      division = 'Trial',
      is_approved = true,
      is_admin = true,
      status = 'active'
  where id in (admin_id, second_admin_id);

  insert into public.league_clubs (league_name, division, club_number, club_name)
  select
    notification_league,
    division_value,
    club_number,
    notification_league || ' club ' || club_number::text
  from generate_series(1, 20) as clubs(club_number);

  select array_agg(id order by club_number) into club_ids
  from public.league_clubs
  where league_name = notification_league and division = division_value;
  select array_agg(id order by id) into fixture_player_ids
  from public.profiles
  where league_name = notification_league
    and division = division_value
    and is_approved is true
    and status = 'active'
    and is_admin is false;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  insert into public.season_club_assignments (season_year, club_id, player_id, assigned_by)
  values (2099, club_ids[1], player_ids[21], admin_id);

  select count(*) into manager_notifications
  from public.notifications
  where event_type = 'club_manager_changed'
    and message = (
      select c.club_name || chr(8217) || 's manager has been changed to '
        || p.manager_handle || '.'
      from public.league_clubs c
      join public.profiles p on p.id = player_ids[21]
      where c.id = club_ids[1]
    );
  if manager_notifications <> 22 then
    raise exception 'Manager change did not notify exactly the active approved players in the league';
  end if;
  if exists (
    select 1
    from public.notifications
    where user_id in (admin_id, second_admin_id, out_of_scope_id, inactive_id, unapproved_id)
      and event_type = 'club_manager_changed'
  ) then
    raise exception 'Manager change notified an admin, out-of-scope, inactive, or unapproved account';
  end if;

  update public.season_club_assignments
  set assigned_by = admin_id
  where season_year = 2099 and club_id = club_ids[1];
  if (
    select count(*) from public.notifications where event_type = 'club_manager_changed'
  ) <> manager_notifications then
    raise exception 'Unchanged club manager generated duplicate notifications';
  end if;

  update public.season_club_assignments
  set player_id = player_ids[22]
  where season_year = 2099 and club_id = club_ids[1];
  if not exists (
    select 1
    from public.notifications
    where event_type = 'club_manager_changed'
      and user_id = player_ids[22]
      and message = (
        select c.club_name || chr(8217) || 's manager has been changed to '
          || p.manager_handle || '.'
        from public.league_clubs c
        join public.profiles p on p.id = player_ids[22]
        where c.id = club_ids[1]
      )
  ) then
    raise exception 'Reassignment notification did not use the actual club and manager names';
  end if;

  update public.season_club_assignments
  set assigned_by = admin_id
  where season_year = 2099 and club_id = club_ids[1];
  if (
    select count(*) from public.notifications where event_type = 'club_manager_changed'
  ) <> 44 then
    raise exception 'Retrying an unchanged manager assignment created duplicate notifications';
  end if;

  perform public.insert_league_notification_events(
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'league_name', notification_league,
        'event_key', retry_event_key,
        'event_type', 'season_fixtures_available',
        'message', 'Retry idempotency test'
      )
    )
  );
  perform public.insert_league_notification_events(
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'league_name', notification_league,
        'event_key', retry_event_key,
        'event_type', 'season_fixtures_available',
        'message', 'Retry idempotency test'
      )
    )
  );
  if (
    select count(*)
    from public.notifications
    where user_id = player_ids[1]
      and event_type = 'season_fixtures_available'
      and message = 'Retry idempotency test'
  ) <> 1 then
    raise exception 'Reusing a notification event key created a duplicate';
  end if;

  insert into public.season_club_assignments (season_year, club_id, player_id, assigned_by)
  select 2098, club_ids[i], fixture_player_ids[i], admin_id
  from generate_series(1, 20) as players(i);
  delete from public.notifications
  where user_id in (select id from public.profiles where league_name = notification_league);

  if exists (
    select 1
    from public.league_clubs c
    join public.season_club_assignments a
      on a.club_id = c.id and a.season_year = 2098
    join public.profiles p on p.id = a.player_id
    where c.league_name = notification_league
      and c.division = division_value
      and (
        p.league_name <> notification_league
        or p.division <> division_value
        or p.is_approved is distinct from true
        or p.status <> 'active'
        or p.is_admin is distinct from false
      )
  ) then
    raise exception 'Fixture test assignments include an ineligible profile: %',
      (
        select string_agg(
          p.id::text || ':' || p.league_name || ':' || p.division || ':'
            || p.is_approved::text || ':' || p.status::text || ':' || p.is_admin::text,
          '; '
        )
        from public.league_clubs c
        join public.season_club_assignments a
          on a.club_id = c.id and a.season_year = 2098
        join public.profiles p on p.id = a.player_id
        where c.league_name = notification_league
          and c.division = division_value
          and (
            p.league_name <> notification_league
            or p.division <> division_value
            or p.is_approved is distinct from true
            or p.status <> 'active'
            or p.is_admin is distinct from false
          )
      );
  end if;

  generation_result := public.admin_generate_club_fixtures(
    notification_league,
    division_value,
    date '2098-01-01',
    date '2098-12-30',
    date '2099-01-15'
  );
  if (generation_result->>'fixtures_generated')::integer <> 190 then
    raise exception 'Fixture generation did not return the expected completed fixture set';
  end if;

  select count(*) into fixture_notifications
  from public.notifications
  where event_type = 'season_fixtures_available'
    and message = 'The fixtures for ' || division_value || ' 2098 are now available.';
  if fixture_notifications <> 22 then
    raise exception 'Successful fixture generation did not notify exactly the active approved players in the league';
  end if;
  if exists (
    select 1
    from public.notifications
    where user_id in (admin_id, second_admin_id, out_of_scope_id, inactive_id, unapproved_id)
      and event_type = 'season_fixtures_available'
  ) then
    raise exception 'Fixture generation notified an admin, out-of-scope, inactive, or unapproved account';
  end if;

  own_notification_id := gen_random_uuid();
  other_notification_id := gen_random_uuid();
  insert into public.notifications (id, user_id, event_key, event_type, message)
  values
    (own_notification_id, fixture_player_ids[1], 'notification-privacy-own', 'club_manager_changed', 'Own notification'),
    (other_notification_id, out_of_scope_id, 'notification-privacy-other', 'club_manager_changed', 'Other user notification');

  insert into realtime.messages (topic, extension, payload, event, private)
  values (
    'club-assignments:' || notification_league || ':' || division_value,
    'broadcast',
    '{}'::jsonb,
    'club_assignments_changed',
    true
  )
  returning id into fixture_topic_id;
  insert into realtime.messages (topic, extension, payload, event, private)
  values (
    'club-assignments:' || other_league || ':' || division_value,
    'broadcast',
    '{}'::jsonb,
    'club_assignments_changed',
    true
  )
  returning id into other_topic_id;

  perform set_config('test.scope_player_id', fixture_player_ids[1]::text, true);
  perform set_config('test.other_player_id', out_of_scope_id::text, true);
  perform set_config('test.global_admin_id', admin_id::text, true);
  perform set_config('test.second_global_admin_id', second_admin_id::text, true);
  perform set_config('test.fixture_topic_id', fixture_topic_id::text, true);
  perform set_config('test.other_topic_id', other_topic_id::text, true);
  perform set_config('test.own_notification_id', own_notification_id::text, true);
  perform set_config('test.other_notification_id', other_notification_id::text, true);
  perform set_config(
    'test.in_scope_topic',
    'club-assignments:' || notification_league || ':' || division_value,
    true
  );
  perform set_config(
    'test.out_of_scope_topic',
    'club-assignments:' || other_league || ':' || division_value,
    true
  );
end;
$$;

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claim.sub',
    current_setting('test.scope_player_id'),
    true
  );
  perform set_config('realtime.topic', current_setting('test.in_scope_topic'), true);
  if (
    select count(*) from realtime.messages
    where id = current_setting('test.fixture_topic_id')::uuid
  ) <> 1 then
    raise exception 'An in-scope non-admin could not subscribe to the club assignment topic';
  end if;

  perform set_config('realtime.topic', current_setting('test.out_of_scope_topic'), true);
  if (select count(*) from realtime.messages) <> 0 then
    raise exception 'An out-of-scope non-admin could subscribe to another league topic';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    current_setting('test.other_player_id'),
    true
  );
  perform set_config('realtime.topic', current_setting('test.in_scope_topic'), true);
  if (select count(*) from realtime.messages) <> 0 then
    raise exception 'A non-admin from another league could subscribe to this topic';
  end if;

  perform set_config('request.jwt.claim.sub', current_setting('test.global_admin_id'), true);
  perform set_config('realtime.topic', current_setting('test.out_of_scope_topic'), true);
  if (
    select count(*) from realtime.messages
    where id = current_setting('test.other_topic_id')::uuid
  ) <> 1 then
    raise exception 'A global admin could not subscribe outside their profile league/division';
  end if;

  perform set_config('request.jwt.claim.sub', current_setting('test.second_global_admin_id'), true);
  if (
    select count(*) from realtime.messages
    where id = current_setting('test.other_topic_id')::uuid
  ) <> 1 then
    raise exception 'The second global admin could not subscribe outside their profile league/division';
  end if;

  perform set_config('request.jwt.claim.sub', current_setting('test.scope_player_id'), true);
  if (
    select count(*) from public.notifications
    where id = current_setting('test.own_notification_id')::uuid
  ) <> 1 or (
    select count(*) from public.notifications
    where id = current_setting('test.other_notification_id')::uuid
  ) <> 0 then
    raise exception 'Notification reads were not restricted to the current user';
  end if;
  if pg_catalog.has_table_privilege(current_user, 'public.notifications', 'INSERT')
     or pg_catalog.has_table_privilege(current_user, 'public.notifications', 'UPDATE') then
    raise exception 'Clients can write notification content directly';
  end if;

  perform public.mark_notification_read(
    current_setting('test.other_notification_id')::uuid
  );
  perform public.mark_notification_read(
    current_setting('test.own_notification_id')::uuid
  );
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from public.notifications
    where id = current_setting('test.own_notification_id')::uuid
      and read_at is not null
  ) then
    raise exception 'A user could not mark their own notification as read';
  end if;
  if exists (
    select 1
    from public.notifications
    where id = current_setting('test.other_notification_id')::uuid
      and read_at is not null
  ) then
    raise exception 'A user marked another user notification as read';
  end if;
end;
$$;

rollback;
