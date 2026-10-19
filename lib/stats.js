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
 * @param {Record<string, string>} [opts.teamNames] team id → name, for a player on no roster now
 * @returns {Array<{ name: string, team: string, gp: number, total: number, statValues: Record<string, number> }>}
 *
 * Each game row counts for the team it was recorded for (`team_id`, set when
 * the row was written — migration 015), not the player's team now, so a player
 * who has left a team, or been replaced on it, keeps every point they scored
 * for it. A row without a team (written before 015) falls back to the roster.
 * A player on no roster now is listed under the team of their latest game.
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
  teamNames = {},
  playoffGameIds = new Set(),
}) {
  const stats = [];
  const playerMap = {};
  (players || []).forEach((p) => { playerMap[p.id] = p; });

  const gameDefs = (stat_definitions || []).filter((s) => s.scope === 'game' || s.scope == null);
  const pointsDef = (stat_definitions || []).find((s) => s.slug === 'points');

  if (gameDefs.length === 0) return stats;

  const gameTeams = {};
  (games || []).forEach((g) => { gameTeams[g.id] = { home: g.home_team_id, away: g.away_team_id, week: Number(g.week) || 0 }; });

  const hasGameStats = (game_stat_values || []).length > 0;

  if (hasGameStats) {
    const playerStatTotals = {};
    const playerGames = {};
    const playerRegGames = {};
    /** The team of each player's latest game: what to list a player on no roster under. */
    const lastTeam = {};

    (game_stat_values || []).forEach((gsv) => {
      const gid = gsv.game_id;
      const pid = gsv.player_id;
      const gt = gameTeams[gid];
      const pTeamId = gsv.team_id || playerToTeamId[pid];
      if (!gt || !pTeamId) return;
      if (pTeamId !== gt.home && pTeamId !== gt.away) return;
      if (!lastTeam[pid] || gt.week >= lastTeam[pid].week) lastTeam[pid] = { week: gt.week, team: pTeamId };

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
        const team = rosterToTeam[pid] || teamNames[lastTeam[pid]?.team] || '';
        stats.push({ name: p.name, team, gp, regGp, total, statValues });
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

/**
 * Players who played for a team this season and are no longer on its roster —
 * released, or replaced mid-season — with the games they played for it. Their
 * rows keep the team they were recorded for (`team_id`), so box scores list
 * them under it for those games, whatever the roster says now.
 *
 * @param {Array<{ game_id: string, player_id: string, team_id?: string }>} rows the season's game_stat_values
 * @param {string} teamId
 * @param {Iterable<string>} rosterIds the team's current roster
 * @param {Record<string, { name: string }>} playerMap
 * @returns {Array<{ id: string, name: string, games: string[] }>} in the order they first appear
 */
export function formerPlayers(rows, teamId, rosterIds, playerMap) {
  const onRoster = new Set(rosterIds || []);
  const games = new Map();
  (rows || []).forEach((r) => {
    if (r?.team_id !== teamId || onRoster.has(r.player_id) || !playerMap?.[r.player_id]) return;
    if (!games.has(r.player_id)) games.set(r.player_id, new Set());
    games.get(r.player_id).add(r.game_id);
  });
  return [...games].map(([id, ids]) => ({ id, name: playerMap[id].name, games: [...ids] }));
}
