/**
 * The league's rules — the settings that differ from one league to the next.
 * Pure: no DOM, no network.
 *
 * Kept league-wide in `content_blocks.game_rules` (JSON text, null
 * `season_id`; the name is from when it held only timeouts) and set on the
 * admin's Rules page:
 * - standings: the tiebreakers for teams level on wins, in order (`lib/standings.js`);
 * - timeouts: so many a game, carried into overtime, or so many a half, each
 *   half starting fresh — the tracker's periods are halves and overtimes, so
 *   those are the two windows on offer — plus any extra each overtime;
 * - fouls: the team fouls in a half that put the other team in the bonus and
 *   the double bonus, and the personal fouls that foul a player out;
 * - the clock: how long a half and an overtime last.
 * A scorekeeper can change the timeouts for one game in the tracker before it
 * starts (its "Timeouts" button); that lives in the game's tracker session,
 * and the league rule stays as it is.
 */

import { DEFAULT_TIEBREAKERS, tiebreakerList } from './standings.js';
import { BONUS_FOULS, DOUBLE_BONUS_FOULS, FOUL_OUT_FOULS, DEFAULT_PERIOD_SECONDS } from './game-tracker.js';

/** How a team's allowance is counted: over the whole game, or afresh each half. */
export const TIMEOUT_SCOPES = ['game', 'half'];

/** The fields a single game's timeouts can change. */
export const TIMEOUT_FIELDS = ['timeouts', 'timeoutsPer', 'overtimeTimeouts'];

/**
 * Three timeouts a game and nothing extra in overtime; head-to-head, then
 * point differential, then points scored; the bonus at 7 team fouls a half and
 * the double bonus at 10; fouled out at 5; 20-minute halves, 5-minute overtimes.
 */
export const DEFAULT_GAME_RULES = Object.freeze({
  timeouts: 3,
  timeoutsPer: 'game',
  overtimeTimeouts: 0,
  tiebreakers: DEFAULT_TIEBREAKERS,
  bonusFouls: BONUS_FOULS,
  doubleBonusFouls: DOUBLE_BONUS_FOULS,
  foulOutFouls: FOUL_OUT_FOULS,
  halfMinutes: DEFAULT_PERIOD_SECONDS / 60,
  overtimeMinutes: 5,
});

/** The most a box will take, so a typo cannot read as a hundred timeouts. */
export const MAX_TIMEOUTS = 20;

/**
 * What each number may be. A double bonus of 0 means there is none; every
 * other number must be at least 1: a half of no minutes never starts, and
 * fouling out at 0 would put every player out before the tip.
 */
export const RULE_LIMITS = Object.freeze({
  timeouts: [0, MAX_TIMEOUTS],
  overtimeTimeouts: [0, MAX_TIMEOUTS],
  bonusFouls: [1, 30],
  doubleBonusFouls: [0, 30],
  foulOutFouls: [1, 20],
  halfMinutes: [1, 60],
  overtimeMinutes: [1, 30],
});

const whole = (key, v) => {
  const [lo, hi] = RULE_LIMITS[key];
  const n = v === '' || v == null ? NaN : Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : DEFAULT_GAME_RULES[key];
};

/**
 * The rules from a stored `game_rules` block: JSON text, an object, or
 * nothing at all. Anything missing or out of range takes the default, field
 * by field, so a damaged block never stops the tracker opening, and a block
 * saved before a rule existed gets that rule's default.
 *
 * @param {string|object|null|undefined} raw
 * @returns {{ timeouts: number, timeoutsPer: 'game'|'half', overtimeTimeouts: number,
 *   tiebreakers: string[], bonusFouls: number, doubleBonusFouls: number, foulOutFouls: number,
 *   halfMinutes: number, overtimeMinutes: number }}
 */
export function gameRules(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch (_) { obj = null; }
  }
  if (!obj || typeof obj !== 'object') obj = {};
  return {
    timeouts: whole('timeouts', obj.timeouts),
    timeoutsPer: TIMEOUT_SCOPES.includes(obj.timeoutsPer) ? obj.timeoutsPer : DEFAULT_GAME_RULES.timeoutsPer,
    overtimeTimeouts: whole('overtimeTimeouts', obj.overtimeTimeouts),
    tiebreakers: tiebreakerList(obj.tiebreakers),
    bonusFouls: whole('bonusFouls', obj.bonusFouls),
    doubleBonusFouls: whole('doubleBonusFouls', obj.doubleBonusFouls),
    foulOutFouls: whole('foulOutFouls', obj.foulOutFouls),
    halfMinutes: whole('halfMinutes', obj.halfMinutes),
    overtimeMinutes: whole('overtimeMinutes', obj.overtimeMinutes),
  };
}

