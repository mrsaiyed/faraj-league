/**
 * Stat aggregation — pure function for testability.
 * Aggregates points from game_stat_values (with GP) or falls back to player_stat_values.
 *
 * @param {Object} opts
 * @param {Array} opts.game_stat_values
 * @param {Array} opts.player_stat_values
 * @param {Array} opts.stat_definitions
 * @param {Array} opts.rosters
 * @param {Array} opts.games
 * @param {Array} opts.players
 * @param {Record<string, string>} opts.rosterToTeam
 * @param {Record<string, string>} opts.playerToTeamId
 * @returns {Array<{ name: string, team: string, gp: number, total: number }>}
 */
export function aggregateStats({
  game_stat_values,
  player_stat_values,
  stat_definitions,
  rosters,
  games,
  players,
  rosterToTeam,
  playerToTeamId,
}) {
  const stats = [];
  const playerMap = {};
  (players || []).forEach((p) => {
    playerMap[p.id] = p;
  });

  const pointsDef = (stat_definitions || []).find((s) => s.slug === 'points');
  if (!pointsDef) return stats;

  const gameTeams = {};
  (games || []).forEach((g) => {
    gameTeams[g.id] = { home: g.home_team_id, away: g.away_team_id };
  });

  const hasGameStats = (game_stat_values || []).length > 0;

  if (hasGameStats) {
    const playerTotal = {};
    const playerGames = {};
    (game_stat_values || []).forEach((gsv) => {
      if (gsv.stat_definition_id !== pointsDef.id) return;
      const gid = gsv.game_id;
      const pid = gsv.player_id;
      const gt = gameTeams[gid];
      const pTeamId = playerToTeamId[pid];
      if (!gt || !pTeamId) return;
      if (pTeamId !== gt.home && pTeamId !== gt.away) return;
      if (!playerTotal[pid]) playerTotal[pid] = 0;
      if (!playerGames[pid]) playerGames[pid] = new Set();
      playerTotal[pid] += Number(gsv.value || 0);
      playerGames[pid].add(gid);
    });
    Object.entries(playerTotal).forEach(([pid, total]) => {
      const p = playerMap[pid];
      const gp = playerGames[pid]?.size || 0;
      if (p && gp > 0) {
        stats.push({ name: p.name, team: rosterToTeam[pid] || '', gp, total });
      }
    });
  } else {
    const psvByPlayer = {};
    (player_stat_values || [])
      .filter((psv) => psv.stat_definition_id === pointsDef.id)
      .forEach((psv) => {
        psvByPlayer[psv.player_id] = (psvByPlayer[psv.player_id] || 0) + Number(psv.value || 0);
      });
    Object.entries(psvByPlayer).forEach(([pid, total]) => {
      const p = playerMap[pid];
      if (p) {
        stats.push({ name: p.name, team: rosterToTeam[pid] || '', gp: 0, total });
      }
    });
  }

  return stats;
}
