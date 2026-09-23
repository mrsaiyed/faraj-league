/**
 * Game status and clock — pure, no DOM, no network.
 *
 * A game used to be treated as finished the moment it had any score, so a
 * live game showed "X Win" as soon as one team led. `games.status` plus a
 * stored clock (migration 012) lets a viewer see the real state instead.
 */

export const GAME_STATUS = {
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  HALFTIME: 'halftime',
  FINAL: 'final',
};

/** Periods 1 and 2 are halves; anything beyond is overtime. */
export const REGULATION_PERIODS = 2;

/**
 * Resolve a game's status.
 *
 * Games recorded before migration 012 have no status. One with scores is
 * treated as final, so past seasons keep showing their results; one without is
 * simply scheduled.
 *
 * @param {{ status?: string|null, s1?: string, s2?: string, forfeit?: string|null }} game
 *   a `config.DB.scores` row
 * @returns {string} one of GAME_STATUS
 */
export function gameStatus(game) {
  const explicit = String(game?.status || '').toLowerCase();
  if (Object.values(GAME_STATUS).includes(explicit)) return explicit;

  const hasScore = game?.s1 !== '' && game?.s1 != null && game?.s2 !== '' && game?.s2 != null;
  if (game?.forfeit || hasScore) return GAME_STATUS.FINAL;
  return GAME_STATUS.SCHEDULED;
}

/** @returns {boolean} true while the game is being played or at the break */
export function isInProgress(game) {
  const s = gameStatus(game);
  return s === GAME_STATUS.LIVE || s === GAME_STATUS.HALFTIME;
}

/** @returns {boolean} true only once the game is over */
export function isFinal(game) {
  return gameStatus(game) === GAME_STATUS.FINAL;
}

/**
 * Seconds left on the clock right now.
 *
 * While the clock is running the stored value is extrapolated forward from the
 * instant it was written, so a viewer's display keeps ticking between polls
 * rather than freezing until the next one.
 *
 * @param {{ clock_seconds?: number|null, clock_running?: boolean, clock_updated_at?: string|null }} game
 * @param {number} [nowMs] current time; defaults to Date.now()
 * @returns {number} seconds remaining, never below zero
 */
export function displayClockSeconds(game, nowMs = Date.now()) {
  const stored = Number(game?.clock_seconds);
  if (!Number.isFinite(stored) || stored < 0) return 0;
  if (!game?.clock_running) return stored;

  const since = Date.parse(game?.clock_updated_at || '');
  if (Number.isNaN(since)) return stored;
  const elapsed = Math.floor((nowMs - since) / 1000);
  if (elapsed <= 0) return stored;
  return Math.max(0, stored - elapsed);
}

/** `H1` / `H2` / `OT` / `OT2`, matching how the tracker labels periods. */
export function periodLabel(period) {
  const n = Number(period);
  if (!Number.isFinite(n) || n < 1) return '';
  if (n <= REGULATION_PERIODS) return `H${n}`;
  return n === REGULATION_PERIODS + 1 ? 'OT' : `OT${n - REGULATION_PERIODS}`;
}

/** `mm:ss`. */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The line a viewer sees on a matchup card in place of the winner tag.
 *
 * @param {object} game a `config.DB.scores` row
 * @param {number} [nowMs]
 * @returns {string} e.g. "H1 12:34", "Half time", or '' when there is nothing to say
 */
export function statusLine(game, nowMs = Date.now()) {
  switch (gameStatus(game)) {
    case GAME_STATUS.HALFTIME:
      return 'Half time';
    case GAME_STATUS.LIVE: {
      const label = periodLabel(game?.period);
      const clock = formatClock(displayClockSeconds(game, nowMs));
      return label ? `${label} ${clock}` : clock;
    }
    default:
      return '';
  }
}
