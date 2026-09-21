-- Faraj League: per-season team logos
-- Run after 010_seasons_multi.sql

-- Logos used to be resolved by matching the team name against files committed
-- in images/teams/, which meant renaming a team silently changed (or lost) its
-- logo, and two seasons could never show different logos for the same club.
-- teams rows are already per-season, so putting the logo here scopes it too.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Logos are cropped into a circle, so each needs its own zoom. NULL means the
-- renderer's default. Kept alongside logo_url because the two are only useful
-- together.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS logo_scale NUMERIC;

ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_logo_scale_range;
ALTER TABLE teams ADD CONSTRAINT teams_logo_scale_range
  CHECK (logo_scale IS NULL OR (logo_scale > 0 AND logo_scale <= 10));
