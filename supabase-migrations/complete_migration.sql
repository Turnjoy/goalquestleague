-- ============================================================================
-- COMPLETE GOALQUEST LEAGUE MIGRATION
-- ============================================================================
-- Run this entire script in Supabase SQL Editor to set up the complete system
-- ============================================================================
-- This script combines all three migration files into one for easy execution
-- ============================================================================

-- Migration: Create Squad System Tables
-- This migration creates tables for squad rosters, transfer windows, and season calendars

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. squad_rosters table
CREATE TABLE IF NOT EXISTS squad_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_rating INTEGER NOT NULL CHECK (player_rating >= 1 AND player_rating <= 150),
  is_initial BOOLEAN DEFAULT true,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  added_via TEXT DEFAULT 'initial' CHECK (added_via IN ('initial', 'transfer')),
  UNIQUE(user_id, player_name)
);

-- Indexes for squad_rosters
CREATE INDEX IF NOT EXISTS idx_squad_rosters_user_id ON squad_rosters(user_id);
CREATE INDEX IF NOT EXISTS idx_squad_rosters_player_name ON squad_rosters(player_name);

-- 2. transfer_windows table
CREATE TABLE IF NOT EXISTS transfer_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  window_type TEXT NOT NULL CHECK (window_type IN ('pre_season', 'mid_season')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(division, season_year, window_type)
);

-- Indexes for transfer_windows
CREATE INDEX IF NOT EXISTS idx_transfer_windows_active ON transfer_windows(is_active);
CREATE INDEX IF NOT EXISTS idx_transfer_windows_division ON transfer_windows(division);

-- 3. transfer_records table
CREATE TABLE IF NOT EXISTS transfer_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  division TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  window_id UUID REFERENCES transfer_windows(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('add', 'drop')),
  player_name TEXT NOT NULL,
  player_rating INTEGER,
  transfer_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  squad_size_after INTEGER NOT NULL
);

-- Indexes for transfer_records
CREATE INDEX IF NOT EXISTS idx_transfer_records_user_id ON transfer_records(user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_records_window_id ON transfer_records(window_id);

-- 4. season_calendars table
CREATE TABLE IF NOT EXISTS season_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  season_start_date DATE NOT NULL,
  season_end_date DATE NOT NULL,
  pre_season_window_start DATE NOT NULL,
  pre_season_window_end DATE NOT NULL,
  mid_season_window_start DATE NOT NULL,
  mid_season_window_end DATE NOT NULL,
  total_fixtures INTEGER NOT NULL,
  expected_duration_days INTEGER NOT NULL,
  is_finalized BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(division, season_year)
);

-- Indexes for season_calendars
CREATE INDEX IF NOT EXISTS idx_season_calendars_division ON season_calendars(division);
CREATE INDEX IF NOT EXISTS idx_season_calendars_active ON season_calendars(season_year);

-- 5. club_name_blacklist table
CREATE TABLE IF NOT EXISTS club_name_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_name TEXT NOT NULL UNIQUE,
  added_by UUID REFERENCES profiles(id),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. squad_violation_reports table
CREATE TABLE IF NOT EXISTS squad_violation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fixture_id UUID REFERENCES fixtures(id) ON DELETE CASCADE,
  violation_type TEXT NOT NULL CHECK (violation_type IN ('unlisted_player', 'incorrect_rating', 'squad_size_violation', 'other')),
  description TEXT,
  evidence_screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'dismissed')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for squad_violation_reports
CREATE INDEX IF NOT EXISTS idx_squad_violation_reports_reported_user ON squad_violation_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_squad_violation_reports_status ON squad_violation_reports(status);
CREATE INDEX IF NOT EXISTS idx_squad_violation_reports_fixture ON squad_violation_reports(fixture_id);

-- ============================================================================
-- Migration: Alter profiles and divisions tables
-- This migration adds new fields to profiles and divisions tables
-- ============================================================================

-- Add new columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS manager_handle TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS custom_team_name TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
ADD COLUMN IF NOT EXISTS squad_locked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS initial_squad_submitted_at TIMESTAMP WITH TIME ZONE;

