/**
 * Unit tests for standings and seeding (lib/standings.js)
 */
import { describe, it, expect } from 'vitest';
import { calcStandings, calcSeeds, compareRecords, conferenceStandings } from '../lib/standings.js';

describe('calcStandings', () => {
  it('computes W/L and PF/PA for two teams each winning one game', () => {
    const teams = [
      { name: 'Team A', conf: 'Mecca', id: 'a1' },
      { name: 'Team B', conf: 'Mecca', id: 'b1' },
    ];
    const scores = [
      { t1: 'Team A', t2: 'Team B', s1: '50', s2: '40' },
      { t1: 'Team B', t2: 'Team A', s1: '55', s2: '45' },
    ];
    const rec = calcStandings(teams, scores);
    expect(rec['Team A']).toEqual({ w: 1, l: 1, pf: 95, pa: 95, conf: 'Mecca', id: 'a1' });
    expect(rec['Team B']).toEqual({ w: 1, l: 1, pf: 95, pa: 95, conf: 'Mecca', id: 'b1' });
  });

  it('handles tie game (same score) — both get a loss in typical basketball rules', () => {
    const teams = [
      { name: 'Team X', conf: 'Medina', id: 'x1' },
      { name: 'Team Y', conf: 'Medina', id: 'y1' },
    ];
    const scores = [
      { t1: 'Team X', t2: 'Team Y', s1: '50', s2: '50' },
    ];
    const rec = calcStandings(teams, scores);
    expect(rec['Team X']).toEqual({ w: 0, l: 1, pf: 50, pa: 50, conf: 'Medina', id: 'x1' });
    expect(rec['Team Y']).toEqual({ w: 1, l: 0, pf: 50, pa: 50, conf: 'Medina', id: 'y1' });
  });

  it('team with no games has 0-0, 0 PF, 0 PA', () => {
    const teams = [
      { name: 'Solo', conf: 'Mecca', id: 's1' },
    ];
    const scores = [];
    const rec = calcStandings(teams, scores);
    expect(rec['Solo']).toEqual({ w: 0, l: 0, pf: 0, pa: 0, conf: 'Mecca', id: 's1' });
  });

  it('ignores games with missing scores', () => {
    const teams = [
      { name: 'A', conf: 'X', id: '1' },
      { name: 'B', conf: 'X', id: '2' },
    ];
    const scores = [
      { t1: 'A', t2: 'B', s1: '', s2: '40' },
      { t1: 'A', t2: 'B', s1: '50', s2: '40' },
    ];
    const rec = calcStandings(teams, scores);
    expect(rec['A'].w).toBe(1);
    expect(rec['A'].pf).toBe(50);
    expect(rec['B'].l).toBe(1);
  });
});

// --- league-wide seeding -----------------------------------------------------

const game = (t1, s1, t2, s2) => ({ t1, t2, s1: String(s1), s2: String(s2) });
const six = [
  { name: 'Jaysh', conf: 'Mecca', id: 'a' }, { name: 'Nasr', conf: 'Mecca', id: 'b' }, { name: 'Noor', conf: 'Mecca', id: 'c' },
  { name: 'Qamar', conf: 'Medina', id: 'd' }, { name: 'Raad', conf: 'Medina', id: 'e' }, { name: 'Sahab', conf: 'Medina', id: 'f' },
];
// Jaysh 2-0 (+21). Sahab, Nasr, Raad and Noor are all 1-1, at +23, +5, -4 and -27. Qamar 0-2.
const sixGames = [
  game('Jaysh', 55, 'Qamar', 40), game('Nasr', 48, 'Raad', 50), game('Noor', 30, 'Sahab', 60),
  game('Jaysh', 50, 'Raad', 44), game('Nasr', 52, 'Sahab', 45), game('Noor', 41, 'Qamar', 38),
];

