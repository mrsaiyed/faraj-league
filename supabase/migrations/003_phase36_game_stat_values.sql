-- Faraj League: Phase 3.6 game stat sheets
-- Run after 002_phase3_schema.sql
-- Supabase CLI: npx supabase db push (or run via Dashboard SQL Editor)

-- Add scope to stat_definitions (game = stat sheet, season = aggregates only)
ALTER TABLE stat_definitions ADD COLUMN IF NOT EXISTS scope TEXT;

-- game_stat_values: per-game, per-player stats
CREATE TABLE IF NOT EXISTS game_stat_values (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stat_definition_id UUID NOT NULL REFERENCES stat_definitions(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, player_id, stat_definition_id)
);

-- RLS
ALTER TABLE game_stat_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read game_stat_values" ON game_stat_values FOR SELECT TO anon USING (true);
