/**
 * Unit tests for aggregateStats
 */
import { describe, it, expect } from 'vitest';
import { aggregateStats } from '../lib/stats.js';

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
    expect(p1).toEqual({ name: 'Player One', team: 'Team Alpha', gp: 2, total: 22 });
    expect(p2).toEqual({ name: 'Player Two', team: 'Team Alpha', gp: 1, total: 8 });
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
    expect(stats[0]).toEqual({ name: 'Solo', team: 'Team X', gp: 0, total: 100 });
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
