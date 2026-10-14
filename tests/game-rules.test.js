/**
 * Unit tests for the league's game rules (lib/game-rules.js) and saving them
 * from the admin (admin/js/league-rules.js, against stubbed adminFetch and Supabase).
 */
import { describe, it, expect } from 'vitest';
import {
  gameRules, timeoutsLeft, timeoutRuleText, timeoutRuleShort, carryText, sameRules, DEFAULT_GAME_RULES, MAX_TIMEOUTS,
} from '../lib/game-rules.js';
import { deriveState } from '../lib/game-tracker.js';
import { saveGameRules, rulesHint, RULES_KEY, RULES_NEED_DEPLOY } from '../admin/js/league-rules.js';

const CFG = { homeTeamId: 'H', awayTeamId: 'A' };
const timeout = (teamId) => ({ type: 'timeout', teamId });
const period = (n) => ({ type: 'period', period: n });
const at = (events) => deriveState(events, events.length, CFG);

describe('gameRules', () => {
  it('is three a game, nothing extra in overtime, when nothing is set', () => {
    expect(gameRules(undefined)).toEqual({ timeouts: 3, timeoutsPer: 'game', overtimeTimeouts: 0 });
    expect(gameRules('')).toEqual(DEFAULT_GAME_RULES);
    expect(gameRules(null)).toEqual(DEFAULT_GAME_RULES);
  });

  it('reads the stored JSON text, or an object', () => {
    const r = { timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1 };
    expect(gameRules(JSON.stringify(r))).toEqual(r);
    expect(gameRules(r)).toEqual(r);
  });

  it('takes the default for anything damaged or out of range, field by field', () => {
    expect(gameRules('{not json')).toEqual(DEFAULT_GAME_RULES);
    expect(gameRules({ timeouts: -1, timeoutsPer: 'quarter', overtimeTimeouts: 2 }))
      .toEqual({ timeouts: 3, timeoutsPer: 'game', overtimeTimeouts: 2 });
    expect(gameRules({ timeouts: 2.5 }).timeouts).toBe(3);
    expect(gameRules({ timeouts: MAX_TIMEOUTS + 1 }).timeouts).toBe(3);
    expect(gameRules({ timeouts: 0 }).timeouts).toBe(0);
    expect(gameRules({ timeouts: '4' }).timeouts).toBe(4);
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
});

describe('saveGameRules', () => {
  /** A database that keeps what admin-content is sent, or one whose function predates game_rules. */
  function stub({ keeps = true, stored = null, readError = null } = {}) {
    const calls = [];
    let held = stored;
    const adminFetch = async (fn, opts) => {
      const body = JSON.parse(opts.body);
      calls.push({ fn, body });
      if (keeps) held = { value: body[0].value };
      return { ok: true };
    };
    const reads = [];
    const supabase = {
      from: (table) => ({
        select: (cols) => ({
          eq: (col, v) => ({
            is: (col2, v2) => ({
              maybeSingle: async () => {
                reads.push({ table, cols, eq: [col, v], is: [col2, v2] });
                return { data: held, error: readError };
              },
            }),
          }),
        }),
      }),
    };
    return { calls, reads, adminFetch, supabase };
  }

  it('saves the rules league-wide, as tidy JSON text, and checks they were kept', async () => {
    const s = stub();
    const out = await saveGameRules({ ...s, rules: { timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1 } });
    expect(s.calls).toEqual([{ fn: 'admin-content', body: [{ key: RULES_KEY, value: '{"timeouts":2,"timeoutsPer":"half","overtimeTimeouts":1}', season_id: null }] }]);
    expect(s.reads[0]).toMatchObject({ table: 'content_blocks', eq: ['key', 'game_rules'], is: ['season_id', null] });
    expect(out).toMatchObject({ verified: true, rules: { timeouts: 2, timeoutsPer: 'half', overtimeTimeouts: 1 } });
  });

  it('says the function needs redeploying when it passed the key over', async () => {
    const s = stub({ keeps: false });
    await expect(saveGameRules({ ...s, rules: DEFAULT_GAME_RULES })).rejects.toThrow(RULES_NEED_DEPLOY);
  });

  it('says what the database still has when the save did not take', async () => {
    const s = stub({ keeps: false, stored: { value: '{"timeouts":4,"timeoutsPer":"game","overtimeTimeouts":0}' } });
    await expect(saveGameRules({ ...s, rules: DEFAULT_GAME_RULES })).rejects.toThrow('the database still has 4 a game');
  });

  it('tidies what it is given before sending it', async () => {
    const s = stub();
    const out = await saveGameRules({ ...s, rules: { timeouts: 99, timeoutsPer: 'quarter', overtimeTimeouts: 1 } });
    expect(out.rules).toEqual({ timeouts: 3, timeoutsPer: 'game', overtimeTimeouts: 1 });
  });

  it('takes the write as done when the check cannot be made', async () => {
    const s = stub({ readError: { message: 'offline' } });
    expect(await saveGameRules({ ...s, rules: DEFAULT_GAME_RULES })).toMatchObject({ verified: false });
    expect(await saveGameRules({ adminFetch: s.adminFetch, rules: DEFAULT_GAME_RULES })).toMatchObject({ verified: false });
  });

  it('passes a failed request on', async () => {
    const adminFetch = async () => { throw new Error('Unauthorized'); };
    await expect(saveGameRules({ adminFetch, rules: DEFAULT_GAME_RULES })).rejects.toThrow('Unauthorized');
  });
});
