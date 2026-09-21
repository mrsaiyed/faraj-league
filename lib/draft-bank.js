/**
 * Draft player-bank search — pure, no DOM.
 */

/**
 * Filter the unrostered player bank by what the admin has typed.
 *
 * Matches a prefix of the whole name or of any word in it, so "r" finds
 * "Raza Saiyed" and typing a surname like "zaidi" finds "Ali Zaidi".
 * Order is preserved so chips do not jump around as the query grows.
 *
 * @param {Array<{ id?: string, name?: string }>} players
 * @param {string} query
 * @returns {Array<object>} the matching players, in their original order
 */
export function filterBankPlayers(players, query) {
  const list = Array.isArray(players) ? players : [];
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [...list];
  return list.filter(p => {
    const name = String(p?.name ?? '').trim().toLowerCase();
    if (!name) return false;
    return name.startsWith(q) || name.split(/\s+/).some(word => word.startsWith(q));
  });
}
