do $$
declare
  target_rows integer;
  target_divisions integer;
begin
  select count(*) into target_rows
  from public.league_clubs
  where (league_name, division) in (
    ('Apex Football League','Apex Vanguard'), ('Apex Football League','Apex Arena'),
    ('Apex Football League','Apex Circuit'), ('Apex Football League','Apex Outpost'),
    ('Crown Super League','Royal Division'), ('Crown Super League','Crown Sovereign'),
    ('Crown Super League','Crown Throne'), ('Crown Super League','Crown Regency'),
    ('Crown Super League','Crown Manor'),
    ('Diamond Elite League','Diamond Prism'), ('Diamond Elite League','Diamond Facet'),
    ('Diamond Elite League','Diamond Vault'), ('Diamond Elite League','Diamond Core'),
    ('Platinum Champions League','Championship'), ('Platinum Champions League','Platinum Masters'),
    ('Platinum Champions League','Platinum Citadel'), ('Platinum Champions League','Platinum Forge'),
    ('Platinum Champions League','Platinum Crucible'),
    ('Gold Masters League','Grandmaster'), ('Gold Masters League','Gold Aurum'),
    ('Gold Masters League','Gold Bullion'), ('Gold Masters League','Gold Reserve'),
    ('Gold Masters League','Gold Ingot'),
    ('Silver Stars League','Supernova'), ('Silver Stars League','Silver Sterling'),
    ('Silver Stars League','Silver Comet'), ('Silver Stars League','Silver Orbit'),
    ('Silver Stars League','Silver Horizon'),
    ('Bronze Victory League','Triumph Division'), ('Bronze Victory League','Bronze Valor'),
    ('Bronze Victory League','Bronze Conquest'), ('Bronze Victory League','Bronze Legion'),
    ('Bronze Victory League','Bronze Garrison'),
    ('Copper Legends League','Mythic Division'), ('Copper Legends League','Copper Odyssey'),
    ('Copper Legends League','Copper Saga'), ('Copper Legends League','Copper Relic'),
    ('Copper Legends League','Copper Roots'),
    ('Iron Warriors League','Iron Fortress'), ('Iron Warriors League','Vanguard Bastion'),
    ('Iron Warriors League','Steel Bulwark'), ('Iron Warriors League','Armor Citadel'),
    ('Iron Warriors League','Siege Ground'),
    ('Steel Titans League','Titan Core'), ('Steel Titans League','Colossus Ring'),
    ('Steel Titans League','Alloy Arena'), ('Steel Titans League','Forge Circuit'),
    ('Steel Titans League','Metal Vanguard')
  );
  if target_rows <> 960 then
    raise exception 'Expected 960 seeded clubs in target divisions, found %', target_rows;
  end if;

  select count(*) into target_divisions
  from (
    select league_name, division
    from public.league_clubs
    where (league_name, division) in (
      ('Apex Football League','Apex Vanguard'), ('Apex Football League','Apex Arena'),
      ('Apex Football League','Apex Circuit'), ('Apex Football League','Apex Outpost'),
      ('Crown Super League','Royal Division'), ('Crown Super League','Crown Sovereign'),
      ('Crown Super League','Crown Throne'), ('Crown Super League','Crown Regency'),
      ('Crown Super League','Crown Manor'),
      ('Diamond Elite League','Diamond Prism'), ('Diamond Elite League','Diamond Facet'),
      ('Diamond Elite League','Diamond Vault'), ('Diamond Elite League','Diamond Core'),
      ('Platinum Champions League','Championship'), ('Platinum Champions League','Platinum Masters'),
      ('Platinum Champions League','Platinum Citadel'), ('Platinum Champions League','Platinum Forge'),
      ('Platinum Champions League','Platinum Crucible'),
      ('Gold Masters League','Grandmaster'), ('Gold Masters League','Gold Aurum'),
      ('Gold Masters League','Gold Bullion'), ('Gold Masters League','Gold Reserve'),
      ('Gold Masters League','Gold Ingot'),
      ('Silver Stars League','Supernova'), ('Silver Stars League','Silver Sterling'),
      ('Silver Stars League','Silver Comet'), ('Silver Stars League','Silver Orbit'),
      ('Silver Stars League','Silver Horizon'),
      ('Bronze Victory League','Triumph Division'), ('Bronze Victory League','Bronze Valor'),
      ('Bronze Victory League','Bronze Conquest'), ('Bronze Victory League','Bronze Legion'),
      ('Bronze Victory League','Bronze Garrison'),
      ('Copper Legends League','Mythic Division'), ('Copper Legends League','Copper Odyssey'),
      ('Copper Legends League','Copper Saga'), ('Copper Legends League','Copper Relic'),
      ('Copper Legends League','Copper Roots'),
      ('Iron Warriors League','Iron Fortress'), ('Iron Warriors League','Vanguard Bastion'),
      ('Iron Warriors League','Steel Bulwark'), ('Iron Warriors League','Armor Citadel'),
      ('Iron Warriors League','Siege Ground'),
      ('Steel Titans League','Titan Core'), ('Steel Titans League','Colossus Ring'),
      ('Steel Titans League','Alloy Arena'), ('Steel Titans League','Forge Circuit'),
      ('Steel Titans League','Metal Vanguard')
    )
    group by league_name, division
    having count(*) = 20
  ) exact_divisions;
  if target_divisions <> 48 then
    raise exception 'Expected 48 full divisions, found %', target_divisions;
  end if;
  if exists (
    select lower(btrim(club_name))
    from public.league_clubs
    where (league_name, division) in (
      ('Apex Football League','Apex Vanguard'), ('Apex Football League','Apex Arena'),
      ('Apex Football League','Apex Circuit'), ('Apex Football League','Apex Outpost'),
      ('Crown Super League','Royal Division'), ('Crown Super League','Crown Sovereign'),
      ('Crown Super League','Crown Throne'), ('Crown Super League','Crown Regency'),
      ('Crown Super League','Crown Manor'),
      ('Diamond Elite League','Diamond Prism'), ('Diamond Elite League','Diamond Facet'),
      ('Diamond Elite League','Diamond Vault'), ('Diamond Elite League','Diamond Core'),
      ('Platinum Champions League','Championship'), ('Platinum Champions League','Platinum Masters'),
      ('Platinum Champions League','Platinum Citadel'), ('Platinum Champions League','Platinum Forge'),
      ('Platinum Champions League','Platinum Crucible'),
      ('Gold Masters League','Grandmaster'), ('Gold Masters League','Gold Aurum'),
      ('Gold Masters League','Gold Bullion'), ('Gold Masters League','Gold Reserve'),
      ('Gold Masters League','Gold Ingot'),
      ('Silver Stars League','Supernova'), ('Silver Stars League','Silver Sterling'),
      ('Silver Stars League','Silver Comet'), ('Silver Stars League','Silver Orbit'),
      ('Silver Stars League','Silver Horizon'),
      ('Bronze Victory League','Triumph Division'), ('Bronze Victory League','Bronze Valor'),
      ('Bronze Victory League','Bronze Conquest'), ('Bronze Victory League','Bronze Legion'),
      ('Bronze Victory League','Bronze Garrison'),
      ('Copper Legends League','Mythic Division'), ('Copper Legends League','Copper Odyssey'),
      ('Copper Legends League','Copper Saga'), ('Copper Legends League','Copper Relic'),
      ('Copper Legends League','Copper Roots'),
      ('Iron Warriors League','Iron Fortress'), ('Iron Warriors League','Vanguard Bastion'),
      ('Iron Warriors League','Steel Bulwark'), ('Iron Warriors League','Armor Citadel'),
      ('Iron Warriors League','Siege Ground'),
      ('Steel Titans League','Titan Core'), ('Steel Titans League','Colossus Ring'),
      ('Steel Titans League','Alloy Arena'), ('Steel Titans League','Forge Circuit'),
      ('Steel Titans League','Metal Vanguard')
    )
    group by lower(btrim(club_name))
    having count(*) > 1
  ) then
    raise exception 'Duplicate club names found in the seeded divisions';
  end if;
  if exists (select 1 from public.league_clubs where league_name = 'Trial') then
    raise exception 'Trial league must not contain clubs';
  end if;
  if (select count(*) from public.league_clubs
      where (league_name='Apex Football League' and division='Premier')
         or (league_name='Diamond Elite League' and division='Elite')) <> 40 then
    raise exception 'Locked Apex/Diamond Tier 1 club rows are missing';
  end if;
end;
$$;
