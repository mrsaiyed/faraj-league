-- Faraj League: DNP (Did Not Play) tracking per game
-- Run after 007_total_weeks.sql

CREATE TABLE IF NOT EXISTS game_dnp (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, player_id)
);

ALTER TABLE game_dnp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read game_dnp" ON game_dnp FOR SELECT TO anon USING (true);
