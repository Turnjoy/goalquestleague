-- ============================================
-- ADD TEAM NAME VALIDATION TRIGGER
-- Run this in Supabase SQL Editor
-- ============================================

-- Create function to validate team names
CREATE OR REPLACE FUNCTION validate_team_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.custom_team_name IS NOT NULL THEN
    IF NEW.custom_team_name NOT IN (
      'Sovereign Hill Athletic FC', 'Diamond Coast FC', 'Crystalwood Rovers FC',
      'Kingsley Wanderers FC', 'Crownpoint Town FC', 'Fairfield Albion FC',
      'Belmont Wanderers FC', 'Gilded Valley Town FC', 'Kensington Athletic FC',
      'Mayfair Borough FC', 'Royal Oak City FC', 'Highbury Athletic FC',
      'Sterling City FC', 'Belgrave City FC', 'Richmond United FC',
      'Victoria Park FC', 'Golden Gate Albion FC', 'Silverton Town FC',
      'Grandview Borough FC', 'Monarch Hill Rangers FC', 'Blackwood Athletic FC',
      'Oldcastle City FC', 'Kingsport Borough FC', 'Riverside Borough FC',
      'Ironclad City FC', 'Southwood Athletic FC', 'Oakridge Rangers FC',
      'Crestview Town FC', 'Silverstream Rovers FC', 'Millwall Heights FC',
      'Redford Wanderers FC', 'Ashford United FC', 'Highland Albion FC',
      'Greensborough Albion FC', 'Northgate Town FC', 'Stonefield Rovers FC',
      'Portside Victoria FC', 'Westvale Rangers FC', 'St. Jude''s Athletic FC',
      'Eastbridge City FC', 'Unassigned'
    ) THEN
      RAISE EXCEPTION 'Invalid team name: %', NEW.custom_team_name;
    END IF;
  END IF;
  
  IF NEW.squad_name IS NOT NULL THEN
    IF NEW.squad_name NOT IN (
      'Sovereign Hill Athletic FC', 'Diamond Coast FC', 'Crystalwood Rovers FC',
      'Kingsley Wanderers FC', 'Crownpoint Town FC', 'Fairfield Albion FC',
      'Belmont Wanderers FC', 'Gilded Valley Town FC', 'Kensington Athletic FC',
      'Mayfair Borough FC', 'Royal Oak City FC', 'Highbury Athletic FC',
      'Sterling City FC', 'Belgrave City FC', 'Richmond United FC',
      'Victoria Park FC', 'Golden Gate Albion FC', 'Silverton Town FC',
      'Grandview Borough FC', 'Monarch Hill Rangers FC', 'Blackwood Athletic FC',
      'Oldcastle City FC', 'Kingsport Borough FC', 'Riverside Borough FC',
      'Ironclad City FC', 'Southwood Athletic FC', 'Oakridge Rangers FC',
      'Crestview Town FC', 'Silverstream Rovers FC', 'Millwall Heights FC',
      'Redford Wanderers FC', 'Ashford United FC', 'Highland Albion FC',
      'Greensborough Albion FC', 'Northgate Town FC', 'Stonefield Rovers FC',
      'Portside Victoria FC', 'Westvale Rangers FC', 'St. Jude''s Athletic FC',
      'Eastbridge City FC', 'Unassigned'
    ) THEN
      RAISE EXCEPTION 'Invalid squad name: %', NEW.squad_name;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on profiles
DROP TRIGGER IF EXISTS validate_team_name_trigger ON profiles;
CREATE TRIGGER validate_team_name_trigger
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION validate_team_name();

-- ============================================
-- COMPLETE
-- ============================================
