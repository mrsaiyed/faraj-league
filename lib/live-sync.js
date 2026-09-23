/**
 * Live refresh support — pure, no DOM, no network.
 *
 * The public site loads a season once. While a game is being scored in the
 * admin tracker, scores and box scores change underneath it. These helpers let
 * the page poll cheaply and re-render only when something actually moved —
 * repainting on every tick would fight whatever the visitor is doing.
 */

/**
 * Stable fingerprint of everything a visitor could see change during a game:
 * scores, and every recorded stat value.
 *
 * Order-independent, so a differently ordered API response does not read as a
 * change.
 *
 * @param {{ scores?: Array<object>, stats?: Array<object>, gameStatValues?: object }} data
 *   a `transformSeasonData` result (or `config.DB`)
 * @returns {string}
 */
export function liveFingerprint(data) {
  if (!data) return '';

  const scores = (data.scores || [])
    .map(g => `${g.gameId}:${g.s1}-${g.s2}:${g.forfeitTeamId || ''}`)
    .sort()
    .join('|');

  const gsv = data.gameStatValues || {};
  const stats = Object.keys(gsv).sort().map(gameId => {
    const byPlayer = gsv[gameId] || {};
    const inner = Object.keys(byPlayer).sort().map(pid => {
      const byDef = byPlayer[pid] || {};
      return `${pid}=${Object.keys(byDef).sort().map(d => `${d}:${byDef[d]}`).join(',')}`;
    }).join(';');
    return `${gameId}{${inner}}`;
  }).join('|');

  return `${scores}#${stats}`;
}

/**
 * Should the page repaint right now?
 *
 * Holds off while the visitor has something open — a repaint would close a box
 * score or yank a menu out from under them. The change is not lost; the next
 * tick picks it up once they are done.
 *
 * @param {{ previous: string, next: string, busy?: boolean }} opts
 * @returns {boolean}
 */
export function shouldRepaint({ previous, next, busy = false }) {
  if (busy) return false;
  if (previous === '') return false;
  return previous !== next;
}

/** Default gap between polls while the tab is visible, in ms. */
export const POLL_INTERVAL_MS = 15000;
