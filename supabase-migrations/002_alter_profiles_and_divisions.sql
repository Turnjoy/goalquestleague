-- Migration: Alter profiles and divisions tables
-- This migration adds new fields to profiles and divisions tables

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
