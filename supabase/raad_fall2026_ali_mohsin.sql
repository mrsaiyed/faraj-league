-- Fall 2026: Ali Mohsin joins Raad in Hanny Ali's place.
--
-- Ali Mohsin is the Ali Mohsin Raza who played for Dukhaan in Spring 2026, so
-- his Fall registration is linked to the same person and his career adds up
-- across both seasons. (The name alone would not link them: they differ.)
--
-- Hanny Ali stays registered for Fall 2026, on no team, and none of his stats
-- are touched: each stat row keeps the team it was scored for, which the site
-- reads (so his points stay on Raad, in the stats page and the box scores).
--
-- Run in Supabase Dashboard → SQL Editor, after the site has the change that
-- keeps a player's stats when they leave a roster (main, then Sync fork).
-- Safe to run more than once.

DO $$
DECLARE
  fall   uuid := (SELECT id FROM seasons WHERE slug = 'fall2026');
  spring uuid := (SELECT id FROM seasons WHERE slug = 'spring2026');
  raad   uuid := (SELECT id FROM teams WHERE season_id = fall AND name = 'Raad');
  hanny  uuid := (SELECT id FROM players WHERE season_id = fall AND name = 'Hanny Ali');
  person uuid := (SELECT person_id FROM players WHERE season_id = spring AND name = 'Ali Mohsin Raza');
  ali    uuid := (SELECT id FROM players WHERE season_id = fall AND lower(name) = 'ali mohsin');
BEGIN
  IF raad IS NULL OR hanny IS NULL THEN
    RAISE EXCEPTION 'Raad or Hanny Ali not found in Fall 2026';
  END IF;
  IF person IS NULL THEN
    RAISE EXCEPTION 'Ali Mohsin Raza not found in Spring 2026';
  END IF;

  -- His Fall registration, as the same person as in Spring.
  IF ali IS NULL THEN
    INSERT INTO players (season_id, name, person_id) VALUES (fall, 'Ali Mohsin', person) RETURNING id INTO ali;
  ELSE
    -- Already registered (an earlier run, or added in the admin): link it. A
    -- person left with no registrations is removed by trigger.
    UPDATE players SET person_id = person WHERE id = ali AND person_id IS DISTINCT FROM person;
  END IF;

  -- He takes Hanny's spot on Raad's roster, in the same place in its order.
  UPDATE rosters SET player_id = ali WHERE team_id = raad AND player_id = hanny;
END $$;

-- Raad's roster now, Hanny's season (still on Raad), and Ali's other season.
SELECT p.name, 'Raad roster' AS status, r.sort_order + 1 AS "order"
FROM rosters r
JOIN players p ON p.id = r.player_id
JOIN teams t ON t.id = r.team_id
JOIN seasons s ON s.id = t.season_id
WHERE s.slug = 'fall2026' AND t.name = 'Raad'
UNION ALL
SELECT name, 'Left Raad: ' || games || ' games, ' || points || ' points kept', NULL
FROM player_season_stats
WHERE name = 'Hanny Ali' AND season_id = (SELECT id FROM seasons WHERE slug = 'fall2026') AND stage = 'all'
UNION ALL
SELECT f.name, 'Same person as ' || o.name || ', ' || se.label, NULL
FROM players f
JOIN players o ON o.person_id = f.person_id AND o.id <> f.id
JOIN seasons se ON se.id = o.season_id
WHERE f.season_id = (SELECT id FROM seasons WHERE slug = 'fall2026') AND lower(f.name) = 'ali mohsin'
ORDER BY "order" NULLS LAST;
