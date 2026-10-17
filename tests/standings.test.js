/**
 * Unit tests for standings and seeding (lib/standings.js)
 */
import { describe, it, expect } from 'vitest';
import {
  calcStandings, calcSeeds, conferenceStandings, rankTeams, tiebreakerList, tiebreakerText, TIEBREAKERS, DEFAULT_TIEBREAKERS,
} from '../lib/standings.js';

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
const teamsOf = (...names) => names.map(name => ({ name, conf: 'X' }));
/** The old rule, for the tests about differential and points scored themselves. */
const PD_ONLY = ['pd', 'pf'];
const six = [
  { name: 'Jaysh', conf: 'Mecca', id: 'a' }, { name: 'Nasr', conf: 'Mecca', id: 'b' }, { name: 'Noor', conf: 'Mecca', id: 'c' },
  { name: 'Qamar', conf: 'Medina', id: 'd' }, { name: 'Raad', conf: 'Medina', id: 'e' }, { name: 'Sahab', conf: 'Medina', id: 'f' },
];
// Jaysh 2-0 (+21). Sahab, Nasr, Raad and Noor are all 1-1, at +23, +5, -4 and -27. Qamar 0-2.
// Between those four: Raad beat Nasr, Nasr beat Sahab, Sahab beat Noor — so head-to-head
// has Raad 1-0, Nasr and Sahab 1-1 (Nasr won theirs) and Noor 0-1.
const sixGames = [
  game('Jaysh', 55, 'Qamar', 40), game('Nasr', 48, 'Raad', 50), game('Noor', 30, 'Sahab', 60),
  game('Jaysh', 50, 'Raad', 44), game('Nasr', 52, 'Sahab', 45), game('Noor', 41, 'Qamar', 38),
];

describe('tiebreakers', () => {
  it('are head-to-head, then point differential, then points scored, unless the league says otherwise', () => {
    expect(DEFAULT_TIEBREAKERS).toEqual(['h2h', 'pd', 'pf']);
    expect(tiebreakerList(undefined)).toEqual(['h2h', 'pd', 'pf']);
    expect(tiebreakerList('pd')).toEqual(['h2h', 'pd', 'pf']);
  });

  it('keep the order given, each once, and only the ones there are', () => {
    expect(tiebreakerList(['pd', 'nonsense', 'h2h', 'pd'])).toEqual(['pd', 'h2h']);
    expect(tiebreakerList([])).toEqual([]);
    expect(Object.keys(TIEBREAKERS)).toEqual(['h2h', 'h2hpd', 'pd', 'pf', 'pa']);
  });

  it('are put in words', () => {
    expect(tiebreakerText(DEFAULT_TIEBREAKERS)).toBe('head-to-head record, then point differential, then points scored');
    expect(tiebreakerText(['pa'])).toBe('fewest points allowed');
    expect(tiebreakerText([])).toBe('');
  });
});

