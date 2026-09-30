/**
 * Jersey numbers — pure, no DOM.
 *
 * A number is a whole number from 0 to 99, or nothing at all. #0 is a real
 * number, so "nothing" is null and is never tested with a falsy check.
 */

/** Whether a stored or typed value counts as a number at all (0 does). */
export function hasJersey(value) {
  return value != null && String(value).trim() !== '';
}

/**
 * A jersey number typed into the admin: null when left blank, NaN when it is not
 * a whole number from 0 to 99. `parseInt(...) || null` used to turn #0 into "none".
 */
export function jerseyValue(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : NaN;
}

/**
 * What a jersey box holds after a keystroke: digits only, and no more than two.
 * A third digit pushes the first out ("23" then "5" gives "35"), so a box that
 * already holds a number can be typed over without selecting it first — iOS does
 * not always select a box's text when it is tapped.
 */
export function typedJersey(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(-2);
}

/**
 * Numbers that more than one player on the same team is down for.
 *
 * @param {Array<{id: string, number: number|string|null|undefined}>} players one team's players
 * @returns {Array<{number: number, ids: string[]}>} ascending by number, ids in the order given;
 *   players with no number (or one that is not valid) never count
 */
export function numberDuplicates(players) {
  const byNumber = new Map();
  for (const p of players || []) {
    const n = jerseyValue(p?.number);
    if (n == null || Number.isNaN(n)) continue;
    if (!byNumber.has(n)) byNumber.set(n, []);
    byNumber.get(n).push(p.id);
  }
  return [...byNumber]
    .filter(([, ids]) => ids.length > 1)
    .sort((a, b) => a[0] - b[0])
    .map(([number, ids]) => ({ number, ids }));
}
