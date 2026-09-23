-- Fall 2026 sponsors: diagnose, then fix. Run the whole thing in one go.
-- Safe to run more than once. Spring 2026 keeps its own branding.

-- ─────────────────────────────────────────────────────────────
-- BEFORE — what the site is actually reading
-- ─────────────────────────────────────────────────────────────
-- is_current = t marks the season the public site loads by default. If that is
-- spring2026, then TOYOMOTORS on the Akhlaq award is correct: you are looking
-- at last season.
SELECT s.slug, s.is_current, COALESCE(sp.type, '(no sponsors)') AS sponsor_type, sp.name, sp.logo_url
FROM seasons s
LEFT JOIN sponsors sp ON sp.season_id = s.id
ORDER BY s.is_current DESC, s.slug, sp.type;

-- ─────────────────────────────────────────────────────────────
-- FIX
-- ─────────────────────────────────────────────────────────────

-- 1. Spring 2026 keeps its branding in its own rows. The site no longer falls
--    back to hard-coded sponsor names or logos, so without this Spring renders
--    unbranded. Fills only what is missing; never overwrites a real value.
INSERT INTO sponsors (season_id, type, name, logo_url)
SELECT s.id, v.type, v.name, v.logo_url
FROM seasons s
CROSS JOIN (VALUES
  ('title'::TEXT,       'Zabiha Family Ranch'::TEXT, 'images/zabiha-logo.png'::TEXT),
  ('conference_mecca',  'TOYOMOTORS',                'images/toyomotors-logo.png'),
  ('conference_medina', 'Xtreme Wellness',           'images/wellness-logo.png')
) AS v (type, name, logo_url)
WHERE s.slug = 'spring2026'
  AND NOT EXISTS (SELECT 1 FROM sponsors x WHERE x.season_id = s.id AND x.type = v.type);

UPDATE sponsors sp
SET name = COALESCE(NULLIF(sp.name, ''), v.name),
    logo_url = COALESCE(NULLIF(sp.logo_url, ''), v.logo_url)
FROM seasons s, (VALUES
  ('title'::TEXT,       'Zabiha Family Ranch'::TEXT, 'images/zabiha-logo.png'::TEXT),
  ('conference_mecca',  'TOYOMOTORS',                'images/toyomotors-logo.png'),
  ('conference_medina', 'Xtreme Wellness',           'images/wellness-logo.png')
) AS v (type, name, logo_url)
WHERE sp.season_id = s.id AND s.slug = 'spring2026' AND sp.type = v.type
  AND (sp.name IS NULL OR sp.name = '' OR sp.logo_url IS NULL OR sp.logo_url = '');

-- 2. Fall 2026: conference sponsors OUT. This is what clears "TOYOMOTORS"
--    from the Akhlaq award and the conference headings.
DELETE FROM sponsors
WHERE season_id = (SELECT id FROM seasons WHERE slug = 'fall2026')
  AND type IN ('conference_mecca', 'conference_medina');

-- 3. Fall 2026: community partners OUT.
DELETE FROM content_blocks
WHERE season_id = (SELECT id FROM seasons WHERE slug = 'fall2026')
  AND key LIKE 'sponsor_community_%';

-- 4. Fall 2026: title sponsor IN, copied from Spring's.
INSERT INTO sponsors (season_id, type, name, logo_url, label)
SELECT f.id, 'title',
       COALESCE(sp.name, 'Zabiha Family Ranch'),
       COALESCE(sp.logo_url, 'images/zabiha-logo.png'),
       sp.label
FROM seasons f
LEFT JOIN seasons s ON s.slug = 'spring2026'
LEFT JOIN sponsors sp ON sp.season_id = s.id AND sp.type = 'title'
WHERE f.slug = 'fall2026'
  AND NOT EXISTS (SELECT 1 FROM sponsors x WHERE x.season_id = f.id AND x.type = 'title');

UPDATE sponsors t
SET name = COALESCE(NULLIF(t.name, ''), sp.name, 'Zabiha Family Ranch'),
    logo_url = COALESCE(NULLIF(t.logo_url, ''), sp.logo_url, 'images/zabiha-logo.png')
FROM seasons f
LEFT JOIN seasons s ON s.slug = 'spring2026'
LEFT JOIN sponsors sp ON sp.season_id = s.id AND sp.type = 'title'
WHERE t.season_id = f.id AND f.slug = 'fall2026' AND t.type = 'title'
  AND (t.name IS NULL OR t.name = '' OR t.logo_url IS NULL OR t.logo_url = '');

-- ─────────────────────────────────────────────────────────────
-- AFTER — expect Fall with exactly one row (title), Spring with three
-- ─────────────────────────────────────────────────────────────
SELECT s.slug, s.is_current, COALESCE(sp.type, '(no sponsors)') AS sponsor_type, sp.name, sp.logo_url
FROM seasons s
LEFT JOIN sponsors sp ON sp.season_id = s.id
ORDER BY s.is_current DESC, s.slug, sp.type;
