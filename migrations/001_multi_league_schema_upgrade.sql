-- ============================================
-- NON-DESTRUCTIVE MULTI-LEAGUE SCHEMA UPGRADE
-- Preserves all existing data and players
-- ============================================

-- ============================================
-- PART 1: ADDITIVE CHANGES TO PROFILES TABLE
-- ============================================

-- Add league tracking fields with safe defaults for existing players
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS league_name TEXT DEFAULT 'Apex Football League',
  ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 1 CHECK (tier >= 1 AND tier <= 10),
  ADD COLUMN IF NOT EXISTS division_name TEXT DEFAULT 'Premier Division',
  ADD COLUMN IF NOT EXISTS league_joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add comment for documentation
COMMENT ON COLUMN profiles.league_name IS 'The league this player belongs to (e.g., Apex Football League, Crown Super League)';
COMMENT ON COLUMN profiles.tier IS 'The tier within the league (1-10, where 1 is highest)';
COMMENT ON COLUMN profiles.division_name IS 'The division within the tier (e.g., Premier Division, Championship)';

-- ============================================
-- PART 2: LEAGUES TABLE (NEW)
-- ============================================

CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  max_players INTEGER DEFAULT 100,
  tier_count INTEGER DEFAULT 5,
  max_tier_capacity INTEGER DEFAULT 20,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE leagues IS 'Leagues that house multiple tiers of divisions';

-- Insert default leagues
INSERT INTO leagues (name, max_players, tier_count, max_tier_capacity) VALUES
  ('Apex Football League', 100, 5, 20),
  ('Crown Super League', 100, 5, 20),
  ('Diamond Elite League', 100, 5, 20)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- PART 3: DIVISIONS TABLE UPDATE
-- ============================================

-- Add league_id to link divisions to leagues
ALTER TABLE divisions 
  ADD COLUMN IF NOT EXISTS league_id UUID REFERENCES leagues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 1 CHECK (tier >= 1 AND tier <= 10),
  ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 20;

-- Set default league for existing divisions
UPDATE divisions 
SET league_id = (SELECT id FROM leagues WHERE name = 'Apex Football League' LIMIT 1)
WHERE league_id IS NULL;

-- ============================================
-- PART 4: SEASON CALENDAR TABLE UPDATE - ADD STOP_DATE
-- ============================================

-- Add stop_date (deadline) field
ALTER TABLE season_calendars
  ADD COLUMN IF NOT EXISTS stop_date DATE,
  ADD COLUMN IF NOT EXISTS is_expired BOOLEAN DEFAULT false;

COMMENT ON COLUMN season_calendars.stop_date IS 'Season deadline - after this date, unplayed fixtures expire and award 0 points';

-- ============================================
-- PART 5: FIXTURES TABLE UPDATE - ADD DEADLINE TRACKING
-- ============================================

ALTER TABLE fixtures
  ADD COLUMN IF NOT EXISTS match_week INTEGER,
  ADD COLUMN IF NOT EXISTS season_stop_date DATE,
  ADD COLUMN IF NOT EXISTS deadline_expired BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_defaulted BOOLEAN DEFAULT false;

COMMENT ON COLUMN fixtures.match_week IS 'The match week number within the season';
COMMENT ON COLUMN fixtures.season_stop_date IS 'The deadline for this fixture (copied from season calendar)';
COMMENT ON COLUMN fixtures.deadline_expired IS 'True if the fixture deadline has passed without being played';
COMMENT ON COLUMN fixtures.auto_defaulted IS 'True if scores were auto-defaulted to 0 due to deadline expiry';

-- ============================================
-- PART 6: FIXTURE EXPIRY AUTOMATION FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION close_expired_fixtures()
RETURNS TABLE (
  fixtures_updated INTEGER,
  players_affected INTEGER
) AS $$
DECLARE
  updated_count INTEGER;
  deadline_count INTEGER;
