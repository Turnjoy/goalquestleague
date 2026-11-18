-- Read-only preview of the 48 target divisions. Does not modify data.
with target(league_name,division) as (values
  ('Apex Football League', 'Apex Vanguard'),
  ('Apex Football League', 'Apex Arena'),
  ('Apex Football League', 'Apex Circuit'),
  ('Apex Football League', 'Apex Outpost'),
  ('Crown Super League', 'Royal Division'),
  ('Crown Super League', 'Crown Sovereign'),
  ('Crown Super League', 'Crown Throne'),
  ('Crown Super League', 'Crown Regency'),
  ('Crown Super League', 'Crown Manor'),
  ('Diamond Elite League', 'Diamond Prism'),
  ('Diamond Elite League', 'Diamond Facet'),
  ('Diamond Elite League', 'Diamond Vault'),
  ('Diamond Elite League', 'Diamond Core'),
  ('Platinum Champions League', 'Championship'),
  ('Platinum Champions League', 'Platinum Masters'),
  ('Platinum Champions League', 'Platinum Citadel'),
  ('Platinum Champions League', 'Platinum Forge'),
  ('Platinum Champions League', 'Platinum Crucible'),
  ('Gold Masters League', 'Grandmaster'),
  ('Gold Masters League', 'Gold Aurum'),
  ('Gold Masters League', 'Gold Bullion'),
  ('Gold Masters League', 'Gold Reserve'),
  ('Gold Masters League', 'Gold Ingot'),
  ('Silver Stars League', 'Supernova'),
  ('Silver Stars League', 'Silver Sterling'),
  ('Silver Stars League', 'Silver Comet'),
  ('Silver Stars League', 'Silver Orbit'),
  ('Silver Stars League', 'Silver Horizon'),
  ('Bronze Victory League', 'Triumph Division'),
  ('Bronze Victory League', 'Bronze Valor'),
  ('Bronze Victory League', 'Bronze Conquest'),
  ('Bronze Victory League', 'Bronze Legion'),
  ('Bronze Victory League', 'Bronze Garrison'),
  ('Copper Legends League', 'Mythic Division'),
  ('Copper Legends League', 'Copper Odyssey'),
  ('Copper Legends League', 'Copper Saga'),
  ('Copper Legends League', 'Copper Relic'),
  ('Copper Legends League', 'Copper Roots'),
  ('Iron Warriors League', 'Iron Fortress'),
  ('Iron Warriors League', 'Vanguard Bastion'),
  ('Iron Warriors League', 'Steel Bulwark'),
  ('Iron Warriors League', 'Armor Citadel'),
  ('Iron Warriors League', 'Siege Ground'),
  ('Steel Titans League', 'Titan Core'),
  ('Steel Titans League', 'Colossus Ring'),
  ('Steel Titans League', 'Alloy Arena'),
  ('Steel Titans League', 'Forge Circuit'),
  ('Steel Titans League', 'Metal Vanguard')
)
select t.league_name,t.division,count(c.id) as current_clubs,20 as expected_clubs,
       greatest(20-count(c.id),0) as estimated_inserts,greatest(count(c.id)-20,0) as excess
from target t left join public.league_clubs c using (league_name,division)
group by t.league_name,t.division order by t.league_name,t.division;

-- Existing duplicate names (case-insensitive), for review before insertion.
select lower(btrim(club_name)) as normalized_name,
       count(*) as occurrences,
       array_agg(league_name || ' · ' || division || ' · #' || club_number order by league_name,division,club_number) as locations
from public.league_clubs
group by lower(btrim(club_name))
having count(*) > 1
order by occurrences desc, normalized_name;

-- Locked Tier 1 clubs for review; migration writes never target these scopes.
select id,league_name,division,club_number,club_name from public.league_clubs
where (league_name='Apex Football League' and division='Premier')
   or (league_name='Diamond Elite League' and division='Elite')
order by league_name,club_number;
