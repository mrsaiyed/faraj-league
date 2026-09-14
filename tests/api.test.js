/**
 * Unit tests for getSeasonData — season scoping of the two-pass fetch.
 * Uses a stub Supabase client so no network or DB is involved.
 */
import { describe, it, expect } from 'vitest';
import { getSeasonData } from '../lib/api.js';

/**
 * Minimal stand-in for the Supabase query builder: records the filters applied
 * per table and resolves to the rows the fixture provides for that table.
 */
function makeSupabase(tables, calls = []) {
  return {
    from(table) {
      const call = { table, eq: {}, in: {}, or: null, single: false };
      calls.push(call);
      const rowsFor = () => {
        const rows = tables[table] || [];
        return rows.filter(r => {
          for (const [col, val] of Object.entries(call.eq)) {
            if (r[col] !== val) return false;
          }
          for (const [col, vals] of Object.entries(call.in)) {
            if (!vals.includes(r[col])) return false;
          }
          return true;
        });
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: (col, val) => { call.eq[col] = val; return builder; },
        in: (col, vals) => { call.in[col] = vals; return builder; },
        or: (expr) => { call.or = expr; return builder; },
        single: () => { call.single = true; return Promise.resolve({ data: rowsFor()[0] || null, error: rowsFor().length ? null : { message: 'not found' } }); },
        maybeSingle: () => Promise.resolve({ data: rowsFor()[0] || null, error: null }),
        then: (resolve, reject) => Promise.resolve({ data: rowsFor(), error: null }).then(resolve, reject),
      };
      return builder;
    },
  };
}

/** Two seasons that share nothing but the shape of their data. */
function fixture() {
  return {
    seasons: [
      { id: 's1', slug: 'spring2026', label: 'Spring 2026', is_current: false },
      { id: 's2', slug: 'fall2026', label: 'Fall 2026', is_current: true },
    ],
    teams: [
      { id: 't1', season_id: 's1', name: 'Old Team', conference: 'Mecca' },
      { id: 't2', season_id: 's2', name: 'New Team', conference: 'Mecca' },
    ],
    players: [
      { id: 'p1', season_id: 's1', name: 'Old Player' },
      { id: 'p2', season_id: 's2', name: 'New Player' },
    ],
    rosters: [
      { player_id: 'p1', team_id: 't1', sort_order: 0 },
      { player_id: 'p2', team_id: 't2', sort_order: 0 },
    ],
    games: [
      { id: 'g1', season_id: 's1', week: 1, game_index: 1, home_team_id: 't1', away_team_id: 't1' },
      { id: 'g2', season_id: 's2', week: 1, game_index: 1, home_team_id: 't2', away_team_id: 't2' },
    ],
    game_stat_values: [
      { game_id: 'g1', player_id: 'p1', stat_definition_id: 'd1', value: 10 },
      { game_id: 'g2', player_id: 'p2', stat_definition_id: 'd1', value: 20 },
    ],
    player_stat_values: [
      { player_id: 'p1', stat_definition_id: 'd1', value: 100 },
      { player_id: 'p2', stat_definition_id: 'd1', value: 200 },
    ],
    awards: [
      { id: 'a1', season_id: 's1', week: 1, champ: 'Old Team' },
      { id: 'a2', season_id: 's2', week: 1, champ: null },
    ],
    sponsors: [
      { id: 'sp1', season_id: 's1', type: 'title', name: 'Old Sponsor' },
      { id: 'sp2', season_id: 's2', type: 'title', name: 'New Sponsor' },
    ],
    // stat_definitions are shared across seasons on purpose: every season uses
    // the same stat categories.
    stat_definitions: [{ id: 'd1', name: 'Points', slug: 'points', scope: 'game', sort_order: 0 }],
    media_items: [],
    media_slots: [],
    content_blocks: [],
  };
}

describe('getSeasonData', () => {
  it('returns only the requested season\'s teams, players, games, awards and sponsors', async () => {
    const { data, error } = await getSeasonData(makeSupabase(fixture()), 'fall2026');
    expect(error).toBe(null);
    expect(data.season.slug).toBe('fall2026');
    expect(data.teams.map(t => t.id)).toEqual(['t2']);
    expect(data.players.map(p => p.id)).toEqual(['p2']);
    expect(data.games.map(g => g.id)).toEqual(['g2']);
    expect(data.awards.map(a => a.id)).toEqual(['a2']);
    expect(data.sponsors.map(s => s.id)).toEqual(['sp2']);
  });

  it('scopes rosters to the season\'s teams rather than fetching every season', async () => {
    const calls = [];
    const { data } = await getSeasonData(makeSupabase(fixture(), calls), 'fall2026');
    expect(data.rosters).toEqual([{ player_id: 'p2', team_id: 't2', sort_order: 0 }]);
    const rosterCall = calls.find(c => c.table === 'rosters');
    expect(rosterCall.in.team_id).toEqual(['t2']);
  });

  it('scopes per-game and per-player stat values to the season', async () => {
    const { data } = await getSeasonData(makeSupabase(fixture()), 'fall2026');
    expect(data.game_stat_values.map(v => v.game_id)).toEqual(['g2']);
    expect(data.player_stat_values.map(v => v.player_id)).toEqual(['p2']);
  });

  it('shares stat definitions across seasons', async () => {
    const spring = await getSeasonData(makeSupabase(fixture()), 'spring2026');
    const fall = await getSeasonData(makeSupabase(fixture()), 'fall2026');
    expect(spring.data.stat_definitions).toEqual(fall.data.stat_definitions);
  });

  it('returns empty collections for a season with no data yet', async () => {
    const tables = fixture();
    tables.seasons.push({ id: 's3', slug: 'spring2027', label: 'Spring 2027', is_current: false });
    const { data, error } = await getSeasonData(makeSupabase(tables), 'spring2027');
    expect(error).toBe(null);
    expect(data.teams).toEqual([]);
    expect(data.players).toEqual([]);
    expect(data.rosters).toEqual([]);
    expect(data.games).toEqual([]);
    expect(data.game_stat_values).toEqual([]);
    expect(data.player_stat_values).toEqual([]);
  });

  it('errors when the slug matches no season', async () => {
    const { data, error } = await getSeasonData(makeSupabase(fixture()), 'winter2030');
    expect(data).toBe(null);
    expect(error).toBeTruthy();
  });
});
