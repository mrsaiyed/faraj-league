/**
 * Unit tests for saving game logs (admin/js/game-log-store.js): the save and
 * delete requests, and uploading logs a device still holds. adminFetch,
 * Supabase and localStorage are stubbed, so no network and no DOM.
 */
import { describe, it, expect } from 'vitest';
import {
  trackerStorageKey, effectiveEvents, logMatchesScore, saveGameLog, deleteGameLog, uploadStoredGameLogs,
} from '../admin/js/game-log-store.js';

const score = (playerId, teamId, points) => ({ type: 'score', playerId, teamId, points });
/** Home 'H' 3, away 'A' 2. */
const fullLog = [score('h1', 'H', 2), score('a1', 'A', 2), score('h1', 'H', 1)];
const game = (id, extra = {}) => ({ gameId: id, t1Id: 'H', t2Id: 'A', s1: 3, s2: 2, status: 'final', ...extra });
const teams = [
  { id: 'H', roster: [{ id: 'h1', name: 'Hamza' }] },
  { id: 'A', roster: [{ id: 'a1', name: 'Omar' }] },
];

function fetchStub({ fail } = {}) {
  const calls = [];
  const adminFetch = (fn, opts) => {
    calls.push({ fn, body: JSON.parse(opts.body) });
    return fail ? Promise.reject(new Error(fail)) : Promise.resolve({ ok: true });
  };
  return { calls, adminFetch };
}

/** localStorage stand-in holding tracker sessions by game id. */
const storageWith = (sessions) => ({
  getItem: (key) => {
    const id = Object.keys(sessions).find(g => trackerStorageKey(g) === key);
    return id ? JSON.stringify(sessions[id]) : null;
  },
});

/** Supabase stand-in for `from('game_logs').select(...).in(...)`. */
function supabaseWith(rows, { error } = {}) {
  const asked = [];
  return {
    asked,
    from: (table) => ({
      select: () => ({
        in: (col, ids) => {
          asked.push({ table, col, ids });
          return Promise.resolve(error ? { data: null, error } : { data: rows.filter(r => ids.includes(r.game_id)), error: null });
        },
      }),
    }),
  };
}

describe('effectiveEvents', () => {
  it('keeps the events up to the undo cursor, not the undone ones', () => {
    expect(effectiveEvents({ events: [1, 2, 3, 4], cursor: 2 })).toEqual([1, 2]);
  });

  it('takes the whole list when there is no cursor, and nothing from a bad session', () => {
    expect(effectiveEvents({ events: [1, 2] })).toEqual([1, 2]);
    expect(effectiveEvents(null)).toEqual([]);
    expect(effectiveEvents({ events: 'nope', cursor: 3 })).toEqual([]);
  });
});

describe('logMatchesScore', () => {
  it('is true when the log replays to the recorded score', () => {
    expect(logMatchesScore(fullLog, game('G1'))).toBe(true);
  });

  it('is false for a partial log, an unplayed game or an empty one', () => {
    expect(logMatchesScore(fullLog.slice(0, 2), game('G1'))).toBe(false);
    expect(logMatchesScore(fullLog, game('G1', { s1: '', s2: '' }))).toBe(false);
    expect(logMatchesScore([], game('G1', { s1: 0, s2: 0 }))).toBe(false);
  });
});

describe('saveGameLog / deleteGameLog', () => {
  it('sends the whole log with a name snapshot', async () => {
    const { calls, adminFetch } = fetchStub();
    await saveGameLog({ adminFetch, gameId: 'G1', events: fullLog, names: { h1: 'Hamza' } });
    expect(calls).toEqual([{ fn: 'admin-game-log', body: { game_id: 'G1', events: fullLog, names: { h1: 'Hamza' } } }]);
  });

  it('asks for a delete', async () => {
    const { calls, adminFetch } = fetchStub();
    await deleteGameLog({ adminFetch, gameId: 'G1' });
    expect(calls).toEqual([{ fn: 'admin-game-log', body: { game_id: 'G1', delete: true } }]);
  });

  it('refuses without a game id', async () => {
    const { adminFetch } = fetchStub();
    await expect(saveGameLog({ adminFetch, gameId: '', events: [] })).rejects.toThrow('gameId is required');
    await expect(deleteGameLog({ adminFetch })).rejects.toThrow('gameId is required');
  });
});

