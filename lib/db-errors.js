/**
 * Plain-language versions of the database's refusals, for the admin.
 *
 * Since migration 015 the database itself refuses changes that would break the
 * league's history or its schedule — deleting a player who has stats, a team
 * with games, a second team of one name in a season. The Edge Functions pass
 * Postgres's own message straight through; this turns the ones the admin can
 * run into into something that says what to do. Anything else is returned as it was.
 */

/** Constraint name → what to tell the admin. */
const MESSAGES = {
  game_stat_values_player_fkey:
    'This player has stats in games already played, so they can\'t be deleted. Move them to another team or to the draft bank instead.',
  player_stat_values_player_fkey:
    'This player has season stats recorded, so they can\'t be deleted. Move them to another team or to the draft bank instead.',
  games_home_team_fkey:
    'This team has games on the schedule, so it can\'t be deleted. Delete those games (or give them another team) first.',
  games_away_team_fkey:
    'This team has games on the schedule, so it can\'t be deleted. Delete those games (or give them another team) first.',
  game_stat_values_team_id_fkey:
    'This team has stats in games already played, so it can\'t be deleted.',
  teams_season_name_key: 'There is already a team with that name this season.',
  games_one_per_slot: 'That week already has a game with that number. Pick another game number.',
  games_two_teams: 'A game needs two different teams.',
  games_scores_not_negative: 'Scores can\'t be negative.',
  game_stat_values_not_negative: 'Stats can\'t be negative.',
  player_stat_values_not_negative: 'Stats can\'t be negative.',
  rosters_one_team_per_player: 'That player is already on a team.',
  players_one_per_season: 'That person is already registered this season.',
};

/**
 * @param {string} message an error message as an Edge Function returned it
 * @returns {string} the plain-language version, or the message itself
 */
export function friendlyDbError(message) {
  const text = String(message ?? '');
  const named = text.match(/constraint "([^"]+)"/);
  return (named && MESSAGES[named[1]]) || text;
}
