/**
 * Unit tests for the champions trophy data and layout (lib/trophy.js)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isChampionSet, cardLines, buildChampionCards, slotForIndex, layoutCard,
  TROPHY_CAPACITY, SLOTS_PER_FACE, CARD_ASPECT, CARD_TRACKING,
} from '../lib/trophy.js';

// Roster in draft order, captain included, as the database holds it.
const JAYSH_ROSTER = ['Saif Ghori', 'Adil Abbas', 'Imran Kader', 'Zaki Rizvi', 'Mohammad Zaidi', 'Qasim Syed', 'Kumail Naqvi'];

describe('isChampionSet', () => {
  it('treats the site\'s placeholders as no champion', () => {
    ['', null, undefined, '—', ' — ', 'Season in progress', 'Spring 2026 — In Progress'].forEach(v => {
      expect(isChampionSet(v), String(v)).toBe(false);
    });
  });
  it('accepts a team name', () => {
    expect(isChampionSet('Jaysh')).toBe(true);
  });
});

describe('cardLines', () => {
  it('reproduces the card engraved on the real trophy, line for line', () => {
    expect(cardLines({ team: 'Jaysh', season: 'Spring 2026', captain: 'Saif Ghori', players: JAYSH_ROSTER })).toEqual([
      'Jaysh Spring 2026',
      'Captain: Saif Ghori',
      'Adil Abbas Imran Kader',
      'Zaki Rizvi Mohammad Zaidi',
      'Qasim Syed Kumail Naqvi',
    ]);
  });

  it('leaves the captain out of the pairs wherever he sits in the roster', () => {
    const lines = cardLines({ team: 'T', season: 'S', captain: 'saif ghori ', players: ['A B', 'Saif Ghori', 'C D'] });
    expect(lines).toEqual(['T S', 'Captain: saif ghori', 'A B C D']);
  });

  it('puts an odd player out on a line of his own', () => {
    expect(cardLines({ team: 'T', season: 'S', captain: 'X', players: ['A', 'B', 'C'] }).slice(2)).toEqual(['A B', 'C']);
  });

  it('skips the captain line when there is no captain', () => {
    expect(cardLines({ team: 'T', season: 'S', players: ['A', 'B'] })).toEqual(['T S', 'A B']);
  });
});

describe('buildChampionCards', () => {
  const seasons = [
    { id: 's2', label: 'Fall 2026', created_at: '2026-08-01T00:00:00Z' },
    { id: 's1', label: 'Spring 2026', created_at: '2026-01-01T00:00:00Z' },
  ];
  const players = JAYSH_ROSTER.map((name, i) => ({ id: `p${i}`, name }));
  const teams = [
    { id: 't1', season_id: 's1', name: 'Jaysh', captain: 'Saif Ghori' },
    // Same name, next season, different roster — must not be mixed in.
    { id: 't9', season_id: 's2', name: 'Jaysh', captain: 'Someone Else' },
  ];
  // Stored out of order; sort_order is draft order.
  const rosters = players.map((p, i) => ({ team_id: 't1', player_id: p.id, sort_order: i })).reverse();

  it('builds the Spring 2026 card from the database rows', () => {
    const cards = buildChampionCards({ seasons, awards: [{ season_id: 's1', week: 9, champ: 'jaysh' }], teams, rosters, players });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ seasonId: 's1', team: 'Jaysh', season: 'Spring 2026', captain: 'Saif Ghori' });
    expect(cards[0].lines[2]).toBe('Adil Abbas Imran Kader');
    expect(cards[0].players).not.toContain('Saif Ghori');
  });

  it('ignores a season still in progress', () => {
    const awards = [
      { season_id: 's1', week: 9, champ: 'Jaysh' },
      { season_id: 's2', week: 1, champ: 'Fall 2026 — In Progress' },
    ];
    expect(buildChampionCards({ seasons, awards, teams, rosters, players }).map(c => c.seasonId)).toEqual(['s1']);
  });

  it('decides the champion like the rest of the site: first row with a value, by week', () => {
    const awards = [
      { season_id: 's1', week: 9, champ: 'Jaysh' },
      { season_id: 's1', week: 2, champ: 'Season in progress' },
    ];
    expect(buildChampionCards({ seasons, awards, teams, rosters, players })).toEqual([]);
  });

  it('orders champions oldest season first', () => {
    const awards = [
      { season_id: 's2', week: 1, champ: 'Jaysh' },
      { season_id: 's1', week: 1, champ: 'Jaysh' },
    ];
    const cards = buildChampionCards({ seasons, awards, teams, rosters, players });
    expect(cards.map(c => c.season)).toEqual(['Spring 2026', 'Fall 2026']);
    expect(cards[1].captain).toBe('Someone Else');
  });

  it('still makes a card when the team row is missing', () => {
    const cards = buildChampionCards({ seasons, awards: [{ season_id: 's1', week: 1, champ: 'Ghost' }], teams: [], rosters: [], players: [] });
    expect(cards[0].lines).toEqual(['Ghost Spring 2026']);
  });

  it('drops awards for seasons it does not know', () => {
    expect(buildChampionCards({ seasons, awards: [{ season_id: 'nope', week: 1, champ: 'X' }] })).toEqual([]);
  });
});

describe('slotForIndex', () => {
  it('fills the front first, left to right then down, like the real trophy', () => {
    expect(slotForIndex(0)).toEqual({ face: 'front', faceIndex: 0, row: 0, col: 0 });
    expect(slotForIndex(1)).toEqual({ face: 'front', faceIndex: 0, row: 0, col: 1 });
    expect(slotForIndex(5)).toEqual({ face: 'front', faceIndex: 0, row: 2, col: 1 });
  });
  it('then the right side, the back and the left', () => {
    expect(slotForIndex(SLOTS_PER_FACE).face).toBe('right');
    expect(slotForIndex(2 * SLOTS_PER_FACE).face).toBe('back');
    expect(slotForIndex(TROPHY_CAPACITY - 1)).toEqual({ face: 'left', faceIndex: 3, row: 2, col: 1 });
  });
  it('returns null once the trophy is full', () => {
    expect(slotForIndex(TROPHY_CAPACITY)).toBeNull();
    expect(slotForIndex(-1)).toBeNull();
  });
});

describe('layoutCard', () => {
  const narrow = () => 1; // every line comfortably fits

  it('uses the real card\'s proportions for five lines', () => {
    // Measured off a photo of the real plate.
    const l = layoutCard(['a', 'b', 'c', 'd', 'e'], narrow);
    expect(l.fontSize).toBeCloseTo(0.164, 3);
    expect(l.lineHeight).toBeCloseTo(0.179, 3);
    expect(l.top).toBeCloseTo((1 - 5 * 0.179) / 2, 3);
  });

  it('shrinks a bigger roster into the same block', () => {
    const l = layoutCard(Array(7).fill('x'), narrow);
    expect(7 * l.lineHeight).toBeLessThanOrEqual(0.8951);
    expect(l.fontSize).toBeLessThan(0.164);
  });

  it('shrinks to fit a line too long for the plate, tracking included', () => {
    const long = 'a very long line indeed';
    const l = layoutCard(['short', long], t => t.length * 0.8);
    expect(l.fontSize).toBeLessThan(0.164);          // it really did have to shrink
    const width = (long.length * 0.8 + CARD_TRACKING * (long.length - 1)) * l.fontSize;
    expect(width).toBeCloseTo(CARD_ASPECT * 0.9, 9);
  });

  it('centres the block vertically', () => {
    const l = layoutCard(['a', 'b', 'c'], narrow);
    expect(l.top + 3 * l.lineHeight / 2).toBeCloseTo(0.5, 6);
  });
});

describe('the trophy on two pages', () => {
  const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
  const sections = [...html.matchAll(/<section class="trophy-scroll" id="([^"]+)"[\s\S]*?<\/section>/g)];

  it('appears at the bottom of home and the top of awards', () => {
    expect(sections.map(m => m[1])).toEqual(['home-trophy-scroll', 'trophy-scroll']);
    const home = html.slice(html.indexOf('<div id="page-home"'), html.indexOf('<div id="page-standings"'));
    // Last thing on the home page: nothing but the footer after it.
    const end = home.indexOf('</section>', home.indexOf('id="home-trophy-scroll"')) + '</section>'.length;
    expect(home.slice(end).trim()).toMatch(/^<footer>[\s\S]*<\/footer>\s*<\/div>$/);
    // First thing on the awards page.
    const awards = html.slice(html.indexOf('<div id="page-awards"')).replace(/^<div[^>]*>\s*/, '');
    expect(awards.startsWith('<section class="trophy-scroll" id="trophy-scroll"')).toBe(true);
  });

  it('is the same markup in both places, apart from its id', () => {
    const [home, awards] = sections.map(m => m[0].replace(/ id="[^"]+"/, ''));
    expect(home).toBe(awards);
  });
});
