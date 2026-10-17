# GoalQuest League Database Schema

## New Tables Required

### 1. squad_rosters
Stores the initial and current squad rosters for each manager.

```sql
CREATE TABLE squad_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_rating INTEGER NOT NULL CHECK (player_rating >= 1 AND player_rating <= 99),
  is_initial BOOLEAN DEFAULT true, -- true if from initial OCR scan, false if from transfer
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  added_via TEXT DEFAULT 'initial', -- 'initial' or 'transfer'
  UNIQUE(user_id, player_name) -- Prevent duplicate players in same squad
);

-- Index for fast squad lookups
CREATE INDEX idx_squad_rosters_user_id ON squad_rosters(user_id);
CREATE INDEX idx_squad_rosters_player_name ON squad_rosters(player_name);
```

### 2. transfer_windows
Tracks transfer window periods for each season and division.

```sql
CREATE TABLE transfer_windows (
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

-- Index for active window lookups
CREATE INDEX idx_transfer_windows_active ON transfer_windows(is_active);
CREATE INDEX idx_transfer_windows_division ON transfer_windows(division);
```

### 3. transfer_records
Tracks all player transfers during transfer windows.

```sql
CREATE TABLE transfer_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  division TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  window_id UUID REFERENCES transfer_windows(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('add', 'drop')),
  player_name TEXT NOT NULL,
  player_rating INTEGER,
  transfer_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  squad_size_after INTEGER NOT NULL
);

-- Index for transfer history
CREATE INDEX idx_transfer_records_user_id ON transfer_records(user_id);
CREATE INDEX idx_transfer_records_window_id ON transfer_records(window_id);
```

### 4. season_calendars
Stores automated season calendar calculations.

```sql
CREATE TABLE season_calendars (
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

-- Index for calendar lookups
CREATE INDEX idx_season_calendars_division ON season_calendars(division);
CREATE INDEX idx_season_calendars_active ON season_calendars(season_year);
```

### 5. club_name_blacklist
Blacklist of real-world club names that cannot be used.

```sql
CREATE TABLE club_name_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_name TEXT NOT NULL UNIQUE,
  added_by UUID REFERENCES profiles(id),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pre-populate with major clubs
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
('M'gladbach'), ('Borussia M'gladbach'),
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
('Venezia'), ('Venezia FC');
```

### 6. squad_violation_reports
Stores squad violation reports for community self-policing.

```sql
CREATE TABLE squad_violation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  fixture_id UUID REFERENCES fixtures(id) ON DELETE CASCADE,
  violation_type TEXT NOT NULL CHECK (violation_type IN ('unlisted_player', 'incorrect_rating', 'squad_size_violation', 'other')),
  description TEXT,
  evidence_screenshot_url TEXT, -- Optional URL if manager uploads screenshot
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'dismissed')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for violation reports
CREATE INDEX idx_squad_violation_reports_reported_user ON squad_violation_reports(reported_user_id);
CREATE INDEX idx_squad_violation_reports_status ON squad_violation_reports(status);
CREATE INDEX idx_squad_violation_reports_fixture ON squad_violation_reports(fixture_id);
```

## Modified Tables

### profiles - Add new fields
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manager_handle TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_team_name TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS squad_locked BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS initial_squad_submitted_at TIMESTAMP WITH TIME ZONE;
```

### divisions - Add capacity and format info
```sql
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 100;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'single_rr' CHECK (format IN ('single_rr', 'double_rr'));
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS tier INTEGER CHECK (tier >= 1 AND tier <= 10);
```

## Helper Functions

### WhatsApp Number Formatter
```sql
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
```

### Check Club Name Against Blacklist
```sql
CREATE OR REPLACE FUNCTION is_club_name_blacklisted(club_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM club_name_blacklist
    WHERE LOWER(club_name_blacklist.club_name) = LOWER(club_name)
  );
END;
$$ LANGUAGE plpgsql;
```

### Validate Squad Size
```sql
CREATE OR REPLACE FUNCTION validate_squad_size(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  squad_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO squad_count FROM squad_rosters WHERE user_id = user_id;

  RETURN squad_count >= 22 AND squad_count <= 25;
END;
$$ LANGUAGE plpgsql;
```

### Get Transfer Window Quota
```sql
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
```
