/**
 * Unit tests for the league's game rules (lib/game-rules.js) and saving them
 * from the admin (admin/js/league-rules.js, against stubbed adminFetch and Supabase).
 */
import { describe, it, expect } from 'vitest';
import {
  gameRules, timeoutsLeft, timeoutRuleText, timeoutRuleShort, carryText, sameRules, withGameTimeouts, ruleProblems,
  seasonRules, splitRules, DEFAULT_GAME_RULES, MAX_TIMEOUTS, SEASON_RULES,
} from '../lib/game-rules.js';
import { deriveState } from '../lib/game-tracker.js';
import {
  saveGameRules, rulesHint, readRulesForm, standingsPreview, RULES_KEY, RULES_NEED_DEPLOY,
} from '../admin/js/league-rules.js';

const CFG = { homeTeamId: 'H', awayTeamId: 'A' };
const timeout = (teamId) => ({ type: 'timeout', teamId });
const period = (n) => ({ type: 'period', period: n });
const at = (events) => deriveState(events, events.length, CFG);

/** Every rule, as `gameRules` gives them with nothing set. */
const DEFAULTS = {
  timeouts: 3, timeoutsPer: 'game', overtimeTimeouts: 0,
  tiebreakers: ['h2h', 'pd', 'pf'],
  bonusFouls: 7, doubleBonusFouls: 10, foulOutFouls: 5,
  halfMinutes: 20, overtimeMinutes: 5,
};

describe('gameRules', () => {
  it('is three timeouts a game, head-to-head first, the bonus at 7, 20-minute halves, when nothing is set', () => {
    expect(gameRules(undefined)).toEqual(DEFAULTS);
    expect(gameRules('')).toEqual(DEFAULT_GAME_RULES);
    expect(gameRules(null)).toEqual(DEFAULT_GAME_RULES);
  });

  it('reads the stored JSON text, or an object', () => {
    const r = {
      timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1, tiebreakers: ['pd'],
      bonusFouls: 5, doubleBonusFouls: 0, foulOutFouls: 6, halfMinutes: 18, overtimeMinutes: 3,
    };
    expect(gameRules(JSON.stringify(r))).toEqual(r);
    expect(gameRules(r)).toEqual(r);
  });

  it('gives a block saved before a rule existed that rule\'s default', () => {
    expect(gameRules('{"timeouts":2,"timeoutsPer":"half","overtimeTimeouts":1}'))
      .toEqual({ ...DEFAULTS, timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1 });
  });

  it('takes the default for anything damaged or out of range, field by field', () => {
    expect(gameRules('{not json')).toEqual(DEFAULT_GAME_RULES);
    expect(gameRules({ timeouts: -1, timeoutsPer: 'quarter', overtimeTimeouts: 2 }))
      .toEqual({ ...DEFAULTS, overtimeTimeouts: 2 });
    expect(gameRules({ timeouts: 2.5 }).timeouts).toBe(3);
    expect(gameRules({ timeouts: MAX_TIMEOUTS + 1 }).timeouts).toBe(3);
    expect(gameRules({ timeouts: 0 }).timeouts).toBe(0);
    expect(gameRules({ timeouts: '4' }).timeouts).toBe(4);
    expect(gameRules({ halfMinutes: 0, foulOutFouls: 0, bonusFouls: 0 })).toMatchObject({ halfMinutes: 20, foulOutFouls: 5, bonusFouls: 7 });
    expect(gameRules({ doubleBonusFouls: 0 }).doubleBonusFouls).toBe(0);   // 0 is "no double bonus"
    expect(gameRules({ tiebreakers: ['pd', 'bogus'] }).tiebreakers).toEqual(['pd']);
    expect(gameRules({ tiebreakers: 'h2h' }).tiebreakers).toEqual(['h2h', 'pd', 'pf']);
  });

  it('names rules that contradict each other', () => {
    expect(ruleProblems(DEFAULTS)).toEqual([]);
    expect(ruleProblems({ bonusFouls: 7, doubleBonusFouls: 0 })).toEqual([]);
    expect(ruleProblems({ bonusFouls: 7, doubleBonusFouls: 7 })[0]).toMatch(/double bonus.*after the bonus/i);
  });
});

