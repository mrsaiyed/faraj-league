import { describe, it, expect } from 'vitest';
import {
  parseTimestamp, formatTimestamp, parseKeepRanges, keptSeconds, toSourceTime,
  concatScript, parseGameTitle, findGame, buildRosters, compareBoxScores,
} from '../lib/hooper.js';

describe('parseTimestamp / formatTimestamp', () => {
  it('reads seconds, m:ss and h:mm:ss', () => {
    expect(parseTimestamp('45')).toBe(45);
    expect(parseTimestamp('12:30')).toBe(750);
    expect(parseTimestamp('1:02:03')).toBe(3723);
    expect(parseTimestamp(' 0:05 ')).toBe(5);
  });

  it('refuses anything a clock would not print', () => {
    for (const bad of ['', 'abc', '1:60', '1:2:3:4', '-5', '1::2']) {
      expect(parseTimestamp(bad)).toBeNaN();
    }
  });

  it('formats with hours only when there are some', () => {
    expect(formatTimestamp(95)).toBe('1:35');
    expect(formatTimestamp(3725)).toBe('1:02:05');
    expect(formatTimestamp(0)).toBe('0:00');
  });
});

describe('parseKeepRanges', () => {
  it('parses the stretches in order', () => {
    expect(parseKeepRanges('1:12-24:30, 31:05-55:40')).toEqual([
      { start: 72, end: 1470 }, { start: 1865, end: 3340 },
    ]);
    expect(keptSeconds(parseKeepRanges('1:12-24:30,31:05-55:40'))).toBe(1398 + 1475);
  });

  it('refuses empty, malformed, reversed and overlapping ranges', () => {
    expect(() => parseKeepRanges('')).toThrow(/No ranges/);
    expect(() => parseKeepRanges('1:00')).toThrow(/not a range/);
    expect(() => parseKeepRanges('1:00-2:00-3:00')).toThrow(/not a range/);
    expect(() => parseKeepRanges('5:00-4:00')).toThrow(/ends before/);
    expect(() => parseKeepRanges('1:00-5:00,4:00-6:00')).toThrow(/overlaps/);
    expect(() => parseKeepRanges('10:00-12:00,1:00-2:00')).toThrow(/overlaps or comes before/);
  });
});

describe('toSourceTime', () => {
  const ranges = [{ start: 60, end: 120 }, { start: 300, end: 400 }];

  it('maps a moment in the cut video back to the source', () => {
    expect(toSourceTime(0, ranges)).toBe(60);
    expect(toSourceTime(59, ranges)).toBe(119);
    expect(toSourceTime(60, ranges)).toBe(300); // the first second of the second stretch
    expect(toSourceTime(110, ranges)).toBe(350);
  });

  it('leaves the time alone when nothing was cut', () => {
    expect(toSourceTime(42, null)).toBe(42);
    expect(toSourceTime(42, [])).toBe(42);
  });
});

describe('concatScript', () => {
  it('lists each stretch of the one file', () => {
    expect(concatScript('/v/game.mp4', [{ start: 60, end: 120 }, { start: 300, end: 400 }])).toBe(
      "file '/v/game.mp4'\ninpoint 60\noutpoint 120\nfile '/v/game.mp4'\ninpoint 300\noutpoint 400\n",
    );
  });

  it('quotes a path with an apostrophe', () => {
    expect(concatScript("/v/it's.mp4", [{ start: 0, end: 1 }])).toContain("file '/v/it'\\''s.mp4'");
  });
});

describe('parseGameTitle / findGame', () => {
  const teams = [
    { id: 't-ansar', name: 'Ansar' }, { id: 't-nasr', name: 'Nasr' },
    { id: 't-raad', name: 'Raad' }, { id: 't-noor', name: 'Noor' },
  ];
  const games = [
    { id: 'g1', home_team_id: 't-nasr', away_team_id: 't-ansar', scheduled_at: '2026-10-10T16:00:00Z' },
    { id: 'g2', home_team_id: 't-noor', away_team_id: 't-raad', scheduled_at: '2026-10-10T15:00:00Z' },
    { id: 'g3', home_team_id: 't-ansar', away_team_id: 't-nasr', scheduled_at: '2026-10-24T16:00:00Z' },
  ];

  it('reads the channel’s titles', () => {
    expect(parseGameTitle('Ansar vs Nasr 10/10')).toEqual({ teams: ['Ansar', 'Nasr'], month: 10, day: 10 });
    expect(parseGameTitle('Mujahideen vs. Dukhaan 9/26 (full game)')).toEqual({ teams: ['Mujahideen', 'Dukhaan'], month: 9, day: 26 });
    expect(parseGameTitle('Week 3 recap')).toBeNull();
  });

  it('finds the game whichever way round the title names the teams', () => {
    expect(findGame(games, teams, parseGameTitle('Ansar vs Nasr 10/10'))?.id).toBe('g1');
    expect(findGame(games, teams, parseGameTitle('Raad vs Noor 10/10'))?.id).toBe('g2');
    expect(findGame(games, teams, parseGameTitle('ansar vs nasr 10/24'))?.id).toBe('g3');
  });

  it('finds the game when another season has teams of the same names', () => {
    const spring = [{ id: 's-ansar', name: 'Ansar' }, { id: 's-nasr', name: 'Nasr' }];
    const springGame = { id: 'g0', home_team_id: 's-ansar', away_team_id: 's-nasr', scheduled_at: '2026-04-11T16:00:00Z' };
    const all = [...spring, ...teams];
    expect(findGame([springGame, ...games], all, parseGameTitle('Ansar vs Nasr 10/10'))?.id).toBe('g1');
    expect(findGame([springGame, ...games], all, parseGameTitle('Ansar vs Nasr 4/11'))?.id).toBe('g0');
  });

  it('finds nothing for an unknown team, another day, or no title', () => {
    expect(findGame(games, teams, parseGameTitle('Ansar vs Qamar 10/10'))).toBeNull();
    expect(findGame(games, teams, parseGameTitle('Ansar vs Nasr 10/11'))).toBeNull();
    expect(findGame(games, teams, null)).toBeNull();
  });
});

