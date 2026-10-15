-- Faraj League: career history
-- Run after 014_tracker_stat_columns.sql (it does not depend on 014, so order
-- between the two does not matter). Needs PostgreSQL 15+, as every current
-- Supabase project is. Safe to run more than once.
--
-- Until now every row was scoped to one season: a player who played two seasons
-- was two unrelated `players` rows, "Noor" in two seasons two unrelated `teams`
-- rows, and a stat line knew its player but not the team it was scored for (that
-- was read from the player's roster *now*, which is wrong once anyone moves). So
-- nothing could add up a career. This adds:
--
--   people      one row per real person. players is now what it always was in
--               practice: a person's registration in one season (name as entered
--               that season, jersey number, roster spot).
--   franchises  one row per club across seasons. teams stays a club's entry in
--               one season (name, captain, logo, conference that season).
--   game_stat_values.team_id
--               the team a stat was scored for, fixed when the row is written.
--
-- Nothing in the site or the Edge Functions has to change for the links: new
-- players and teams are linked to their person and club by name as they are
-- inserted (see the triggers below), and a stat row takes its team from the
-- roster when it is written. Career, season and team numbers are in the views
-- of migration 016. Deploy the admin-players function alongside it, though:
-- the version before this removed a player from their team before deleting
-- them, so a delete this migration refuses would leave them off their team.
--
-- It also tightens what the database itself guarantees, now that it holds
-- history worth keeping:
--   * deleting a player or a team no longer silently deletes every stat or game
--     they ever had, and a season with recorded stats cannot be deleted in one
--     go either: the delete is refused instead (deleting a game, which the admin
--     warns about, still takes its stats with it);
--   * games can only be between two different teams of their own season, with
--     one game per week and game number, and no negative scores or stats;
--   * a season registration is on at most one team, of its own season;
--   * team names are unique within a season (the site looks teams up by name);
--   * content_blocks holds one row per key per season — admin-content could
--     write a key twice and then kept adding copies (the draft settings had 63);
--   * awards.akhlaq_post_url, which production has but no migration created.

DO $$
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'Migration 015 needs PostgreSQL 15 or later (this is %)', current_setting('server_version');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Drift: a column production already has (added in the dashboard) that the
-- awards admin reads and writes. A database built from these files lacked it.
ALTER TABLE awards ADD COLUMN IF NOT EXISTS akhlaq_post_url TEXT;

-- ---------------------------------------------------------------------------
-- Helpers

-- How two spellings of one name are compared: case, outer spaces and runs of
-- spaces ignored. "Raza  Saiyed " and "raza saiyed" are the same name.
CREATE OR REPLACE FUNCTION name_key(name TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$ SELECT lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) $$;

-- Migration-only helpers (pg_temp: gone when the session ends). Both leave a
-- constraint that is already there alone, so running this file again changes
-- nothing.

-- Add a constraint unless one of that name exists.
CREATE FUNCTION pg_temp.add_constraint(tbl REGCLASS, con_name TEXT, def TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = tbl AND conname = con_name) THEN
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', tbl, con_name, def);
  END IF;
END $$;

-- Swap whatever foreign keys sit on exactly this one column, whatever they were
-- named (production has drifted from these files before), for one that says
-- what should happen on delete.
CREATE FUNCTION pg_temp.replace_fk(tbl REGCLASS, col TEXT, con_name TEXT, def TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE c RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = tbl AND conname = con_name) THEN RETURN; END IF;
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attname = col
    WHERE con.conrelid = tbl AND con.contype = 'f' AND con.conkey = ARRAY[att.attnum]
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', tbl, c.conname);
  END LOOP;
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', tbl, con_name, def);
END $$;

-- History is protected with ON DELETE NO ACTION: a player, team or person that
-- a stat or game still points at cannot be deleted, and neither can a season
-- that has recorded stats. History is removed only by deleting its games, which
-- takes their stats with them; an empty season, team or player deletes as before.