describe('seasonRules — each season keeps its own tiebreakers', () => {
  const row = (value, season_id = null) => ({ key: 'game_rules', value: JSON.stringify(value), season_id });
  const spring = { id: 'S1', slug: 'spring2026' };
  const fall = { id: 'S2', slug: 'fall2026' };
  const later = { id: 'S3', slug: 'spring2027' };

  it('has Spring 2026 on point differential and Fall 2026 on head-to-head, with nothing stored', () => {
    expect(seasonRules([], spring).tiebreakers).toEqual(['pd', 'pf']);
    expect(seasonRules([], fall).tiebreakers).toEqual(['h2h', 'pd', 'pf']);
    expect(SEASON_RULES.spring2026.tiebreakers).toEqual(['pd', 'pf']);
  });

  it('gives a new season head-to-head first, or the league row\'s tiebreakers', () => {
    expect(seasonRules([], later).tiebreakers).toEqual(['h2h', 'pd', 'pf']);
    expect(seasonRules([row({ tiebreakers: ['pa'] })], later).tiebreakers).toEqual(['pa']);
  });

  it('lets the season\'s own row win over what it was played under', () => {
    expect(seasonRules([row({ tiebreakers: ['h2hpd'] }, 'S1')], spring).tiebreakers).toEqual(['h2hpd']);
  });

  it('takes the league\'s timeouts, fouls and clock for every season, field by field', () => {
    const rows = [row({ timeouts: 2, bonusFouls: 5, tiebreakers: ['pa'] }), row({ tiebreakers: ['pd'] }, 'S2'), row({ tiebreakers: ['pf'] }, 'S9')];
    expect(seasonRules(rows, spring)).toEqual({ ...DEFAULTS, timeouts: 2, bonusFouls: 5, tiebreakers: ['pd', 'pf'] });
    expect(seasonRules(rows, fall)).toEqual({ ...DEFAULTS, timeouts: 2, bonusFouls: 5, tiebreakers: ['pd'] });
  });

  it('reads only game_rules rows, and survives damaged ones', () => {
    const rows = [{ key: 'hero_badge', value: '{"timeouts":9}', season_id: null }, { key: 'game_rules', value: '{oops', season_id: 'S2' }];
    expect(seasonRules(rows, fall)).toEqual(DEFAULTS);
    expect(seasonRules(undefined, undefined)).toEqual(DEFAULTS);
  });

  it('splits rules into the season\'s row and the league\'s', () => {
    const { league, season } = splitRules({ ...DEFAULTS, tiebreakers: ['pd'], timeouts: 2 });
    expect(season).toEqual({ tiebreakers: ['pd'] });
    expect(league).toEqual({ ...DEFAULTS, timeouts: 2, tiebreakers: undefined });
    expect('tiebreakers' in league).toBe(false);
  });
});

describe('withGameTimeouts', () => {
  it('takes only the timeouts from a game\'s own rules, and the rest from the league\'s', () => {
    const league = { ...DEFAULTS, bonusFouls: 5, tiebreakers: ['pd'] };
    const game = withGameTimeouts(league, { timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1, bonusFouls: 9 });
    expect(game).toEqual({ ...league, timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1 });
    expect(withGameTimeouts(league, null)).toEqual(league);
  });
});

describe('timeoutsLeft — per game', () => {
  const rules = { timeouts: 3, timeoutsPer: 'game', overtimeTimeouts: 0 };

  it('counts down across both halves', () => {
    expect(timeoutsLeft(at([]), 'H', rules)).toMatchObject({ allowed: 3, used: 0, left: 3, scope: 'game' });
    const s = at([timeout('H'), period(2), timeout('H'), timeout('A')]);
    expect(timeoutsLeft(s, 'H', rules)).toMatchObject({ allowed: 3, used: 2, left: 1 });
    expect(timeoutsLeft(s, 'A', rules)).toMatchObject({ used: 1, left: 2 });
  });

  it('carries what is left into overtime, plus any overtime extra', () => {
    const events = [timeout('H'), timeout('H'), period(2), period(3)];
    expect(timeoutsLeft(at(events), 'H', rules).left).toBe(1);
    const extra = { ...rules, overtimeTimeouts: 1 };
    expect(timeoutsLeft(at(events), 'H', extra)).toMatchObject({ allowed: 4, left: 2 });
    expect(timeoutsLeft(at([...events, period(4)]), 'H', extra)).toMatchObject({ allowed: 5, left: 3 });
  });

  it('never goes below none left, and says how many were over', () => {
    const s = at([timeout('H'), timeout('H'), timeout('H'), timeout('H')]);
    expect(timeoutsLeft(s, 'H', rules)).toMatchObject({ left: 0, over: 1 });
  });

  it('defaults to three a game', () => {
    expect(timeoutsLeft(at([timeout('H')]), 'H')).toMatchObject({ allowed: 3, left: 2 });
  });
});

