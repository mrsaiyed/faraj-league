/**
 * Unit tests for aggregateStats
 */
import { describe, it, expect } from 'vitest';
import { aggregateStats, visibleStatDefinitions, formerPlayers } from '../lib/stats.js';
import { config } from '../js/config.js';

const pointsDef = { id: 'pt1', slug: 'points', name: 'Points', sort_order: 0 };

describe('aggregateStats', () => {
  it('aggregates from game_stat_values with correct GP and total', () => {
    const players = [
      { id: 'p1', name: 'Player One', jersey_number: 1 },
      { id: 'p2', name: 'Player Two', jersey_number: 2 },
    ];
    const teams = [{ id: 't1', name: 'Team Alpha' }];
    const rosters = [
      { player_id: 'p1', team_id: 't1' },
      { player_id: 'p2', team_id: 't1' },
    ];
    const games = [
      { id: 'g1', home_team_id: 't1', away_team_id: 't2' },
      { id: 'g2', home_team_id: 't2', away_team_id: 't1' },
    ];
    const game_stat_values = [
      { game_id: 'g1', player_id: 'p1', stat_definition_id: 'pt1', value: 10 },
      { game_id: 'g1', player_id: 'p2', stat_definition_id: 'pt1', value: 8 },
      { game_id: 'g2', player_id: 'p1', stat_definition_id: 'pt1', value: 12 },
    ];
    const rosterToTeam = { p1: 'Team Alpha', p2: 'Team Alpha' };
    const playerToTeamId = { p1: 't1', p2: 't1' };

    const stats = aggregateStats({
      game_stat_values,
      player_stat_values: [],
      stat_definitions: [pointsDef],
      rosters,
      games,
      players,
      rosterToTeam,
      playerToTeamId,
    });

    expect(stats).toHaveLength(2);
    const p1 = stats.find((s) => s.name === 'Player One');
    const p2 = stats.find((s) => s.name === 'Player Two');
    expect(p1).toEqual({ name: 'Player One', team: 'Team Alpha', gp: 2, regGp: 2, total: 22, statValues: { pt1: 22 } });
    expect(p2).toEqual({ name: 'Player Two', team: 'Team Alpha', gp: 1, regGp: 1, total: 8, statValues: { pt1: 8 } });
  });

  it('falls back to player_stat_values when no game stats', () => {
    const players = [{ id: 'p1', name: 'Solo', jersey_number: 1 }];
    const rosters = [{ player_id: 'p1', team_id: 't1' }];
    const rosterToTeam = { p1: 'Team X' };
    const playerToTeamId = { p1: 't1' };
    const player_stat_values = [
      { player_id: 'p1', stat_definition_id: 'pt1', value: 100 },
    ];

    const stats = aggregateStats({
      game_stat_values: [],
      player_stat_values,
      stat_definitions: [pointsDef],
      rosters,
      games: [],
      players,
      rosterToTeam,
      playerToTeamId,
    });

    expect(stats).toHaveLength(1);
    expect(stats[0]).toEqual({ name: 'Solo', team: 'Team X', gp: 0, regGp: 0, total: 100, statValues: { pt1: 100 } });
  });

  it('excludes stats when player team not in game', () => {
    const players = [{ id: 'p1', name: 'Player', jersey_number: 1 }];
    const rosters = [{ player_id: 'p1', team_id: 't1' }];
    const games = [
      { id: 'g1', home_team_id: 't2', away_team_id: 't3' },
    ];
    const game_stat_values = [
      { game_id: 'g1', player_id: 'p1', stat_definition_id: 'pt1', value: 20 },
    ];
    const rosterToTeam = { p1: 'Team 1' };
    const playerToTeamId = { p1: 't1' };

    const stats = aggregateStats({
      game_stat_values,
      player_stat_values: [],
      stat_definitions: [pointsDef],
      rosters,
      games,
      players,
      rosterToTeam,
      playerToTeamId,
    });

    expect(stats).toHaveLength(0);
  });
});

