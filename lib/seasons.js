/**
 * Faraj League season helpers — pure functions, no DB.
 *
 * Used by the public site (season dropdown), the admin site (new-season form),
 * and mirrored server-side in supabase/functions/admin-seasons for validation.
 */

/** Slug shape accepted by the DB and the admin-seasons Edge Function. */
export const SEASON_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/**
 * Derive a URL-safe slug from a season label.
 * 'Fall 2026' → 'fall2026'; 'Spring 2026 — Div II' → 'spring2026-div-ii'
 *
 * @param {string} label
 * @returns {string} slug (may be '' when the label has no usable characters)
 */
export function slugifySeasonLabel(label) {
  const raw = String(label == null ? '' : label).toLowerCase().trim();
  return raw
    // Season names read as one token: "fall 2026" → "fall2026"
    .replace(/([a-z])\s+(\d)/g, '$1$2')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

/**
 * @param {string} slug
 * @returns {boolean} true when the slug is safe to store and use in URLs
 */
export function isValidSeasonSlug(slug) {
  return SEASON_SLUG_RE.test(String(slug == null ? '' : slug));
}

/**
 * Order seasons for the season dropdown: the active season first, then past
 * seasons newest-first. Does not mutate the input.
 *
 * @param {Array<{ slug: string, label: string, is_current?: boolean, created_at?: string }>} seasons
 * @returns {Array<object>} sorted copy
 */
export function sortSeasons(seasons) {
  const time = (s) => {
    const t = Date.parse(s?.created_at || '');
    return Number.isNaN(t) ? 0 : t;
  };
  return [...(seasons || [])].sort((a, b) => {
    if (!!a.is_current !== !!b.is_current) return a.is_current ? -1 : 1;
    return time(b) - time(a);
  });
}

/**
 * Slug the site should load by default: the active season, else the newest one.
 *
 * @param {Array<{ slug: string, is_current?: boolean, created_at?: string }>} seasons
 * @returns {string|null}
 */
export function activeSeasonSlug(seasons) {
  const sorted = sortSeasons(seasons);
  return sorted[0]?.slug || null;
}
