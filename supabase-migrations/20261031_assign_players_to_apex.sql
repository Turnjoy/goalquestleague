alter table public.profiles
  add column if not exists manager_handle text,
  add column if not exists custom_team_name text,
  add column if not exists league_name text;

update public.profiles
set manager_handle = coalesce(nullif(manager_handle, ''), nullif(efootball_username, ''), nullif(gamertag, ''), nullif(full_name, '')),
    custom_team_name = coalesce(nullif(custom_team_name, ''), nullif(squad_name, ''), 'eFootball Team'),
    league_name = 'Apex Football League';

alter table public.profiles
  alter column league_name set default 'Apex Football League',
  alter column league_name set not null;

alter table public.standings
  add column if not exists league_name text not null default 'Apex Football League';

update public.standings s
set league_name = coalesce(p.league_name, 'Apex Football League'),
    player_name = coalesce(nullif(p.manager_handle, ''), nullif(p.gamertag, ''), nullif(p.full_name, ''), s.player_name),
    team_name = coalesce(nullif(p.custom_team_name, ''), nullif(p.squad_name, ''), s.team_name)
from public.profiles p
where p.id = s.player_id;

delete from public.standings s
using public.profiles p
where p.id = s.player_id
  and p.is_admin = true;

create or replace function public.assign_player_to_highest_available_division(player_id_input uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_division text;
  target_league text;
begin
  select coalesce(league_name, 'Apex Football League')
  into target_league
  from public.profiles
  where id = player_id_input;

  select catalog.name into target_division
  from public.division_catalog catalog
  where catalog.slot_limit is null
    or (select count(*) from public.profiles p
        where p.division = catalog.name
          and p.league_name = target_league
          and p.is_approved = true
          and p.status = 'active'
          and p.id <> player_id_input) < catalog.slot_limit
  order by catalog.sort_order
  limit 1;

  target_division := coalesce(target_division, 'Trial');

  update public.profiles
  set division = target_division
  where id = player_id_input;

  return target_division;
end;
$$;

create or replace function public.auto_create_player_standing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin = true then
    delete from public.standings where player_id = new.id;
  elsif new.is_approved = true and new.status = 'active' then
    update public.standings
    set player_name = coalesce(new.manager_handle, new.gamertag, new.full_name, 'Player'),
        team_name = coalesce(new.custom_team_name, new.squad_name, 'eFootball Team'),
        league_name = new.league_name
    where player_id = new.id;

    if old.division is distinct from new.division then
      delete from public.standings
      where player_id = new.id
        and season = extract(year from now())::int
        and division = old.division;
    end if;

    insert into public.standings (division, league_name, season, player_id, player_name, team_name)
    values (
      new.division,
      new.league_name,
      extract(year from now())::int,
      new.id,
      coalesce(new.manager_handle, new.gamertag, new.full_name, 'Player'),
      coalesce(new.custom_team_name, new.squad_name, 'eFootball Team')
    )
    on conflict (division, season, player_id) do update
      set player_name = excluded.player_name,
          team_name = excluded.team_name,
          league_name = excluded.league_name,
          division = excluded.division;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_division_assigned on public.profiles;
create trigger on_profile_division_assigned
  after update of division, is_approved, is_admin, league_name, manager_handle, gamertag, full_name, custom_team_name, squad_name on public.profiles
  for each row execute function public.auto_create_player_standing();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, gamertag, efootball_username, squad_name, full_name,
    whatsapp_number, manager_handle, custom_team_name, league_name
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'gamertag', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'efootball_username',
    new.raw_user_meta_data->>'squad_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'whatsapp_number',
    coalesce(new.raw_user_meta_data->>'manager_handle', new.raw_user_meta_data->>'gamertag'),
    coalesce(new.raw_user_meta_data->>'custom_team_name', new.raw_user_meta_data->>'squad_name'),
    'Apex Football League'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

notify pgrst, 'reload schema';