describe('compareRecords', () => {
  it('ranks more wins first, whatever the rest says', () => {
    expect(compareRecords({ w: 2, pf: 10, pa: 90 }, { w: 1, pf: 90, pa: 10 })).toBeLessThan(0);
    expect(compareRecords({ w: 1, pf: 90, pa: 10 }, { w: 2, pf: 10, pa: 90 })).toBeGreaterThan(0);
  });

  it('ranks the better point differential first when wins are level', () => {
    expect(compareRecords({ w: 1, pf: 50, pa: 40 }, { w: 1, pf: 70, pa: 65 })).toBeLessThan(0);
  });

  it('ranks more points for first when wins and differential are level', () => {
    expect(compareRecords({ w: 1, pf: 70, pa: 60 }, { w: 1, pf: 50, pa: 40 })).toBeLessThan(0);
  });

  it('is 0 when level on all three', () => {
    expect(compareRecords({ w: 1, pf: 50, pa: 40 }, { w: 1, pf: 50, pa: 40 })).toBe(0);
  });

  it('counts a missing record as 0-0', () => {
    expect(compareRecords(undefined, undefined)).toBe(0);
    expect(compareRecords({ w: 1, pf: 5, pa: 3 }, undefined)).toBeLessThan(0);
  });
});

describe('calcSeeds', () => {
  it('numbers the whole league 1 to 6, not 1 to 3 in each conference', () => {
    const seeds = calcSeeds(six, sixGames);
    expect(seeds).toEqual({ Jaysh: 1, Sahab: 2, Nasr: 3, Raad: 4, Noor: 5, Qamar: 6 });
    expect(Object.values(seeds).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('puts a team ahead of one in the other conference when its record is better', () => {
    const seeds = calcSeeds(six, sixGames);
    expect(seeds.Sahab).toBeLessThan(seeds.Nasr);      // Medina ahead of Mecca
    expect(seeds.Nasr).toBeLessThan(seeds.Raad);       // and back again
  });

  it('ranks wins before point differential', () => {
    const teams = [{ name: 'A', conf: 'X' }, { name: 'B', conf: 'X' }, { name: 'C', conf: 'Y' }];
    // A is 2-0 by one point a game; B is 1-1 having won by 50 and lost by 1; C is 0-2.
    const seeds = calcSeeds(teams, [game('A', 41, 'C', 40), game('A', 41, 'C', 40), game('B', 90, 'C', 40), game('C', 41, 'B', 40)]);
    expect(seeds.A).toBe(1);
  });

  it('breaks a tie on wins by point differential first, even against more points scored', () => {
    const teams = [{ name: 'X', conf: 'M' }, { name: 'Y', conf: 'N' }, { name: 'Z', conf: 'N' }];
    // X and Y both beat Z once: X by 10 having scored 50, Y by 5 having scored 70.
    const seeds = calcSeeds(teams, [game('X', 50, 'Z', 40), game('Y', 70, 'Z', 65)]);
    expect(seeds).toEqual({ X: 1, Y: 2, Z: 3 });
  });

  it('breaks a tie on wins and differential by points for', () => {
    const teams = [{ name: 'X', conf: 'M' }, { name: 'Y', conf: 'N' }, { name: 'Z', conf: 'N' }];
    // Both beat Z by 10; Y scored 70 to X's 50.
    const seeds = calcSeeds(teams, [game('X', 50, 'Z', 40), game('Y', 70, 'Z', 60)]);
    expect(seeds).toEqual({ Y: 1, X: 2, Z: 3 });
  });

  it('keeps the listed order for teams level on wins, differential and points for', () => {
    const scores = [game('X', 50, 'Z', 40), game('Y', 50, 'Z', 40)];
    const xy = [{ name: 'X', conf: 'M' }, { name: 'Y', conf: 'N' }, { name: 'Z', conf: 'N' }];
    const yx = [{ name: 'Y', conf: 'N' }, { name: 'X', conf: 'M' }, { name: 'Z', conf: 'N' }];
    expect(calcSeeds(xy, scores)).toEqual({ X: 1, Y: 2, Z: 3 });
    expect(calcSeeds(yx, scores)).toEqual({ X: 2, Y: 1, Z: 3 });
  });

  it('ranks teams that have not played yet after the ones that have won', () => {
    const teams = [{ name: 'A', conf: 'M' }, { name: 'B', conf: 'M' }, { name: 'Idle', conf: 'N' }, { name: 'Idle2', conf: 'N' }];
    const seeds = calcSeeds(teams, [game('A', 50, 'B', 40)]);
    expect(seeds).toEqual({ A: 1, Idle: 2, Idle2: 3, B: 4 });   // B lost; the idle teams are 0-0
  });

  it('counts a forfeit as a win for the other team, with the score still in PF/PA', () => {
    const teams = [{ name: 'A', conf: 'M' }, { name: 'B', conf: 'N' }];
    const seeds = calcSeeds(teams, [{ ...game('A', 50, 'B', 40), forfeit: 't1' }]);   // A scored more but forfeited
    expect(seeds).toEqual({ B: 1, A: 2 });
  });

  it('ranks a team with no conference in the same pool', () => {
    const teams = [{ name: 'A', conf: 'M' }, { name: 'Loose', conf: undefined }, { name: 'B', conf: 'N' }];
    const seeds = calcSeeds(teams, [game('Loose', 50, 'A', 40), game('Loose', 50, 'B', 40)]);
    expect(seeds).toEqual({ Loose: 1, A: 2, B: 3 });
  });

  it('is TBD for every team until a game has been scored', () => {
    const tbd = { Jaysh: 'TBD', Nasr: 'TBD', Noor: 'TBD', Qamar: 'TBD', Raad: 'TBD', Sahab: 'TBD' };
    expect(calcSeeds(six, [])).toEqual(tbd);
    expect(calcSeeds(six, undefined)).toEqual(tbd);
    expect(calcSeeds(six, [{ t1: 'Jaysh', t2: 'Qamar', s1: '', s2: '' }])).toEqual(tbd);
  });

  it('handles no teams', () => {
    expect(calcSeeds([], sixGames)).toEqual({});
    expect(calcSeeds(undefined, sixGames)).toEqual({});
  });
});

describe('conferenceStandings', () => {
  it('keeps each conference its own table, carrying league-wide seeds in seed order', () => {
    const mecca = conferenceStandings(six, sixGames, 'Mecca');
    const medina = conferenceStandings(six, sixGames, 'Medina');
    expect(mecca.map(r => [r.name, r.seed])).toEqual([['Jaysh', 1], ['Nasr', 3], ['Noor', 5]]);
    expect(medina.map(r => [r.name, r.seed])).toEqual([['Sahab', 2], ['Raad', 4], ['Qamar', 6]]);
  });

  it('puts the rows in seed order, not the order the teams are listed in', () => {
    const reversed = [...six].reverse();
    expect(conferenceStandings(reversed, sixGames, 'Mecca').map(r => r.name)).toEqual(['Jaysh', 'Nasr', 'Noor']);
  });

  it('carries each team\'s record, points and id', () => {
    const nasr = conferenceStandings(six, sixGames, 'Mecca').find(r => r.name === 'Nasr');
    expect(nasr).toMatchObject({ id: 'b', w: 1, l: 1, pf: 100, pa: 95, seed: 3 });
  });

  it('has a null seed for every row until a game has been scored, in listed order', () => {
    const rows = conferenceStandings(six, [], 'Medina');
    expect(rows.map(r => [r.name, r.seed])).toEqual([['Qamar', null], ['Raad', null], ['Sahab', null]]);
    expect(rows[0]).toMatchObject({ w: 0, l: 0, pf: 0, pa: 0 });
  });

  it('has no rows for a conference nobody is in', () => {
    expect(conferenceStandings(six, sixGames, 'Nowhere')).toEqual([]);
    expect(conferenceStandings(undefined, sixGames, 'Mecca')).toEqual([]);
  });

  it('uses every conference\'s seeds from the same ranking: together they are 1 to 6, once each', () => {
    const all = [...conferenceStandings(six, sixGames, 'Mecca'), ...conferenceStandings(six, sixGames, 'Medina')];
    expect(all.map(r => r.seed).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
