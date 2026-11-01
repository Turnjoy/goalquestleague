drop function if exists public.admin_reassign_player(text, uuid);
drop function if exists public.admin_reassign_player(uuid, text);

create or replace function public.admin_reassign_player(player_id_input uuid, division_input text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_player public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if division_input not in ('Elite', 'Premier', 'Championship', 'Challenger', 'Contender', 'Trial') then
    raise exception 'Unknown division: %', division_input;
  end if;

  select * into target_player
  from public.profiles
  where id = player_id_input
  for update;
  if not found then
    raise exception 'Player not found';
  end if;

  update public.profiles
  set division = division_input
  where id = player_id_input;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (auth.uid(), 'reassign_player', player_id_input, 'Division: ' || division_input);
end;
$$;

grant execute on function public.admin_reassign_player(uuid, text) to authenticated;

notify pgrst, 'reload schema';
