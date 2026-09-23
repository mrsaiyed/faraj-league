/**
 * Unit tests for clearing a game back to "not played" (admin/js/game-reset.js).
 * adminFetch is stubbed, so no network and no DOM.
 */
import { describe, it, expect } from 'vitest';
import { clearGame } from '../admin/js/game-reset.js';

function stub() {
  const calls = [];
  const adminFetch = (fn, opts) => {
    calls.push({ fn, body: JSON.parse(opts.body) });
    return Promise.resolve({ ok: true });
  };
  return { calls, adminFetch };
}

describe('clearGame', () => {
  it('deletes the stat rows, empties DNP, then nulls the score — in that order', async () => {
    const { calls, adminFetch } = stub();
    await clearGame({ adminFetch, gameId: 'G1', rosterPlayerIds: ['p1', 'p2'] });

    expect(calls.map(c => c.fn)).toEqual(['admin-game-stats', 'admin-game-stats', 'admin-games']);
    expect(calls[0].body).toMatchObject({ game_id: 'G1', values: [], dnp_player_ids: ['p1', 'p2'] });
    expect(calls[1].body).toMatchObject({ game_id: 'G1', values: [], dnp_player_ids: [] });
    expect(calls[2].body).toEqual({ id: 'G1', home_score: null, away_score: null });
  });

  it('nulls the score rather than zeroing it — 0 still reads as played', async () => {
    const { calls, adminFetch } = stub();
    await clearGame({ adminFetch, gameId: 'G1', rosterPlayerIds: ['p1'] });
    const scoreCall = calls.find(c => c.fn === 'admin-games');
    expect(scoreCall.body.home_score).toBeNull();
    expect(scoreCall.body.away_score).toBeNull();
    expect(scoreCall.body.home_score).not.toBe(0);
  });

  it('clears any forfeit along the way', async () => {
    const { calls, adminFetch } = stub();
    await clearGame({ adminFetch, gameId: 'G1', rosterPlayerIds: ['p1'] });
    calls.filter(c => c.fn === 'admin-game-stats')
      .forEach(c => expect(c.body.forfeit_team_id).toBeNull());
  });

  it('still nulls the score when the rosters are empty', async () => {
    const { calls, adminFetch } = stub();
    await clearGame({ adminFetch, gameId: 'G1', rosterPlayerIds: [] });
    expect(calls.map(c => c.fn)).toEqual(['admin-game-stats', 'admin-games']);
    expect(calls.at(-1).body).toEqual({ id: 'G1', home_score: null, away_score: null });
  });

  it('de-duplicates and drops blank player ids', async () => {
    const { calls, adminFetch } = stub();
    await clearGame({ adminFetch, gameId: 'G1', rosterPlayerIds: ['p1', 'p1', null, '', 'p2'] });
    expect(calls[0].body.dnp_player_ids).toEqual(['p1', 'p2']);
  });

  it('refuses without a game id', async () => {
    const { adminFetch } = stub();
    await expect(clearGame({ adminFetch, gameId: null, rosterPlayerIds: [] })).rejects.toThrow('gameId is required');
  });

  it('propagates a failure instead of reporting success', async () => {
    const adminFetch = (fn) => fn === 'admin-games'
      ? Promise.reject(new Error('boom'))
      : Promise.resolve({ ok: true });
    await expect(clearGame({ adminFetch, gameId: 'G1', rosterPlayerIds: ['p1'] })).rejects.toThrow('boom');
  });
});
