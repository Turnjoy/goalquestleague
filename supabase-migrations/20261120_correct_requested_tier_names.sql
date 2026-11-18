begin;

-- Rename the divisions to match the supplied 960-club list. These are
-- in-place text updates: club IDs, names, managers, fixtures, and standings
-- remain attached to the same permanent club records. Apex Premier and
-- Diamond Elite are intentionally absent from this mapping and remain locked.
create temporary table _tier_name_mapping (
  league_name text not null,
  old_division text not null,
  new_division text not null,
  primary key (league_name, old_division),
  unique (league_name, new_division)
) on commit drop;

insert into _tier_name_mapping (league_name, old_division, new_division) values
  ('Crown Super League', 'Royal Division', 'Royal'),
  ('Crown Super League', 'Crown Sovereign', 'Sovereign'),
  ('Crown Super League', 'Crown Throne', 'Throne'),
  ('Crown Super League', 'Crown Regency', 'Regency'),
  ('Crown Super League', 'Crown Manor', 'Manor'),
  ('Diamond Elite League', 'Diamond Prism', 'Prism'),
  ('Diamond Elite League', 'Diamond Facet', 'Facet'),
  ('Diamond Elite League', 'Diamond Vault', 'Vault'),
  ('Diamond Elite League', 'Diamond Core', 'Core'),
  ('Platinum Champions League', 'Platinum Masters', 'Masters'),
  ('Platinum Champions League', 'Platinum Citadel', 'Citadel'),
  ('Platinum Champions League', 'Platinum Forge', 'Forge'),
  ('Platinum Champions League', 'Platinum Crucible', 'Crucible'),
  ('Gold Masters League', 'Gold Aurum', 'Aurum'),
  ('Gold Masters League', 'Gold Bullion', 'Bullion'),
  ('Gold Masters League', 'Gold Reserve', 'Reserve'),
  ('Gold Masters League', 'Gold Ingot', 'Ingot'),
  ('Silver Stars League', 'Silver Sterling', 'Sterling'),
  ('Silver Stars League', 'Silver Comet', 'Comet'),
  ('Silver Stars League', 'Silver Orbit', 'Orbit'),
  ('Silver Stars League', 'Silver Horizon', 'Horizon'),
  ('Bronze Victory League', 'Triumph Division', 'Triumph'),
  ('Bronze Victory League', 'Bronze Valor', 'Valor'),
  ('Bronze Victory League', 'Bronze Conquest', 'Conquest'),
  ('Bronze Victory League', 'Bronze Legion', 'Legion'),
  ('Bronze Victory League', 'Bronze Garrison', 'Garrison'),
  ('Copper Legends League', 'Mythic Division', 'Mythic'),
  ('Copper Legends League', 'Copper Odyssey', 'Odyssey'),
  ('Copper Legends League', 'Copper Saga', 'Saga'),
  ('Copper Legends League', 'Copper Relic', 'Relic'),
  ('Copper Legends League', 'Copper Roots', 'Roots');

do $preflight$
declare
  mapping record;
  source_count integer;
  destination_count integer;
begin
  for mapping in select * from _tier_name_mapping loop
    select count(*) into source_count
    from public.league_clubs
    where league_name = mapping.league_name and division = mapping.old_division;

    select count(*) into destination_count
    from public.league_clubs
    where league_name = mapping.league_name and division = mapping.new_division;

    -- Allow a safe rerun after a complete prior application, but refuse partial
    -- or unexpected contents before touching any rows.
    if not (
      (source_count = 20 and destination_count = 0)
      or (source_count = 0 and destination_count = 20)
    ) then
      raise exception 'Tier rename preflight failed for % / % -> % (source %, destination %); no tier rows changed',
        mapping.league_name, mapping.old_division, mapping.new_division,
        source_count, destination_count;
    end if;
  end loop;

  if (select count(*) from public.league_clubs
      where (league_name = 'Apex Football League' and division = 'Premier')
         or (league_name = 'Diamond Elite League' and division = 'Elite')) <> 40 then
    raise exception 'Expected the 40 locked Apex Premier and Diamond Elite clubs; no tier rows changed';
  end if;
end;
$preflight$;

update public.league_clubs c
set division = m.new_division
from _tier_name_mapping m
where c.league_name = m.league_name
  and c.division = m.old_division;

-- Keep player profile league labels aligned with their existing league/tier.
-- Manager identities and club assignments are not changed.
update public.profiles p
set division = m.new_division,
    division_name = case when p.division_name = m.old_division
                         then m.new_division else p.division_name end
from _tier_name_mapping m
where p.league_name = m.league_name
  and p.division = m.old_division;

do $verify$
begin
  if exists (
    select 1
    from _tier_name_mapping m
    where (select count(*) from public.league_clubs c
           where c.league_name = m.league_name and c.division = m.new_division) <> 20
  ) then
    raise exception 'Tier rename verification failed; expected 20 clubs in each renamed division';
  end if;

  if (select count(*) from public.league_clubs
      where (league_name = 'Apex Football League' and division = 'Premier')
         or (league_name = 'Diamond Elite League' and division = 'Elite')) <> 40 then
    raise exception 'Locked Tier 1 club count changed';
  end if;
end;
$verify$;

commit;
