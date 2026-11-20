-- Qualify positions 1-4 from each of the eight groups for a 32-team bracket.
-- Keep the existing opening_round enum value internally for compatibility;
-- the public and admin UI labels it Round of 32.

create or replace function public.generate_world_cup_knockout_fixtures(tournament_id_input uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  group_letters text[];
  home_team uuid;
  away_team uuid;
  fixture_count int := 0;
  match_number int := 1;
  group_index int;
  seed int;
  existing_fixtures int;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select count(*) into existing_fixtures
  from public.world_cup_fixtures
  where tournament_id = tournament_id_input
    and match_type = 'knockout'
    and knockout_round = 'opening_round';

  if existing_fixtures = 16 then
    return 0;
  end if;

  if existing_fixtures > 0 then
    if exists (
      select 1 from public.world_cup_fixtures
      where tournament_id = tournament_id_input
        and match_type = 'knockout'
        and knockout_round = 'opening_round'
        and (status <> 'scheduled' or home_score is not null or away_score is not null)
    ) then
      raise exception 'Existing opening-round fixtures contain results and cannot be replaced automatically';
    end if;

    delete from public.world_cup_fixtures
    where tournament_id = tournament_id_input
      and match_type = 'knockout'
      and knockout_round = 'opening_round';
  end if;

  select array_agg(groups.group_letter order by groups.group_letter)
  into group_letters
  from (
    select distinct group_letter
    from public.world_cup_standings
    where tournament_id = tournament_id_input
  ) groups;

  if coalesce(array_length(group_letters, 1), 0) <> 8 then
    raise exception 'World Cup requires exactly 8 groups before generating the Round of 32';
  end if;

  if exists (
    select 1
    from unnest(group_letters) as groups(group_letter)
    where (
      select count(*) from public.world_cup_standings s
      where s.tournament_id = tournament_id_input
        and s.group_letter = groups.group_letter
        and s.position between 1 and 5
    ) <> 5 or (
      select min(s.played) from public.world_cup_standings s
      where s.tournament_id = tournament_id_input
        and s.group_letter = groups.group_letter
    ) < 8
  ) then
    raise exception 'All eight groups must have complete standings before generating knockout fixtures';
  end if;

  update public.world_cup_standings
  set advanced = (position between 1 and 4)
  where tournament_id = tournament_id_input;

  -- Pair the top four from one group against positions 4 through 1
  -- from the opposite group (A-H, B-G, C-F, D-E).
  for group_index in 1..4 loop
    for seed in 1..4 loop
      select country_id into home_team
      from public.world_cup_standings
      where tournament_id = tournament_id_input
        and group_letter = group_letters[group_index]
        and position = seed;

      select country_id into away_team
      from public.world_cup_standings
      where tournament_id = tournament_id_input
        and group_letter = group_letters[9 - group_index]
        and position = 5 - seed;

      if home_team is null or away_team is null or home_team = away_team then
        raise exception 'Could not create a valid Round of 32 pairing';
      end if;

      insert into public.world_cup_fixtures (
        tournament_id, match_type, knockout_round,
        home_country_id, away_country_id, match_number
      ) values (
        tournament_id_input, 'knockout', 'opening_round',
        home_team, away_team, match_number
      );

      fixture_count := fixture_count + 1;
      match_number := match_number + 1;
    end loop;
  end loop;

  update public.world_cup_tournaments
  set current_round = 'opening_round'
  where id = tournament_id_input;

  return fixture_count;
end;
$$;

create or replace function public.generate_world_cup_round_of_16(tournament_id_input uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  round_of_32_winners uuid[];
  fixture_count int := 0;
  match_number int := 1;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if exists (
    select 1 from public.world_cup_fixtures
    where tournament_id = tournament_id_input
      and match_type = 'knockout'
      and knockout_round = 'round_of_16'
  ) then
    return 0;
  end if;

  select array_agg(
    case
      when home_score > away_score then home_country_id
      when away_score > home_score then away_country_id
      when home_penalty_shootout > away_penalty_shootout then home_country_id
      when away_penalty_shootout > home_penalty_shootout then away_country_id
      else null
    end
    order by match_number
  ) into round_of_32_winners
  from public.world_cup_fixtures
  where tournament_id = tournament_id_input
    and match_type = 'knockout'
    and knockout_round = 'opening_round'
    and status = 'completed';

  if coalesce(array_length(round_of_32_winners, 1), 0) <> 16
     or array_position(round_of_32_winners, null) is not null then
    raise exception 'All 16 Round of 32 fixtures must be completed with a winner before generating the Round of 16';
  end if;

  for match_number in 1..8 loop
    insert into public.world_cup_fixtures (
      tournament_id, match_type, knockout_round,
      home_country_id, away_country_id, match_number
    ) values (
      tournament_id_input, 'knockout', 'round_of_16',
      round_of_32_winners[match_number],
      round_of_32_winners[17 - match_number],
      match_number
    );
    fixture_count := fixture_count + 1;
  end loop;

  update public.world_cup_tournaments
  set current_round = 'round_of_16'
  where id = tournament_id_input;

  return fixture_count;
end;
$$;