describe('buildRosters', () => {
  const home = { id: 't-home', name: 'Ansar' };
  const away = { id: 't-away', name: 'Nasr' };

  it('sends home as recording and away as opponent, with our ids', () => {
    const { rosters, skipped } = buildRosters(home, away, {
      't-home': [{ id: 'p1', name: 'Ali', jersey_number: 0 }, { id: 'p2', name: 'Omar', jersey_number: 23 }],
      't-away': [{ id: 'p3', name: 'Zaid', jersey_number: 7 }],
    });
    expect(skipped).toEqual([]);
    expect(rosters.recording).toEqual({
      name: 'Ansar', metadata: { team_id: 't-home' },
      players: [
        { jersey: '0', name: 'Ali', metadata: { player_id: 'p1' } },
        { jersey: '23', name: 'Omar', metadata: { player_id: 'p2' } },
      ],
    });
    expect(rosters.opponent.players).toEqual([{ jersey: '7', name: 'Zaid', metadata: { player_id: 'p3' } }]);
  });

  it('leaves out players with no number and teammates sharing one, and says why', () => {
    const { rosters, skipped } = buildRosters(home, away, {
      't-home': [
        { id: 'p1', name: 'Ali', jersey_number: 5 },
        { id: 'p2', name: 'Omar', jersey_number: 5 },
        { id: 'p3', name: 'Bilal', jersey_number: null },
        { id: 'p4', name: 'Hamza', jersey_number: 11 },
      ],
      't-away': [{ id: 'p5', name: 'Zaid', jersey_number: 5 }], // the other team may share it
    });
    expect(rosters.recording.players.map(p => p.name)).toEqual(['Hamza']);
    expect(rosters.opponent.players.map(p => p.name)).toEqual(['Zaid']);
    expect(skipped).toEqual([
      { team: 'Ansar', name: 'Ali', reason: 'shares #5 with a teammate' },
      { team: 'Ansar', name: 'Omar', reason: 'shares #5 with a teammate' },
      { team: 'Ansar', name: 'Bilal', reason: 'no jersey number' },
    ]);
  });

  it('drops a side with nobody to name, and sends no rosters when neither has anyone', () => {
    const one = buildRosters(home, away, { 't-home': [{ id: 'p1', name: 'Ali', jersey_number: 3 }] });
    expect(Object.keys(one.rosters)).toEqual(['recording']);
    expect(buildRosters(home, away, {}).rosters).toBeNull();
  });
});

describe('compareBoxScores', () => {
  const ours = [
    { id: 'p1', name: 'Ali', jersey_number: 3, teamName: 'Ansar' },
    { id: 'p2', name: 'Omar', jersey_number: 23, teamName: 'Ansar' },
    { id: 'p3', name: 'Zaid', jersey_number: null, teamName: 'Nasr' },
  ];

  it('puts Hooper’s points next to the tracker’s, adding up a split player', () => {
    const hooper = [
      { id: 'plr_1', jersey: '3', metadata: { player_id: 'p1' }, stats: { points: 8 } },
      { id: 'plr_2', jersey: '3', metadata: { player_id: 'p1' }, stats: { points: 4 } },
      { id: 'plr_3', jersey: '41', team_name: 'Nasr', metadata: {}, stats: { points: 6 } },
      { id: 'plr_4', jersey: null, name: 'Player 4', team_name: null, metadata: {}, stats: { points: 2 } },
    ];
    const { rows, unnamed } = compareBoxScores(hooper, ours, { p1: 14, p2: 9 });
    expect(rows).toEqual([
      { name: 'Ali', team: 'Ansar', jersey: 3, ours: 14, hooper: 12 },
      { name: 'Omar', team: 'Ansar', jersey: 23, ours: 9, hooper: null },
      { name: 'Zaid', team: 'Nasr', jersey: null, ours: 0, hooper: null },
    ]);
    expect(unnamed).toEqual([
      { label: '#41', team: 'Nasr', hooper: 6 },
      { label: 'Player 4', team: '?', hooper: 2 },
    ]);
  });
});
