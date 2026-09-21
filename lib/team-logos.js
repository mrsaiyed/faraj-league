/**
 * Team logo resolution — pure, no DOM, no DB.
 *
 * A team's logo comes from its own season's `teams.logo_url` when set, so two
 * seasons can show different logos for the same club and a renamed team keeps
 * the logo the admin gave it.
 *
 * When that column is empty we fall back to the files committed under
 * `images/teams/`, matched loosely against the team name. That fallback exists
 * only for seasons recorded before `logo_url` existed (Spring 2026); it is
 * deliberately left as-is so those pages render exactly as they always have.
 */

/** Logo files committed in `images/teams/`, keyed by name fragment. */
export const BUILT_IN_TEAM_LOGOS = {
  ansar: 'ansar.png',
  dukhaan: 'dukhaan.jpg',
  jaysh: 'jaysh.png',
  mujahideen: 'mujahideen.png',
  noor: 'noor.png',
  raad: 'raad.jpg',
};

/**
 * Per-file zoom for the built-in logos. Each is rendered as an absolutely
 * centred img inside an overflow:hidden circular crop, so the scale is tuned
 * per image. An array is [x, y].
 */
export const BUILT_IN_LOGO_SCALE = {
  jaysh: 2.75,
  noor: 2.40,
  dukhaan: 2.50,
  ansar: 1.725,
  mujahideen: [1.85, 2.45],
  raad: 2.30,
};

/** Zoom applied to a logo with no tuned value — including every custom upload. */
export const DEFAULT_LOGO_SCALE = 1.15;

/**
 * Loose name match against the built-in files.
 * @param {string} name
 * @returns {string|null} key into BUILT_IN_TEAM_LOGOS
 */
export function builtInLogoKey(name) {
  const slug = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) return null;
  return Object.keys(BUILT_IN_TEAM_LOGOS).find(k => slug.includes(k) || k.includes(slug)) ?? null;
}

/**
 * Resolve the logo for one team.
 *
 * @param {{ logo_url?: string|null, logo_scale?: number|null }|null|undefined} team
 *   the team row for the season being viewed, when known
 * @param {string} [name] team name, used only for the built-in fallback
 * @returns {{ path: string, scale: number|number[], custom: boolean }|null}
 *   `path` is an absolute URL or a repo-relative path the caller resolves
 *   against the site's base path; null means "no logo, render initials"
 */
export function resolveTeamLogo(team, name) {
  const custom = typeof team?.logo_url === 'string' ? team.logo_url.trim() : '';
  if (custom) {
    const scale = Number(team?.logo_scale);
    return {
      path: custom,
      scale: Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_LOGO_SCALE,
      custom: true,
    };
  }

  const key = builtInLogoKey(name ?? team?.name);
  if (!key) return null;
  return {
    path: `images/teams/${BUILT_IN_TEAM_LOGOS[key]}`,
    scale: BUILT_IN_LOGO_SCALE[key] ?? DEFAULT_LOGO_SCALE,
    custom: false,
  };
}

/**
 * CSS value for `transform: scale(...)` — the tuned entries may be [x, y].
 * @param {number|number[]} scale
 * @returns {string}
 */
export function logoScaleCss(scale) {
  return Array.isArray(scale) ? `${scale[0]}, ${scale[1]}` : String(scale);
}
