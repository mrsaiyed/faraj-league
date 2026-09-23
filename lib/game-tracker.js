/**
 * Live game tracker — pure state engine. No DOM, no network, no clock.
 *
 * The tracker records an append-only list of events and derives everything
 * (box score, team score, fouls, who is on court, minutes) from them. Undo and
 * redo are a cursor into that list rather than edits to a running total, so
 * they are exact no matter how deep the history goes and can never drift from
 * what is displayed.
 *
 * Nothing here knows about Supabase. `deriveState()` output is what the UI
 * renders and what gets mapped to `game_stat_values` on save.
 */

/** Per-player counting stats the tracker records, beyond points. */
export const COUNTING_STATS = ['foul', 'reb', 'ast', 'stl', 'blk', 'to'];

/** Engine stat key → `stat_definitions.slug`, for syncing totals. */
export const STAT_SLUGS = {
  points: 'points',
  foul: 'fouls',
  reb: 'rebounds',
  ast: 'assists',
  stl: 'steals',
  blk: 'blocks',
  to: 'turnovers',
};

/** Players on the floor per team. */
export const LINEUP_SIZE = 5;

/** Default half length, in seconds. */
export const DEFAULT_PERIOD_SECONDS = 20 * 60;

const emptyPlayer = () => ({
  pts: 0, fg1: 0, fg2: 0, fg3: 0,
  foul: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0,
  secondsPlayed: 0,
});

const emptyTeam = () => ({ score: 0, fouls: 0, onCourt: [] });

/**
 * Build the empty state for a game.
 * @param {{ homeTeamId: string, awayTeamId: string }} config
 */
export function initialState({ homeTeamId, awayTeamId }) {
  return {
    players: {},
    teams: {
      [homeTeamId]: emptyTeam(),
      [awayTeamId]: emptyTeam(),
    },
    period: 1,
    warnings: [],
  };
}

/**
 * Derive the full game state from the first `cursor` events.
 *
 * Invalid events (a sub for someone not on court, a score with no player) are
 * skipped and reported in `warnings` rather than thrown — a scorekeeping tool
 * must never blow up mid-game over a bad tap.
 *
 * @param {Array<object>} events append-only event list
 * @param {number} cursor how many events are currently applied (undo moves this)
 * @param {{ homeTeamId: string, awayTeamId: string }} config
 * @returns {{ players: object, teams: object, period: number, warnings: string[] }}
 */
export function deriveState(events, cursor, config) {
  const state = initialState(config);
  const list = Array.isArray(events) ? events : [];
  const upTo = Math.max(0, Math.min(Number(cursor) ?? list.length, list.length));

  const player = (id) => {
    if (!state.players[id]) state.players[id] = emptyPlayer();
    return state.players[id];
  };
  const team = (id) => {
    if (!state.teams[id]) state.teams[id] = emptyTeam();
    return state.teams[id];
  };

  for (let i = 0; i < upTo; i++) {
    const e = list[i];
    if (!e || typeof e !== 'object') continue;

    switch (e.type) {
      case 'lineup': {
        if (!e.teamId || !Array.isArray(e.playerIds)) break;
        team(e.teamId).onCourt = [...new Set(e.playerIds.filter(Boolean))].slice(0, LINEUP_SIZE);
        break;
      }
      case 'score': {
        const pts = Number(e.points);
        if (!e.playerId || ![1, 2, 3].includes(pts)) {
          state.warnings.push(`Event ${i}: score needs a player and 1, 2 or 3 points`);
          break;
        }
        const p = player(e.playerId);
        p.pts += pts;
        p[`fg${pts}`] += 1;
        if (e.teamId) team(e.teamId).score += pts;
        break;
      }
      case 'foul': {
        if (!e.playerId) { state.warnings.push(`Event ${i}: foul needs a player`); break; }
        player(e.playerId).foul += 1;
        if (e.teamId) team(e.teamId).fouls += 1;
        break;
      }
      case 'stat': {
        if (!e.playerId || !COUNTING_STATS.includes(e.stat) || e.stat === 'foul') {
          state.warnings.push(`Event ${i}: unknown stat "${e.stat}"`);
          break;
        }
        player(e.playerId)[e.stat] += 1;
        break;
      }
      case 'sub': {
        const t = team(e.teamId);
        const outIdx = t.onCourt.indexOf(e.playerOutId);
        if (outIdx === -1) {
          state.warnings.push(`Event ${i}: ${e.playerOutId} was not on court`);
          break;
        }
        if (t.onCourt.includes(e.playerInId)) {
          state.warnings.push(`Event ${i}: ${e.playerInId} is already on court`);
          break;
        }
        t.onCourt = [...t.onCourt];
        t.onCourt[outIdx] = e.playerInId;
        // Court time is credited from the elapsed seconds carried on the event,
        // so the engine stays independent of any running clock.
        const secs = Number(e.secondsPlayed);
        if (Number.isFinite(secs) && secs > 0) player(e.playerOutId).secondsPlayed += secs;
        break;
      }
      case 'period': {
        const n = Number(e.period);
        if (Number.isFinite(n) && n >= 1) state.period = n;
        break;
      }
      default:
        state.warnings.push(`Event ${i}: unknown type "${e?.type}"`);
    }
  }

  return state;
}

