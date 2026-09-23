-- Faraj League: live game status and clock
-- Run after 011_team_logo.sql

-- Before this, a game showed a winner the moment it had any score — so a game
-- in progress read as finished as soon as one team led. These columns let the
-- public site tell "in progress" from "final".
--
-- status: NULL for everything recorded before this migration. A NULL status on
-- a game that has scores is treated as final, so past seasons are unaffected.
ALTER TABLE games ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS period INT;

-- The clock is stored as "this many seconds remained, as of this instant".
-- Viewers extrapolate from clock_updated_at while clock_running is true, so a
-- running clock ticks smoothly on a phone without the tracker writing a row
-- every second.
ALTER TABLE games ADD COLUMN IF NOT EXISTS clock_seconds INT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS clock_running BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS clock_updated_at TIMESTAMPTZ;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_status_values;
ALTER TABLE games ADD CONSTRAINT games_status_values
  CHECK (status IS NULL OR status IN ('scheduled', 'live', 'halftime', 'final'));
