create or replace function public.generate_round_robin_fixtures(
  p_league_id uuid,
  p_division text,
  p_start_date date,
  p_end_date date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  players_array uuid[];
  schedule_player_count int;
  num_players int;
  num_rounds int;
  home_player_id uuid;
  away_player_id uuid;
  home_team text;
  away_team text;
  fixture_count int;
  scheduled_on date;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Fixture start and end dates are required';
  end if;
  if p_end_date < p_start_date then
    raise exception 'Fixture end date must be on or after the start date';
  end if;

  select array_agg(id order by id) into players_array
  from public.profiles
  where division = p_division
    and is_approved = true
    and status = 'active';

  players_array := coalesce(players_array, '{}'::uuid[]);
  num_players := cardinality(players_array);

  if num_players < 2 then
    raise exception 'Need at least 2 players to generate fixtures';
  end if;

  if num_players % 2 = 1 then
    players_array := array_append(players_array, null::uuid);
  end if;
  schedule_player_count := cardinality(players_array);
  num_rounds := schedule_player_count - 1;

  delete from public.fixtures
  where division = p_division
    and fixture_date::date between p_start_date and p_end_date;

  fixture_count := 0;

  for round_idx in 1..num_rounds loop
    scheduled_on := p_start_date
      + ((p_end_date - p_start_date) * (round_idx - 1) / greatest(num_rounds - 1, 1));

    for pair_idx in 1..(schedule_player_count / 2) loop
      home_player_id := players_array[pair_idx];
      away_player_id := players_array[schedule_player_count - pair_idx + 1];

      if home_player_id is not null and away_player_id is not null and home_player_id <> away_player_id then
        select coalesce(squad_name, gamertag, 'eFootball Team') into home_team
        from public.profiles where id = home_player_id;
        select coalesce(squad_name, gamertag, 'eFootball Team') into away_team
        from public.profiles where id = away_player_id;

        insert into public.fixtures (
          division, matchweek, home_player_id, away_player_id,
          home_team, away_team, status, fixture_date
        ) values (
          p_division, round_idx, home_player_id, away_player_id,
          home_team, away_team,
          'scheduled', scheduled_on::timestamp at time zone 'UTC'
        );

        fixture_count := fixture_count + 1;
      end if;
    end loop;

    if schedule_player_count > 2 then
      players_array[2:schedule_player_count] := array_cat(
        array[players_array[schedule_player_count]],
        players_array[2:schedule_player_count - 1]
      );
    end if;
  end loop;

  insert into public.admin_audit_logs (admin_id, action, target_player_id, notes)
  values (
    auth.uid(),
    'generate_fixtures',
    null,
    'Division: ' || p_division || ', Fixtures: ' || fixture_count
      || ', Date range: ' || p_start_date || ' to ' || p_end_date
  );

  return json_build_object(
    'success', true,
    'division', p_division,
    'fixtures_generated', fixture_count,
    'players', num_players
  );
end;
$$;

grant execute on function public.generate_round_robin_fixtures(uuid, text, date, date) to authenticated;

notify pgrst, 'reload schema';
