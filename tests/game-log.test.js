/**
 * Unit tests for the game log: lib/game-log.js (rows from a saved event log)
 * and js/game-log.js (their markup, shared by the public box score and the
 * admin stat sheets).
 */
import { describe, it, expect } from 'vitest';
import { gameLogRows, visibleLogTypes, periodHeading, LOG_TYPES_BY_STAT } from '../lib/game-log.js';
import { gameLogHtml } from '../js/game-log.js';

const H = 'H';
const A = 'A';
const names = { h1: 'Hamza', h2: 'Bilal', h6: 'Yusuf', h7: 'Zaid', a1: 'Omar', a2: 'Ali' };
const nameOf = (id) => names[id] || id;
const opts = { homeTeamId: H, awayTeamId: A, nameOf };

/** A short game: two lineups, baskets either side, a foul, a sub, half time. */
const events = [
  { type: 'lineup', teamId: H, playerIds: ['h1', 'h2', 'h3', 'h4', 'h5'], period: 1, clock: 1200 },
  { type: 'lineup', teamId: A, playerIds: ['a1', 'a2', 'a3', 'a4', 'a5'], period: 1, clock: 1200 },
  { type: 'score', playerId: 'h1', teamId: H, points: 2, period: 1, clock: 1150 },
  { type: 'foul', playerId: 'a1', teamId: A, period: 1, clock: 1140 },
  { type: 'score', playerId: 'a1', teamId: A, points: 3, period: 1, clock: 1100 },
  { type: 'sub', teamId: H, playerInId: 'h6', playerOutId: 'h2', period: 1, clock: 900 },
  // Refused by the tracker: h2 has already gone off. It counted for nothing.
  { type: 'sub', teamId: H, playerInId: 'h7', playerOutId: 'h2', period: 1, clock: 800 },
  // Refused too: Ali has no foul to take back.
  { type: 'unfoul', playerId: 'a2', teamId: A, period: 1, clock: 700 },
  { type: 'period', period: 2, clock: 1200 },
  { type: 'score', playerId: 'h6', teamId: H, points: 1, period: 2, clock: 1190 },
];

describe('gameLogRows', () => {
  it('heads each period and lists every play in the admin, with the score after it', () => {
    const rows = gameLogRows(events, opts);
    expect(rows.map(r => (r.kind === 'period' ? `== ${r.label}` : `${r.clock} ${r.text} ${r.home}-${r.away}`))).toEqual([
      '== First Half',
      '20:00 On the floor: Hamza, Bilal, h3, h4, h5 0-0',
      '20:00 On the floor: Omar, Ali, a3, a4, a5 0-0',
      '19:10 Hamza +2 2-0',
      '19:00 Foul — Omar 2-0',
      '18:20 Omar +3 2-3',
      '15:00 Sub: Yusuf in for Bilal 2-3',
      '== Second Half',
      '19:50 Yusuf +1 3-3',
    ]);
  });

  it('leaves out plays the tracker refused, as it did', () => {
    const texts = gameLogRows(events, opts).map(r => r.text);
    expect(texts).not.toContain('Sub: Zaid in for Bilal');
    expect(texts.some(t => /taken back/.test(t || ''))).toBe(false);
  });

  it('lists only the scoring plays on the public site', () => {
    const rows = gameLogRows(events, { ...opts, types: visibleLogTypes(['points']) });
    expect(rows.map(r => r.kind === 'period' ? r.label : r.text)).toEqual([
      'First Half', 'Hamza +2', 'Omar +3', 'Second Half', 'Yusuf +1',
    ]);
  });

  it('gives a period with nothing to list no heading', () => {
    const quietSecondHalf = [...events.slice(0, 5), { type: 'period', period: 2 }, { type: 'foul', playerId: 'h1', teamId: H }];
    const rows = gameLogRows(quietSecondHalf, { ...opts, types: visibleLogTypes(['points']) });
    expect(rows.filter(r => r.kind === 'period').map(r => r.label)).toEqual(['First Half']);
  });

  it('carries the team, the points and the running score on each play', () => {
    const play = gameLogRows(events, opts).find(r => r.text === 'Omar +3');
    expect(play).toMatchObject({ kind: 'play', type: 'score', teamId: A, points: 3, home: 2, away: 3, period: 1 });
  });

  it('heads overtime too', () => {
    const ot = [...events, { type: 'period', period: 3 }, { type: 'score', playerId: 'a1', teamId: A, points: 2, period: 3, clock: 300 }];
    expect(gameLogRows(ot, opts).filter(r => r.kind === 'period').map(r => r.label))
      .toEqual(['First Half', 'Second Half', 'Overtime']);
  });

  it('copes with an empty or missing log, and with events that have no clock', () => {
    expect(gameLogRows([], opts)).toEqual([]);
    expect(gameLogRows(undefined, opts)).toEqual([]);
    const rows = gameLogRows([{ type: 'score', playerId: 'h1', teamId: H, points: 2 }], opts);
    expect(rows[1]).toMatchObject({ text: 'Hamza +2', clock: '' });
  });
});

