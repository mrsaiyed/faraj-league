/**
 * Saving the live tracker's play-by-play — admin only.
 *
 * The tracker's event log is its source of truth, kept in this browser's
 * localStorage per game. Since migration 013 it is also saved to `game_logs`
 * through the `admin-game-log` function, so a final game's box score can show
 * it on both sites. Games tracked before then kept their log on the device
 * that tracked them only; `uploadStoredGameLogs()` puts those in the database
 * the next time the admin is opened on that device.
 */

import { deriveState } from '../../lib/game-tracker.js';
import { isFinal } from '../../lib/game-clock.js';

/** Where the tracker keeps a game's session in localStorage. */
export const trackerStorageKey = (gameId) => `faraj_live_tracker_${gameId}`;

/**
 * The part of a tracker session that is the game: its events up to the undo
 * cursor. Anything past the cursor was undone, and is kept only for redo.
 *
 * @param {{ events?: object[], cursor?: number } | null} session
 * @returns {object[]}
 */
export function effectiveEvents(session) {
  const events = Array.isArray(session?.events) ? session.events : [];
  const cursor = Number(session?.cursor);
  const upTo = Number.isFinite(cursor) ? Math.max(0, Math.min(cursor, events.length)) : events.length;
  return events.slice(0, upTo);
}

/**
 * Does replaying this log give the game's recorded final score? A log that
 * does is complete; one that does not is partial (saved at half time and the
 * device went quiet) or out of date (the stat sheet was corrected afterwards).
 *
 * @param {object[]} events
 * @param {{ t1Id: string, t2Id: string, s1: string|number, s2: string|number }} game
 * @returns {boolean}
 */
export function logMatchesScore(events, game) {
  if (!game || game.s1 === '' || game.s1 == null || game.s2 === '' || game.s2 == null) return false;
  const state = deriveState(events || [], (events || []).length, { homeTeamId: game.t1Id, awayTeamId: game.t2Id });
  const home = state.teams[game.t1Id]?.score || 0;
  const away = state.teams[game.t2Id]?.score || 0;
  return (home > 0 || away > 0) && home === Number(game.s1) && away === Number(game.s2);
}

/**
 * Save a game's log, replacing whatever was saved before.
 *
 * @param {object} opts
 * @param {Function} opts.adminFetch
 * @param {string} opts.gameId
 * @param {object[]} opts.events already cut at the undo cursor
 * @param {Record<string, string>} [opts.names] player id → name, a snapshot
 *   so the log still reads if someone is renamed or removed later
 */
export async function saveGameLog({ adminFetch, gameId, events, names }) {
  if (!gameId) throw new Error('gameId is required');
  return adminFetch('admin-game-log', {
    method: 'POST',
    body: JSON.stringify({ game_id: gameId, events: events || [], names: names || {} }),
  });
}

/** Remove a game's saved log — clearing a game back to "not played" does this. */
export async function deleteGameLog({ adminFetch, gameId }) {
  if (!gameId) throw new Error('gameId is required');
  return adminFetch('admin-game-log', {
    method: 'POST',
    body: JSON.stringify({ game_id: gameId, delete: true }),
  });
}

/**
 * Upload the logs this device still holds for final games that have no
 * complete log saved.
 *
 * Careful by design, because the device may hold an old or partial log:
 * - only final games, and only a log that replays to the game's recorded score;
 * - never over a saved log that already does — another device's may be truer.
 *
 * @param {object} opts
 * @param {Function} opts.adminFetch
 * @param {object} opts.supabase client with read access to `game_logs`
 * @param {object[]} opts.games the loaded season's games (`config.DB.scores`)
 * @param {object[]} opts.teams the loaded season's teams, rosters included
 * @param {Storage} [opts.storage] defaults to localStorage
 * @returns {Promise<{ uploaded: number, errors: string[] }>}
 */
export async function uploadStoredGameLogs({ adminFetch, supabase, games, teams, storage }) {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return { uploaded: 0, errors: [] };

  const namesByTeam = {};
  (teams || []).forEach((t) => {
    namesByTeam[t.id] = {};
    (t.roster || []).forEach((p) => { if (p?.id) namesByTeam[t.id][p.id] = p.name; });
  });

  const candidates = [];
  for (const game of games || []) {
    if (!game?.gameId || !isFinal(game)) continue;
    let session = null;
    try { session = JSON.parse(store.getItem(trackerStorageKey(game.gameId)) || 'null'); } catch (_) { continue; }
    const events = effectiveEvents(session);
    if (!events.length || !logMatchesScore(events, game)) continue;
    candidates.push({ game, events, names: { ...namesByTeam[game.t1Id], ...namesByTeam[game.t2Id] } });
  }
  if (!candidates.length) return { uploaded: 0, errors: [] };

  const { data, error } = await supabase
    .from('game_logs')
    .select('game_id, log')
    .in('game_id', candidates.map(c => c.game.gameId));
  // Most likely migration 013 has not been run; nothing to do until it is.
  if (error) return { uploaded: 0, errors: [error.message || String(error)] };
  const saved = new Map((data || []).map(r => [r.game_id, r.log]));

  let uploaded = 0;
  const errors = [];
  for (const c of candidates) {
    const existing = saved.get(c.game.gameId);
    if (existing && logMatchesScore(existing.events, c.game)) continue;
    try {
      await saveGameLog({ adminFetch, gameId: c.game.gameId, events: c.events, names: c.names });
      uploaded += 1;
    } catch (err) {
      errors.push(err?.message || String(err));
    }
  }
  return { uploaded, errors };
}