describe('rankTeams', () => {
  // C 2-0. A and B 1-1: A beat B by a point, but B has the far better differential.
  const abcd = teamsOf('A', 'B', 'C', 'D');
  const headToHeadGames = [game('A', 50, 'B', 49), game('C', 70, 'A', 40), game('B', 90, 'D', 40), game('C', 60, 'D', 50)];

  it('puts the team that won their game ahead of one level on wins, whatever the differential', () => {
    expect(rankTeams(abcd, headToHeadGames)).toEqual(['C', 'A', 'B', 'D']);
    expect(rankTeams(abcd, headToHeadGames, PD_ONLY)).toEqual(['C', 'B', 'A', 'D']);
  });

  it('goes to point differential when the two split their games', () => {
    // A won by 10, B by 1; both lost to C, A by more. A is +9 against B but -21 overall, B -14.
    const games = [game('A', 50, 'B', 40), game('B', 45, 'A', 44), game('C', 70, 'A', 40), game('C', 55, 'B', 50)];
    expect(rankTeams(teamsOf('A', 'B', 'C'), games)).toEqual(['C', 'B', 'A']);
    // Head-to-head differential, if the league uses it, says A.
    expect(rankTeams(teamsOf('A', 'B', 'C'), games, ['h2h', 'h2hpd', 'pd'])).toEqual(['C', 'A', 'B']);
  });

  it('goes to point differential when the two have not played each other', () => {
    // X and Y both beat Z: X by 10, Y by 5.
    expect(rankTeams(teamsOf('Y', 'X', 'Z'), [game('X', 50, 'Z', 40), game('Y', 70, 'Z', 65)])).toEqual(['X', 'Y', 'Z']);
  });

  it('breaks a three-way tie by head-to-head, then starts again for the two left level', () => {
    // As in Fall 2026: D beat both N1 and N2, who have not played each other.
    // X 4-0; D, N1 and N2 2-2; Y 0-4. By differential alone it would be N1, D, N2.
    const games = [
      game('D', 54, 'N1', 50), game('D', 67, 'N2', 46), game('X', 70, 'D', 40), game('X', 60, 'D', 50),
      game('N1', 60, 'Y', 40), game('N1', 50, 'Y', 45), game('X', 50, 'N1', 40),
      game('N2', 70, 'Y', 40), game('N2', 61, 'Y', 60), game('X', 60, 'N2', 30),
    ];
    const teams = teamsOf('X', 'N2', 'N1', 'D', 'Y');
    expect(rankTeams(teams, games)).toEqual(['X', 'D', 'N1', 'N2', 'Y']);
    expect(rankTeams(teams, games, PD_ONLY)).toEqual(['X', 'N1', 'D', 'N2', 'Y']);
  });

  it('when each of three beat one of the others, goes on to differential — and head-to-head settles the two still level', () => {
    // A beat B, B beat C, C beat A; all three beat E. C has the best differential,
    // A and B the same (+10), and B more points scored: A is ahead only by beating B.
    const games = [
      game('A', 50, 'B', 48), game('B', 60, 'C', 50), game('C', 70, 'A', 50),
      game('A', 78, 'E', 50), game('B', 80, 'E', 78), game('C', 55, 'E', 50),
    ];
    expect(rankTeams(teamsOf('B', 'A', 'C', 'E'), games)).toEqual(['C', 'A', 'B', 'E']);
  });

  it('leaves head-to-head out when one of the tied teams has played none of the others', () => {
    // D 2-2; A, B and C 1-1. A beat B, but C has played neither, so it is
    // differential: B +29, then A and C both 0 — and they have not met, so points scored: C 120, A 90.
    const games = [
      game('A', 50, 'B', 49), game('D', 41, 'A', 40), game('B', 60, 'D', 30),
      game('C', 70, 'D', 60), game('D', 60, 'C', 50),
    ];
    expect(rankTeams(teamsOf('A', 'B', 'C', 'D'), games)).toEqual(['D', 'B', 'C', 'A']);
  });

  it('counts a forfeit in head-to-head as it counts in the standings', () => {
    // B forfeited to A, so A is ahead of B though B's differential is better.
    const games = [{ t1: 'A', t2: 'B', s1: '', s2: '', forfeit: 't2' }, game('C', 60, 'A', 40), game('B', 50, 'C', 40), game('C', 50, 'D', 40)];
    expect(rankTeams(teamsOf('B', 'A', 'C', 'D'), games)).toEqual(['C', 'A', 'B', 'D']);
  });

  it('ranks fewest points allowed first when asked to', () => {
    const games = [game('X', 50, 'Z', 40), game('Y', 80, 'Z', 70)];
    expect(rankTeams(teamsOf('Y', 'X', 'Z'), games, ['pa'])).toEqual(['X', 'Y', 'Z']);
    expect(rankTeams(teamsOf('X', 'Y', 'Z'), games, ['pf'])).toEqual(['Y', 'X', 'Z']);
  });

  it('keeps the listed order for teams level on wins when there are no tiebreakers', () => {
    expect(rankTeams(abcd, headToHeadGames, [])).toEqual(['C', 'A', 'B', 'D']);
    expect(rankTeams(teamsOf('B', 'A', 'C', 'D'), headToHeadGames, [])).toEqual(['C', 'B', 'A', 'D']);
  });

  it('ranks wins before any tiebreaker', () => {
    // A is 2-0 by one point a game; B is 1-1 having won by 50 and lost by 1; C is 0-2.
    const games = [game('A', 41, 'C', 40), game('A', 41, 'C', 40), game('B', 90, 'C', 40), game('C', 41, 'B', 40)];
    expect(rankTeams(teamsOf('C', 'B', 'A'), games)[0]).toBe('A');
  });
});

describe('calcSeeds', () => {
  it('numbers the whole league 1 to 6, not 1 to 3 in each conference', () => {
    const seeds = calcSeeds(six, sixGames);
    // Jaysh 2-0; of the four at 1-1, Raad won its game between them, Nasr beat Sahab,
    // and Noor lost its; Qamar 0-2.
    expect(seeds).toEqual({ Jaysh: 1, Raad: 2, Nasr: 3, Sahab: 4, Noor: 5, Qamar: 6 });
    expect(Object.values(seeds).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('seeds by the tiebreakers it is given', () => {
    expect(calcSeeds(six, sixGames, PD_ONLY)).toEqual({ Jaysh: 1, Sahab: 2, Nasr: 3, Raad: 4, Noor: 5, Qamar: 6 });
  });

  it('puts a team ahead of one in the other conference when its record is better', () => {
    const seeds = calcSeeds(six, sixGames);
    expect(seeds.Raad).toBeLessThan(seeds.Nasr);       // Medina ahead of Mecca
    expect(seeds.Nasr).toBeLessThan(seeds.Sahab);      // and back again
  });

  it('breaks a tie on wins by point differential, even against more points scored', () => {
    const teams = [{ name: 'X', conf: 'M' }, { name: 'Y', conf: 'N' }, { name: 'Z', conf: 'N' }];
    // X and Y both beat Z once, and have not met: X by 10 having scored 50, Y by 5 having scored 70.
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
    expect(medina.map(r => [r.name, r.seed])).toEqual([['Raad', 2], ['Sahab', 4], ['Qamar', 6]]);
  });

  it('orders the rows by the tiebreakers it is given', () => {
    expect(conferenceStandings(six, sixGames, 'Medina', PD_ONLY).map(r => [r.name, r.seed]))
      .toEqual([['Sahab', 2], ['Raad', 4], ['Qamar', 6]]);
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