-- Add new columns to divisions table
ALTER TABLE divisions
ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'single_rr' CHECK (format IN ('single_rr', 'double_rr')),
ADD COLUMN IF NOT EXISTS tier INTEGER CHECK (tier >= 1 AND tier <= 10);

-- Update existing divisions with tier information
UPDATE divisions SET tier = 1 WHERE name = 'Elite';
UPDATE divisions SET tier = 2 WHERE name = 'Championship';
UPDATE divisions SET tier = 3 WHERE name = 'League One';
UPDATE divisions SET tier = 4 WHERE name = 'League Two';
UPDATE divisions SET tier = 5 WHERE name = 'National League';
UPDATE divisions SET tier = 6 WHERE name = 'Regional 1';
UPDATE divisions SET tier = 7 WHERE name = 'Regional 2';
UPDATE divisions SET tier = 8 WHERE name = 'Regional 3';
UPDATE divisions SET tier = 9 WHERE name = 'Regional 4';
UPDATE divisions SET tier = 10 WHERE name = 'Trial';

-- Set max players based on tier
UPDATE divisions SET max_players = 20 WHERE tier = 1; -- Elite: 20 players
UPDATE divisions SET max_players = 100 WHERE tier BETWEEN 2 AND 9; -- Intermediate: 100 players
UPDATE divisions SET max_players = 80 WHERE tier = 10; -- Rookie: 80 players

-- Set format based on tier
UPDATE divisions SET format = 'double_rr' WHERE tier = 1; -- Elite: Double Round-Robin
UPDATE divisions SET format = 'single_rr' WHERE tier > 1; -- Others: Single Round-Robin

-- ============================================================================
-- Migration: Populate club name blacklist and create helper functions
-- This migration populates the club_name_blacklist table and creates helper functions
-- ============================================================================

-- Ensure squad_rosters rating constraint supports boosted ratings (1-150)
ALTER TABLE squad_rosters DROP CONSTRAINT IF EXISTS squad_rosters_player_rating_check;
ALTER TABLE squad_rosters ADD CONSTRAINT squad_rosters_player_rating_check CHECK (player_rating >= 1 AND player_rating <= 150);

