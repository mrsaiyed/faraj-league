/**
 * When a game with no time of its own is played — pure, no DOM.
 *
 * A week's games are an hour apart, so an unscheduled game (a bracket game
 * whose teams are not known yet, an empty slot in the schedule editor) goes by
 * the nearest game of its week that has a time: game 3 an hour after game 2.
 * A week with no timed game uses the slot's usual time on the week's date.
 */

/** The usual start of each slot, as a wall-clock "HH:mm"; later slots start at 10:00. */
export const DEFAULT_SLOT_TIMES = Object.freeze({ 1: '10:00', 2: '11:00', 3: '12:00' });

export function defaultSlotTime(gameIndex) {
  return DEFAULT_SLOT_TIMES[Number(gameIndex)] || '10:00';
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * @param {Array<{ game: number, scheduled_at?: string|null }>} weekGames the week's games
 * @param {number} gameIndex the slot to time
 * @param {string} [weekDate] the week's date, 'YYYY-MM-DD' (the schedule editor's)
 * @returns {Date|null} null when the week has neither a timed game nor a date
 */
export function slotStart(weekGames, gameIndex, weekDate) {
  const gi = Number(gameIndex);
  const timed = (weekGames || []).filter(g =>
    g?.scheduled_at && !Number.isNaN(new Date(g.scheduled_at).getTime()) && Number(g.game) !== gi);
  if (timed.length) {
    const distance = (g) => Math.abs(Number(g.game) - gi);
    const nearest = timed.reduce((best, g) =>
      (distance(g) < distance(best) || (distance(g) === distance(best) && Number(g.game) < Number(best.game)) ? g : best));
    return new Date(new Date(nearest.scheduled_at).getTime() + (gi - Number(nearest.game)) * HOUR_MS);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(weekDate || ''));
  if (!m) return null;
  const [hh, mm] = defaultSlotTime(gi).split(':').map(Number);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm);
}
