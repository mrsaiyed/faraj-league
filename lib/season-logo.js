/**
 * The league logo shown in the home hero, per season — pure, no DOM.
 *
 * Each season can carry its own mark: the inaugural season keeps the original
 * circular badge, and Fall 2026 is the "City Edition". A season not listed
 * gets the newest edition rather than the original badge, so creating a
 * season never quietly reverts the site to an old logo — give it its own
 * entry here once it has one.
 *
 * `variant` picks the CSS treatment (`.hero-league-logo--<variant>` in
 * css/main.css), because the marks are not interchangeable at one size: the
 * badge is a solid disc drawn with `mix-blend-mode:screen`, the City Edition
 * an airy calligraphic shape on a transparent background.
 */

/** Newest edition; also what the page's HTML ships with, so it never flashes. */
export const DEFAULT_LOGO = Object.freeze({
  src: 'images/logos/fall2026-city-edition.svg',
  variant: 'mark',
  alt: 'Faraj League — City Edition',
});

/** Season slug → logo. Slugs are `seasons.slug` (see lib/seasons.js). */
export const SEASON_LOGOS = Object.freeze({
  spring2026: Object.freeze({ src: 'faraj-logo.png', variant: 'badge', alt: 'Faraj League' }),
  fall2026: DEFAULT_LOGO,
});

/**
 * @param {string|null|undefined} slug the season being shown
 * @returns {{ src: string, variant: string, alt: string }} a repo-relative src
 */
export function seasonLogo(slug) {
  // hasOwnProperty.call rather than Object.hasOwn: the latter needs iOS 15.4+,
  // and a throw here would take down renderAll() for the whole page.
  return (slug && Object.prototype.hasOwnProperty.call(SEASON_LOGOS, slug))
    ? SEASON_LOGOS[slug]
    : DEFAULT_LOGO;
}
