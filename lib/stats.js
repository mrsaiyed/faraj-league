/**
 * Stat aggregation — pure function for testability.
 * Aggregates all game_stat_values per player, falling back to player_stat_values.
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
 * @returns {Array<{ name: string, team: string, gp: number, total: number, statValues: Record<string, number> }>}
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
  playoffGameIds = new Set(),
}) {
  const stats = [];
  const playerMap = {};
  (players || []).forEach((p) => { playerMap[p.id] = p; });

  const gameDefs = (stat_definitions || []).filter((s) => s.scope === 'game' || s.scope == null);
  const pointsDef = (stat_definitions || []).find((s) => s.slug === 'points');

  if (gameDefs.length === 0) return stats;

  const gameTeams = {};
  (games || []).forEach((g) => { gameTeams[g.id] = { home: g.home_team_id, away: g.away_team_id }; });

  const hasGameStats = (game_stat_values || []).length > 0;

  if (hasGameStats) {
    const playerStatTotals = {};
    const playerGames = {};
    const playerRegGames = {};

    (game_stat_values || []).forEach((gsv) => {
      const gid = gsv.game_id;
      const pid = gsv.player_id;
      const gt = gameTeams[gid];
      const pTeamId = playerToTeamId[pid];
      if (!gt || !pTeamId) return;
      if (pTeamId !== gt.home && pTeamId !== gt.away) return;

      if (!playerStatTotals[pid]) playerStatTotals[pid] = {};
      if (!playerGames[pid]) playerGames[pid] = new Set();
      playerStatTotals[pid][gsv.stat_definition_id] = (playerStatTotals[pid][gsv.stat_definition_id] || 0) + Number(gsv.value || 0);
      playerGames[pid].add(gid);
      if (!playoffGameIds.has(gid)) {
        if (!playerRegGames[pid]) playerRegGames[pid] = new Set();
        playerRegGames[pid].add(gid);
      }
    });

    Object.entries(playerStatTotals).forEach(([pid, statValues]) => {
      const p = playerMap[pid];
      const gp = playerGames[pid]?.size || 0;
      const regGp = playerRegGames[pid]?.size || 0;
      if (p && gp > 0) {
        const total = pointsDef ? (statValues[pointsDef.id] || 0) : (Object.values(statValues)[0] || 0);
        stats.push({ name: p.name, team: rosterToTeam[pid] || '', gp, regGp, total, statValues });
      }
    });
  } else {
    const psvByPlayer = {};
    (player_stat_values || []).forEach((psv) => {
      if (!psvByPlayer[psv.player_id]) psvByPlayer[psv.player_id] = {};
      psvByPlayer[psv.player_id][psv.stat_definition_id] = (psvByPlayer[psv.player_id][psv.stat_definition_id] || 0) + Number(psv.value || 0);
    });

    Object.entries(psvByPlayer).forEach(([pid, statValues]) => {
      const p = playerMap[pid];
      if (p) {
        const total = pointsDef ? (statValues[pointsDef.id] || 0) : (Object.values(statValues)[0] || 0);
        stats.push({ name: p.name, team: rosterToTeam[pid] || '', gp: 0, regGp: 0, total, statValues });
      }
    });
  }

  return stats;
}

/**
 * The stat columns a page should show.
 *
 * The league records more than the public site shows: the admin's live
 * tracker saves fouls and minutes, but the public box scores and stats page
 * show only `publicSlugs` (points, for now). The admin passes `showAll` and
 * sees everything. Filtering here, at render time, rather than when the data
 * loads matters: the tracker needs every definition to know where to save.
 *
 * @param {Array<{ slug: string }>} defs
 * @param {string[]} publicSlugs
 * @param {boolean} [showAll]
 * @returns {Array<{ slug: string }>} in their original order
 */
export function visibleStatDefinitions(defs, publicSlugs, showAll = false) {
  if (showAll) return defs || [];
  const allowed = new Set(publicSlugs || []);
  return (defs || []).filter((d) => allowed.has(d?.slug));
}
