-- Faraj League: Phase 3.7 media slots (Baseline Breakdown, Match Highlights)
-- Run after 003_phase36_game_stat_values.sql
-- Supabase CLI: npx supabase db push (or run via Dashboard SQL Editor)

-- media_slots: editable slots per week (baseline_ep1-3, highlights_g1-3)
CREATE TABLE IF NOT EXISTS media_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week INT NOT NULL,
  slot_key TEXT NOT NULL,
  title TEXT,
  url TEXT,
  CONSTRAINT media_slots_season_week_slot_key UNIQUE (season_id, week, slot_key)
);

-- RLS
ALTER TABLE media_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read media_slots" ON media_slots FOR SELECT TO anon USING (true);
