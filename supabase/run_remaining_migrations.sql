-- Run this in Supabase Dashboard → SQL Editor
-- Creates content_blocks, media_items, media_slots (and related objects)
-- Safe to run multiple times (uses IF NOT EXISTS)

-- From 002_phase3_schema.sql
ALTER TABLE games ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS current_week INT;

CREATE TABLE IF NOT EXISTS media_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week INT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS content_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL,
  value TEXT,
  season_id UUID REFERENCES seasons(id) ON DELETE CASCADE
);

ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read media_items" ON media_items;
CREATE POLICY "Public read media_items" ON media_items FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Public read content_blocks" ON content_blocks;
CREATE POLICY "Public read content_blocks" ON content_blocks FOR SELECT TO anon USING (true);

-- From 003_phase36_game_stat_values.sql
ALTER TABLE stat_definitions ADD COLUMN IF NOT EXISTS scope TEXT;

CREATE TABLE IF NOT EXISTS game_stat_values (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stat_definition_id UUID NOT NULL REFERENCES stat_definitions(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, player_id, stat_definition_id)
);

ALTER TABLE game_stat_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read game_stat_values" ON game_stat_values;
CREATE POLICY "Public read game_stat_values" ON game_stat_values FOR SELECT TO anon USING (true);

-- From 004_phase37_media_slots.sql
CREATE TABLE IF NOT EXISTS media_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week INT NOT NULL,
  slot_key TEXT NOT NULL,
  title TEXT,
  url TEXT,
  CONSTRAINT media_slots_season_week_slot_key UNIQUE (season_id, week, slot_key)
);

ALTER TABLE media_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read media_slots" ON media_slots;
CREATE POLICY "Public read media_slots" ON media_slots FOR SELECT TO anon USING (true);

-- From 005_roster_sort_order.sql: roster order by draft/add order
ALTER TABLE rosters ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
