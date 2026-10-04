-- Faraj League: the stat columns the live tracker writes
-- Run after 013_game_logs.sql, and only once the site code that keeps these
-- off the public site is live (config.PUBLIC_STAT_SLUGS = points only). The
-- site from before that shows every stat column on the public box scores and
-- stats page, so running this first would put all of these on show meanwhile.

-- The tracker saves a stat only when a column with its slug exists here
-- (STAT_SLUGS in lib/game-tracker.js); a missing one is named in a warning.
-- The 3s, 2s and 1s made are counted from which of +3, +2 or +1 was tapped.
-- Creating these on the admin Stats tab does the same — the tab makes these
-- slugs of the names "3s Made", "2s Made" and "1s Made" — and this does it in
-- one go. Safe to re-run: a slug that already exists is left as it is.
INSERT INTO stat_definitions (name, slug, unit, sort_order, scope) VALUES
  ('3s Made', '3s_made', NULL, 1, 'game'),
  ('2s Made', '2s_made', NULL, 2, 'game'),
  ('1s Made', '1s_made', NULL, 3, 'game'),
  ('Fouls',   'fouls',   NULL, 4, 'game'),
  ('Minutes', 'minutes', 'min', 5, 'game')
ON CONFLICT (slug) DO NOTHING;
