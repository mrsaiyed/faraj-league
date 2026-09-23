/**
 * Returning a game to "not played" — admin only.
 *
 * Saving an empty stat sheet is not enough on its own: `admin-game-stats`
 * recomputes the score from whatever point totals remain, so an emptied game
 * lands on 0–0. Every "has this been played?" check in the site is
 * `score !== ''`, and '0' passes that, so the game still shows as complete and
 * still counts as a tie in the standings. Only NULL scores mark it unplayed.
 *
 * This runs entirely through Edge Functions that are already deployed, so
 * clearing a game needs no new backend.
 */

/**
 * Wipe a game's recorded stats and mark it as not played.
 *
 * @param {object} opts
 * @param {Function} opts.adminFetch the admin fetch helper
 * @param {string} opts.gameId
 * @param {string[]} opts.rosterPlayerIds every player on either roster — their
 *   stat rows are what has to be deleted
 * @returns {Promise<void>}
 */
export async function clearGame({ adminFetch, gameId, rosterPlayerIds }) {
  if (!gameId) throw new Error('gameId is required');
  const ids = [...new Set((rosterPlayerIds || []).filter(Boolean))];

  // 1. Delete the stat rows. admin-game-stats only deletes values for players
  //    listed as DNP, so naming the whole roster is how you clear the sheet.
  //    This also clears any forfeit.
  if (ids.length) {
    await adminFetch('admin-game-stats', {
      method: 'POST',
      body: JSON.stringify({ game_id: gameId, values: [], dnp_player_ids: ids, forfeit_team_id: null }),
    });
  }

  // 2. Empty the DNP list again — nobody "did not play" a game that never
  //    happened. The function rewrites game_dnp from the list it is given.
  await adminFetch('admin-game-stats', {
    method: 'POST',
    body: JSON.stringify({ game_id: gameId, values: [], dnp_player_ids: [], forfeit_team_id: null }),
  });

  // 3. Null the score. Steps 1–2 leave it at 0–0, which still reads as played.
  await adminFetch('admin-games', {
    method: 'POST',
    body: JSON.stringify({ id: gameId, home_score: null, away_score: null }),
  });
}