describe('a player who leaves a team keeps what they scored for it', () => {
  // Raad: Hanny played weeks 1 and 2, then left; Ali took his place for week 3.
  const players = [{ id: 'hanny', name: 'Hanny Ali' }, { id: 'ali', name: 'Ali Mohsin' }, { id: 'mo', name: 'Mohammad Ali' }];
  const games = [
    { id: 'w1', week: 1, home_team_id: 'raad', away_team_id: 'noor' },
    { id: 'w2', week: 2, home_team_id: 'nasr', away_team_id: 'raad' },
    { id: 'w3', week: 3, home_team_id: 'raad', away_team_id: 'nasr' },
  ];
  const row = (game_id, player_id, value, team_id = 'raad') => ({ game_id, player_id, stat_definition_id: 'pt1', value, team_id });
  const game_stat_values = [row('w1', 'hanny', 6), row('w2', 'hanny', 11), row('w1', 'mo', 4), row('w3', 'mo', 9), row('w3', 'ali', 7)];
  // Hanny is on no roster now.
  const rosterToTeam = { ali: 'Raad', mo: 'Raad' };
  const playerToTeamId = { ali: 'raad', mo: 'raad' };
  const teamNames = { raad: 'Raad', noor: 'Noor', nasr: 'Nasr' };
  const run = (extra = {}) => aggregateStats({
    game_stat_values, player_stat_values: [], stat_definitions: [pointsDef], rosters: [], games, players,
    rosterToTeam, playerToTeamId, teamNames, ...extra,
  });

  it('counts every game the player played, under the team they played for', () => {
    const hanny = run().find(s => s.name === 'Hanny Ali');
    expect(hanny).toMatchObject({ team: 'Raad', gp: 2, total: 17 });
  });

  it('starts the player who took their place from their own games only', () => {
    expect(run().find(s => s.name === 'Ali Mohsin')).toMatchObject({ team: 'Raad', gp: 1, total: 7 });
  });

  it('used to drop them altogether, with no team to count the rows for', () => {
    const stripped = game_stat_values.map(({ team_id, ...r }) => r);
    expect(run({ game_stat_values: stripped }).find(s => s.name === 'Hanny Ali')).toBeUndefined();
  });

  it('lists a player now on another team under that team, with the games from both', () => {
    const moved = run({ rosterToTeam: { ...rosterToTeam, hanny: 'Noor' }, playerToTeamId: { ...playerToTeamId, hanny: 'noor' } });
    expect(moved.find(s => s.name === 'Hanny Ali')).toMatchObject({ team: 'Noor', gp: 2, total: 17 });
  });

  it('names the former players of a team, with the games they played for it', () => {
    const playerMap = Object.fromEntries(players.map(p => [p.id, p]));
    expect(formerPlayers(game_stat_values, 'raad', ['ali', 'mo'], playerMap))
      .toEqual([{ id: 'hanny', name: 'Hanny Ali', games: ['w1', 'w2'] }]);
    expect(formerPlayers(game_stat_values, 'raad', ['ali', 'mo', 'hanny'], playerMap)).toEqual([]);
    expect(formerPlayers(game_stat_values, 'noor', [], playerMap)).toEqual([]);
    expect(formerPlayers(undefined, 'raad', [], playerMap)).toEqual([]);
  });
});

describe('visibleStatDefinitions', () => {
  const defs = [
    { id: 'd-pts', slug: 'points' },
    { id: 'd-foul', slug: 'fouls' },
    { id: 'd-min', slug: 'minutes' },
  ];

  it('shows the public site only the public columns', () => {
    expect(visibleStatDefinitions(defs, ['points'])).toEqual([{ id: 'd-pts', slug: 'points' }]);
  });

  it('shows the admin every column, in order', () => {
    expect(visibleStatDefinitions(defs, ['points'], true)).toEqual(defs);
  });

  it('keeps the original order when several are public', () => {
    expect(visibleStatDefinitions(defs, ['minutes', 'points']).map(d => d.slug)).toEqual(['points', 'minutes']);
  });

  it('copes with no definitions or no public list', () => {
    expect(visibleStatDefinitions(undefined, ['points'])).toEqual([]);
    expect(visibleStatDefinitions(defs, undefined)).toEqual([]);
  });

  it('defaults the public site to points only, with the admin switching it off', () => {
    // Fouls and minutes are recorded by the admin tracker but stay off the public site.
    expect(config.PUBLIC_STAT_SLUGS).toEqual(['points']);
    expect(config.SHOW_ALL_STATS).toBe(false);
  });
});
