-- Faraj League: multi-season support
-- Run after 009_forfeit_team_id.sql

-- Collapse any pre-existing duplicates down to the newest current season so the
-- unique index below can be created.
UPDATE seasons SET is_current = false
WHERE is_current
  AND id <> (SELECT id FROM seasons WHERE is_current ORDER BY created_at DESC LIMIT 1);

-- At most one season may be current at a time. The public site loads the current
-- season by default, so a second one would make that choice non-deterministic.
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_current_idx
  ON seasons (is_current) WHERE is_current;

-- Season lookups by slug happen on every page load.
CREATE INDEX IF NOT EXISTS idx_seasons_created_at ON seasons (created_at DESC);
