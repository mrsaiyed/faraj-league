/**
 * Unit tests for the live game tracker engine (lib/game-tracker.js)
 */
import { describe, it, expect } from 'vitest';
import {
  deriveState, appendEvent, undo, redo, canUndo, canRedo,
  toStatValues, missingStatSlugs, describeEvent, formatClock,
  LINEUP_SIZE, DEFAULT_PERIOD_SECONDS,
} from '../lib/game-tracker.js';

const CFG = { homeTeamId: 'H', awayTeamId: 'A' };
const lineup = (teamId, ids) => ({ type: 'lineup', teamId, playerIds: ids });
const score = (playerId, points, teamId = 'H') => ({ type: 'score', playerId, teamId, points });
const all = (events) => deriveState(events, events.length, CFG);

describe('deriveState — scoring', () => {
  it('adds points to the player and their team', () => {
    const s = all([score('p1', 3), score('p1', 2), score('p2', 1, 'A')]);
    expect(s.players.p1).toMatchObject({ pts: 5, fg3: 1, fg2: 1, fg1: 0 });
    expect(s.players.p2).toMatchObject({ pts: 1, fg1: 1 });
    expect(s.teams.H.score).toBe(5);
    expect(s.teams.A.score).toBe(1);
  });

  it('counts each basket type separately', () => {
    const s = all([score('p1', 1), score('p1', 1), score('p1', 2), score('p1', 3)]);
    expect(s.players.p1).toMatchObject({ pts: 7, fg1: 2, fg2: 1, fg3: 1 });
  });

  it('skips a malformed basket instead of throwing', () => {
    const s = all([score('p1', 4), score(null, 2), score('p1', 2)]);
    expect(s.teams.H.score).toBe(2);
    expect(s.warnings).toHaveLength(2);
  });

  it('starts every team at zero', () => {
    const s = all([]);
    expect(s.teams.H.score).toBe(0);
    expect(s.teams.A.score).toBe(0);
  });
});

describe('deriveState — fouls and counting stats', () => {
  it('tallies player and team fouls together', () => {
    const s = all([{ type: 'foul', playerId: 'p1', teamId: 'H' }, { type: 'foul', playerId: 'p2', teamId: 'H' }]);
    expect(s.players.p1.foul).toBe(1);
    expect(s.teams.H.fouls).toBe(2);
  });

  it('records rebounds, assists, steals, blocks and turnovers', () => {
    const s = all(['reb', 'ast', 'stl', 'blk', 'to'].map(stat => ({ type: 'stat', playerId: 'p1', stat })));
    expect(s.players.p1).toMatchObject({ reb: 1, ast: 1, stl: 1, blk: 1, to: 1 });
  });

  it('rejects an unknown stat key', () => {
    const s = all([{ type: 'stat', playerId: 'p1', stat: 'dunks' }]);
    expect(s.warnings[0]).toMatch(/unknown stat/);
  });
});

describe('deriveState — lineups and substitutions', () => {
  const five = ['a', 'b', 'c', 'd', 'e'];

  it('sets the starting five', () => {
    expect(all([lineup('H', five)]).teams.H.onCourt).toEqual(five);
  });

  it('caps a lineup at five and drops duplicates', () => {
    const s = all([lineup('H', ['a', 'a', 'b', 'c', 'd', 'e', 'f'])]);
    expect(s.teams.H.onCourt).toHaveLength(LINEUP_SIZE);
    expect(new Set(s.teams.H.onCourt).size).toBe(LINEUP_SIZE);
  });

  it('swaps the incoming player into the outgoing slot, keeping position', () => {
    const s = all([lineup('H', five), { type: 'sub', teamId: 'H', playerInId: 'z', playerOutId: 'c' }]);
    expect(s.teams.H.onCourt).toEqual(['a', 'b', 'z', 'd', 'e']);
  });

  it('refuses to sub out someone who is not on court', () => {
    const s = all([lineup('H', five), { type: 'sub', teamId: 'H', playerInId: 'z', playerOutId: 'q' }]);
    expect(s.teams.H.onCourt).toEqual(five);
    expect(s.warnings[0]).toMatch(/not on court/);
  });

  it('refuses to sub in someone already on court', () => {
    const s = all([lineup('H', five), { type: 'sub', teamId: 'H', playerInId: 'a', playerOutId: 'c' }]);
    expect(s.teams.H.onCourt).toEqual(five);
    expect(s.warnings[0]).toMatch(/already on court/);
  });

  it('credits court time to the player coming off', () => {
    const s = all([lineup('H', five), { type: 'sub', teamId: 'H', playerInId: 'z', playerOutId: 'c', secondsPlayed: 300 }]);
    expect(s.players.c.secondsPlayed).toBe(300);
  });

  it('keeps the two teams independent', () => {
    const s = all([lineup('H', five), lineup('A', ['v', 'w', 'x', 'y', 'z'])]);
    expect(s.teams.H.onCourt).toEqual(five);
    expect(s.teams.A.onCourt).toEqual(['v', 'w', 'x', 'y', 'z']);
  });
});

