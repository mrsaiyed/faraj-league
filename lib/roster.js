/**
 * Roster display ordering — pure, no DOM.
 *
 * One rule shared by the public Teams panel and its admin mirror, which had
 * drifted apart: the public side sorted alphabetically while admin still showed
 * draft order.
 */

/** Accepts either a plain name or a roster row. */
const nameOf = (p) => (typeof p === 'string' ? p : String(p?.name ?? ''));

/**
 * Order a roster for display: captain first, then everyone else alphabetically
 * by name (so, by first name — names are stored "First Last").
 *
 * Draft order is deliberately not preserved here; the draft board reads
 * `team.roster` directly and keeps its own pick order.
 *
 * @param {Array<string|{name?: string}>} roster
 * @param {string} [captain] captain's name; pinned first when they are on the roster
 * @returns {Array<string|object>} a new array, same item types as the input
 */
export function orderRosterForDisplay(roster, captain) {
  const list = Array.isArray(roster) ? [...roster] : [];
  const cap = String(captain ?? '').trim().toLowerCase();
  const isCaptain = (p) => cap !== '' && nameOf(p).trim().toLowerCase() === cap;

  const captains = list.filter(isCaptain);
  const others = list
    .filter(p => !isCaptain(p))
    .sort((a, b) => nameOf(a).trim().localeCompare(nameOf(b).trim(), undefined, { sensitivity: 'base' }));

  return [...captains, ...others];
}
