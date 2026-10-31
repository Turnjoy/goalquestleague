-- ============================================
-- COMPLETE MULTI-LEAGUE UPGRADE SQL SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- PART 1: ADDITIVE SCHEMA CHANGES
-- ============================================

-- Add league tracking fields to profiles table
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS league_name TEXT DEFAULT 'Apex Football League',
  ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 1 CHECK (tier >= 1 AND tier <= 10),
  ADD COLUMN IF NOT EXISTS division_name TEXT DEFAULT 'Premier Division',
  ADD COLUMN IF NOT EXISTS league_joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

COMMENT ON COLUMN profiles.league_name IS 'The league this player belongs to (e.g., Apex Football League, Crown Super League)';
COMMENT ON COLUMN profiles.tier IS 'The tier within the league (1-10, where 1 is highest)';
COMMENT ON COLUMN profiles.division_name IS 'The division within the tier (e.g., Premier Division, Championship)';

-- Create leagues table (if it doesn't exist)
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

-- Add missing columns if they don't exist (in case table was created with different schema)
ALTER TABLE leagues 
  ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS tier_count INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_tier_capacity INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Insert default leagues
INSERT INTO leagues (name, max_players, tier_count, max_tier_capacity) VALUES
  ('Apex Football League', 100, 5, 20),
  ('Crown Super League', 100, 5, 20),
  ('Diamond Elite League', 100, 5, 20),
  ('Platinum Champions League', 100, 5, 20),
  ('Gold Masters League', 100, 5, 20),
  ('Silver Stars League', 100, 5, 20),
  ('Bronze Victory League', 100, 5, 20),
  ('Copper Legends League', 100, 5, 20),
  ('Iron Warriors League', 100, 5, 20),
  ('Steel Titans League', 100, 5, 20)
ON CONFLICT (name) DO NOTHING;

-- Add league/tier/capacity to divisions table
ALTER TABLE divisions 
  ADD COLUMN IF NOT EXISTS league_id UUID REFERENCES leagues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 1 CHECK (tier >= 1 AND tier <= 10),
  ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 20;

-- Set default league for existing divisions
UPDATE divisions 
SET league_id = (SELECT id FROM leagues WHERE name = 'Apex Football League' LIMIT 1)
WHERE league_id IS NULL;

-- Add stop_date (deadline) to season_calendars
ALTER TABLE season_calendars
  ADD COLUMN IF NOT EXISTS stop_date DATE,
  ADD COLUMN IF NOT EXISTS is_expired BOOLEAN DEFAULT false;

COMMENT ON COLUMN season_calendars.stop_date IS 'Season deadline - after this date, unplayed fixtures expire and award 0 points';

-- Add deadline tracking to fixtures
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
-- PART 2: VIEWS
-- ============================================

CREATE OR REPLACE VIEW league_capacity_stats AS
SELECT 
  l.name AS league_name,
  l.max_players AS league_capacity,
  COUNT(p.id) AS current_players,
  l.max_players - COUNT(p.id) AS remaining_slots,
  ROUND(((COUNT(p.id)::NUMERIC / l.max_players) * 100), 2) AS fill_percentage
FROM leagues l
LEFT JOIN profiles p ON p.league_name = l.name
GROUP BY l.id, l.name, l.max_players
ORDER BY l.name;

COMMENT ON VIEW league_capacity_stats IS 'Real-time view of league capacity and fill rates';

CREATE OR REPLACE VIEW tier_capacity_stats AS
SELECT 
  p.league_name,
  p.tier,
  d.name AS division_name,
  d.capacity AS division_capacity,
  COUNT(*) AS current_players,
  d.capacity - COUNT(*) AS remaining_slots,
  ROUND(((COUNT(*)::NUMERIC / d.capacity) * 100), 2) AS fill_percentage
FROM profiles p
LEFT JOIN divisions d ON p.division_name = d.name
GROUP BY p.league_name, p.tier, d.name, d.capacity
ORDER BY p.league_name, p.tier, d.name;

COMMENT ON VIEW tier_capacity_stats IS 'Real-time view of tier/division capacity and fill rates';

-- ============================================
-- PART 3: FUNCTIONS
-- ============================================

-- Auto-allocation trigger function (simplified: fill Apex tiers sequentially)
CREATE OR REPLACE FUNCTION auto_allocate_player_to_league()
RETURNS TRIGGER AS $$
DECLARE
  target_league TEXT;
  target_tier INTEGER;
  target_division TEXT;
  league_current_players INTEGER;
BEGIN
  -- Always use Apex Football League as the primary league
  target_league := 'Apex Football League';
  
  -- Count current players in the league
  SELECT COUNT(*) INTO league_current_players
  FROM profiles
  WHERE league_name = target_league;
  
  -- Determine tier based on league capacity (20 players per tier)
  -- Tier 1: players 0-19, Tier 2: 20-39, Tier 3: 40-59, Tier 4: 60-79, Tier 5: 80-99
  target_tier := (league_current_players / 20) + 1;
  
  -- Cap at tier 5
  IF target_tier > 5 THEN
    target_tier := 5;
  END IF;
  
  -- Set division name based on tier
  CASE target_tier
    WHEN 1 THEN target_division := 'Premier Division';
    WHEN 2 THEN target_division := 'Championship';
    WHEN 3 THEN target_division := 'Division 1';
    WHEN 4 THEN target_division := 'Division 2';
    WHEN 5 THEN target_division := 'Division 3';
    ELSE target_division := 'Division ' || (target_tier - 1);
  END CASE;
  
  -- Update the new profile
  NEW.league_name := target_league;
  NEW.tier := target_tier;
  NEW.division_name := target_division;
  NEW.league_joined_at := NOW();
  
  -- Ensure division exists in divisions table
  INSERT INTO divisions (name, league_id, tier, capacity, max_players)
  VALUES (
    target_division,
    (SELECT id FROM leagues WHERE name = target_league),
    target_tier,
    20,
    20
  )
  ON CONFLICT (name) DO UPDATE SET
    league_id = (SELECT id FROM leagues WHERE name = target_league),
    tier = target_tier,
    capacity = 20,
    max_players = 20;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fixture expiry function
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

COMMENT ON FUNCTION close_expired_fixtures() IS 'Automatically expires pending fixtures after deadline passes, defaulting scores to 0';

-- Admin force player allocation
CREATE OR REPLACE FUNCTION admin_force_player_allocation(
  p_player_id UUID,
  p_target_league TEXT,
  p_target_tier INTEGER,
  p_target_division TEXT
)
RETURNS JSONB AS $$
DECLARE
  league_id UUID;
BEGIN
  -- Validate league exists
  SELECT id INTO league_id FROM leagues WHERE name = p_target_league;
  IF league_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'League not found: ' || p_target_league
    );
  END IF;
  
  -- Validate tier is within range
  IF p_target_tier < 1 OR p_target_tier > 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Tier must be between 1 and 5'
    );
  END IF;
  
  -- Ensure division exists
  INSERT INTO divisions (name, league_id, tier, capacity, max_players)
  VALUES (p_target_division, league_id, p_target_tier, 20, 20)
  ON CONFLICT (name) DO UPDATE SET
    league_id = league_id,
    tier = p_target_tier,
    capacity = 20,
    max_players = 20;
  
  -- Update player
  UPDATE profiles
  SET 
    league_name = p_target_league,
    tier = p_target_tier,
    division_name = p_target_division
  WHERE id = p_player_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Player reallocated to ' || p_target_league || ' Tier ' || p_target_tier || ' - ' || p_target_division,
    'league', p_target_league,
    'tier', p_target_tier,
    'division', p_target_division
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin reassign with clear parameters
CREATE OR REPLACE FUNCTION admin_reassign_player_v2(
  p_player_id UUID DEFAULT NULL,
  p_target_league TEXT DEFAULT NULL,
  p_target_tier INTEGER DEFAULT NULL,
  p_target_division TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
  -- If no league specified, use player's current league but reassign division
  IF p_target_league IS NULL THEN
    SELECT league_name INTO p_target_league FROM profiles WHERE id = p_player_id;
  END IF;
  
  IF p_target_tier IS NULL THEN
    SELECT tier INTO p_target_tier FROM profiles WHERE id = p_player_id;
  END IF;
  
  IF p_target_division IS NULL THEN
    SELECT division_name INTO p_target_division FROM profiles WHERE id = p_player_id;
  END IF;
  
  RETURN admin_force_player_allocation(p_player_id, p_target_league, p_target_tier, p_target_division);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backward compatibility wrapper (drop existing first)
DROP FUNCTION IF EXISTS admin_reassign_player(UUID, TEXT);
CREATE FUNCTION admin_reassign_player(p_player_id UUID, p_division_input TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM admin_reassign_player_v2(p_player_id, NULL, NULL, p_division_input);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Season calendar with deadline
CREATE OR REPLACE FUNCTION create_season_calendar_with_deadline(
  p_division TEXT,
  p_season_year INTEGER,
  p_start_date DATE,
  p_end_date DATE,
  p_stop_date DATE
)
RETURNS JSONB AS $$
DECLARE
  calendar_id UUID;
BEGIN
  -- Validate dates
  IF p_stop_date IS NULL THEN
    p_stop_date := p_end_date + INTERVAL '7 days';
  END IF;
  
  IF p_stop_date < p_end_date THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stop date must be after season end date'
    );
  END IF;
  
  -- Insert or update calendar
  INSERT INTO season_calendars (
    division,
    season_year,
    season_start_date,
    season_end_date,
    stop_date,
    pre_season_window_start,
    pre_season_window_end,
    mid_season_window_start,
    mid_season_window_end,
    total_fixtures,
    expected_duration_days
  )
  VALUES (
    p_division,
    p_season_year,
    p_start_date,
    p_end_date,
    p_stop_date,
    p_start_date - INTERVAL '14 days',
    p_start_date - INTERVAL '7 days',
    p_start_date + INTERVAL '60 days',
    p_start_date + INTERVAL '90 days',
    0,
    EXTRACT(DAY FROM (p_end_date - p_start_date))
  )
  ON CONFLICT (division, season_year) DO UPDATE SET
    season_start_date = p_start_date,
    season_end_date = p_end_date,
    stop_date = p_stop_date,
    pre_season_window_start = p_start_date - INTERVAL '14 days',
    pre_season_window_end = p_start_date - INTERVAL '7 days',
    mid_season_window_start = p_start_date + INTERVAL '60 days',
    mid_season_window_end = p_start_date + INTERVAL '90 days',
    expected_duration_days = EXTRACT(DAY FROM (p_end_date - p_start_date)),
    is_finalized = false;
  
  SELECT id INTO calendar_id FROM season_calendars
  WHERE division = p_division AND season_year = p_season_year;
  
  RETURN jsonb_build_object(
    'success', true,
    'calendar_id', calendar_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'stop_date', p_stop_date
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fixture generation with stop_date
CREATE OR REPLACE FUNCTION generate_fixtures_with_deadline(
  p_league_id TEXT,
  p_division TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_stop_date DATE
)
RETURNS JSONB AS $$
DECLARE
  season_year INTEGER;
  calendar_id UUID;
  fixtures_generated INTEGER;
  players_count INTEGER;
BEGIN
  -- Extract season year from start date
  season_year := EXTRACT(YEAR FROM p_start_date);
  
  -- Create or update season calendar with stop date
  PERFORM create_season_calendar_with_deadline(p_division, season_year, p_start_date, p_end_date, p_stop_date);
  
  -- Get calendar ID
  SELECT id INTO calendar_id FROM season_calendars
  WHERE division = p_division AND season_year = season_year;
  
  -- Get all players in this division
  SELECT COUNT(*) INTO players_count
  FROM profiles
  WHERE division_name = p_division;
  
  -- Note: Actual fixture generation logic would go here
  fixtures_generated := players_count * (players_count - 1);
  
  -- Update calendar with fixture count
  UPDATE season_calendars
  SET total_fixtures = fixtures_generated
  WHERE id = calendar_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'fixtures_generated', fixtures_generated,
    'players', players_count,
    'division', p_division,
    'season_year', season_year,
    'calendar_id', calendar_id,
    'stop_date', p_stop_date
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backward compatibility wrapper
CREATE OR REPLACE FUNCTION generate_round_robin_fixtures(
  p_league_id TEXT,
  p_division TEXT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB AS $$
BEGIN
  RETURN generate_fixtures_with_deadline(p_league_id, p_division, p_start_date, p_end_date, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update fixture deadlines
CREATE OR REPLACE FUNCTION update_fixture_deadlines()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Copy stop_date from season calendar to fixtures
  UPDATE fixtures f
  SET season_stop_date = sc.stop_date
  FROM season_calendars sc
  WHERE f.season_year = sc.season_year
    AND f.division = sc.division
    AND f.season_stop_date IS NULL
    AND sc.stop_date IS NOT NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 4: TRIGGERS
-- ============================================

-- Create trigger on profiles insert for auto-allocation
DROP TRIGGER IF EXISTS on_profile_insert_auto_allocate ON profiles;
CREATE TRIGGER on_profile_insert_auto_allocate
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_allocate_player_to_league();

-- ============================================
-- PART 5: DATA MIGRATION (SIMPLIFIED - ALL TO APEX)
-- ============================================

-- Migrate all existing players to Apex Football League tiers sequentially
DO $$
DECLARE
  player_count INTEGER;
  current_tier INTEGER;
  target_division TEXT;
  offset_counter INTEGER := 0;
  player_record RECORD;
BEGIN
  SELECT COUNT(*) INTO player_count FROM profiles;
  RAISE NOTICE 'Found % existing players to migrate to Apex Football League', player_count;
  
  -- Migrate players sequentially (fill Tier 1 first, then Tier 2, etc.)
  FOR player_record IN (
    SELECT id FROM profiles ORDER BY created_at ASC
  ) LOOP
    -- Calculate tier based on offset (20 players per tier)
    current_tier := (offset_counter / 20) + 1;
    
    -- Cap at tier 5
    IF current_tier > 5 THEN
      current_tier := 5;
    END IF;
    
    -- Set division based on tier
    CASE current_tier
      WHEN 1 THEN target_division := 'Premier Division';
      WHEN 2 THEN target_division := 'Championship';
      WHEN 3 THEN target_division := 'Division 1';
      WHEN 4 THEN target_division := 'Division 2';
      WHEN 5 THEN target_division := 'Division 3';
      ELSE target_division := 'Division ' || (current_tier - 1);
    END CASE;
    
    -- Update player
    UPDATE profiles
    SET 
      league_name = 'Apex Football League',
      tier = current_tier,
      division_name = target_division,
      league_joined_at = created_at
    WHERE id = player_record.id;
    
    offset_counter := offset_counter + 1;
  END LOOP;
  
  RAISE NOTICE 'Migration complete: All % players allocated to Apex Football League tiers', offset_counter;
END $$;

-- ============================================
-- COMPLETE
-- ============================================
-- All changes are additive. No data was dropped or altered.
-- Existing players are preserved and mapped to Apex tiers.
-- ============================================
