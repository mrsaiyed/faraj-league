-- Faraj League: stats views — careers, seasons, teams and clubs
-- Run after 015_career_history.sql. Safe to run more than once.
--
-- Read-only views over the per-game stat sheets, worked out each time they are
-- read, so they can never disagree with the sheets. Query them in the SQL
-- editor (or through the API: they show only what the tables already show to
-- everyone). Nothing on the site uses them yet.
--
--   people_directory        everyone who has played: name, seasons, teams
--   franchise_directory     every club: name, seasons, the names it has used
--   player_game_stats       one row per player per game: the box score line
--   player_season_stats     per player, per season, per team they played for
--   player_franchise_stats  per player, per club, across seasons
--   player_career_stats     per player, all-time
--   team_game_stats         one row per team per game
--   team_season_stats       per team, per season (W/L, points, fouls)
--   franchise_stats         per club, all-time
--
-- The totals count only games that are over (marked final, or from before
-- games had a status and have a score or a forfeit — the site's own rule), and
-- come in three rows per player or team: stage 'regular', 'playoffs' (weeks the
-- admin marked as playoff weeks) and 'all'. For example:
--
--   SELECT name, games, points, points_per_game, fouls, minutes, points_per_minute
--   FROM player_career_stats WHERE stage = 'all' ORDER BY points DESC;
--
--   SELECT season, team, games, points, points_per_game
--   FROM player_season_stats WHERE name = 'Raza Saiyed' AND stage = 'all';
--
-- Averages are over the games where that stat was recorded: points have been
-- kept since the first season, but fouls, minutes and the 3s/2s/1s only since
-- the live tracker started saving them (migration 014). Per-minute rates use
-- only games with minutes, for the same reason. A stat column added later on
-- the admin Stats tab needs adding to player_game_stats to show up here.
-- Manual season totals (player_stat_values, the site's fallback when a season
-- has no game sheets) are not included: every season so far has game sheets.

-- ---------------------------------------------------------------------------
-- Helpers

-- Text to JSON, or NULL when it is not valid JSON (content_blocks are free text).
CREATE OR REPLACE FUNCTION try_jsonb(t TEXT) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  RETURN t::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- Whether a game is over, by the site's rule (gameStatus in lib/game-clock.js):
-- marked final; or, from before games had a status, it has a score or a forfeit.
CREATE OR REPLACE FUNCTION game_is_final(status TEXT, home_score INT, away_score INT, forfeit_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT coalesce(status = 'final',
                  forfeit_team_id IS NOT NULL OR (home_score IS NOT NULL AND away_score IS NOT NULL))
$$;

-- W, L or T for one team in a game. A forfeit decides it whatever the score
-- (as calcStandings does); otherwise the score does. NULL until there is one.
CREATE OR REPLACE FUNCTION game_result(team_id UUID, home_team_id UUID, home_score INT, away_score INT, forfeit_team_id UUID)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN forfeit_team_id IS NOT NULL THEN CASE WHEN forfeit_team_id = team_id THEN 'L' ELSE 'W' END
    WHEN home_score IS NULL OR away_score IS NULL THEN NULL
    WHEN home_score = away_score THEN 'T'
    WHEN (home_score > away_score) = (team_id = home_team_id) THEN 'W'
    ELSE 'L'
  END
$$;

-- 'playoffs' in a week the admin marked as a playoff week (the season's
-- playoffs_by_week content block, as the site reads it), else 'regular'.
CREATE OR REPLACE FUNCTION game_stage(p_season_id UUID, p_week INT) RETURNS TEXT
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM content_blocks cb
    WHERE cb.season_id = p_season_id
      AND cb.key = 'playoffs_by_week'
      AND try_jsonb(cb.value) -> p_week::TEXT = 'true'::JSONB
  ) THEN 'playoffs' ELSE 'regular' END
$$;

-- ---------------------------------------------------------------------------
-- Directories

CREATE OR REPLACE VIEW people_directory WITH (security_invoker = true) AS
SELECT
  pe.id                                                                     AS person_id,
  (array_agg(p.name ORDER BY s.created_at DESC))[1]                         AS name,
  count(*)                                                                  AS seasons,
  (array_agg(s.label ORDER BY s.created_at))[1]                             AS first_season,
  (array_agg(s.label ORDER BY s.created_at DESC))[1]                        AS last_season,
  string_agg(coalesce(t.name, 'no team') || ' (' || s.label || ')', ', ' ORDER BY s.created_at) AS teams_by_season,
  string_agg(DISTINCT p.name, ' / ')                                        AS names_used
FROM people pe
JOIN players p ON p.person_id = pe.id
JOIN seasons s ON s.id = p.season_id
LEFT JOIN rosters r ON r.player_id = p.id
LEFT JOIN teams t ON t.id = r.team_id
GROUP BY pe.id;
COMMENT ON VIEW people_directory IS
  'Everyone who has registered for a season, once each: their latest name, how many seasons, and which team each season.';

CREATE OR REPLACE VIEW franchise_directory WITH (security_invoker = true) AS
SELECT
  f.id                                                   AS franchise_id,
  (array_agg(t.name ORDER BY s.created_at DESC))[1]      AS name,
  count(*)                                               AS seasons,
  (array_agg(s.label ORDER BY s.created_at))[1]          AS first_season,
  (array_agg(s.label ORDER BY s.created_at DESC))[1]     AS last_season,
  string_agg(DISTINCT t.name, ' / ')                     AS names_used
FROM franchises f
JOIN teams t ON t.franchise_id = f.id
JOIN seasons s ON s.id = t.season_id
GROUP BY f.id;
COMMENT ON VIEW franchise_directory IS 'Every club once, with its latest name and the seasons it has played.';

-- ---------------------------------------------------------------------------
-- Per game

-- A player's line in one game: every stat on their sheet, one column each.
-- Players marked DNP for a game have no line in it.
CREATE OR REPLACE VIEW player_game_stats WITH (security_invoker = true) AS
WITH lines AS (
  SELECT
    v.game_id,
    v.player_id,
    v.team_id,
    sum(v.value) FILTER (WHERE d.slug = 'points')  AS points,
    sum(v.value) FILTER (WHERE d.slug = '3s_made') AS threes_made,
    sum(v.value) FILTER (WHERE d.slug = '2s_made') AS twos_made,
    sum(v.value) FILTER (WHERE d.slug = '1s_made') AS free_throws_made,
    sum(v.value) FILTER (WHERE d.slug = 'fouls')   AS fouls,
    sum(v.value) FILTER (WHERE d.slug = 'minutes') AS minutes
  FROM game_stat_values v
  JOIN stat_definitions d ON d.id = v.stat_definition_id
  WHERE NOT EXISTS (SELECT 1 FROM game_dnp dnp WHERE dnp.game_id = v.game_id AND dnp.player_id = v.player_id)
  GROUP BY v.game_id, v.player_id, v.team_id
)
SELECT
  p.person_id,
  p.name,
  l.player_id,
  g.season_id,
  s.label                                                                         AS season,
  l.game_id,
  g.week,
  g.game_index,
  g.scheduled_at,
  game_stage(g.season_id, g.week)                                                 AS stage,
  game_is_final(g.status, g.home_score, g.away_score, g.forfeit_team_id)          AS is_final,
  l.team_id,
  t.name                                                                          AS team,
  t.franchise_id,
  opp.id                                                                          AS opponent_id,
  opp.name                                                                        AS opponent,
  l.team_id = g.home_team_id                                                      AS is_home,
  CASE WHEN l.team_id = g.home_team_id THEN g.home_score ELSE g.away_score END    AS team_score,
  CASE WHEN l.team_id = g.home_team_id THEN g.away_score ELSE g.home_score END    AS opponent_score,
  game_result(l.team_id, g.home_team_id, g.home_score, g.away_score, g.forfeit_team_id) AS result,
  l.points,
  l.threes_made,
  l.twos_made,
  l.free_throws_made,
  l.fouls,
  l.minutes
FROM lines l
JOIN games g     ON g.id = l.game_id
JOIN seasons s   ON s.id = g.season_id
JOIN players p   ON p.id = l.player_id
JOIN teams t     ON t.id = l.team_id
JOIN teams opp   ON opp.id = CASE WHEN l.team_id = g.home_team_id THEN g.away_team_id ELSE g.home_team_id END;
COMMENT ON VIEW player_game_stats IS
  'One row per player per game they played: the team they played for, the opponent, the result and their stats '
  '(NULL where a stat was not recorded that game). is_final is false for a game still being played.';

-- A team's side of one game: the score, the result and its players' totals.
CREATE OR REPLACE VIEW team_game_stats WITH (security_invoker = true) AS
SELECT
  g.id                                                                            AS game_id,
  g.season_id,
  s.label                                                                         AS season,
  g.week,
  g.game_index,
  g.scheduled_at,
  game_stage(g.season_id, g.week)                                                 AS stage,
  game_is_final(g.status, g.home_score, g.away_score, g.forfeit_team_id)          AS is_final,
  side.team_id,
  t.name                                                                          AS team,
  t.franchise_id,
  side.opponent_id,
  o.name                                                                          AS opponent,
  side.is_home,
  side.points_for,
  side.points_against,
  game_result(side.team_id, g.home_team_id, g.home_score, g.away_score, g.forfeit_team_id) AS result,
  g.forfeit_team_id IS NOT NULL                                                   AS is_forfeit,
  box.players_used,
  box.threes_made,
  box.twos_made,
  box.free_throws_made,
  box.fouls,
  box.minutes
FROM games g
JOIN seasons s ON s.id = g.season_id
CROSS JOIN LATERAL (VALUES
  (g.home_team_id, g.away_team_id, true,  g.home_score, g.away_score),
  (g.away_team_id, g.home_team_id, false, g.away_score, g.home_score)
) AS side (team_id, opponent_id, is_home, points_for, points_against)
JOIN teams t ON t.id = side.team_id
JOIN teams o ON o.id = side.opponent_id
LEFT JOIN LATERAL (
  SELECT
    count(*)              AS players_used,
    sum(threes_made)      AS threes_made,
    sum(twos_made)        AS twos_made,
    sum(free_throws_made) AS free_throws_made,
    sum(fouls)            AS fouls,
    sum(minutes)          AS minutes
  FROM player_game_stats pgs
  WHERE pgs.game_id = g.id AND pgs.team_id = side.team_id
) box ON true;
COMMENT ON VIEW team_game_stats IS
  'Two rows per game, one for each team: score, result, and its players'' combined stats (fouls are team fouls '
  'for the whole game). Includes games not yet played; filter on is_final.';

-- ---------------------------------------------------------------------------
-- Player totals

CREATE OR REPLACE VIEW player_season_stats WITH (security_invoker = true) AS
SELECT
  person_id,
  name,
  player_id,
  season_id,
  season,
  team_id,
  team,
  franchise_id,
  CASE WHEN grouping(stage) = 1 THEN 'all' ELSE stage END                         AS stage,
  count(*)                                                                        AS games,
  count(*) FILTER (WHERE result = 'W')                                            AS wins,
  count(*) FILTER (WHERE result = 'L')                                            AS losses,
  sum(points)                                                                     AS points,
  sum(threes_made)                                                                AS threes_made,
  sum(twos_made)                                                                  AS twos_made,
  sum(free_throws_made)                                                           AS free_throws_made,
  sum(fouls)                                                                      AS fouls,
  sum(minutes)                                                                    AS minutes,
  count(minutes)                                                                  AS games_with_minutes,
  max(points)                                                                     AS high_points,
  round(avg(points), 1)                                                           AS points_per_game,
  round(avg(fouls), 1)                                                            AS fouls_per_game,
  round(avg(minutes), 1)                                                          AS minutes_per_game,
  round(sum(points) FILTER (WHERE minutes IS NOT NULL) / nullif(sum(minutes), 0), 3) AS points_per_minute,
  round(sum(fouls)  FILTER (WHERE minutes IS NOT NULL) / nullif(sum(minutes), 0), 3) AS fouls_per_minute
FROM player_game_stats
WHERE is_final
GROUP BY person_id, name, player_id, season_id, season, team_id, team, franchise_id, ROLLUP (stage);
COMMENT ON VIEW player_season_stats IS
  'Per player, per season, per team they played for (a player moved mid-season has a row for each team). '
  'stage is regular, playoffs or all.';

CREATE OR REPLACE VIEW player_franchise_stats WITH (security_invoker = true) AS
SELECT
  pgs.person_id,
  pd.name,
  pgs.franchise_id,
  fd.name                                                                         AS franchise,
  CASE WHEN grouping(pgs.stage) = 1 THEN 'all' ELSE pgs.stage END                 AS stage,
  count(DISTINCT pgs.season_id)                                                   AS seasons,
  count(*)                                                                        AS games,
  count(*) FILTER (WHERE pgs.result = 'W')                                        AS wins,
  count(*) FILTER (WHERE pgs.result = 'L')                                        AS losses,
  sum(pgs.points)                                                                 AS points,
  sum(pgs.threes_made)                                                            AS threes_made,
  sum(pgs.twos_made)                                                              AS twos_made,
  sum(pgs.free_throws_made)                                                       AS free_throws_made,
  sum(pgs.fouls)                                                                  AS fouls,
  sum(pgs.minutes)                                                                AS minutes,
  count(pgs.minutes)                                                              AS games_with_minutes,
  max(pgs.points)                                                                 AS high_points,
  round(avg(pgs.points), 1)                                                       AS points_per_game,
  round(avg(pgs.fouls), 1)                                                        AS fouls_per_game,
  round(avg(pgs.minutes), 1)                                                      AS minutes_per_game,
  round(sum(pgs.points) FILTER (WHERE pgs.minutes IS NOT NULL) / nullif(sum(pgs.minutes), 0), 3) AS points_per_minute,
  round(sum(pgs.fouls)  FILTER (WHERE pgs.minutes IS NOT NULL) / nullif(sum(pgs.minutes), 0), 3) AS fouls_per_minute
FROM player_game_stats pgs
JOIN people_directory pd    ON pd.person_id = pgs.person_id
JOIN franchise_directory fd ON fd.franchise_id = pgs.franchise_id
WHERE pgs.is_final
GROUP BY pgs.person_id, pd.name, pgs.franchise_id, fd.name, ROLLUP (pgs.stage);
COMMENT ON VIEW player_franchise_stats IS
  'Per player, per club, across every season they played for it. stage is regular, playoffs or all.';

CREATE OR REPLACE VIEW player_career_stats WITH (security_invoker = true) AS
SELECT
  pgs.person_id,
  pd.name,
  CASE WHEN grouping(pgs.stage) = 1 THEN 'all' ELSE pgs.stage END                 AS stage,
  count(DISTINCT pgs.season_id)                                                   AS seasons,
  string_agg(DISTINCT fd.name, ', ')                                              AS teams,
  count(*)                                                                        AS games,
  count(*) FILTER (WHERE pgs.result = 'W')                                        AS wins,
  count(*) FILTER (WHERE pgs.result = 'L')                                        AS losses,
  sum(pgs.points)                                                                 AS points,
  sum(pgs.threes_made)                                                            AS threes_made,
  sum(pgs.twos_made)                                                              AS twos_made,
  sum(pgs.free_throws_made)                                                       AS free_throws_made,
  sum(pgs.fouls)                                                                  AS fouls,
  sum(pgs.minutes)                                                                AS minutes,
  count(pgs.minutes)                                                              AS games_with_minutes,
  max(pgs.points)                                                                 AS high_points,
  round(avg(pgs.points), 1)                                                       AS points_per_game,
  round(avg(pgs.fouls), 1)                                                        AS fouls_per_game,
  round(avg(pgs.minutes), 1)                                                      AS minutes_per_game,
  round(sum(pgs.points) FILTER (WHERE pgs.minutes IS NOT NULL) / nullif(sum(pgs.minutes), 0), 3) AS points_per_minute,
  round(sum(pgs.fouls)  FILTER (WHERE pgs.minutes IS NOT NULL) / nullif(sum(pgs.minutes), 0), 3) AS fouls_per_minute
FROM player_game_stats pgs
JOIN people_directory pd    ON pd.person_id = pgs.person_id
JOIN franchise_directory fd ON fd.franchise_id = pgs.franchise_id
WHERE pgs.is_final
GROUP BY pgs.person_id, pd.name, ROLLUP (pgs.stage);
COMMENT ON VIEW player_career_stats IS
  'Per player, all-time: seasons, the clubs they have played for, totals, averages and per-minute rates. '
  'stage is regular, playoffs or all.';

-- ---------------------------------------------------------------------------
-- Team totals

CREATE OR REPLACE VIEW team_season_stats WITH (security_invoker = true) AS
SELECT
  season_id,
  season,
  team_id,
  team,
  franchise_id,
  CASE WHEN grouping(stage) = 1 THEN 'all' ELSE stage END                         AS stage,
  count(*)                                                                        AS games,
  count(*) FILTER (WHERE result = 'W')                                            AS wins,
  count(*) FILTER (WHERE result = 'L')                                            AS losses,
  sum(points_for)                                                                 AS points_for,
  sum(points_against)                                                             AS points_against,
  sum(points_for) - sum(points_against)                                           AS point_diff,
  round(avg(points_for), 1)                                                       AS points_per_game,
  round(avg(points_against), 1)                                                   AS points_against_per_game,
  sum(fouls)                                                                      AS fouls,
  round(avg(fouls), 1)                                                            AS fouls_per_game,
  count(*) FILTER (WHERE is_forfeit)                                              AS forfeits
FROM team_game_stats
WHERE is_final
GROUP BY season_id, season, team_id, team, franchise_id, ROLLUP (stage);
COMMENT ON VIEW team_season_stats IS
  'Per team, per season: record, points for and against, and team fouls. stage is regular, playoffs or all.';

CREATE OR REPLACE VIEW franchise_stats WITH (security_invoker = true) AS
SELECT
  tgs.franchise_id,
  fd.name,
  CASE WHEN grouping(tgs.stage) = 1 THEN 'all' ELSE tgs.stage END                 AS stage,
  count(DISTINCT tgs.season_id)                                                   AS seasons,
  count(*)                                                                        AS games,
  count(*) FILTER (WHERE tgs.result = 'W')                                        AS wins,
  count(*) FILTER (WHERE tgs.result = 'L')                                        AS losses,
  sum(tgs.points_for)                                                             AS points_for,
  sum(tgs.points_against)                                                         AS points_against,
  sum(tgs.points_for) - sum(tgs.points_against)                                   AS point_diff,
  round(avg(tgs.points_for), 1)                                                   AS points_per_game,
  round(avg(tgs.points_against), 1)                                               AS points_against_per_game,
  sum(tgs.fouls)                                                                  AS fouls,
  round(avg(tgs.fouls), 1)                                                        AS fouls_per_game
FROM team_game_stats tgs
JOIN franchise_directory fd ON fd.franchise_id = tgs.franchise_id
WHERE tgs.is_final
GROUP BY tgs.franchise_id, fd.name, ROLLUP (tgs.stage);
COMMENT ON VIEW franchise_stats IS 'Per club, all-time: seasons, record, points and team fouls. stage is regular, playoffs or all.';