describe('uploadStoredGameLogs', () => {
  it('uploads a complete log this device holds for a final game with none saved', async () => {
    const { calls, adminFetch } = fetchStub();
    const res = await uploadStoredGameLogs({
      adminFetch, supabase: supabaseWith([]), games: [game('G1')], teams,
      storage: storageWith({ G1: { events: fullLog, cursor: 3 } }),
    });
    expect(res).toEqual({ uploaded: 1, errors: [] });
    expect(calls).toEqual([{ fn: 'admin-game-log', body: { game_id: 'G1', events: fullLog, names: { h1: 'Hamza', a1: 'Omar' } } }]);
  });

  it('leaves alone games that are not final, have no log here, or whose log does not match the score', async () => {
    const { calls, adminFetch } = fetchStub();
    const supabase = supabaseWith([]);
    const res = await uploadStoredGameLogs({
      adminFetch, supabase, teams,
      games: [game('LIVE', { status: 'live' }), game('NOLOG'), game('PARTIAL'), game('UNDONE')],
      storage: storageWith({
        LIVE: { events: fullLog, cursor: 3 },
        PARTIAL: { events: fullLog.slice(0, 2), cursor: 2 },
        // The last basket was undone, so this log no longer gives 3–2.
        UNDONE: { events: fullLog, cursor: 2 },
      }),
    });
    expect(res).toEqual({ uploaded: 0, errors: [] });
    expect(calls).toEqual([]);
    expect(supabase.asked).toEqual([]);   // nothing worth asking about
  });

  it('never replaces a saved log that already matches the score', async () => {
    const { calls, adminFetch } = fetchStub();
    const res = await uploadStoredGameLogs({
      adminFetch, teams, games: [game('G1')],
      supabase: supabaseWith([{ game_id: 'G1', log: { events: fullLog } }]),
      storage: storageWith({ G1: { events: fullLog, cursor: 3 } }),
    });
    expect(res.uploaded).toBe(0);
    expect(calls).toEqual([]);
  });

  it('replaces a saved log that stopped short, such as one sent at half time', async () => {
    const { calls, adminFetch } = fetchStub();
    const res = await uploadStoredGameLogs({
      adminFetch, teams, games: [game('G1')],
      supabase: supabaseWith([{ game_id: 'G1', log: { events: fullLog.slice(0, 1) } }]),
      storage: storageWith({ G1: { events: fullLog, cursor: 3 } }),
    });
    expect(res.uploaded).toBe(1);
    expect(calls[0].body.events).toEqual(fullLog);
  });

  it('does nothing when the database cannot be read (no migration 013 yet)', async () => {
    const { calls, adminFetch } = fetchStub();
    const res = await uploadStoredGameLogs({
      adminFetch, teams, games: [game('G1')],
      supabase: supabaseWith([], { error: { message: 'relation "game_logs" does not exist' } }),
      storage: storageWith({ G1: { events: fullLog, cursor: 3 } }),
    });
    expect(res).toEqual({ uploaded: 0, errors: ['relation "game_logs" does not exist'] });
    expect(calls).toEqual([]);
  });

  it('reports a failed upload rather than claiming it', async () => {
    const { adminFetch } = fetchStub({ fail: 'Request failed: 404' });
    const res = await uploadStoredGameLogs({
      adminFetch, teams, games: [game('G1')], supabase: supabaseWith([]),
      storage: storageWith({ G1: { events: fullLog, cursor: 3 } }),
    });
    expect(res).toEqual({ uploaded: 0, errors: ['Request failed: 404'] });
  });

  it('skips a session it cannot read', async () => {
    const { calls, adminFetch } = fetchStub();
    const res = await uploadStoredGameLogs({
      adminFetch, teams, games: [game('G1')], supabase: supabaseWith([]),
      storage: { getItem: () => '{not json' },
    });
    expect(res.uploaded).toBe(0);
    expect(calls).toEqual([]);
  });
});