describe('timeoutsLeft — per half', () => {
  const rules = { timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1 };

  it('starts each half afresh', () => {
    const first = [timeout('H'), timeout('H')];
    expect(timeoutsLeft(at(first), 'H', rules)).toMatchObject({ allowed: 2, used: 2, left: 0, scope: 'half' });
    expect(timeoutsLeft(at([...first, period(2)]), 'H', rules)).toMatchObject({ allowed: 2, used: 0, left: 2 });
  });

  it('gives each overtime its own extra, with nothing carried in', () => {
    const s = at([period(2), period(3), timeout('H')]);
    expect(timeoutsLeft(s, 'H', rules)).toMatchObject({ allowed: 1, used: 1, left: 0, scope: 'overtime' });
    expect(timeoutsLeft(at([period(2), period(3), timeout('H'), period(4)]), 'H', rules)).toMatchObject({ left: 1 });
  });

  it('follows undo back out of the second half', () => {
    const events = [timeout('H'), timeout('H'), period(2)];
    expect(timeoutsLeft(deriveState(events, 2, CFG), 'H', rules).left).toBe(0);
  });
});

describe('the rule in words', () => {
  const halves = { timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1 };

  it('puts the rule in words', () => {
    expect(timeoutRuleText(DEFAULT_GAME_RULES)).toBe('3 a game');
    expect(timeoutRuleText(halves)).toBe('2 a half, and 1 more each overtime');
  });

  it('puts it in a few characters for the tracker\'s button', () => {
    expect(timeoutRuleShort(DEFAULT_GAME_RULES)).toBe('3/game');
    expect(timeoutRuleShort(halves)).toBe('2/half +1 OT');
  });

  it('says whether what is left carries into overtime, in the tracker and the admin alike', () => {
    expect(carryText({ timeoutsPer: 'game' })).toMatch(/carry over into overtime/);
    expect(carryText({ timeoutsPer: 'half' })).toMatch(/starts afresh/);
    expect(rulesHint({ timeoutsPer: 'half' })).toContain(carryText({ timeoutsPer: 'half' }));
    expect(rulesHint({})).toMatch(/single game can be changed in the tracker/);
  });

  it('compares rules by what they say, not how they were written', () => {
    expect(sameRules(DEFAULT_GAME_RULES, '{"timeouts":3}')).toBe(true);
    expect(sameRules(DEFAULT_GAME_RULES, null)).toBe(true);
    expect(sameRules(DEFAULT_GAME_RULES, halves)).toBe(false);
  });

  it('compares only the timeouts, all a single game can change', () => {
    expect(sameRules({ ...DEFAULTS, bonusFouls: 5, halfMinutes: 18 }, { timeouts: 3 })).toBe(true);
  });
});

