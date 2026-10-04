-- Faraj League: saved game logs (the live tracker's play-by-play)
-- Run after 012_game_clock.sql

-- Until now the tracker's event log lived only in the scorekeeper's browser
-- (localStorage); just the totals reached the database. This keeps the whole
-- log per game, so a final game's box score can show its play-by-play on both
-- sites, and so every play keeps its wall-clock time (`at`) for lining up with
-- the game video later.
--
-- log: { "version": 1, "events": [...], "names": { "<player id>": "<name>" } }
--   events are the tracker's own (type, playerId, teamId, points, period,
--   clock, elapsed, at …), cut at the undo cursor; names is a snapshot so the
--   log still reads if a player is later renamed or removed.
-- Written only by the admin-game-log Edge Function (admin token required).
CREATE TABLE IF NOT EXISTS game_logs (
  game_id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  log JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE game_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read game_logs" ON game_logs;
CREATE POLICY "Public read game_logs" ON game_logs FOR SELECT TO anon USING (true);
