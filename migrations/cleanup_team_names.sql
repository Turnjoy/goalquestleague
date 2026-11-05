-- ============================================
-- CLEANUP INVALID TEAM NAMES FROM DATABASE
-- Run this in Supabase SQL Editor
-- ============================================

-- Direct fix for Hullcity - update standings with Unassigned
UPDATE standings 
SET team_name = 'Unassigned'
WHERE team_name ILIKE '%hull%';

-- Update all other invalid team names to use player's actual team
UPDATE standings s
SET team_name = COALESCE(
  (SELECT custom_team_name FROM profiles WHERE id = s.player_id),
  (SELECT squad_name FROM profiles WHERE id = s.player_id),
  'Unassigned'
)
WHERE team_name IS NULL 
   OR team_name = 'Not assigned'
   OR team_name = 'SomeTeam';

-- Update fixtures to use proper team names from profiles
UPDATE fixtures f
SET home_team = COALESCE(
  (SELECT custom_team_name FROM profiles WHERE id = f.home_player_id),
  (SELECT squad_name FROM profiles WHERE id = f.home_player_id),
  'Unassigned'
)
WHERE home_team ILIKE '%hull%' 
   OR home_team = 'Not assigned' 
   OR home_team = 'SomeTeam';

UPDATE fixtures f
SET away_team = COALESCE(
  (SELECT custom_team_name FROM profiles WHERE id = f.away_player_id),
  (SELECT squad_name FROM profiles WHERE id = f.away_player_id),
  'Unassigned'
)
WHERE away_team ILIKE '%hull%' 
   OR away_team = 'Not assigned' 
   OR away_team = 'SomeTeam';

-- Report what was cleaned up
SELECT 
  'Standings with invalid team names updated' as action,
  COUNT(*) as count
FROM standings
WHERE team_name = 'Unassigned';

SELECT 
  'Profiles with custom_team_name' as action,
  COUNT(*) as count
FROM profiles
WHERE custom_team_name IS NOT NULL;

SELECT 
  'Profiles with squad_name' as action,
  COUNT(*) as count
FROM profiles
WHERE squad_name IS NOT NULL;

-- ============================================
-- COMPLETE
-- ============================================
