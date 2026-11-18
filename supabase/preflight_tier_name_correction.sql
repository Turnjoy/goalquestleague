-- Read-only check before applying 20261120_correct_requested_tier_names.sql.
-- Expected result: 31 source rows groups at 20 clubs each, destinations at 0,
-- and 40 locked Tier 1 clubs. No data is changed by this query.
with mapping(league_name, old_division, new_division) as (
  values
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
    ('Copper Legends League', 'Copper Roots', 'Roots')
)
select
  m.league_name,
  m.old_division,
  m.new_division,
  count(*) filter (where c.division = m.old_division) as clubs_to_rename,
  count(*) filter (where c.division = m.new_division) as clubs_already_renamed
from mapping m
left join public.league_clubs c
  on c.league_name = m.league_name
 and c.division in (m.old_division, m.new_division)
group by m.league_name, m.old_division, m.new_division
order by m.league_name, m.old_division;

select league_name, division, count(*) as locked_clubs
from public.league_clubs
where (league_name = 'Apex Football League' and division = 'Premier')
   or (league_name = 'Diamond Elite League' and division = 'Elite')
group by league_name, division
order by league_name;
