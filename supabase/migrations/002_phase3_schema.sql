-- Faraj League: Phase 3 schema additions
-- Run after 001_initial_schema.sql
-- Supabase CLI: npx supabase db push (or run via Dashboard SQL Editor)

-- Add scheduled_at to games (game time)
ALTER TABLE games ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Add current_week to seasons (admin sets which week is current)
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS current_week INT;

-- media_items for Media page (Highlights & Interviews)
CREATE TABLE IF NOT EXISTS media_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week INT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

-- content_blocks for editable page copy (About, Draft)
CREATE TABLE IF NOT EXISTS content_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL,
  value TEXT,
  season_id UUID REFERENCES seasons(id) ON DELETE CASCADE
);

-- RLS for new tables
ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read media_items" ON media_items FOR SELECT TO anon USING (true);
CREATE POLICY "Public read content_blocks" ON content_blocks FOR SELECT TO anon USING (true);
