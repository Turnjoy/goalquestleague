-- Read-only preview of the 48 target divisions. Does not modify data.
with target(league_name,division) as (values
  ('Apex Football League', 'Apex Vanguard'),
  ('Apex Football League', 'Apex Arena'),
  ('Apex Football League', 'Apex Circuit'),
  ('Apex Football League', 'Apex Outpost'),
  ('Crown Super League', 'Royal'),
  ('Crown Super League', 'Sovereign'),
  ('Crown Super League', 'Throne'),
  ('Crown Super League', 'Regency'),
  ('Crown Super League', 'Manor'),
  ('Diamond Elite League', 'Prism'),
  ('Diamond Elite League', 'Facet'),
  ('Diamond Elite League', 'Vault'),
  ('Diamond Elite League', 'Core'),
  ('Platinum Champions League', 'Championship'),
  ('Platinum Champions League', 'Masters'),
  ('Platinum Champions League', 'Citadel'),
  ('Platinum Champions League', 'Forge'),
  ('Platinum Champions League', 'Crucible'),
  ('Gold Masters League', 'Grandmaster'),
  ('Gold Masters League', 'Aurum'),
  ('Gold Masters League', 'Bullion'),
  ('Gold Masters League', 'Reserve'),
  ('Gold Masters League', 'Ingot'),
  ('Silver Stars League', 'Supernova'),
  ('Silver Stars League', 'Sterling'),
  ('Silver Stars League', 'Comet'),
  ('Silver Stars League', 'Orbit'),
  ('Silver Stars League', 'Horizon'),
  ('Bronze Victory League', 'Triumph'),
  ('Bronze Victory League', 'Valor'),
  ('Bronze Victory League', 'Conquest'),
  ('Bronze Victory League', 'Legion'),
  ('Bronze Victory League', 'Garrison'),
  ('Copper Legends League', 'Mythic'),
  ('Copper Legends League', 'Odyssey'),
  ('Copper Legends League', 'Saga'),
  ('Copper Legends League', 'Relic'),
  ('Copper Legends League', 'Roots'),
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
