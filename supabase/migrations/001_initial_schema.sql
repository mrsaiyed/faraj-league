-- Faraj League: Initial schema
-- Run in Supabase Dashboard → SQL Editor (paste and execute)
-- Or with Supabase CLI: npx supabase db push

-- Enable uuid extension (Supabase has it by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- seasons
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  conference TEXT NOT NULL,
  captain TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

-- players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  jersey_number INT
);

-- rosters (player ↔ team assignment)
CREATE TABLE rosters (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (player_id, team_id)
);

-- games
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week INT NOT NULL,
  game_index INT NOT NULL,
  home_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  home_score INT,
  away_score INT
);

-- awards (weekly + season)
CREATE TABLE awards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week INT NOT NULL,
  akhlaq TEXT,
  motm1 TEXT,
  motm2 TEXT,
  motm3 TEXT,
  champ TEXT,
  mvp TEXT,
  scoring TEXT
);

-- stat_definitions (extensible stat types)
CREATE TABLE stat_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  unit TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

-- player_stat_values (flexible stats per player)
CREATE TABLE player_stat_values (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stat_definition_id UUID NOT NULL REFERENCES stat_definitions(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, stat_definition_id)
);

-- sponsors (per season)
CREATE TABLE sponsors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT,
  logo_url TEXT,
  label TEXT
);

-- RLS: enable and allow public read for all tables
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE stat_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stat_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read seasons" ON seasons FOR SELECT TO anon USING (true);
CREATE POLICY "Public read teams" ON teams FOR SELECT TO anon USING (true);
CREATE POLICY "Public read players" ON players FOR SELECT TO anon USING (true);
CREATE POLICY "Public read rosters" ON rosters FOR SELECT TO anon USING (true);
CREATE POLICY "Public read games" ON games FOR SELECT TO anon USING (true);
CREATE POLICY "Public read awards" ON awards FOR SELECT TO anon USING (true);
CREATE POLICY "Public read stat_definitions" ON stat_definitions FOR SELECT TO anon USING (true);
CREATE POLICY "Public read player_stat_values" ON player_stat_values FOR SELECT TO anon USING (true);
CREATE POLICY "Public read sponsors" ON sponsors FOR SELECT TO anon USING (true);
