-- Roster sort_order: players displayed in order added to team (draft order)
ALTER TABLE rosters ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
