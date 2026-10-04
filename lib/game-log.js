/**
 * Game log — the live tracker's play-by-play, as rows to show under a final
 * game's box score. Pure: no DOM, no network.
 *
 * The tracker saves its event log to `game_logs` (migration 013) through the
 * `admin-game-log` function. These rows are what both sites draw from it: a
 * heading where each period starts, then every play with the clock, the team,
 * what happened and the score after it.
 */

import { deriveState, describeEvent, formatClock } from './game-tracker.js';

/**
 * The plays behind each stat column. The public log lists only the plays
 * behind the stats the public site shows (`config.PUBLIC_STAT_SLUGS`), so
 * making fouls public later brings fouls into its log with no other change.
 */
export const LOG_TYPES_BY_STAT = {
  points: ['score'],
  fouls: ['foul', 'unfoul'],
  minutes: ['lineup', 'sub'],
};

/**
 * The play types a page's log lists.
 *
 * @param {string[]} publicSlugs the stat columns the public site shows
 * @param {boolean} [showAll] the admin, which lists every play
 * @returns {Set<string>|null} null means every type
 */
export function visibleLogTypes(publicSlugs, showAll = false) {
  if (showAll) return null;
  const types = new Set();
  (publicSlugs || []).forEach(slug => (LOG_TYPES_BY_STAT[slug] || []).forEach(t => types.add(t)));
  return types;
}

/**
 * The heading a period's plays sit under. Spelt out, because the headings are
 * set in Cinzel, whose "1" reads as a capital I ("IST HALF").
 * @param {number} period 1 and 2 are halves; 3 on are overtimes
 * @returns {string} 'First Half', 'Second Half', 'Overtime', 'Second Overtime', …
 */
export function periodHeading(period) {
  const n = Number(period);
  if (!Number.isFinite(n) || n < 1) return '';
  const named = ['First Half', 'Second Half', 'Overtime', 'Second Overtime', 'Third Overtime'];
  return named[n - 1] || `Overtime ${n - 2}`;
}

/** What a play says. The tracker's own wording, except a lineup names who took the floor. */
function playText(event, nameOf) {
  if (event.type === 'lineup') {
    const names = (event.playerIds || []).filter(Boolean).map(nameOf);
    return names.length ? `On the floor: ${names.join(', ')}` : '';
  }
  return describeEvent(event, nameOf);
}

/**
 * Turn a saved event log into the rows of a game log.
 *
 * Each event is replayed through the tracker's own engine (`deriveState`), so
 * the period, the running score and which events count are exactly what the
 * tracker showed: an event it refused (a sub for someone not on the floor, a
 * −Foul with no foul to take back) counted for nothing there and is left out
 * here. Replaying from the start for every event is quadratic, but a game is a
 * few hundred events, which is nothing.
 *
 * @param {Array<object>} events the saved log, already cut at the undo cursor
 * @param {object} opts
 * @param {string} opts.homeTeamId
 * @param {string} opts.awayTeamId
 * @param {Set<string>|null} [opts.types] play types to list; null lists every one
 * @param {(id: string) => string} [opts.nameOf] player id → name
 * @returns {Array<{ kind: 'period', period: number, label: string }
 *   | { kind: 'play', type: string, period: number, clock: string, teamId: string|null,
 *       text: string, points: number, home: number, away: number }>}
 */
export function gameLogRows(events, { homeTeamId, awayTeamId, types = null, nameOf = (id) => id } = {}) {
  const list = Array.isArray(events) ? events : [];
  const cfg = { homeTeamId, awayTeamId };
  const sections = [];
  let current = null;
  let refused = 0;

  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const state = deriveState(list, i + 1, cfg);
    const applied = state.warnings.length === refused;
    refused = state.warnings.length;
    if (!current || state.period !== current.period) {
      current = { period: state.period, plays: [] };
      sections.push(current);
    }
    if (!applied || !e || e.type === 'period') continue;
    if (types && !types.has(e.type)) continue;
    const text = playText(e, nameOf);
    if (!text) continue;
    const clock = Number(e.clock);
    current.plays.push({
      kind: 'play',
      type: e.type,
      period: state.period,
      clock: Number.isFinite(clock) && e.clock !== null && e.clock !== '' ? formatClock(clock) : '',
      teamId: e.teamId || null,
      text,
      points: e.type === 'score' ? Number(e.points) : 0,
      home: state.teams[homeTeamId]?.score || 0,
      away: state.teams[awayTeamId]?.score || 0,
    });
  }

  // A period with nothing to list (the public log of a half with no scoring,
  // say) gets no heading of its own.
  return sections
    .filter(s => s.plays.length)
    .flatMap(s => [{ kind: 'period', period: s.period, label: periodHeading(s.period) }, ...s.plays]);
}