-- Populate club_name_blacklist with major real-world clubs
INSERT INTO club_name_blacklist (club_name) VALUES
('Real Madrid'), ('Real Madrid CF'), ('Madrid'),
('Manchester United'), ('Man United'), ('Man Utd'), ('United'),
('Barcelona'), ('FC Barcelona'), ('Barca'),
('Paris Saint-Germain'), ('PSG'), ('Paris SG'),
('Arsenal'), ('Arsenal FC'),
('Chelsea'), ('Chelsea FC'),
('Liverpool'), ('Liverpool FC'),
('Manchester City'), ('Man City'), ('Man City'),
('Bayern Munich'), ('Bayern'), ('FC Bayern'),
('Juventus'), ('Juve'), ('Juventus FC'),
('Inter Milan'), ('Inter'), ('Inter FC'),
('AC Milan'), ('Milan'),
('Dortmund'), ('Borussia Dortmund'),
('Atletico Madrid'), ('Atletico'),
('Napoli'), ('Napoli FC'),
('RB Leipzig'), ('Leipzig'),
('Benfica'), ('SL Benfica'),
('Porto'), ('FC Porto'),
('Ajax'), ('Ajax Amsterdam'),
('Sevilla'), ('Sevilla FC'),
('Roma'), ('AS Roma'),
('Lazio'), ('SS Lazio'),
('Athletic Bilbao'), ('Athletic'),
('Real Sociedad'), ('Sociedad'),
('Villarreal'), ('Villarreal CF'),
('Valencia'), ('Valencia CF'),
('Real Betis'), ('Betis'),
('Celtic'), ('Celtic FC'),
('Rangers'), ('Rangers FC'),
('Feyenoord'), ('Feyenoord Rotterdam'),
('PSV Eindhoven'), ('PSV'),
('Galatasaray'), ('Galatasaray SK'),
('Fenerbahce'), ('Fenerbahce SK'),
('Olympiacos'), ('Olympiacos FC'),
('Panathinaikos'), ('Panathinaikos FC'),
('Red Star Belgrade'), ('Crvena Zvezda'),
('Partizan Belgrade'), ('Partizan'),
('Shakhtar Donetsk'), ('Shakhtar'),
('Dynamo Kyiv'), ('Dynamo Kiev'),
('Salzburg'), ('Red Bull Salzburg'),
('Basel'), ('FC Basel'),
('Club Brugge'), ('Brugge'),
('Anderlecht'), ('Anderlecht'),
('Sporting CP'), ('Sporting'),
('Braga'), ('SC Braga'),
('Wolverhampton'), ('Wolves'),
('Leicester City'), ('Leicester'),
('West Ham'), ('West Ham United'),
('Everton'), ('Everton FC'),
('Tottenham'), ('Spurs'), ('Tottenham Hotspur'),
('Newcastle'), ('Newcastle United'),
('Aston Villa'), ('Villa'),
('Crystal Palace'), ('Palace'),
('Brighton'), ('Brighton & Hove Albion'),
('Brentford'), ('Brentford FC'),
('Fulham'), ('Fulham FC'),
('Nottingham Forest'), ('Forest'),
('Bournemouth'), ('AFC Bournemouth'),
('Luton Town'), ('Luton'),
('Burnley'), ('Burnley FC'),
('Sheffield United'), ('Sheffield'),
('Monaco'), ('AS Monaco'),
('Marseille'), ('Olympique Marseille'),
('Lyon'), ('Olympique Lyonnais'),
('Nice'), ('OGC Nice'),
('Lens'), ('RC Lens'),
('Rennes'), ('Stade Rennais'),
('Lille'), ('LOSC Lille'),
('Strasbourg'), ('RC Strasbourg'),
('Reims'), ('Stade Reims'),
('Nantes'), ('FC Nantes'),
('Montpellier'), ('Montpellier HSC'),
('Toulouse'), ('Toulouse FC'),
('Wolfsburg'), ('VfL Wolfsburg'),
('Leverkusen'), ('Bayer Leverkusen'),
('Frankfurt'), ('Eintracht Frankfurt'),
('Monchengladbach'), ('Borussia M'gladbach'),
('Union Berlin'), ('Union'),
('Freiburg'), ('SC Freiburg'),
('Mainz'), ('Mainz 05'),
('Koln'), ('FC Koln'),
('Hoffenheim'), ('TSG Hoffenheim'),
('Werder Bremen'), ('Bremen'),
('Stuttgart'), ('VfB Stuttgart'),
('Bochum'), ('VfL Bochum'),
('Augsburg'), ('FC Augsburg'),
('Darmstadt'), ('Darmstadt 98'),
('Heidenheim'), ('Heidenheim'),
('Atalanta'), ('Atalanta BC'),
('Lazio'), ('SS Lazio'),
('Fiorentina'), ('Fiorentina FC'),
('Roma'), ('AS Roma'),
('Torino'), ('Torino FC'),
('Bologna'), ('Bologna FC'),
('Udinese'), ('Udinese Calcio'),
('Sassuolo'), ('Sassuolo Calcio'),
('Empoli'), ('Empoli FC'),
('Lecce'), ('US Lecce'),
('Verona'), ('Hellas Verona'),
('Monza'), ('AC Monza'),
('Cagliari'), ('Cagliari Calcio'),
('Genoa'), ('Genoa CFC'),
('Frosinone'), ('Frosinone Calcio'),
('Cosenza'), ('Cosenza Calcio'),
('Parma'), ('Parma Calcio'),
('Como'), ('Como 1907'),
('Venezia'), ('Venezia FC')
ON CONFLICT (club_name) DO NOTHING;

-- Create helper function: format_whatsapp_number
CREATE OR REPLACE FUNCTION format_whatsapp_number(input_number TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Remove all non-digit characters
  input_number := REGEXP_REPLACE(input_number, '[^0-9]', '', 'g');

  -- Strip leading zero if present
  IF input_number LIKE '0%' THEN
    input_number := SUBSTRING(input_number FROM 2);
  END IF;

  -- Ensure it starts with 234 (Nigeria country code)
  IF input_number NOT LIKE '234%' THEN
    input_number := '234' || input_number;
  END IF;

  RETURN input_number;
END;
$$ LANGUAGE plpgsql;

-- Create helper function: is_club_name_blacklisted
CREATE OR REPLACE FUNCTION is_club_name_blacklisted(club_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM club_name_blacklist
    WHERE LOWER(club_name_blacklist.club_name) = LOWER(club_name)
  );
END;
$$ LANGUAGE plpgsql;

-- Create helper function: validate_squad_size
CREATE OR REPLACE FUNCTION validate_squad_size(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  squad_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO squad_count FROM squad_rosters WHERE user_id = user_id;

  RETURN squad_count >= 22 AND squad_count <= 25;
END;
$$ LANGUAGE plpgsql;

-- Create helper function: get_transfer_quota
CREATE OR REPLACE FUNCTION get_transfer_quota(user_id UUID, division TEXT, season_year INTEGER)
RETURNS INTEGER AS $$
DECLARE
  used_quota INTEGER;
BEGIN
  SELECT COUNT(*) INTO used_quota
  FROM transfer_records
  WHERE user_id = user_id
    AND division = division
    AND season_year = season_year
    AND transfer_date >= (
      SELECT start_date FROM transfer_windows
      WHERE division = division
        AND season_year = season_year
        AND is_active = true
        LIMIT 1
    );

  RETURN 4 - used_quota; -- Max 4 transfers per window
END;
$$ LANGUAGE plpgsql;

-- Create helper function: calculate_season_calendar
CREATE OR REPLACE FUNCTION calculate_season_calendar(division TEXT, season_start_date DATE)
RETURNS JSON AS $$
DECLARE
  division_info RECORD;
  total_players INTEGER;
  total_fixtures INTEGER;
  expected_duration_days INTEGER;
  season_end_date DATE;
  mid_season_day INTEGER;
  mid_season_start_date DATE;
  mid_season_end_date DATE;
  pre_season_start_date DATE;
  pre_season_end_date DATE;
  result JSON;
BEGIN
  -- Get division info
  SELECT * INTO division_info
  FROM divisions
  WHERE name = division;

  -- Count total players in division
  SELECT COUNT(*) INTO total_players
  FROM profiles
  WHERE division = division
    AND is_approved = true
    AND status = 'active'
    AND is_admin = false;

  -- Calculate total fixtures based on format
  IF division_info.format = 'double_rr' THEN
    total_fixtures := total_players * (total_players - 1);
  ELSE
    total_fixtures := total_players * (total_players - 1) / 2;
  END IF;

  -- Calculate expected duration (1-2 matches per day average)
  expected_duration_days := CEIL(total_fixtures::FLOAT / 1.5);

  -- Calculate season end date
  season_end_date := season_start_date + expected_duration_days;

  -- Calculate mid-season window (at midpoint)
  mid_season_day := FLOOR(expected_duration_days / 2);
  mid_season_start_date := season_start_date + mid_season_day;
  mid_season_end_date := mid_season_start_date + 7; -- 7-day window

  -- Calculate pre-season window (7 days before start)
  pre_season_start_date := season_start_date - 7;
  pre_season_end_date := season_start_date;

  -- Build result JSON
  result := json_build_object(
    'season_start_date', season_start_date,
    'season_end_date', season_end_date,
    'pre_season_window_start', pre_season_start_date,
    'pre_season_window_end', pre_season_end_date,
    'mid_season_window_start', mid_season_start_date,
    'mid_season_window_end', mid_season_end_date,
    'total_fixtures', total_fixtures,
    'expected_duration_days', expected_duration_days,
    'total_players', total_players
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create RPC-compatible version of calculate_season_calendar
CREATE OR REPLACE FUNCTION calculate_season_calendar(division_input TEXT, season_start_date_input DATE)
RETURNS JSON AS $$
BEGIN
  RETURN calculate_season_calendar(division_input, season_start_date_input);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- All tables, indexes, and helper functions have been created
-- The GoalQuest League system is now ready for use
-- ============================================================================
