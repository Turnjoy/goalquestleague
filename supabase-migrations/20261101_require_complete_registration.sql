alter table public.profiles
  add column if not exists manager_handle text,
  add column if not exists custom_team_name text,
  add column if not exists full_name text,
  add column if not exists whatsapp_number text;

update public.profiles p
set full_name = coalesce(
      nullif(btrim(p.full_name), ''),
      nullif(btrim(u.raw_user_meta_data->>'full_name'), '')
    ),
    whatsapp_number = coalesce(
      nullif(btrim(p.whatsapp_number), ''),
      nullif(
        regexp_replace(coalesce(u.raw_user_meta_data->>'whatsapp_number', ''), '[^0-9]', '', 'g'),
        ''
      )
    )
from auth.users u
where u.id = p.id
  and (
    nullif(btrim(p.full_name), '') is null
    or nullif(btrim(p.whatsapp_number), '') is null
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_name_value text := nullif(btrim(new.raw_user_meta_data->>'full_name'), '');
  manager_handle_value text := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'manager_handle'), ''),
    nullif(btrim(new.raw_user_meta_data->>'gamertag'), '')
  );
  team_name_value text := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'custom_team_name'), ''),
    nullif(btrim(new.raw_user_meta_data->>'squad_name'), '')
  );
  whatsapp_number_value text := regexp_replace(
    coalesce(new.raw_user_meta_data->>'whatsapp_number', ''),
    '[^0-9]',
    '',
    'g'
  );
begin
  if nullif(btrim(new.email), '') is null
     or full_name_value is null
     or manager_handle_value is null
     or length(manager_handle_value) < 3
     or team_name_value is null
     or whatsapp_number_value !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'Registration requires a valid email, full name, manager handle (at least 3 characters), team name, and international WhatsApp number';
  end if;

  insert into public.profiles (
    id, email, gamertag, efootball_username, squad_name, full_name,
    whatsapp_number, manager_handle, custom_team_name, league_name
  )
  values (
    new.id,
    new.email,
    manager_handle_value,
    manager_handle_value,
    team_name_value,
    full_name_value,
    whatsapp_number_value,
    manager_handle_value,
    team_name_value,
    'Apex Football League'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

notify pgrst, 'reload schema';
