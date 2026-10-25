/**
 * Unit tests for the postseason (lib/playoffs.js)
 */
import { describe, it, expect } from 'vitest';
import { postseasonWeeks, gameOutcome, playInSeeds, bracketSlots } from '../lib/playoffs.js';

// Fall 2026's regular season, best first.
const ORDER = ['Mujahideen', 'Dukhaan', 'Nasr', 'Ansar', 'Noor', 'Raad'];
const final = (game, t1, s1, t2, s2) => ({ week: 6, game, t1, s1: String(s1), t2, s2: String(s2), status: 'final' });
const pending = (game, t1, t2) => ({ week: 6, game, t1, s1: '', s2: '', t2, status: null });

describe('postseasonWeeks', () => {
  it('makes the last marked week the bracket and any earlier one the play-in', () => {
    expect(postseasonWeeks({ 6: true, 7: true })).toEqual({ bracketWeek: 7, playInWeeks: [6] });
  });
  it('a single marked week is the bracket, with no play-in (Spring 2026)', () => {
    expect(postseasonWeeks({ 8: true })).toEqual({ bracketWeek: 8, playInWeeks: [] });
  });
  it('ignores unmarked weeks and sorts numerically', () => {
    expect(postseasonWeeks({ 10: true, 9: true, 3: false })).toEqual({ bracketWeek: 10, playInWeeks: [9] });
  });
  it('no marked weeks, no postseason', () => {
    expect(postseasonWeeks({})).toEqual({ bracketWeek: null, playInWeeks: [] });
    expect(postseasonWeeks(undefined)).toEqual({ bracketWeek: null, playInWeeks: [] });
  });
});

describe('gameOutcome', () => {
  it('names the winner once the game is final', () => {
    expect(gameOutcome(final(1, 'A', 50, 'B', 40))).toEqual({ winner: 'A', loser: 'B' });
    expect(gameOutcome(final(1, 'A', 40, 'B', 50))).toEqual({ winner: 'B', loser: 'A' });
  });
  it('names nobody while the game is being played', () => {
    expect(gameOutcome({ t1: 'A', s1: '30', t2: 'B', s2: '20', status: 'live' })).toBeNull();
  });
  it('a forfeit decides it whatever the score', () => {
    expect(gameOutcome({ t1: 'A', s1: '', t2: 'B', s2: '', forfeit: 't1' })).toEqual({ winner: 'B', loser: 'A' });
  });
});

describe('playInSeeds', () => {
  it('nothing is settled before the play-in is played', () => {
    const { seeds } = playInSeeds(ORDER, [pending(1, 'Mujahideen', 'Dukhaan'), pending(2, 'Nasr', 'Raad'), pending(3, 'Ansar', 'Noor')]);
    expect(seeds).toEqual({ 1: null, 2: null, 3: null, 4: null });
  });

  it('the 1 v 2 winner is the first seed and the loser the second', () => {
    const { seeds } = playInSeeds(ORDER, [final(1, 'Mujahideen', 40, 'Dukhaan', 45)]);
    expect(seeds[1]).toBe('Dukhaan');
    expect(seeds[2]).toBe('Mujahideen');
  });

  it('the other winners are the third and fourth seeds, the better regular-season seed third', () => {
    const { seeds } = playInSeeds(ORDER, [
      final(1, 'Mujahideen', 50, 'Dukhaan', 45),
      final(2, 'Nasr', 50, 'Raad', 40),
      final(3, 'Ansar', 50, 'Noor', 40),
    ]);
    expect(seeds).toEqual({ 1: 'Mujahideen', 2: 'Dukhaan', 3: 'Nasr', 4: 'Ansar' });
  });

  it('reseeds upsets by regular-season seed: a sixth that wins can be the third', () => {
    const { seeds } = playInSeeds(ORDER, [
      final(1, 'Mujahideen', 50, 'Dukhaan', 45),
      final(2, 'Nasr', 40, 'Raad', 50),
      final(3, 'Ansar', 40, 'Noor', 50),
    ]);
    expect(seeds[3]).toBe('Noor');
    expect(seeds[4]).toBe('Raad');
  });

  it('waits for both of the other games before naming the third and fourth', () => {
    const { seeds } = playInSeeds(ORDER, [
      final(1, 'Mujahideen', 50, 'Dukhaan', 45),
      final(2, 'Nasr', 50, 'Raad', 40),
      pending(3, 'Ansar', 'Noor'),
    ]);
    expect(seeds[3]).toBeNull();
    expect(seeds[4]).toBeNull();
  });

  it('finds the top game by the teams in it, whatever game number it is', () => {
    const { seeds, topGame } = playInSeeds(ORDER, [final(3, 'Dukhaan', 50, 'Mujahideen', 45)]);
    expect(topGame.game).toBe(3);
    expect(seeds[1]).toBe('Dukhaan');
  });
});

describe('bracketSlots', () => {
  const playIn = [
    final(1, 'Mujahideen', 50, 'Dukhaan', 45),
    final(2, 'Nasr', 40, 'Raad', 50),
    final(3, 'Ansar', 50, 'Noor', 40),
  ];

  it('blank before the play-in: seeds with what decides each side', () => {
    const [s1, s2, f] = bracketSlots(ORDER, [pending(1, 'Mujahideen', 'Dukhaan')], []);
    expect(s1).toMatchObject({ game: 1, round: 'semifinal' });
    expect(s1.home).toEqual({ seed: 1, team: null, note: 'Winner of Mujahideen vs Dukhaan' });
    expect(s1.away).toEqual({ seed: 4, team: null, note: 'Play-in winner' });
    expect(s2.home).toEqual({ seed: 2, team: null, note: 'Loser of Mujahideen vs Dukhaan' });
    expect(s2.away).toEqual({ seed: 3, team: null, note: 'Play-in winner' });
    expect(f.round).toBe('final');
    expect(f.home.note).toBe('Winner of Semifinal 1');
    expect(f.away.note).toBe('Winner of Semifinal 2');
  });

  it('the first seed plays the fourth in game 1, the second the third in game 2', () => {
    const [s1, s2] = bracketSlots(ORDER, playIn, []);
    expect([s1.game, s1.home.team, s1.away.team]).toEqual([1, 'Mujahideen', 'Raad']);
    expect([s2.game, s2.home.team, s2.away.team]).toEqual([2, 'Dukhaan', 'Ansar']);
  });

  it('fills the final from the semifinals, the better seed at home', () => {
    const semis = [
      { ...final(1, 'Mujahideen', 40, 'Raad', 50), week: 7 },
      { ...final(2, 'Dukhaan', 50, 'Ansar', 40), week: 7 },
    ];
    const f = bracketSlots(ORDER, playIn, semis)[2];
    expect(f.home).toEqual({ seed: 2, team: 'Dukhaan', note: '' });
    expect(f.away).toEqual({ seed: 4, team: 'Raad', note: '' });
  });

  it('a semifinal still being played leaves its finalist open', () => {
    const semis = [{ ...final(1, 'Mujahideen', 50, 'Raad', 40), week: 7 }, { week: 7, game: 2, t1: 'Dukhaan', s1: '20', t2: 'Ansar', s2: '18', status: 'live' }];
    const f = bracketSlots(ORDER, playIn, semis)[2];
    expect(f.home.team).toBe('Mujahideen');
    expect(f.away).toEqual({ seed: null, team: null, note: 'Winner of Semifinal 2' });
  });
});
