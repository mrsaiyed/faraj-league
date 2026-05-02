-- Add forfeit_team_id to games table.
-- When set, the referenced team is the forfeiting team (automatic loss).
-- Forfeit does not affect PF/PA — only W/L record.
ALTER TABLE games ADD COLUMN IF NOT EXISTS forfeit_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
