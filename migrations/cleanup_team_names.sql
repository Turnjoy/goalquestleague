-- ============================================
-- CLEANUP INVALID TEAM NAMES FROM DATABASE
-- Run this in Supabase SQL Editor
-- ============================================

-- The profiles table uses custom_team_name and squad_name, not team_name
-- Invalid team names may be in the standings table

-- Update standings table: set invalid team names to null or use player's custom_team_name
UPDATE standings s
SET team_name = COALESCE(
  (SELECT custom_team_name FROM profiles WHERE id = s.player_id),
  (SELECT squad_name FROM profiles WHERE id = s.player_id),
  'Unassigned'
)
WHERE team_name IN ('Hullcity', 'Not assigned', 'SomeTeam', 'Hull City', 'hullcity')
   OR team_name IS NULL;

-- Update fixtures to use proper team names from profiles
UPDATE fixtures f
SET home_team = COALESCE(
  (SELECT custom_team_name FROM profiles WHERE id = f.home_player_id),
  (SELECT squad_name FROM profiles WHERE id = f.home_player_id),
  'Unassigned'
)
WHERE home_team IN ('Hullcity', 'Not assigned', 'SomeTeam', 'Hull City', 'hullcity');

UPDATE fixtures f
SET away_team = COALESCE(
  (SELECT custom_team_name FROM profiles WHERE id = f.away_player_id),
  (SELECT squad_name FROM profiles WHERE id = f.away_player_id),
  'Unassigned'
)
WHERE away_team IN ('Hullcity', 'Not assigned', 'SomeTeam', 'Hull City', 'hullcity');

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
