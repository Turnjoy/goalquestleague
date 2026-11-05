-- ============================================
-- CLEANUP INVALID TEAM NAMES FROM DATABASE
-- Run this in Supabase SQL Editor
-- ============================================

-- Update profiles with invalid team names (like "Hullcity") to "Unassigned"
-- Only update records where team_name is not in the valid teams list
UPDATE profiles
SET team_name = 'Unassigned'
WHERE team_name IS NOT NULL
  AND team_name NOT IN (
    'Sovereign Hill Athletic FC',
    'Diamond Coast FC',
    'Crystalwood Rovers FC',
    'Kingsley Wanderers FC',
    'Crownpoint Town FC',
    'Fairfield Albion FC',
    'Belmont Wanderers FC',
    'Gilded Valley Town FC',
    'Kensington Athletic FC',
    'Mayfair Borough FC',
    'Royal Oak City FC',
    'Highbury Athletic FC',
    'Sterling City FC',
    'Belgrave City FC',
    'Richmond United FC',
    'Victoria Park FC',
    'Golden Gate Albion FC',
    'Silverton Town FC',
    'Grandview Borough FC',
    'Monarch Hill Rangers FC',
    'Blackwood Athletic FC',
    'Oldcastle City FC',
    'Kingsport Borough FC',
    'Riverside Borough FC',
    'Ironclad City FC',
    'Southwood Athletic FC',
    'Oakridge Rangers FC',
    'Crestview Town FC',
    'Silverstream Rovers FC',
    'Millwall Heights FC',
    'Redford Wanderers FC',
    'Ashford United FC',
    'Highland Albion FC',
    'Greensborough Albion FC',
    'Northgate Town FC',
    'Stonefield Rovers FC',
    'Portside Victoria FC',
    'Westvale Rangers FC',
    'St. Jude''s Athletic FC',
    'Eastbridge City FC'
  );

-- Update standings table to match profiles team_name
UPDATE standings s
SET team_name = p.team_name
FROM profiles p
WHERE s.player_id = p.id
  AND p.team_name IS NOT NULL;

-- Update fixtures to use custom_team_name instead of team_name if needed
-- This ensures fixtures show the correct team names
UPDATE fixtures f
SET home_team = COALESCE(
  (SELECT custom_team_name FROM profiles WHERE id = f.home_player_id),
  (SELECT squad_name FROM profiles WHERE id = f.home_player_id),
  f.home_team
)
WHERE home_team IN ('Hullcity', 'Not assigned', 'SomeTeam');

UPDATE fixtures f
SET away_team = COALESCE(
  (SELECT custom_team_name FROM profiles WHERE id = f.away_player_id),
  (SELECT squad_name FROM profiles WHERE id = f.away_player_id),
  f.away_team
)
WHERE away_team IN ('Hullcity', 'Not assigned', 'SomeTeam');

-- Report what was cleaned up
SELECT 
  'Invalid team names removed from profiles' as action,
  COUNT(*) as count
FROM profiles
WHERE team_name = 'Unassigned';

SELECT 
  'Profiles with custom_team_name (should be used for display)' as action,
  COUNT(*) as count
FROM profiles
WHERE custom_team_name IS NOT NULL;

SELECT 
  'Profiles with squad_name (fallback)' as action,
  COUNT(*) as count
FROM profiles
WHERE squad_name IS NOT NULL;

-- ============================================
-- COMPLETE
-- ============================================
