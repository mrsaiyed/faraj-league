/**
 * The champions' photo at the top of the home page, per season — pure, no DOM.
 *
 * A season's page shows its own champions once their photo is listed here. Until
 * then (the whole time the season is being played) it shows the newest champions
 * listed, DEFAULT_PHOTO. So when a season is won and its winners' photo is added,
 * it replaces the old photo on that season's page and carries over to the next
 * season, while every earlier season keeps its own winners.
 *
 * Every photo is cropped to the framing the hero is laid out for (2345:1623, the
 * players' heads about a third of the way down), because the logos sit over its
 * top edge and the phone layout's aspect-ratio in css/main.css is fixed to it.
 * Files are `${base}-${width}.jpg`, one per width, for srcset.
 */

/** Season slug → its champions' photo. Add each new season at the end. */
export const CHAMPION_PHOTOS = Object.freeze({
  spring2026: Object.freeze({
    base: 'images/champions/spring2026',
    widths: Object.freeze([800, 1200, 1600, 2345]),
    height: 1623, // at the largest width
    alt: 'The Spring 2026 champions with the Faraj League trophy',
  }),
});

/** The newest photo: the last one listed. */
function newest(photos) {
  const all = Object.values(photos);
  return all[all.length - 1] || null;
}

/** The newest champions' photo; also what the page's HTML ships with, so it never flashes. */
export const DEFAULT_PHOTO = newest(CHAMPION_PHOTOS);

/**
 * @param {string|null|undefined} slug the season being shown
 * @param {object} [photos] slug → photo, in the order they were won
 * @returns {{ base: string, widths: number[], height: number, alt: string }|null}
 */
export function championPhoto(slug, photos = CHAMPION_PHOTOS) {
  // hasOwnProperty.call rather than Object.hasOwn: the latter needs iOS 15.4+,
  // and a throw here would take down renderAll() for the whole page.
  return (slug && Object.prototype.hasOwnProperty.call(photos, slug))
    ? photos[slug]
    : newest(photos);
}

/**
 * The <img> attributes for a photo. `src` is the fallback for browsers without
 * srcset: the first width of at least 1200px.
 * @param {{ base: string, widths: number[], height: number }} photo
 * @param {(path: string) => string} [toPath] maps a repo-relative path to a URL
 * @returns {{ src: string, srcset: string, width: number, height: number }}
 */
export function photoSources(photo, toPath = (p) => p) {
  const url = (w) => toPath(`${photo.base}-${w}.jpg`);
  const widths = [...photo.widths].sort((a, b) => a - b);
  const largest = widths[widths.length - 1];
  return {
    src: url(widths.find(w => w >= 1200) ?? largest),
    srcset: widths.map(w => `${url(w)} ${w}w`).join(', '),
    width: largest,
    height: photo.height,
  };
}