/**
 * The league's rules with one game's timeouts in place of its own — what the
 * tracker plays by when a game's timeouts were changed. Only the timeouts:
 * the rest is the league's, whatever the override holds.
 * @param {object} league from `gameRules`
 * @param {object|null} [override] a game's `{ timeouts, timeoutsPer, overtimeTimeouts }`
 */
export function withGameTimeouts(league, override) {
  const base = gameRules(league);
  if (!override) return base;
  const own = gameRules(override);
  TIMEOUT_FIELDS.forEach((k) => { base[k] = own[k]; });
  return base;
}

/**
 * Problems that would make a set of rules mean nothing sensible, in words; an
 * empty list when there are none. Ranges are `gameRules`'s business — this is
 * about rules that contradict each other.
 * @param {object} rules
 * @returns {string[]}
 */
export function ruleProblems(rules) {
  const r = gameRules(rules);
  const problems = [];
  if (r.doubleBonusFouls && r.doubleBonusFouls <= r.bonusFouls) {
    problems.push(`The double bonus (${r.doubleBonusFouls} fouls) must come after the bonus (${r.bonusFouls}), or be 0 for none.`);
  }
  return problems;
}

/**
 * Where a team stands on timeouts in the period the game is in.
 *
 * Per game: the regulation allowance plus the overtime extra for each
 * overtime reached, less every timeout taken — so what is left carries over.
 * Per half: each half has the regulation allowance and each overtime the
 * overtime extra, and only timeouts taken in the current period count.
 *
 * `left` is never below 0; `over` says how many were taken beyond the
 * allowance, which the tracker allows (it records what happened) but warns about.
 *
 * @param {object} state derived state from `deriveState` (`period`, `teams[id].timeoutPeriods`)
 * @param {string} teamId
 * @param {object} rules from `gameRules`
 * @returns {{ allowed: number, used: number, left: number, over: number, scope: 'game'|'half'|'overtime' }}
 */
export function timeoutsLeft(state, teamId, rules = DEFAULT_GAME_RULES) {
  const r = gameRules(rules);
  const period = Math.max(1, Number(state?.period) || 1);
  const taken = state?.teams?.[teamId]?.timeoutPeriods || [];
  let allowed;
  let used;
  let scope;
  if (r.timeoutsPer === 'half') {
    const overtime = period > 2;
    allowed = overtime ? r.overtimeTimeouts : r.timeouts;
    used = taken.filter(p => p === period).length;
    scope = overtime ? 'overtime' : 'half';
  } else {
    allowed = r.timeouts + r.overtimeTimeouts * Math.max(0, period - 2);
    used = taken.length;
    scope = 'game';
  }
  return { allowed, used, left: Math.max(0, allowed - used), over: Math.max(0, used - allowed), scope };
}

/** "this game" / "this half" / "this overtime", for the tracker's messages. */
export const scopeText = (scope) => `this ${scope}`;

/** Whether what a team has not used carries into overtime, in words. */
export function carryText(rules) {
  return gameRules(rules).timeoutsPer === 'half'
    ? 'Each half starts afresh, and so does each overtime.'
    : 'Timeouts not used carry over into overtime.';
}

/** The rule in a few characters, for the tracker's button: "3/game", "2/half +1 OT". */
export function timeoutRuleShort(rules) {
  const r = gameRules(rules);
  return `${r.timeouts}/${r.timeoutsPer}${r.overtimeTimeouts ? ` +${r.overtimeTimeouts} OT` : ''}`;
}

/** Whether two sets of rules give the same timeouts — all a single game can change. */
export const sameRules = (a, b) => TIMEOUT_FIELDS.every(k => gameRules(a)[k] === gameRules(b)[k]);

/**
 * The rule in words, for the admin and the tracker: "3 a game", "2 a half,
 * and 1 more each overtime".
 * @param {object} rules from `gameRules`
 */
export function timeoutRuleText(rules) {
  const r = gameRules(rules);
  const base = `${r.timeouts} a ${r.timeoutsPer}`;
  if (!r.overtimeTimeouts) return base;
  return `${base}, and ${r.overtimeTimeouts} more each overtime`;
}