-- ---------------------------------------------------------------------------
-- people: one row per person, across every season they play

CREATE TABLE IF NOT EXISTS people (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE people IS
  'One row per real person, across every season they play. A players row is that person''s registration in one season; '
  'their name is the one on their latest registration (see people_directory).';

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read people" ON people;
CREATE POLICY "Public read people" ON people FOR SELECT TO anon USING (true);

ALTER TABLE players ADD COLUMN IF NOT EXISTS person_id UUID;
COMMENT ON TABLE players IS
  'A person''s registration in one season: the name as entered that season, jersey number, roster spot. '
  'person_id ties a player''s seasons together.';
COMMENT ON COLUMN players.person_id IS
  'The person this registration belongs to. Set automatically on insert by name (players_link_person); '
  'fix a wrong match with merge_people() or split_person().';

CREATE INDEX IF NOT EXISTS players_name_key_idx ON players (name_key(name));

-- The person a registration under this name in this season belongs to:
-- someone registered under the same name in another season (the most recently
-- active, if there are two), or NULL. Someone already registered in this
-- season is never picked, so two different people with one name in one season
-- stay two people.
CREATE OR REPLACE FUNCTION matching_person(p_name TEXT, p_season_id UUID, p_exclude UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT cand.person_id
  FROM players cand
  JOIN seasons s ON s.id = cand.season_id
  WHERE name_key(cand.name) = name_key(p_name)
    AND cand.person_id IS NOT NULL
    AND cand.person_id IS DISTINCT FROM p_exclude
    AND NOT EXISTS (SELECT 1 FROM players same
                    WHERE same.person_id = cand.person_id AND same.season_id = p_season_id)
  ORDER BY s.created_at DESC, cand.person_id
  LIMIT 1
$$;

-- That person, or a new one.
CREATE OR REPLACE FUNCTION person_for_registration(p_name TEXT, p_season_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  found UUID := matching_person(p_name, p_season_id);
BEGIN
  IF found IS NULL THEN
    INSERT INTO people DEFAULT VALUES RETURNING id INTO found;
  END IF;
  RETURN found;
END $$;

-- Backfill, oldest season first, one row at a time so each registration sees
-- the links made before it. A rerun finds nothing left to link.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.id, p.name, p.season_id
    FROM players p JOIN seasons s ON s.id = p.season_id
    WHERE p.person_id IS NULL
    ORDER BY s.created_at, p.name, p.id
  LOOP
    UPDATE players SET person_id = person_for_registration(r.name, r.season_id) WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE players ALTER COLUMN person_id SET NOT NULL;
DO $$ BEGIN
  PERFORM pg_temp.add_constraint('players', 'players_person_id_fkey',
    'FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE NO ACTION');
  PERFORM pg_temp.add_constraint('players', 'players_one_per_season', 'UNIQUE (season_id, person_id)');
END $$;
CREATE INDEX IF NOT EXISTS players_person_id_idx ON players (person_id);

-- On insert: link to a person by name (unless one is given).
-- On a rename: a registration that is its person's only one was most likely a
-- typo when it was entered (so it matched nobody), so a corrected name moves it
-- to the person it now matches. A person with several seasons keeps the link:
-- that is just this season's spelling.
CREATE OR REPLACE FUNCTION players_link_person() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.person_id IS NULL THEN
      NEW.person_id := person_for_registration(NEW.name, NEW.season_id);
    END IF;
  ELSIF name_key(NEW.name) IS DISTINCT FROM name_key(OLD.name)
        AND NEW.person_id = OLD.person_id
        AND NOT EXISTS (SELECT 1 FROM players o WHERE o.person_id = OLD.person_id AND o.id <> OLD.id) THEN
    -- Nobody else has the new name: the same person, renamed.
    NEW.person_id := coalesce(matching_person(NEW.name, NEW.season_id, OLD.person_id), OLD.person_id);
  END IF;
  RETURN NEW;
END $$;

-- A person nobody is registered as any more (after a delete, merge or relink)
-- goes. It runs after any update, not just "UPDATE OF person_id": a rename that
-- relinks changes person_id from the trigger above, and a column changed by a
-- trigger does not count as one the update named.
CREATE OR REPLACE FUNCTION players_drop_orphan_person() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.person_id IS DISTINCT FROM NEW.person_id THEN
    DELETE FROM people pe
    WHERE pe.id = OLD.person_id
      AND NOT EXISTS (SELECT 1 FROM players p WHERE p.person_id = pe.id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS players_link_person ON players;
CREATE TRIGGER players_link_person
  BEFORE INSERT OR UPDATE OF name ON players
  FOR EACH ROW EXECUTE FUNCTION players_link_person();
DROP TRIGGER IF EXISTS players_drop_orphan_person ON players;
CREATE TRIGGER players_drop_orphan_person
  AFTER UPDATE OR DELETE ON players
  FOR EACH ROW EXECUTE FUNCTION players_drop_orphan_person();

-- ---------------------------------------------------------------------------
-- franchises: one row per club, across every season it plays

CREATE TABLE IF NOT EXISTS franchises (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE franchises IS
  'One row per club, across every season it plays. A teams row is the club''s entry in one season; '
  'its name is the one on its latest season''s team.';

ALTER TABLE franchises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read franchises" ON franchises;
CREATE POLICY "Public read franchises" ON franchises FOR SELECT TO anon USING (true);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS franchise_id UUID;
COMMENT ON TABLE teams IS
  'A club''s entry in one season: its name, conference, captain and logo that season. '
  'franchise_id ties a club''s seasons together.';
COMMENT ON COLUMN teams.franchise_id IS
  'The club this season''s team belongs to. Set automatically on insert by name (teams_link_franchise); '
  'fix a wrong match with merge_franchises().';

-- Same rule as for people: a club known by that name in another season and
-- not yet in this one (the most recently active first), or NULL ...
CREATE OR REPLACE FUNCTION matching_franchise(p_name TEXT, p_season_id UUID, p_exclude UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT cand.franchise_id
  FROM teams cand
  JOIN seasons s ON s.id = cand.season_id
  WHERE name_key(cand.name) = name_key(p_name)
    AND cand.franchise_id IS NOT NULL
    AND cand.franchise_id IS DISTINCT FROM p_exclude
    AND NOT EXISTS (SELECT 1 FROM teams same
                    WHERE same.franchise_id = cand.franchise_id AND same.season_id = p_season_id)
  ORDER BY s.created_at DESC, cand.franchise_id
  LIMIT 1
$$;

-- ... and that club, or a new one.
CREATE OR REPLACE FUNCTION franchise_for_team(p_name TEXT, p_season_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  found UUID := matching_franchise(p_name, p_season_id);
BEGIN
  IF found IS NULL THEN
    INSERT INTO franchises DEFAULT VALUES RETURNING id INTO found;
  END IF;
  RETURN found;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT t.id, t.name, t.season_id
    FROM teams t JOIN seasons s ON s.id = t.season_id
    WHERE t.franchise_id IS NULL
    ORDER BY s.created_at, t.sort_order, t.name, t.id
  LOOP
    UPDATE teams SET franchise_id = franchise_for_team(r.name, r.season_id) WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE teams ALTER COLUMN franchise_id SET NOT NULL;
DO $$ BEGIN
  PERFORM pg_temp.add_constraint('teams', 'teams_franchise_id_fkey',
    'FOREIGN KEY (franchise_id) REFERENCES franchises (id) ON DELETE NO ACTION');
  PERFORM pg_temp.add_constraint('teams', 'teams_one_per_season', 'UNIQUE (franchise_id, season_id)');
END $$;

-- The site finds a season's teams by name (standings, schedule), so two with
-- one name in a season would collide. Also serves lookups by season.
CREATE UNIQUE INDEX IF NOT EXISTS teams_season_name_key ON teams (season_id, name_key(name));

-- On insert, link by name; on a rename, a club's only season moves to the club
-- its corrected name matches (see players_link_person).
CREATE OR REPLACE FUNCTION teams_link_franchise() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.franchise_id IS NULL THEN
      NEW.franchise_id := franchise_for_team(NEW.name, NEW.season_id);
    END IF;
  ELSIF name_key(NEW.name) IS DISTINCT FROM name_key(OLD.name)
        AND NEW.franchise_id = OLD.franchise_id
        AND NOT EXISTS (SELECT 1 FROM teams o WHERE o.franchise_id = OLD.franchise_id AND o.id <> OLD.id) THEN
    NEW.franchise_id := coalesce(matching_franchise(NEW.name, NEW.season_id, OLD.franchise_id), OLD.franchise_id);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION teams_drop_orphan_franchise() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.franchise_id IS DISTINCT FROM NEW.franchise_id THEN
    DELETE FROM franchises f
    WHERE f.id = OLD.franchise_id
      AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.franchise_id = f.id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS teams_link_franchise ON teams;
CREATE TRIGGER teams_link_franchise
  BEFORE INSERT OR UPDATE OF name ON teams
  FOR EACH ROW EXECUTE FUNCTION teams_link_franchise();
DROP TRIGGER IF EXISTS teams_drop_orphan_franchise ON teams;
CREATE TRIGGER teams_drop_orphan_franchise
  AFTER UPDATE OR DELETE ON teams
  FOR EACH ROW EXECUTE FUNCTION teams_drop_orphan_franchise();

-- ---------------------------------------------------------------------------
-- rosters: a registration is on at most one team, and only a team of its season.
-- (admin-players already moves a player by deleting their roster row first.)

DO $$ BEGIN
  PERFORM pg_temp.add_constraint('rosters', 'rosters_one_team_per_player', 'UNIQUE (player_id)');
END $$;
CREATE INDEX IF NOT EXISTS rosters_team_id_idx ON rosters (team_id);

CREATE OR REPLACE FUNCTION rosters_same_season() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT season_id FROM players WHERE id = NEW.player_id)
     IS DISTINCT FROM (SELECT season_id FROM teams WHERE id = NEW.team_id) THEN
    RAISE EXCEPTION 'A player can only be put on a team from their own season'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rosters_same_season';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rosters_same_season ON rosters;
CREATE TRIGGER rosters_same_season
  BEFORE INSERT OR UPDATE ON rosters
  FOR EACH ROW EXECUTE FUNCTION rosters_same_season();

-- ---------------------------------------------------------------------------
-- games: two different teams, both of the game's own season; one game per slot.
-- Deleting a team that has games is refused (it used to delete the games, and
-- every stat in them, without a word).

DO $$ BEGIN
  -- What the games' (team, season) foreign keys point at.
  PERFORM pg_temp.add_constraint('teams', 'teams_id_season_key', 'UNIQUE (id, season_id)');
  PERFORM pg_temp.replace_fk('games', 'home_team_id', 'games_home_team_fkey',
    'FOREIGN KEY (home_team_id, season_id) REFERENCES teams (id, season_id) ON DELETE NO ACTION');
  PERFORM pg_temp.replace_fk('games', 'away_team_id', 'games_away_team_fkey',
    'FOREIGN KEY (away_team_id, season_id) REFERENCES teams (id, season_id) ON DELETE NO ACTION');
  PERFORM pg_temp.add_constraint('games', 'games_two_teams', 'CHECK (home_team_id <> away_team_id)');
  PERFORM pg_temp.add_constraint('games', 'games_scores_not_negative',
    'CHECK ((home_score IS NULL OR home_score >= 0) AND (away_score IS NULL OR away_score >= 0))');
  PERFORM pg_temp.add_constraint('games', 'games_forfeit_by_a_team_in_it',
    'CHECK (forfeit_team_id IS NULL OR forfeit_team_id IN (home_team_id, away_team_id))');
  -- The schedule shows one game per week and game number; a second one hid the first.
  PERFORM pg_temp.add_constraint('games', 'games_one_per_slot', 'UNIQUE (season_id, week, game_index)');
END $$;

CREATE INDEX IF NOT EXISTS games_home_team_id_idx ON games (home_team_id);
CREATE INDEX IF NOT EXISTS games_away_team_id_idx ON games (away_team_id);

-- ---------------------------------------------------------------------------
-- game_stat_values: every stat line remembers the team it was scored for.

ALTER TABLE game_stat_values ADD COLUMN IF NOT EXISTS team_id UUID;
COMMENT ON COLUMN game_stat_values.team_id IS
  'The team the player was on for this game, fixed when the row is written. Set from the roster by '
  'game_stat_values_set_team, so moving a player to another team later never rewrites old games.';

-- Existing rows: every player's roster today is the history, as nobody has
-- been moved mid-season. Checked rather than assumed.
UPDATE game_stat_values v
SET team_id = r.team_id
FROM games g, rosters r
WHERE g.id = v.game_id
  AND r.player_id = v.player_id
  AND r.team_id IN (g.home_team_id, g.away_team_id)
  AND v.team_id IS NULL;

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM game_stat_values WHERE team_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION USING MESSAGE = format(
      '%s game stat rows are for players on neither team in their game; nothing was changed. Find them with: '
      'SELECT v.* FROM game_stat_values v JOIN games g ON g.id = v.game_id WHERE NOT EXISTS (SELECT 1 FROM rosters r '
      'WHERE r.player_id = v.player_id AND r.team_id IN (g.home_team_id, g.away_team_id))', n);
  END IF;
END $$;

ALTER TABLE game_stat_values ALTER COLUMN team_id SET NOT NULL;
DO $$ BEGIN
  PERFORM pg_temp.add_constraint('game_stat_values', 'game_stat_values_team_id_fkey',
    'FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE NO ACTION');
  -- Deleting a player used to delete every stat they had; now it is refused
  -- while they have any. (A whole game can still be deleted, stats and all: the
  -- admin asks first. So can a stat column.)
  PERFORM pg_temp.replace_fk('game_stat_values', 'player_id', 'game_stat_values_player_fkey',
    'FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE NO ACTION');
  PERFORM pg_temp.add_constraint('game_stat_values', 'game_stat_values_not_negative', 'CHECK (value >= 0)');
END $$;

CREATE INDEX IF NOT EXISTS game_stat_values_player_id_idx ON game_stat_values (player_id);
CREATE INDEX IF NOT EXISTS game_stat_values_team_id_idx ON game_stat_values (team_id);
CREATE INDEX IF NOT EXISTS game_stat_values_stat_definition_id_idx ON game_stat_values (stat_definition_id);

-- Written one row at a time by admin-game-stats, which has already checked the
-- player is on one of the two teams. An upsert of an existing row keeps the
-- team it was first written with (it is not in the update), so a later move
-- never rewrites an old game.
CREATE OR REPLACE FUNCTION game_stat_values_set_team() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  home UUID;
  away UUID;
BEGIN
  SELECT home_team_id, away_team_id INTO home, away FROM games WHERE id = NEW.game_id;
  IF NEW.team_id IS NULL THEN
    SELECT r.team_id INTO NEW.team_id
    FROM rosters r
    WHERE r.player_id = NEW.player_id AND r.team_id IN (home, away);
  END IF;
  IF NEW.team_id IS NULL OR NEW.team_id NOT IN (home, away) THEN
    RAISE EXCEPTION 'That player is not on either team in this game'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'game_stat_values_team_in_game';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS game_stat_values_set_team ON game_stat_values;
CREATE TRIGGER game_stat_values_set_team
  BEFORE INSERT OR UPDATE OF game_id, player_id, team_id ON game_stat_values
  FOR EACH ROW EXECUTE FUNCTION game_stat_values_set_team();

-- Manual season totals are history too.
DO $$ BEGIN
  PERFORM pg_temp.replace_fk('player_stat_values', 'player_id', 'player_stat_values_player_fkey',
    'FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE NO ACTION');
  PERFORM pg_temp.add_constraint('player_stat_values', 'player_stat_values_not_negative', 'CHECK (value >= 0)');
END $$;

CREATE INDEX IF NOT EXISTS game_dnp_player_id_idx ON game_dnp (player_id);

-- ---------------------------------------------------------------------------
-- content_blocks: one row per key per season (or per key, league-wide).
-- admin-content looked a key up with "exactly one row", so once a key had two
-- rows it found none and inserted another, every save. The site uses the last
-- copy it reads, which is the last one in the table, so that is the one kept.

DELETE FROM content_blocks older
USING content_blocks newer
WHERE newer.key = older.key
  AND newer.season_id IS NOT DISTINCT FROM older.season_id
  AND newer.ctid > older.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS content_blocks_key_season_key
  ON content_blocks (key, season_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS content_blocks_season_id_idx ON content_blocks (season_id);

-- ---------------------------------------------------------------------------
-- Fixing a wrong match. Run in the SQL editor; not callable through the API.

-- Two people who are one (a name spelt differently one season): every
-- registration of merge_id moves to keep_id. Refused if both played the same season.
CREATE OR REPLACE FUNCTION merge_people(keep_id UUID, merge_id UUID) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF keep_id = merge_id THEN RAISE EXCEPTION 'That is the same person twice'; END IF;
  IF NOT EXISTS (SELECT 1 FROM people WHERE id = keep_id) OR NOT EXISTS (SELECT 1 FROM people WHERE id = merge_id) THEN
    RAISE EXCEPTION 'Both ids must be people (see people_directory)';
  END IF;
  UPDATE players SET person_id = keep_id WHERE person_id = merge_id;
END $$;

-- One registration that is not the person it was matched to (two people with
-- one name): it gets a person of its own. Returns the new person's id.
CREATE OR REPLACE FUNCTION split_person(registration_id UUID) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  fresh UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = registration_id) THEN
    RAISE EXCEPTION 'No players row has that id';
  END IF;
  INSERT INTO people DEFAULT VALUES RETURNING id INTO fresh;
  UPDATE players SET person_id = fresh WHERE id = registration_id;
  RETURN fresh;
END $$;

-- Two clubs that are one (a club renamed between seasons).
CREATE OR REPLACE FUNCTION merge_franchises(keep_id UUID, merge_id UUID) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF keep_id = merge_id THEN RAISE EXCEPTION 'That is the same club twice'; END IF;
  IF NOT EXISTS (SELECT 1 FROM franchises WHERE id = keep_id) OR NOT EXISTS (SELECT 1 FROM franchises WHERE id = merge_id) THEN
    RAISE EXCEPTION 'Both ids must be franchises (see franchise_directory)';
  END IF;
  UPDATE teams SET franchise_id = keep_id WHERE franchise_id = merge_id;
END $$;

-- Functions in public are callable through the API by default. These change
-- data, and the triggers' helpers are not meant to be called on their own.
REVOKE ALL ON FUNCTION merge_people(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION split_person(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION merge_franchises(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION matching_person(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION person_for_registration(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION matching_franchise(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION franchise_for_team(TEXT, UUID) FROM PUBLIC, anon, authenticated;
-- The triggers call these as whoever is writing: the Edge Functions' service_role.
GRANT EXECUTE ON FUNCTION matching_person(TEXT, UUID, UUID), person_for_registration(TEXT, UUID),
  matching_franchise(TEXT, UUID, UUID), franchise_for_team(TEXT, UUID) TO service_role;
