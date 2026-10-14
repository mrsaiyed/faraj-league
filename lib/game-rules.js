/**
 * League game rules the live tracker plays by — for now, team timeouts.
 * Pure: no DOM, no network.
 *
 * Kept league-wide in `content_blocks.game_rules` (JSON text, null
 * `season_id`) and set in the admin drawer's "League rules". Leagues differ:
 * some give a team so many timeouts a game, carried into overtime; others so
 * many a half, each half starting fresh. The tracker's periods are halves and
 * overtimes, so those are the two windows on offer. A scorekeeper can change
 * them for one game in the tracker before it starts (its "Timeouts" button);
 * that lives in the game's tracker session, and the league rule stays as it is.
 */

/** How a team's allowance is counted: over the whole game, or afresh each half. */
export const TIMEOUT_SCOPES = ['game', 'half'];

/** Three a game, nothing extra in overtime. */
export const DEFAULT_GAME_RULES = Object.freeze({ timeouts: 3, timeoutsPer: 'game', overtimeTimeouts: 0 });

/** The most a box will take, so a typo cannot read as a hundred timeouts. */
export const MAX_TIMEOUTS = 20;

const count = (v, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_TIMEOUTS ? n : fallback;
};

/**
 * The rules from a stored `game_rules` block: JSON text, an object, or
 * nothing at all. Anything missing or out of range takes the default, so a
 * damaged block never stops the tracker opening.
 *
 * @param {string|object|null|undefined} raw
 * @returns {{ timeouts: number, timeoutsPer: 'game'|'half', overtimeTimeouts: number }}
 */
export function gameRules(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch (_) { obj = null; }
  }
  if (!obj || typeof obj !== 'object') obj = {};
  return {
    timeouts: count(obj.timeouts, DEFAULT_GAME_RULES.timeouts),
    timeoutsPer: TIMEOUT_SCOPES.includes(obj.timeoutsPer) ? obj.timeoutsPer : DEFAULT_GAME_RULES.timeoutsPer,
    overtimeTimeouts: count(obj.overtimeTimeouts, DEFAULT_GAME_RULES.overtimeTimeouts),
  };
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

/** Whether two sets of rules say the same thing. */
export const sameRules = (a, b) => JSON.stringify(gameRules(a)) === JSON.stringify(gameRules(b));

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
