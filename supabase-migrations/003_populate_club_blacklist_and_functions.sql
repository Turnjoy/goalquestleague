-- Migration: Populate club name blacklist and create helper functions
-- This migration populates the club_name_blacklist table and creates helper functions

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
