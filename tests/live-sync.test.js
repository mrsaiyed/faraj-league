/**
 * Unit tests for public-site live refresh helpers (lib/live-sync.js)
 */
import { describe, it, expect } from 'vitest';
import { liveFingerprint, shouldRepaint, POLL_INTERVAL_MS } from '../lib/live-sync.js';

const data = (over = {}) => ({
  scores: [{ gameId: 'g1', s1: '10', s2: '8', forfeitTeamId: null }],
  gameStatValues: { g1: { p1: { d1: 10 }, p2: { d1: 8 } } },
  ...over,
});

describe('liveFingerprint', () => {
  it('is stable for unchanged data', () => {
    expect(liveFingerprint(data())).toBe(liveFingerprint(data()));
  });

  it('changes when a score changes', () => {
    const after = data({ scores: [{ gameId: 'g1', s1: '12', s2: '8', forfeitTeamId: null }] });
    expect(liveFingerprint(after)).not.toBe(liveFingerprint(data()));
  });

  it('changes when a player stat changes, even with the score the same', () => {
    const after = data({ gameStatValues: { g1: { p1: { d1: 10 }, p2: { d1: 9 } } } });
    expect(liveFingerprint(after)).not.toBe(liveFingerprint(data()));
  });

  it('changes when a game becomes unplayed', () => {
    const cleared = data({ scores: [{ gameId: 'g1', s1: '', s2: '', forfeitTeamId: null }] });
    expect(liveFingerprint(cleared)).not.toBe(liveFingerprint(data()));
  });

  it('changes when a forfeit is set', () => {
    const ff = data({ scores: [{ gameId: 'g1', s1: '10', s2: '8', forfeitTeamId: 't1' }] });
    expect(liveFingerprint(ff)).not.toBe(liveFingerprint(data()));
  });

  it('ignores the order rows come back in', () => {
    const a = { scores: [{ gameId: 'g1', s1: '1', s2: '2' }, { gameId: 'g2', s1: '3', s2: '4' }] };
    const b = { scores: [{ gameId: 'g2', s1: '3', s2: '4' }, { gameId: 'g1', s1: '1', s2: '2' }] };
    expect(liveFingerprint(a)).toBe(liveFingerprint(b));
  });

  it('ignores fields a visitor cannot see change mid-game', () => {
    expect(liveFingerprint(data({ teams: [{ id: 't1' }] }))).toBe(liveFingerprint(data()));
  });

  it('handles empty and missing input', () => {
    expect(liveFingerprint(null)).toBe('');
    expect(liveFingerprint({})).toBe('#');
  });
});

describe('shouldRepaint', () => {
  it('repaints when the fingerprint moved', () => {
    expect(shouldRepaint({ previous: 'a', next: 'b' })).toBe(true);
  });

  it('does not repaint when nothing changed', () => {
    expect(shouldRepaint({ previous: 'a', next: 'a' })).toBe(false);
  });

  it('holds off while the visitor has something open', () => {
    expect(shouldRepaint({ previous: 'a', next: 'b', busy: true })).toBe(false);
  });

  it('does not repaint before a baseline exists', () => {
    expect(shouldRepaint({ previous: '', next: 'b' })).toBe(false);
  });
});

describe('POLL_INTERVAL_MS', () => {
  it('is frequent enough to feel live but not a hammer', () => {
    expect(POLL_INTERVAL_MS).toBeGreaterThanOrEqual(5000);
    expect(POLL_INTERVAL_MS).toBeLessThanOrEqual(30000);
  });
});
