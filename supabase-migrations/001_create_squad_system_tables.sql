-- Migration: Create Squad System Tables
-- This migration creates tables for squad rosters, transfer windows, and season calendars

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. squad_rosters table
CREATE TABLE IF NOT EXISTS squad_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_rating INTEGER NOT NULL CHECK (player_rating >= 1 AND player_rating <= 99),
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