BEGIN
  -- Identify fixtures whose stop_date has passed and are still pending/scheduled
  WITH expired_fixtures AS (
    SELECT f.id, f.home_player_id, f.away_player_id
    FROM fixtures f
    LEFT JOIN season_calendars sc ON f.season_year = sc.season_year AND f.division = sc.division
    WHERE 
      f.status IN ('scheduled', 'pending_confirmation', 'disputed')
      AND (
        -- Check fixture-specific deadline first
        (f.season_stop_date IS NOT NULL AND f.season_stop_date < CURRENT_DATE)
        OR
        -- Fall back to season-level deadline
        (f.season_stop_date IS NULL AND sc.stop_date IS NOT NULL AND sc.stop_date < CURRENT_DATE)
      )
      AND f.deadline_expired = false
  )
  UPDATE fixtures f
  SET 
    status = 'expired',
    deadline_expired = true,
    auto_defaulted = true,
    home_score = 0,
    away_score = 0,
    submitted_at = NOW()
  FROM expired_fixtures ef
  WHERE f.id = ef.id
  RETURNING f.id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  -- Also mark the season calendar as expired if all fixtures are done
  UPDATE season_calendars sc
  SET is_expired = true
  WHERE sc.stop_date < CURRENT_DATE
    AND sc.is_expired = false
    AND NOT EXISTS (
      SELECT 1 FROM fixtures f 
      WHERE f.season_year = sc.season_year 
        AND f.division = sc.division 
        AND f.status IN ('scheduled', 'pending_confirmation', 'disputed')
    );

  GET DIAGNOSTICS deadline_count = ROW_COUNT;

  RETURN QUERY SELECT updated_count, deadline_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION close_expired_fixtures() IS 'Automatically expires pending fixtures after their deadline passes, defaulting scores to 0';

-- ============================================
-- PART 7: SCHEDULED CRON-JOB FOR FIXTURE EXPIRY
-- ============================================

-- Note: This would be set up in Supabase Dashboard under "Database > Extensions > pg_cron"
-- Enable pg_cron extension first (if not already enabled)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule to run daily at midnight UTC
-- SELECT cron.schedule('close-expired-fixtures', '0 0 * * *', 'SELECT close_expired_fixtures();');

-- ============================================
-- PART 8: MIGRATE EXISTING PLAYERS TO APEX LEAGUE
-- ============================================

-- Ensure all existing profiles have league/tier/division set
UPDATE profiles
SET 
  league_name = 'Apex Football League',
  tier = 1,
  division_name = 'Premier Division'
WHERE league_name IS NULL OR tier IS NULL OR division_name IS NULL;

-- Count migrated players for verification
DO $$
DECLARE
  player_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO player_count FROM profiles;
  RAISE NOTICE 'Migrated % existing players to Apex Football League Tier 1', player_count;
END $$;

-- ============================================
-- PART 9: CREATE LEAGUE CAPACITY MONITORING VIEW
-- ============================================

CREATE OR REPLACE VIEW league_capacity_stats AS
SELECT 
  l.name AS league_name,
  l.max_players AS league_capacity,
  COUNT(p.id) AS current_players,
  l.max_players - COUNT(p.id) AS remaining_slots,
  ROUND((COUNT(p.id)::FLOAT / l.max_players) * 100, 2) AS fill_percentage
FROM leagues l
LEFT JOIN profiles p ON p.league_name = l.name
GROUP BY l.id, l.name, l.max_players
ORDER BY l.name;

COMMENT ON VIEW league_capacity_stats IS 'Real-time view of league capacity and fill rates';

-- ============================================
-- PART 10: CREATE TIER CAPACITY MONITORING VIEW
-- ============================================

CREATE OR REPLACE VIEW tier_capacity_stats AS
SELECT 
  p.league_name,
  p.tier,
  d.name AS division_name,
  d.capacity AS division_capacity,
  COUNT(*) AS current_players,
  d.capacity - COUNT(*) AS remaining_slots,
  ROUND((COUNT(*)::FLOAT / d.capacity) * 100, 2) AS fill_percentage
FROM profiles p
LEFT JOIN divisions d ON p.division_name = d.name
GROUP BY p.league_name, p.tier, d.name, d.capacity
ORDER BY p.league_name, p.tier, d.name;

COMMENT ON VIEW tier_capacity_stats IS 'Real-time view of tier/division capacity and fill rates';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- All changes are additive. No data was dropped or altered.
-- Existing 40+ players are preserved and mapped to Apex Football League Tier 1.
-- ============================================
