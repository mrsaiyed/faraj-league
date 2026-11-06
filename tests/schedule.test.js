/**
 * Unit tests for timing unscheduled games (lib/schedule.js)
 */
import { describe, it, expect } from 'vitest';
import { slotStart, defaultSlotTime } from '../lib/schedule.js';

const at = (iso) => new Date(iso).toISOString();

describe('slotStart', () => {
  it('puts a game an hour after the one before it in its week', () => {
    const semis = [
      { game: 1, scheduled_at: '2026-11-07T15:00:00+00:00' },
      { game: 2, scheduled_at: '2026-11-07T16:00:00+00:00' },
    ];
    expect(slotStart(semis, 3).toISOString()).toBe(at('2026-11-07T17:00:00Z'));
  });

  it('counts an hour per slot from the nearest timed game, before or after it', () => {
    expect(slotStart([{ game: 1, scheduled_at: '2026-11-07T15:00:00Z' }], 3).toISOString()).toBe(at('2026-11-07T17:00:00Z'));
    expect(slotStart([{ game: 3, scheduled_at: '2026-11-07T17:00:00Z' }], 1).toISOString()).toBe(at('2026-11-07T15:00:00Z'));
  });

  it('prefers the earlier game when two are as near', () => {
    const games = [
      { game: 1, scheduled_at: '2026-11-07T15:00:00Z' },
      { game: 3, scheduled_at: '2026-11-07T20:00:00Z' },
    ];
    expect(slotStart(games, 2).toISOString()).toBe(at('2026-11-07T16:00:00Z'));
  });

  it('ignores games with no time, and the slot itself', () => {
    const games = [
      { game: 1, scheduled_at: null },
      { game: 2, scheduled_at: '2026-11-07T16:00:00Z' },
      { game: 3, scheduled_at: '2026-11-07T23:00:00Z' },
    ];
    expect(slotStart(games, 3).toISOString()).toBe(at('2026-11-07T17:00:00Z'));
  });

  it('with no timed game, the slot\'s usual time on the week\'s date, in local time', () => {
    const d = slotStart([], 3, '2026-11-07');
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 7, 12, 0]);
  });

  it('nothing to go on gives null', () => {
    expect(slotStart([], 1)).toBeNull();
    expect(slotStart([{ game: 1, scheduled_at: 'not a date' }], 2, '')).toBeNull();
  });
});

describe('defaultSlotTime', () => {
  it('is 10, 11 and 12 for the first three slots and 10 after', () => {
    expect([1, 2, 3, 4].map(defaultSlotTime)).toEqual(['10:00', '11:00', '12:00', '10:00']);
  });
});
