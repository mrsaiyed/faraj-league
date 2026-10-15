/**
 * Unit tests for lib/db-errors.js: the database's refusals, in plain words for the admin.
 */
import { describe, it, expect } from 'vitest';
import { friendlyDbError } from '../lib/db-errors.js';

describe('friendlyDbError', () => {
  it('explains a refused player delete', () => {
    const pg = 'update or delete on table "players" violates foreign key constraint "game_stat_values_player_fkey" on table "game_stat_values"';
    expect(friendlyDbError(pg)).toMatch(/has stats in games already played/);
  });

  it('explains a refused team delete, whichever side of a game it is on', () => {
    for (const side of ['home', 'away']) {
      const pg = `update or delete on table "teams" violates foreign key constraint "games_${side}_team_fkey" on table "games"`;
      expect(friendlyDbError(pg)).toMatch(/has games on the schedule/);
    }
  });

  it('explains unique and check refusals', () => {
    expect(friendlyDbError('duplicate key value violates unique constraint "teams_season_name_key"')).toMatch(/already a team with that name/);
    expect(friendlyDbError('duplicate key value violates unique constraint "games_one_per_slot"')).toMatch(/already has a game with that number/);
    expect(friendlyDbError('new row for relation "game_stat_values" violates check constraint "game_stat_values_not_negative"')).toBe('Stats can\'t be negative.');
  });

  it('passes anything else through as it was', () => {
    expect(friendlyDbError('Invalid or expired token')).toBe('Invalid or expired token');
    expect(friendlyDbError('violates check constraint "some_other_rule"')).toBe('violates check constraint "some_other_rule"');
    expect(friendlyDbError(undefined)).toBe('');
  });
});
