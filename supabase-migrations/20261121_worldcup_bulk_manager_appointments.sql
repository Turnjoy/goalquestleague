create or replace function public.appoint_country_managers(
  tournament_id_input uuid,
  manager_assignments_input jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  appointment_record record;
  saved_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if jsonb_typeof(manager_assignments_input) is distinct from 'array' then
    raise exception 'Manager assignments must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(manager_assignments_input) as assignment(country_id uuid, manager_id uuid)
    where country_id is null or manager_id is null
  ) then
    raise exception 'Each appointment requires a country and manager';
  end if;

  if exists (
    select country_id
    from jsonb_to_recordset(manager_assignments_input) as assignment(country_id uuid, manager_id uuid)
    group by country_id
    having count(*) > 1
  ) then
    raise exception 'A country can only be appointed once per save';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(manager_assignments_input) as assignment(country_id uuid, manager_id uuid)
    left join public.world_cup_countries country
      on country.id = assignment.country_id
     and country.tournament_id = tournament_id_input
    where country.id is null
  ) then
    raise exception 'Every country must belong to this tournament';
  end if;

  for appointment_record in
    select country_id, manager_id
    from jsonb_to_recordset(manager_assignments_input) as assignment(country_id uuid, manager_id uuid)
  loop
    perform public.appoint_country_manager(
      tournament_id_input,
      appointment_record.country_id,
      appointment_record.manager_id
    );
    saved_count := saved_count + 1;
  end loop;

  return saved_count;
end;
$$;

revoke all on function public.appoint_country_managers(uuid, jsonb) from public, anon;
grant execute on function public.appoint_country_managers(uuid, jsonb) to authenticated;