describe('visibleLogTypes', () => {
  it('maps the public stat columns onto the plays behind them', () => {
    expect([...visibleLogTypes(['points'])]).toEqual(['score']);
    expect([...visibleLogTypes(['points', 'fouls'])].sort()).toEqual(['foul', 'score', 'unfoul']);
  });

  it('lists everything in the admin', () => {
    expect(visibleLogTypes(['points'], true)).toBeNull();
  });

  it('ignores a column with no plays behind it', () => {
    expect([...visibleLogTypes(['rebounds'])]).toEqual([]);
  });

  it('covers every stat the tracker saves', () => {
    expect(Object.keys(LOG_TYPES_BY_STAT).sort()).toEqual(['fouls', 'minutes', 'points']);
  });
});

describe('periodHeading', () => {
  it('names halves and overtimes', () => {
    expect([1, 2, 3, 4, 5, 6].map(periodHeading))
      .toEqual(['First Half', 'Second Half', 'Overtime', 'Second Overtime', 'Third Overtime', 'Overtime 4']);
    expect(periodHeading(0)).toBe('');
    expect(periodHeading('x')).toBe('');
  });
});

describe('gameLogHtml', () => {
  const teams = { homeTeamId: H, homeName: 'Noor', awayName: 'Ansar' };

  it('draws a heading per period and a row per play', () => {
    const html = gameLogHtml(gameLogRows(events, { ...opts, types: visibleLogTypes(['points']) }), teams);
    expect(html.match(/class="game-log-period"/g)).toHaveLength(2);
    expect(html.match(/class="game-log-row/g)).toHaveLength(3);
    expect(html).toContain('>First Half<');
    expect(html).toContain('Noor – Ansar');
  });

  it('marks whose play it is, and picks out the side that scored', () => {
    const html = gameLogHtml(gameLogRows(events, { ...opts, types: visibleLogTypes(['points']) }), teams);
    expect(html).toContain('data-side="home"><span class="game-log-clock">19:10</span><span class="game-log-team">Noor</span>');
    expect(html).toContain('<span class="game-log-score"><b>2</b>–0</span>');
    expect(html).toContain('<span class="game-log-score">2–<b>3</b></span>');
  });

  it('escapes names', () => {
    const rows = gameLogRows([{ type: 'score', playerId: 'x', teamId: H, points: 2, clock: 10 }],
      { ...opts, nameOf: () => '<img src=x onerror=alert(1)>' });
    const html = gameLogHtml(rows, { ...teams, homeName: 'A&B' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; +2');
    expect(html).toContain('A&amp;B');
  });

  it('is empty with nothing to show', () => {
    expect(gameLogHtml([], teams)).toBe('');
  });
});
