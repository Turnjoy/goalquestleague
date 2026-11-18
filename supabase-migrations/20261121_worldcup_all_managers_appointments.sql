create or replace function public.appoint_country_manager(
  tournament_id_input uuid,
  country_id_input uuid,
  manager_id_input uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  manager_profile public.profiles%rowtype;
  current_assignment public.season_club_assignments%rowtype;
  club_name text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into manager_profile
  from public.profiles
  where id = manager_id_input
    and is_admin = false;

  if not found then
    raise exception 'Manager profile not found or is an admin';
  end if;

  if not exists (
    select 1
    from public.world_cup_countries
    where id = country_id_input
      and tournament_id = tournament_id_input
  ) then
    raise exception 'Country does not belong to this tournament';
  end if;

  select * into current_assignment
  from public.season_club_assignments
  where player_id = manager_id_input
    and season_year = extract(year from now())::int
  order by assigned_at desc
  limit 1;

  select lc.club_name into club_name
  from public.league_clubs lc
  where lc.id = current_assignment.club_id;

  update public.world_cup_manager_appointments
  set is_current = false,
      end_date = now(),
      end_reason = 'replaced'
  where tournament_id = tournament_id_input
    and country_id = country_id_input
    and is_current = true;

  insert into public.world_cup_manager_appointments (
    tournament_id,
    country_id,
    manager_id,
    source_club_id,
    source_club_name,
    appointed_by
  )
  values (
    tournament_id_input,
    country_id_input,
    manager_id_input,
    current_assignment.club_id,
    club_name,
    auth.uid()
  );
end;
$$;

revoke all on function public.appoint_country_manager(uuid, uuid, uuid) from public, anon;
grant execute on function public.appoint_country_manager(uuid, uuid, uuid) to authenticated;