describe('undo / redo', () => {
  const events = [score('p1', 2), score('p1', 3), { type: 'foul', playerId: 'p1', teamId: 'H' }];

  it('undo rewinds the derived score', () => {
    expect(deriveState(events, 3, CFG).teams.H.score).toBe(5);
    expect(deriveState(events, undo(3), CFG).teams.H.score).toBe(5);
    expect(deriveState(events, undo(undo(3)), CFG).teams.H.score).toBe(2);
    expect(deriveState(events, 0, CFG).teams.H.score).toBe(0);
  });

  it('redo replays forward again', () => {
    expect(deriveState(events, redo(events, 1), CFG).teams.H.score).toBe(5);
  });

  it('never moves past either end', () => {
    expect(undo(0)).toBe(0);
    expect(redo(events, 3)).toBe(3);
  });

  it('reports what is available', () => {
    expect(canUndo(0)).toBe(false);
    expect(canUndo(1)).toBe(true);
    expect(canRedo(events, 3)).toBe(false);
    expect(canRedo(events, 2)).toBe(true);
  });

  it('acting after an undo discards the redo tail', () => {
    const next = appendEvent(events, 1, score('p9', 1));
    expect(next.events).toHaveLength(2);
    expect(next.cursor).toBe(2);
    expect(canRedo(next.events, next.cursor)).toBe(false);
    expect(deriveState(next.events, next.cursor, CFG).teams.H.score).toBe(3);
  });

  it('appendEvent does not mutate the original log', () => {
    const before = [...events];
    appendEvent(events, 1, score('p9', 1));
    expect(events).toEqual(before);
  });

  it('treats a cursor beyond the log as the whole log', () => {
    expect(deriveState(events, 99, CFG).teams.H.score).toBe(5);
  });
});

describe('toStatValues', () => {
  const defs = [
    { id: 'd-pts', slug: 'points' },
    { id: 'd-foul', slug: 'fouls' },
    { id: 'd-reb', slug: 'rebounds' },
  ];

  it('maps totals onto the defined stat columns', () => {
    const s = all([score('p1', 2), { type: 'foul', playerId: 'p1', teamId: 'H' }, { type: 'stat', playerId: 'p1', stat: 'reb' }]);
    const rows = toStatValues(s.players, defs);
    expect(rows).toContainEqual({ player_id: 'p1', stat_definition_id: 'd-pts', value: 2 });
    expect(rows).toContainEqual({ player_id: 'p1', stat_definition_id: 'd-foul', value: 1 });
    expect(rows).toContainEqual({ player_id: 'p1', stat_definition_id: 'd-reb', value: 1 });
  });

  it('skips stats the league has not defined', () => {
    const rows = toStatValues(all([{ type: 'stat', playerId: 'p1', stat: 'stl' }]).players, defs);
    expect(rows.every(r => r.stat_definition_id !== undefined)).toBe(true);
    expect(rows).toHaveLength(3);
  });

  it('returns nothing when no stats are defined', () => {
    expect(toStatValues(all([score('p1', 2)]).players, [])).toEqual([]);
  });

  it('writes explicit zeros so a corrected stat is cleared server-side', () => {
    const rows = toStatValues(all([score('p1', 2)]).players, defs);
    expect(rows).toContainEqual({ player_id: 'p1', stat_definition_id: 'd-foul', value: 0 });
  });
});

describe('missingStatSlugs', () => {
  it('names the columns that still need creating', () => {
    expect(missingStatSlugs([{ slug: 'points' }])).toEqual(
      ['fouls', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers']);
  });

  it('is empty once everything exists', () => {
    const defs = ['points', 'fouls', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers'].map(slug => ({ slug }));
    expect(missingStatSlugs(defs)).toEqual([]);
  });
});

describe('describeEvent', () => {
  const nameOf = (id) => ({ p1: 'Raza', p2: 'Ali' }[id] || id);

  it('describes each event type for the play log', () => {
    expect(describeEvent(score('p1', 3), nameOf)).toBe('Raza +3');
    expect(describeEvent({ type: 'foul', playerId: 'p1' }, nameOf)).toBe('Foul — Raza');
    expect(describeEvent({ type: 'stat', playerId: 'p2', stat: 'reb' }, nameOf)).toBe('Rebound — Ali');
    expect(describeEvent({ type: 'sub', playerInId: 'p2', playerOutId: 'p1' }, nameOf)).toBe('Sub: Ali in for Raza');
  });

  it('survives a missing event', () => {
    expect(describeEvent(null)).toBe('');
  });
});

describe('formatClock', () => {
  it('formats a half and its edges', () => {
    expect(formatClock(DEFAULT_PERIOD_SECONDS)).toBe('20:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});
