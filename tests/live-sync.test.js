/**
 * Unit tests for public-site live refresh helpers (lib/live-sync.js)
 */
import { describe, it, expect } from 'vitest';
import { liveFingerprint, scoresFingerprint, shouldRepaint, SCORE_POLL_MS, FULL_POLL_MS } from '../lib/live-sync.js';

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

describe('scoresFingerprint', () => {
  const rows = [{ id: 'g1', home_score: 10, away_score: 8, forfeit_team_id: null }];

  it('is stable for unchanged scores', () => {
    expect(scoresFingerprint(rows)).toBe(scoresFingerprint([...rows]));
  });

  it('moves when a score changes', () => {
    expect(scoresFingerprint([{ ...rows[0], home_score: 12 }])).not.toBe(scoresFingerprint(rows));
  });

  it('distinguishes an unplayed game from 0-0', () => {
    const unplayed = scoresFingerprint([{ id: 'g1', home_score: null, away_score: null }]);
    const nilNil = scoresFingerprint([{ id: 'g1', home_score: 0, away_score: 0 }]);
    expect(unplayed).not.toBe(nilNil);
  });

  it('moves when a forfeit is set', () => {
    expect(scoresFingerprint([{ ...rows[0], forfeit_team_id: 't1' }])).not.toBe(scoresFingerprint(rows));
  });

  it('ignores row order', () => {
    const a = [{ id: 'g1', home_score: 1, away_score: 2 }, { id: 'g2', home_score: 3, away_score: 4 }];
    expect(scoresFingerprint(a)).toBe(scoresFingerprint([...a].reverse()));
  });

  it('handles empty and missing input', () => {
    expect(scoresFingerprint([])).toBe('');
    expect(scoresFingerprint(null)).toBe('');
  });
});

describe('poll intervals', () => {
  it('probes scores often enough to feel live', () => {
    expect(SCORE_POLL_MS).toBeGreaterThanOrEqual(2000);
    expect(SCORE_POLL_MS).toBeLessThanOrEqual(10000);
  });

  it('re-reads everything far less often, since it is the expensive one', () => {
    expect(FULL_POLL_MS).toBeGreaterThan(SCORE_POLL_MS * 4);
  });
});

describe('scoresFingerprint — shape tolerance', () => {
  // The baseline is seeded from transformed config.DB.scores, while the probe
  // reads raw games rows. If the two shapes disagreed, every probe would read
  // as a change (constant repainting) or the baseline would swallow the first
  // real one.
  it('matches between a raw games row and its transformed form', () => {
    const raw = [{ id: 'g1', home_score: 3, away_score: 2, forfeit_team_id: null }];
    const transformed = [{ gameId: 'g1', s1: '3', s2: '2', forfeitTeamId: null }];
    expect(scoresFingerprint(raw)).toBe(scoresFingerprint(transformed));
  });

  it('matches for an unplayed game in either shape', () => {
    const raw = [{ id: 'g1', home_score: null, away_score: null, forfeit_team_id: null }];
    const transformed = [{ gameId: 'g1', s1: '', s2: '', forfeitTeamId: null }];
    expect(scoresFingerprint(raw)).toBe(scoresFingerprint(transformed));
  });

  it('matches for a genuine 0-0, and differs from unplayed', () => {
    const rawZero = [{ id: 'g1', home_score: 0, away_score: 0, forfeit_team_id: null }];
    const transformedZero = [{ gameId: 'g1', s1: '0', s2: '0', forfeitTeamId: null }];
    const unplayed = [{ gameId: 'g1', s1: '', s2: '', forfeitTeamId: null }];
    expect(scoresFingerprint(rawZero)).toBe(scoresFingerprint(transformedZero));
    expect(scoresFingerprint(rawZero)).not.toBe(scoresFingerprint(unplayed));
  });

  it('matches on a forfeit in either shape', () => {
    const raw = [{ id: 'g1', home_score: 2, away_score: 0, forfeit_team_id: 't1' }];
    const transformed = [{ gameId: 'g1', s1: '2', s2: '0', forfeitTeamId: 't1' }];
    expect(scoresFingerprint(raw)).toBe(scoresFingerprint(transformed));
  });
});

describe('liveFingerprint covers everything the probe covers', () => {
  // The probe decides whether to re-read; liveFingerprint decides whether to
  // repaint. If the second is blind to something the first sees, the change is
  // fetched and then silently dropped — which is exactly what happened to
  // going live, ending a period, and the final whistle.
  const base = {
    scores: [{ gameId: 'g1', s1: '2', s2: '3', forfeitTeamId: null, status: 'live', period: 1, clock_seconds: 600, clock_running: true, clock_updated_at: '2026-09-24T18:00:00Z' }],
    gameStatValues: { g1: { p1: { d1: 2 } } },
  };
  const withScore = (over) => ({ ...base, scores: [{ ...base.scores[0], ...over }] });

  it('moves when a game goes live', () => {
    expect(liveFingerprint(withScore({ status: 'live' })))
      .not.toBe(liveFingerprint(withScore({ status: 'scheduled' })));
  });

  it('moves when a period changes', () => {
    expect(liveFingerprint(withScore({ period: 2 }))).not.toBe(liveFingerprint(base));
  });

  it('moves at half time', () => {
    expect(liveFingerprint(withScore({ status: 'halftime' }))).not.toBe(liveFingerprint(base));
  });

  it('moves on the final whistle, even with the score unchanged', () => {
    expect(liveFingerprint(withScore({ status: 'final', clock_running: false })))
      .not.toBe(liveFingerprint(base));
  });

  it('moves when the clock is paused or re-anchored', () => {
    expect(liveFingerprint(withScore({ clock_running: false }))).not.toBe(liveFingerprint(base));
    expect(liveFingerprint(withScore({ clock_updated_at: '2026-09-24T18:05:00Z' }))).not.toBe(liveFingerprint(base));
  });

  it('agrees with the probe: anything scoresFingerprint sees, this sees too', () => {
    const variants = [
      { status: 'halftime' }, { period: 3 }, { clock_seconds: 1 },
      { clock_running: false }, { s1: '9' }, { forfeitTeamId: 't1' },
    ];
    variants.forEach(v => {
      const probeMoved = scoresFingerprint(withScore(v).scores) !== scoresFingerprint(base.scores);
      const repaintMoved = liveFingerprint(withScore(v)) !== liveFingerprint(base);
      expect(repaintMoved).toBe(probeMoved);
    });
  });
});

describe('pre-migration-012 rows', () => {
  // The probe reads whatever columns the database has. Against a database that
  // has not run migration 012 there are no status/clock columns at all, and
  // live refresh must keep working on scores alone.
  const legacy = [{ id: 'g1', home_score: 10, away_score: 8, forfeit_team_id: null }];

  it('fingerprints a row with no status or clock columns', () => {
    expect(() => scoresFingerprint(legacy)).not.toThrow();
    expect(scoresFingerprint(legacy)).toBeTruthy();
  });

  it('still detects a score change without those columns', () => {
    const after = [{ ...legacy[0], home_score: 12 }];
    expect(scoresFingerprint(after)).not.toBe(scoresFingerprint(legacy));
  });

  it('is stable across repeated reads, so it does not repaint forever', () => {
    expect(scoresFingerprint(legacy)).toBe(scoresFingerprint([{ ...legacy[0] }]));
  });

  it('agrees with a transformed row that also lacks them', () => {
    const transformed = [{ gameId: 'g1', s1: '10', s2: '8', forfeitTeamId: null }];
    expect(scoresFingerprint(legacy)).toBe(scoresFingerprint(transformed));
  });
});
