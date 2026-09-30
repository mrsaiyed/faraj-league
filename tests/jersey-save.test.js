/**
 * Unit tests for saving a jersey number (admin/js/jersey.js).
 * adminFetch and the Supabase client are stubbed, so no network and no DOM.
 */
import { describe, it, expect } from 'vitest';
import { saveJerseyNumber, setLoadedJersey, CLEAR_NEEDS_DEPLOY } from '../admin/js/jersey.js';

function stub({ row = { jersey_number: null }, readError = null, writeError = null } = {}) {
  const calls = [];
  const reads = [];
  const adminFetch = (fn, opts) => {
    calls.push({ fn, body: JSON.parse(opts.body) });
    return writeError ? Promise.reject(writeError) : Promise.resolve({ ok: true });
  };
  // What the database holds after the write: a function that took it, or one that did not.
  const supabase = {
    from: (table) => ({
      select: (cols) => ({
        eq: (col, id) => ({
          maybeSingle: async () => {
            reads.push({ table, cols, col, id });
            return { data: typeof row === 'function' ? row(calls.at(-1)?.body) : row, error: readError };
          },
        }),
      }),
    }),
  };
  return { calls, reads, adminFetch, supabase };
}
const took = (body) => ({ jersey_number: body.jersey_number });

describe('saveJerseyNumber', () => {
  it('posts the number to admin-players, without a team — a team would reshuffle the roster', async () => {
    const { calls, adminFetch, supabase } = stub({ row: took });
    await saveJerseyNumber({ adminFetch, supabase, playerId: 'P1', value: 23 });
    expect(calls).toEqual([{ fn: 'admin-players', body: { id: 'P1', jersey_number: 23 } }]);
    expect(calls[0].body).not.toHaveProperty('team_id');
  });

  it('sends #0 as 0, not as a clear', async () => {
    const { calls, adminFetch, supabase } = stub({ row: took });
    await saveJerseyNumber({ adminFetch, supabase, playerId: 'P1', value: 0 });
    expect(calls[0].body.jersey_number).toBe(0);
  });

  it('sends a clear as null', async () => {
    const { calls, adminFetch, supabase } = stub({ row: took });
    await saveJerseyNumber({ adminFetch, supabase, playerId: 'P1', value: null });
    expect(calls[0].body.jersey_number).toBeNull();
  });

  it('reads the player back and confirms the number is there', async () => {
    const { reads, adminFetch, supabase } = stub({ row: took });
    const result = await saveJerseyNumber({ adminFetch, supabase, playerId: 'P1', value: 7 });
    expect(result).toEqual({ value: 7, verified: true });
    expect(reads).toEqual([{ table: 'players', cols: 'jersey_number', col: 'id', id: 'P1' }]);
  });

  it('confirms #0 and a clear as well', async () => {
    const zero = stub({ row: took });
    expect(await saveJerseyNumber({ ...zero, playerId: 'P1', value: 0 })).toEqual({ value: 0, verified: true });
    const none = stub({ row: took });
    expect(await saveJerseyNumber({ ...none, playerId: 'P1', value: null })).toEqual({ value: null, verified: true });
  });

  it('throws when the database still has another number, and says which', async () => {
    const { adminFetch, supabase } = stub({ row: { jersey_number: 4 } });
    const err = await saveJerseyNumber({ adminFetch, supabase, playerId: 'P1', value: 9 }).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.stored).toBe(4);
    expect(err.message).toMatch(/still has #4/);
  });

  it('throws when the database still has nothing', async () => {
    const { adminFetch, supabase } = stub({ row: { jersey_number: null } });
    const err = await saveJerseyNumber({ adminFetch, supabase, playerId: 'P1', value: 9 }).catch(e => e);
    expect(err.stored).toBeNull();
    expect(err.message).toMatch(/no number/);
  });

  it('says a clear needs the updated function when an old one ignored the null', async () => {
    const { adminFetch, supabase } = stub({ row: { jersey_number: 12 } });
    const err = await saveJerseyNumber({ adminFetch, supabase, playerId: 'P1', value: null }).catch(e => e);
    expect(err.message).toBe(CLEAR_NEEDS_DEPLOY);
    expect(err.stored).toBe(12);
  });

  it('throws when the player is gone', async () => {
    const { adminFetch, supabase } = stub({ row: null });
    const err = await saveJerseyNumber({ adminFetch, supabase, playerId: 'P1', value: 5 }).catch(e => e);
    expect(err.message).toMatch(/no longer exists/);
  });

  it('takes the write as done when the read-back itself fails', async () => {
    const { adminFetch, supabase } = stub({ row: null, readError: { message: 'offline' } });
    expect(await saveJerseyNumber({ adminFetch, supabase, playerId: 'P1', value: 5 })).toEqual({ value: 5, verified: false });
  });

  it('takes the write as done when there is no client to read with', async () => {
    const { adminFetch } = stub();
    expect(await saveJerseyNumber({ adminFetch, playerId: 'P1', value: 5 })).toEqual({ value: 5, verified: false });
  });

  it('passes a failed request on, and never reads back after it', async () => {
    const { reads, adminFetch, supabase } = stub({ writeError: new Error('Unauthorized') });
    await expect(saveJerseyNumber({ adminFetch, supabase, playerId: 'P1', value: 5 })).rejects.toThrow('Unauthorized');
    expect(reads).toEqual([]);
  });

  it('needs a player', async () => {
    const { adminFetch, supabase } = stub();
    await expect(saveJerseyNumber({ adminFetch, supabase, playerId: '', value: 5 })).rejects.toThrow('playerId');
  });
});

describe('setLoadedJersey', () => {
  const loaded = () => ({
    DB: {
      teams: [
        { id: 'T1', roster: [{ id: 'P1', name: 'A', jersey_number: null }, { id: 'P2', name: 'B', jersey_number: 7 }] },
        { id: 'T2', roster: [{ id: 'P3', name: 'C', jersey_number: 3 }] },
      ],
      draftBank: [{ id: 'P9', name: 'Z', jersey_number: null }],
    },
  });

  it('puts the number on the player wherever the season holds them', () => {
    const config = loaded();
    setLoadedJersey(config, 'P1', 23);
    expect(config.DB.teams[0].roster[0].jersey_number).toBe(23);
    expect(config.DB.teams[0].roster[1].jersey_number).toBe(7);
    expect(config.DB.teams[1].roster[0].jersey_number).toBe(3);
  });

  it('updates the draft bank too', () => {
    const config = loaded();
    setLoadedJersey(config, 'P9', 0);
    expect(config.DB.draftBank[0].jersey_number).toBe(0);
  });

  it('clears a number with null', () => {
    const config = loaded();
    setLoadedJersey(config, 'P2', null);
    expect(config.DB.teams[0].roster[1].jersey_number).toBeNull();
  });

  it('copes with a season that has no rosters, no bank or nothing loaded', () => {
    expect(() => setLoadedJersey({ DB: {} }, 'P1', 5)).not.toThrow();
    expect(() => setLoadedJersey({}, 'P1', 5)).not.toThrow();
    expect(() => setLoadedJersey(undefined, 'P1', 5)).not.toThrow();
  });
});
