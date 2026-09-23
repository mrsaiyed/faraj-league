-- Remove the conference/title sponsors from Fall 2026, and pin Spring 2026's
-- sponsors into its own data so it is unaffected.
--
-- Background: the site used to fall back to hard-coded sponsor names and logos
-- whenever a season had none, which is why clearing them in admin appeared to
-- do nothing. Those fallbacks are gone. Spring 2026 relied on them, so its
-- values are written into its own sponsor rows here — after this it renders
-- from data exactly as it did before.
--
-- Run in Supabase Dashboard → SQL Editor. Safe to run more than once.

-- 1. Spring 2026 keeps its branding, stored properly.
--    Fills a missing row, and fills a blank column on an existing row. Never
--    overwrites a value that is already set.
INSERT INTO sponsors (season_id, type, name, logo_url)
SELECT s.id, v.type, v.name, v.logo_url
FROM seasons s
CROSS JOIN (VALUES
  ('title'::TEXT,            'Zabiha Family Ranch'::TEXT, 'images/zabiha-logo.png'::TEXT),
  ('conference_mecca',       'TOYOMOTORS',                'images/toyomotors-logo.png'),
  ('conference_medina',      'Xtreme Wellness',           'images/wellness-logo.png')
) AS v (type, name, logo_url)
WHERE s.slug = 'spring2026'
  AND NOT EXISTS (
    SELECT 1 FROM sponsors x WHERE x.season_id = s.id AND x.type = v.type
  );

UPDATE sponsors sp
SET name = COALESCE(NULLIF(sp.name, ''), v.name),
    logo_url = COALESCE(NULLIF(sp.logo_url, ''), v.logo_url)
FROM seasons s,
  (VALUES
    ('title'::TEXT,       'Zabiha Family Ranch'::TEXT, 'images/zabiha-logo.png'::TEXT),
    ('conference_mecca',  'TOYOMOTORS',                'images/toyomotors-logo.png'),
    ('conference_medina', 'Xtreme Wellness',           'images/wellness-logo.png')
  ) AS v (type, name, logo_url)
WHERE sp.season_id = s.id
  AND s.slug = 'spring2026'
  AND sp.type = v.type
  AND (sp.name IS NULL OR sp.name = '' OR sp.logo_url IS NULL OR sp.logo_url = '');

-- 2. Fall 2026 loses its sponsor rows entirely.
DELETE FROM sponsors
WHERE season_id = (SELECT id FROM seasons WHERE slug = 'fall2026');

-- 3. ...and any community-partner blocks carried over with them.
DELETE FROM content_blocks
WHERE season_id = (SELECT id FROM seasons WHERE slug = 'fall2026')
  AND key LIKE 'sponsor_community_%';

-- Confirmation — Spring should list three sponsors, Fall none.
SELECT s.slug, sp.type, sp.name, sp.logo_url
FROM seasons s
LEFT JOIN sponsors sp ON sp.season_id = s.id
WHERE s.slug IN ('spring2026', 'fall2026')
ORDER BY s.slug, sp.type;
