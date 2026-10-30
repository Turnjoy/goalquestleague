create or replace function public.admin_reject_player(player_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  player_row public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into player_row
  from public.profiles
  where id = player_id_input
  for update;

  if not found then
    raise exception 'Player not found';
  end if;
  if player_row.is_admin then
    raise exception 'Admin accounts cannot be rejected';
  end if;
  if player_row.is_approved then
    raise exception 'Only pending applicants can be rejected';
  end if;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (
    auth.uid(),
    'reject_player_delete',
    null,
    'Rejected and deleted pending account: ' || player_id_input::text
  );

  update public.admin_audit_logs
  set target_player_id = null
  where target_player_id = player_id_input;

  delete from public.fixtures f
  where f.home_player_id = player_id_input
     or f.away_player_id = player_id_input;

  delete from auth.users
  where id = player_id_input;

  if not found then
    raise exception 'Authentication account not found';
  end if;
end;
$$;
grant execute on function public.admin_reject_player(uuid) to authenticated;

create or replace function public.admin_permanent_ban_player(
  player_id_input uuid,
  ban_reason_input text,
  notes_input text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  player_row public.profiles%rowtype;
  current_season int := extract(year from now())::int;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into player_row
  from public.profiles
  where id = player_id_input;
  if not found then
    raise exception 'Player not found';
  end if;

  insert into public.banned_users (
    player_id, player_name, player_email, original_division,
    ban_reason, banned_by, notes
  ) values (
    player_id_input,
    coalesce(player_row.gamertag, player_row.full_name, 'Unknown'),
    player_row.email,
    player_row.division,
    ban_reason_input,
    auth.uid(),
    notes_input
  )
  on conflict (player_id) do update
  set player_name = excluded.player_name,
      player_email = excluded.player_email,
      original_division = excluded.original_division,
      ban_reason = excluded.ban_reason,
      banned_by = excluded.banned_by,
      notes = excluded.notes,
      banned_at = now();

  delete from public.standings s
  where s.player_id = player_id_input
    and s.season = current_season;

  update public.fixtures
  set status = 'cancelled'
  where (home_player_id = player_id_input or away_player_id = player_id_input)
    and status in ('scheduled', 'pending_confirmation');

  update public.profiles
  set status = 'banned', is_approved = false
  where id = player_id_input;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (
    auth.uid(),
    'permanent_ban',
    player_id_input,
    'Reason: ' || coalesce(ban_reason_input, 'Not specified')
  );
end;
$$;
grant execute on function public.admin_permanent_ban_player(uuid, text, text) to authenticated;
