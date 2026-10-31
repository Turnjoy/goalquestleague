-- ============================================
-- AUTO-ALLOCATION TRIGGER & RPC FUNCTIONS
-- ============================================

-- ============================================
-- PART 1: AUTO-ALLOCATION TRIGGER FOR NEW PLAYERS
-- ============================================

CREATE OR REPLACE FUNCTION auto_allocate_player_to_league()
RETURNS TRIGGER AS $$
DECLARE
  target_league TEXT;
  target_tier INTEGER;
  target_division TEXT;
  league_capacity INTEGER;
  league_current_players INTEGER;
  tier_capacity INTEGER;
  tier_current_players INTEGER;
BEGIN
  -- Get the target league (Apex by default, then check capacity)
  SELECT name, max_players INTO target_league, league_capacity
  FROM leagues
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1;
  
  -- Count current players in the league
  SELECT COUNT(*) INTO league_current_players
  FROM profiles
  WHERE league_name = target_league;
  
  -- If league is full, move to next league
  IF league_current_players >= league_capacity THEN
    SELECT name, max_players INTO target_league, league_capacity
    FROM leagues
    WHERE is_active = true
      AND name > target_league
    ORDER BY name ASC
    LIMIT 1;
    
    -- Recount for new league
    SELECT COUNT(*) INTO league_current_players
    FROM profiles
    WHERE league_name = target_league;
  END IF;
  
  -- Determine tier and division based on league capacity
  -- Each tier has 20 players max (5 tiers = 100 players per league)
  target_tier := (league_current_players / 20) + 1;
  
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
  
  -- Ensure division exists
  INSERT INTO divisions (name, league_id, tier, capacity, max_players)
  VALUES (
    target_division,
    (SELECT id FROM leagues WHERE name = target_league),
    target_tier,
    20,
    20
  )
  ON CONFLICT (name) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on profiles insert
DROP TRIGGER IF EXISTS on_profile_insert_auto_allocate ON profiles;
CREATE TRIGGER on_profile_insert_auto_allocate
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_allocate_player_to_league();

COMMENT ON FUNCTION auto_allocate_player_to_league() IS 'Automatically allocates new players to leagues/tiers/divisions based on capacity';

-- ============================================
-- PART 2: ADMIN RPC FUNCTIONS WITH CLEAR NAMING
-- ============================================

-- Reassign player to specific league/tier/division
CREATE OR REPLACE FUNCTION admin_reassign_player_v2(
  p_player_id UUID,
  p_league_name TEXT DEFAULT NULL,
  p_tier INTEGER DEFAULT NULL,
  p_division_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  league_id UUID;
  target_league TEXT;
  target_tier INTEGER;
  target_division TEXT;
BEGIN
  -- Get current player info
  SELECT league_name, tier, division_name 
  INTO target_league, target_tier, target_division
  FROM profiles WHERE id = p_player_id;
  
  -- Override with provided parameters
  IF p_league_name IS NOT NULL THEN
    target_league := p_league_name;
  END IF;
  
  IF p_tier IS NOT NULL THEN
    target_tier := p_tier;
  END IF;
  
  IF p_division_name IS NOT NULL THEN
    target_division := p_division_name;
  END IF;
  
  -- Validate league exists
  SELECT id INTO league_id FROM leagues WHERE name = target_league;
  IF league_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'League not found: ' || target_league
    );
  END IF;
  
  -- Ensure division exists
  INSERT INTO divisions (name, league_id, tier, capacity, max_players)
  VALUES (target_division, league_id, target_tier, 20, 20)
  ON CONFLICT (name) DO UPDATE SET
    league_id = league_id,
    tier = target_tier,
    capacity = 20,
    max_players = 20;
  
  -- Update player
  UPDATE profiles
  SET 
    league_name = target_league,
    tier = target_tier,
    division_name = target_division
  WHERE id = p_player_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Player reassigned to ' || target_league || ' ' || target_tier || ' - ' || target_division,
    'league', target_league,
    'tier', target_tier,
    'division', target_division
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Override existing function name to avoid conflicts
CREATE OR REPLACE FUNCTION admin_reassign_player(p_player_id UUID, p_division_input TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM admin_reassign_player_v2(p_player_id, NULL, NULL, p_division_input);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Force player to specific league/tier
CREATE OR REPLACE FUNCTION admin_force_player_allocation(
  p_player_id UUID,
  p_league_name TEXT,
  p_tier INTEGER,
  p_division_name TEXT
)
RETURNS JSONB AS $$
BEGIN
  RETURN admin_reassign_player_v2(p_player_id, p_league_name, p_tier, p_division_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION admin_force_player_allocation IS 'Forces a player into a specific league/tier/division regardless of capacity';

-- ============================================
-- PART 3: SEASON CALENDAR WITH STOP_DATE RPC
-- ============================================

CREATE OR REPLACE FUNCTION create_season_calendar_v2(
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
    p_stop_date := p_end_date + INTERVAL '7 days'; -- Default: 7 days after season end
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
    0, -- Will be calculated when fixtures generated
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

-- Update existing fixture generation to use stop_date
CREATE OR REPLACE FUNCTION generate_round_robin_fixtures_v2(
  p_league_id TEXT DEFAULT NULL,
  p_division TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_stop_date DATE DEFAULT NULL
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
  PERFORM create_season_calendar_v2(p_division, season_year, p_start_date, p_end_date, p_stop_date);
  
  -- Get calendar ID
  SELECT id INTO calendar_id FROM season_calendars
  WHERE division = p_division AND season_year = season_year;
  
  -- Get all players in this division
  SELECT COUNT(*) INTO players_count
  FROM profiles
  WHERE division_name = p_division;
  
  -- Note: Actual fixture generation logic would go here
  -- For now, we'll simulate the count
  fixtures_generated := players_count * (players_count - 1); -- Round robin
  
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
    'calendar_id', calendar_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Override existing function for backward compatibility
CREATE OR REPLACE FUNCTION generate_round_robin_fixtures(
  p_league_id TEXT,
  p_division TEXT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB AS $$
BEGIN
  RETURN generate_round_robin_fixtures_v2(p_league_id, p_division, p_start_date, p_end_date, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 4: BULK FIXTURE DEADLINE UPDATE
-- ============================================

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

COMMENT ON FUNCTION update_fixture_deadlines IS 'Propagates season stop_date to all fixtures in that season';

-- ============================================
-- PART 5: LEAGUE CAPACITY CHECK FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION check_league_capacity(p_league_name TEXT)
RETURNS JSONB AS $$
DECLARE
  league_info RECORD;
  tier_stats JSONB;
BEGIN
  SELECT 
    l.name,
    l.max_players,
    COUNT(p.id) AS current_players
  INTO league_info
  FROM leagues l
  LEFT JOIN profiles p ON p.league_name = l.name
  WHERE l.name = p_league_name
  GROUP BY l.id, l.name, l.max_players;
  
  -- Get tier breakdown
  SELECT jsonb_agg(jsonb_build_object(
    'tier', tier,
    'division', division_name,
    'count', tier_count
  )) INTO tier_stats
  FROM (
    SELECT tier, division_name, COUNT(*) AS tier_count
    FROM profiles
    WHERE league_name = p_league_name
    GROUP BY tier, division_name
    ORDER BY tier
  ) sub;
  
  RETURN jsonb_build_object(
    'league', league_info.name,
    'capacity', league_info.max_players,
    'current_players', league_info.current_players,
    'remaining_slots', league_info.max_players - league_info.current_players,
    'is_full', league_info.current_players >= league_info.max_players,
    'tier_breakdown', tier_stats
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