describe('saveGameRules', () => {
  /** A database that keeps what admin-content is sent, one row per season, or one whose function predates game_rules. */
  function stub({ keeps = true, rows = [], readError = null } = {}) {
    const calls = [];
    const held = [...rows];
    const adminFetch = async (fn, opts) => {
      const body = JSON.parse(opts.body);
      calls.push({ fn, body });
      if (keeps) {
        body.forEach((item) => {
          const at = held.findIndex(r => (r.season_id || null) === (item.season_id || null));
          if (at >= 0) held[at] = { value: item.value, season_id: item.season_id };
          else held.push({ value: item.value, season_id: item.season_id });
        });
      }
      return { ok: true };
    };
    const reads = [];
    const supabase = {
      from: (table) => ({
        select: (cols) => ({
          eq: async (col, v) => {
            reads.push({ table, cols, eq: [col, v] });
            return { data: readError ? null : held, error: readError };
          },
        }),
      }),
    };
    return { calls, reads, adminFetch, supabase };
  }
  const LEAGUE_FIELDS = { ...DEFAULTS };
  delete LEAGUE_FIELDS.tiebreakers;

  it('saves the tiebreakers to the season and everything else league-wide, in one request, and checks both', async () => {
    const s = stub();
    const out = await saveGameRules({ ...s, seasonId: 'S2', rules: { timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1, tiebreakers: ['pd', 'h2h'] } });
    const all = { ...DEFAULTS, timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1, tiebreakers: ['pd', 'h2h'] };
    expect(s.calls).toEqual([{ fn: 'admin-content', body: [
      { key: RULES_KEY, value: JSON.stringify({ ...LEAGUE_FIELDS, timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1 }), season_id: null },
      { key: RULES_KEY, value: JSON.stringify({ tiebreakers: ['pd', 'h2h'] }), season_id: 'S2' },
    ] }]);
    expect(s.reads[0]).toMatchObject({ table: 'content_blocks', eq: ['key', 'game_rules'] });
    expect(out).toMatchObject({ verified: true, rules: all, value: JSON.stringify(all) });
  });

  it('never touches another season\'s row', async () => {
    const spring = { value: JSON.stringify({ tiebreakers: ['pd', 'pf'] }), season_id: 'S1' };
    const s = stub({ rows: [spring] });
    await saveGameRules({ ...s, seasonId: 'S2', rules: DEFAULT_GAME_RULES });
    expect(s.calls[0].body.map(r => r.season_id)).toEqual([null, 'S2']);
  });

  it('keeps the tiebreakers league-wide when no season is loaded', async () => {
    const s = stub();
    await saveGameRules({ ...s, rules: DEFAULT_GAME_RULES });
    expect(s.calls[0].body).toEqual([{ key: RULES_KEY, value: JSON.stringify(DEFAULTS), season_id: null }]);
  });

  it('says the function needs redeploying when it passed the key over', async () => {
    const s = stub({ keeps: false });
    await expect(saveGameRules({ ...s, seasonId: 'S2', rules: DEFAULT_GAME_RULES })).rejects.toThrow(RULES_NEED_DEPLOY);
  });

  it('says so when the save did not take', async () => {
    const s = stub({ keeps: false, rows: [{ value: '{"timeouts":4}', season_id: null }, { value: '{"tiebreakers":["pa"]}', season_id: 'S2' }] });
    await expect(saveGameRules({ ...s, seasonId: 'S2', rules: DEFAULT_GAME_RULES })).rejects.toThrow('the database still has the rules from before');
  });

  it('tidies what it is given before sending it', async () => {
    const s = stub();
    const out = await saveGameRules({ ...s, seasonId: 'S2', rules: { timeouts: 99, timeoutsPer: 'quarter', overtimeTimeouts: 1 } });
    expect(out.rules).toEqual({ ...DEFAULTS, overtimeTimeouts: 1 });
  });

  it('takes the write as done when the check cannot be made', async () => {
    const s = stub({ readError: { message: 'offline' } });
    expect(await saveGameRules({ ...s, seasonId: 'S2', rules: DEFAULT_GAME_RULES })).toMatchObject({ verified: false });
    expect(await saveGameRules({ adminFetch: s.adminFetch, rules: DEFAULT_GAME_RULES })).toMatchObject({ verified: false });
  });

  it('passes a failed request on', async () => {
    const adminFetch = async () => { throw new Error('Unauthorized'); };
    await expect(saveGameRules({ adminFetch, rules: DEFAULT_GAME_RULES })).rejects.toThrow('Unauthorized');
  });
});

describe('the Rules page', () => {
  const form = (over = {}) => ({
    timeouts: '3', timeoutsPer: 'game', overtimeTimeouts: '0', tiebreakers: ['h2h', 'pd', 'pf'],
    bonusFouls: '7', doubleBonusFouls: '10', foulOutFouls: '5', halfMinutes: '20', overtimeMinutes: '5', ...over,
  });

  it('reads the boxes into rules', () => {
    expect(readRulesForm(form())).toEqual({ rules: DEFAULTS, problems: [] });
    expect(readRulesForm(form({ tiebreakers: ['pd', 'pd', 'h2h'] })).rules.tiebreakers).toEqual(['pd', 'h2h']);
  });

  it('refuses a box left empty or out of range, by name, rather than saving the default', () => {
    const { problems } = readRulesForm(form({ halfMinutes: '', foulOutFouls: '0', timeouts: '2.5' }));
    expect(problems).toEqual([
      'Timeouts per team: a whole number from 0 to 20.',
      'Fouled out at: a whole number from 1 to 20.',
      'Half: a whole number from 1 to 60.',
    ]);
  });

  it('refuses a double bonus that comes before the bonus', () => {
    expect(readRulesForm(form({ doubleBonusFouls: '6' })).problems[0]).toMatch(/double bonus/i);
    expect(readRulesForm(form({ doubleBonusFouls: '0' })).problems).toEqual([]);
  });

  it('previews the standings with other tiebreakers, and how far each team moves', () => {
    const g = (t1, s1, t2, s2) => ({ t1, t2, s1: String(s1), s2: String(s2) });
    const teams = ['A', 'B', 'C', 'D'].map(name => ({ name }));
    // C 2-0; A beat B by a point, B has the better differential.
    const scores = [g('A', 50, 'B', 49), g('C', 70, 'A', 40), g('B', 90, 'D', 40), g('C', 60, 'D', 50)];
    const rows = standingsPreview(teams, scores, ['h2h', 'pd'], ['pd']);
    expect(rows.map(r => [r.name, r.move])).toEqual([['C', 0], ['A', 1], ['B', -1], ['D', 0]]);
    expect(rows[1]).toMatchObject({ w: 1, l: 1, pd: -29 });
  });
});