/**
 * Append an event, discarding any redo tail (the standard undo/redo contract:
 * acting after undoing abandons the undone branch).
 *
 * @returns {{ events: Array<object>, cursor: number }} a new log, input untouched
 */
export function appendEvent(events, cursor, event) {
  const list = Array.isArray(events) ? events : [];
  const at = Math.max(0, Math.min(Number(cursor) ?? list.length, list.length));
  return { events: [...list.slice(0, at), event], cursor: at + 1 };
}

/** @returns {number} cursor after undo (never below 0) */
export function undo(cursor) {
  return Math.max(0, (Number(cursor) || 0) - 1);
}

/** @returns {number} cursor after redo (never past the end of the log) */
export function redo(events, cursor) {
  const len = Array.isArray(events) ? events.length : 0;
  return Math.min(len, (Number(cursor) || 0) + 1);
}

export const canUndo = (cursor) => (Number(cursor) || 0) > 0;
export const canRedo = (events, cursor) =>
  (Number(cursor) || 0) < (Array.isArray(events) ? events.length : 0);

/**
 * Short human description of an event, for the undo button and the play log.
 * @param {object} event
 * @param {(id: string) => string} nameOf resolves a player id to a display name
 */
export function describeEvent(event, nameOf = (id) => id) {
  if (!event) return '';
  switch (event.type) {
    case 'score': return `${nameOf(event.playerId)} +${event.points}`;
    case 'foul': return `Foul — ${nameOf(event.playerId)}`;
    case 'stat': return `${STAT_LABELS[event.stat] || event.stat} — ${nameOf(event.playerId)}`;
    case 'sub': return `Sub: ${nameOf(event.playerInId)} in for ${nameOf(event.playerOutId)}`;
    case 'lineup': return 'Starting five set';
    case 'period': return `Period ${event.period}`;
    default: return String(event.type || '');
  }
}

/** Display labels for the secondary stat buttons. */
export const STAT_LABELS = {
  foul: 'Foul', reb: 'Rebound', ast: 'Assist', stl: 'Steal', blk: 'Block', to: 'Turnover',
};

/**
 * Map derived per-player totals onto `game_stat_values` rows.
 * Only stats with a matching `stat_definitions` slug are included, so a league
 * that has not defined "steals" simply does not record them.
 *
 * @param {object} players derived `state.players`
 * @param {Array<{ id: string, slug: string }>} statDefinitions
 * @returns {Array<{ player_id: string, stat_definition_id: string, value: number }>}
 */
export function toStatValues(players, statDefinitions) {
  const bySlug = {};
  (statDefinitions || []).forEach(d => { if (d?.slug) bySlug[d.slug] = d.id; });

  const rows = [];
  Object.entries(players || {}).forEach(([playerId, totals]) => {
    Object.entries(STAT_SLUGS).forEach(([key, slug]) => {
      const defId = bySlug[slug];
      if (!defId) return;
      const value = key === 'points' ? totals.pts : totals[key];
      if (!Number.isFinite(value)) return;
      rows.push({ player_id: playerId, stat_definition_id: defId, value });
    });
  });
  return rows;
}

/**
 * Stat slugs the tracker can record that the league has not defined yet.
 * @param {Array<{ slug: string }>} statDefinitions
 * @returns {string[]} missing slugs
 */
export function missingStatSlugs(statDefinitions) {
  const have = new Set((statDefinitions || []).map(d => d?.slug).filter(Boolean));
  return Object.values(STAT_SLUGS).filter(slug => !have.has(slug));
}

/** `mm:ss` from a second count, for the game clock. */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
