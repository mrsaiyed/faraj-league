/**
 * Unit tests for game status and the live clock (lib/game-clock.js)
 */
import { describe, it, expect } from 'vitest';
import {
  gameStatus, isInProgress, isFinal, displayClockSeconds,
  periodLabel, formatClock, statusLine, GAME_STATUS,
} from '../lib/game-clock.js';

describe('gameStatus', () => {
  it('reads an explicit status', () => {
    expect(gameStatus({ status: 'live' })).toBe(GAME_STATUS.LIVE);
    expect(gameStatus({ status: 'halftime' })).toBe(GAME_STATUS.HALFTIME);
    expect(gameStatus({ status: 'final' })).toBe(GAME_STATUS.FINAL);
  });

  it('does not call a live game final just because one team leads', () => {
    expect(isFinal({ status: 'live', s1: '20', s2: '8' })).toBe(false);
  });

  // Everything recorded before migration 012 has no status. Past seasons must
  // keep showing their results.
  it('treats a scored game with no status as final', () => {
    expect(gameStatus({ s1: '50', s2: '40' })).toBe(GAME_STATUS.FINAL);
  });

  it('treats a forfeit with no status as final', () => {
    expect(gameStatus({ s1: '', s2: '', forfeit: 't1' })).toBe(GAME_STATUS.FINAL);
  });

  it('treats an unscored game with no status as scheduled', () => {
    expect(gameStatus({ s1: '', s2: '' })).toBe(GAME_STATUS.SCHEDULED);
    expect(gameStatus({})).toBe(GAME_STATUS.SCHEDULED);
  });

  it('counts a genuine 0-0 final as final', () => {
    expect(gameStatus({ s1: '0', s2: '0' })).toBe(GAME_STATUS.FINAL);
  });

  it('ignores an unrecognised status rather than trusting it', () => {
    expect(gameStatus({ status: 'nonsense', s1: '10', s2: '8' })).toBe(GAME_STATUS.FINAL);
  });
});

describe('isInProgress / isFinal', () => {
  it('covers live and halftime', () => {
    expect(isInProgress({ status: 'live' })).toBe(true);
    expect(isInProgress({ status: 'halftime' })).toBe(true);
  });

  it('excludes scheduled and final', () => {
    expect(isInProgress({ status: 'final' })).toBe(false);
    expect(isInProgress({ s1: '', s2: '' })).toBe(false);
    expect(isFinal({ status: 'final' })).toBe(true);
  });
});

describe('displayClockSeconds', () => {
  const T = Date.parse('2026-09-24T18:00:00Z');

  it('returns the stored value when the clock is stopped', () => {
    expect(displayClockSeconds({ clock_seconds: 600, clock_running: false }, T + 60000)).toBe(600);
  });

  it('counts down from the anchor while running', () => {
    const g = { clock_seconds: 600, clock_running: true, clock_updated_at: new Date(T).toISOString() };
    expect(displayClockSeconds(g, T)).toBe(600);
    expect(displayClockSeconds(g, T + 30000)).toBe(570);
    expect(displayClockSeconds(g, T + 600000)).toBe(0);
  });

  it('never goes below zero however long ago the anchor was', () => {
    const g = { clock_seconds: 60, clock_running: true, clock_updated_at: new Date(T).toISOString() };
    expect(displayClockSeconds(g, T + 86400000)).toBe(0);
  });

  it('does not run backwards if a device clock is behind the server', () => {
    const g = { clock_seconds: 600, clock_running: true, clock_updated_at: new Date(T).toISOString() };
    expect(displayClockSeconds(g, T - 30000)).toBe(600);
  });

  it('falls back to the stored value when the anchor is missing or unparseable', () => {
    expect(displayClockSeconds({ clock_seconds: 300, clock_running: true }, T)).toBe(300);
    expect(displayClockSeconds({ clock_seconds: 300, clock_running: true, clock_updated_at: 'nope' }, T)).toBe(300);
  });

  it('returns zero when there is no clock at all', () => {
    expect(displayClockSeconds({}, T)).toBe(0);
    expect(displayClockSeconds(null, T)).toBe(0);
  });
});

describe('periodLabel', () => {
  it('labels halves and overtime', () => {
    expect(periodLabel(1)).toBe('H1');
    expect(periodLabel(2)).toBe('H2');
    expect(periodLabel(3)).toBe('OT');
    expect(periodLabel(4)).toBe('OT2');
  });

  it('is empty for a missing period', () => {
    expect(periodLabel(null)).toBe('');
    expect(periodLabel(0)).toBe('');
  });
});

describe('formatClock', () => {
  it('formats mm:ss and clamps', () => {
    expect(formatClock(1200)).toBe('20:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('statusLine', () => {
  const T = Date.parse('2026-09-24T18:00:00Z');

  it('shows the period and a ticking clock while live', () => {
    const g = { status: 'live', period: 1, clock_seconds: 754, clock_running: true, clock_updated_at: new Date(T).toISOString() };
    expect(statusLine(g, T)).toBe('H1 12:34');
    expect(statusLine(g, T + 10000)).toBe('H1 12:24');
  });

  it('says Half time at the break', () => {
    expect(statusLine({ status: 'halftime', period: 1, clock_seconds: 0 }, T)).toBe('Half time');
  });

  it('shows the second half clock', () => {
    expect(statusLine({ status: 'live', period: 2, clock_seconds: 600, clock_running: false }, T)).toBe('H2 10:00');
  });

  it('says nothing for a final or scheduled game — the card shows those itself', () => {
    expect(statusLine({ status: 'final', s1: '50', s2: '40' }, T)).toBe('');
    expect(statusLine({ s1: '', s2: '' }, T)).toBe('');
  });
});
